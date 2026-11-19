// World: glues the city together — layout data, chunk meshes, water, sky and collision.
// Features use it through game.world:
//   world.heightAt(x, z)        ground height
//   world.districtAt(x, z)      district entry from data/districts.json (or null)
//   world.collision             CollisionWorld (resolveCircle / raycast / isBlocked)
//   world.layout                the full city grid (roads, blocks, buildings) for minimap, traffic...
//   world.roads                 RoadNet: junctions, lanes, signals, routes, bus stops (roads.js)
//   world.ramps                 stunt ramps; their height is already part of heightAt()
//   world.landmarks             real Dhaka places, MRT / flyover, entrance markers (landmarks/index.js)

import * as THREE from 'three';
import { log, debugLine } from '../core/debug.js';
import { CityLayout, KIND } from './layout.js';
import { ChunkManager } from './chunks.js';
import { CollisionWorld, COLLIDE } from './collision.js';
import { Water } from './water.js';
import { Sky } from './sky.js';
import { RoadNet } from './roads.js';
import { Ramps } from './ramps.js';
import { makePoleGeometry, makeTankGeometry, makeTreeGeometry } from './props.js';
import { Landmarks, landmarkBlocks } from './landmarks/index.js';
import { HeroBuildings } from './hero/index.js';

export class World {
  /** @param {object} game  the Game (scene, camera, config, assets) */
  constructor(game) {
    this.game = game;
    this.cfg = game.config.get('world');
    this.root = new THREE.Group();
    this.root.name = 'world';
    game.scene.add(this.root);
  }

  async init() {
    const { assets, config, scene } = this.game;
    const t0 = performance.now();
    // Places (with their landmark plots) were loaded by the Content Service at boot.
    const places = this.game.content.get('places');
    const landmarkCfg = config.get('landmarks');
    this.layout = new CityLayout(this.cfg, config.get('districts'), landmarkBlocks(places, landmarkCfg));
    log.info(`city layout: ${this.layout.pieces.length} pieces in ${(performance.now() - t0).toFixed(0)} ms`);
    // Ramps first: they remove the trees in their way before any mesh or collider exists.
    this.ramps = new Ramps(this.layout, this.cfg.ramps);
    // Landmarks plan their plots now (they plant and remove trees); meshes come further down.
    this.landmarks = new Landmarks(this.layout, places, landmarkCfg, this.cfg);
    this.ramps.surface = (x, z) => this.landmarks.heightAt(x, z);
    this.roads = new RoadNet(this.layout, config.get('traffic'));

    // Placeholder prop shapes go through the asset registry so real models can replace them.
    assets.registerDefault('geometry.pole', () => makePoleGeometry(this.cfg));
    assets.registerDefault('geometry.tank', () => makeTankGeometry());
    assets.registerDefault('geometry.tree', () => makeTreeGeometry(this.cfg));
    const [facades, ground, water, glow, poleGeo, tankGeo, treeGeo] = await assets.loadMany([
      'texture.facades', 'texture.ground', 'texture.water', 'texture.glow',
      'geometry.pole', 'geometry.tank', 'geometry.tree',
    ]);

    // Shared materials: the whole static city uses just these.
    this.shared = {
      facadeMaterial: new THREE.MeshLambertMaterial({ map: facades, vertexColors: true }),
      groundMaterial: new THREE.MeshLambertMaterial({ map: ground, vertexColors: true }),
      propMaterial: new THREE.MeshLambertMaterial({ vertexColors: true }),
      wireMaterial: new THREE.LineBasicMaterial({ color: this.cfg.props.wire.color }),
      poleGeo, tankGeo, treeGeo,
    };

    this.sky = new Sky(this.cfg, glow, scene);
    this.water = new Water(this.layout, water, this.root, config.get('graphics'));
    this.chunks = new ChunkManager(this.layout, this.shared, this.root);
    this.collision = new CollisionWorld();
    this.buildColliders();
    await this.landmarks.build(this.shared, this.root, this.collision);
    const rampMesh = this.ramps.buildMesh();
    if (rampMesh) this.root.add(rampMesh);
    // 3D kit buildings (Medium/High): load now, during the loading screen, before chunks are built.
    this.hero = new HeroBuildings(this, config.get('heroBuildings'), this.root);
    if (config.get('quality').levels[this.game.qualityName]?.heroBuildings) await this.loadHero();
  }

  /** Load the kit pieces for the 3D hero buildings (once). Chunks built before are rebuilt. */
  async loadHero() {
    const url = this.game.assets.url('model.city.kitPieces');
    if (!url) return;
    const fresh = !this.hero.loading;
    await this.hero.load(url, this.game.config.get('player').spawn);
    if (fresh && this.chunks.stats.built > 0) this.chunks.disposeAll();
    this.hero.setEnabled(!!this.quality?.heroBuildings || !this.quality);
  }

  /** Register every static obstacle once. */
  buildColliders() {
    const L = this.layout;
    const col = this.collision;
    const { pole, tree } = this.cfg.props;
    let count = 0;
    for (const p of L.pieces) {
      if (p.kind === KIND.WATER) {
        col.add(p.x, p.z, p.x + p.w, p.z + p.d, COLLIDE.SOLID); // can't walk into the lake
        count++;
      }
      const c = p.content;
      if (!c) continue;
      for (const b of c.buildings) col.add(b.x0, b.z0, b.x1, b.z1);
      for (const t of c.poles) col.add(t.x - pole.colliderSize / 2, t.z - pole.colliderSize / 2, t.x + pole.colliderSize / 2, t.z + pole.colliderSize / 2, COLLIDE.SOLID);
      for (const t of c.trees) col.add(t.x - tree.colliderSize / 2, t.z - tree.colliderSize / 2, t.x + tree.colliderSize / 2, t.z + tree.colliderSize / 2, COLLIDE.SOLID);
      count += c.buildings.length + c.poles.length + c.trees.length;
    }
    // City limits (north/east/west walls) and the river to the south.
    const far = 5000;
    col.add(L.minX - far, L.minZ - far, L.maxX + far, L.minZ + 0.4, COLLIDE.SOLID);
    col.add(L.minX - far, L.maxZ - 0.3, L.maxX + far, L.maxZ + far, COLLIDE.SOLID);
    col.add(L.minX - far, L.minZ - far, L.minX + 0.4, L.maxZ + far, COLLIDE.SOLID);
    col.add(L.maxX - 0.4, L.minZ - far, L.maxX + far, L.maxZ + far, COLLIDE.SOLID);
    log.info(`collision: ${count + 4} boxes`);
  }

  setQuality(quality) {
    this.quality = quality;
    this.chunks.setQuality(quality);
    if (quality.heroBuildings && this.hero && !this.hero.lib) this.loadHero();
    this.hero?.setEnabled(!!quality.heroBuildings);
    this.sky.setViewDistance(quality.viewDistance, this.game.camera);
  }

  /** Ground height: road 0, sidewalk/park = kerb height, plus any stunt ramp. */
  heightAt(x, z) {
    return this.layout.heightAt(x, z) + this.ramps.heightAt(x, z);
  }

  districtAt(x, z) {
    return this.layout.districtAt(x, z);
  }

  /** Loading-screen build of everything in view of (x, z). */
  buildAround(x, z, onProgress) {
    return this.chunks.buildAround(x, z, onProgress);
  }

  /** @param {{x:number, z:number}} focus  where the player is */
  update(dt, focus) {
    this.chunks.update(focus.x, focus.z);
    this.water.update(dt);
    this.sky.update(this.game.camera);
    this.landmarks.update(focus, this.quality.viewDistance);
    this.hero.update(focus, this.quality.viewDistance);
    debugLine('chunks', `chunks ${this.chunks.stats.visible}/${this.chunks.stats.built} queue ${this.chunks.queue.length}`);
  }
}
