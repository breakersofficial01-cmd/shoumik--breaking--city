// Terrain (Roadmap 2 S3): the bigger world around Breaking City — green paddy fields in the
// north, a golden desert in the west, the coconut coast + beach + sea in the east, the
// Buriganga with a road bridge and the char lands in the south, green hills along the edge,
// ponds and an oasis, highways out of the city, and far mountains on the horizon.
// World owns it as world.terrain (only when data/terrain.json → enabled).
//
//   terrain.heightAt(x, z)  ground outside the city (0 inside) — part of world.heightAt()
//   terrain.zoneAt(x, z)    countryside zone { id, name } for the HUD (null in the city)
//   terrain.field           TerrainField (pure maths, ./field.js)
//   terrain.tiles / props   ground tiles (./tiles.js) and streamed props (./props.js)
//
// Gradual loading: the ground, roads, bridge and water are code (no download). The models
// (assets/nature/outskirts.glb) are an 'areas' group in data/streaming.json; when the
// streaming feature sends stream:loaded for one of the zone groups, the props appear.

import * as THREE from 'three';
import { log } from '../../core/debug.js';
import { COLLIDE } from '../collision.js';
import { hexToLinear } from '../geoBuilder.js';
import { TerrainField } from './field.js';
import { TerrainTiles } from './tiles.js';
import { TerrainProps } from './props.js';
import { buildHighways, buildBridge } from './roads.js';
import { Backdrop } from './backdrop.js';

export const TERRAIN_MODELS = 'model.nature.outskirts';

export class Terrain {
  /** @param {import('../world.js').World} world */
  constructor(world) {
    this.world = world;
    this.game = world.game;
    this.cfg = world.game.config.get('terrain');
    const L = world.layout;
    this.field = new TerrainField(L, this.cfg, world.cfg);
    this.group = new THREE.Group();
    this.group.name = 'terrain';
    world.root.add(this.group);
    // The city is open to the countryside now (no city-limit wall); only the bridge needs a
    // gap in the river railing. Read by groundMesher.js.
    L.openCity = true;
    L.openEdges = new Set();
    const B = this.field.bridge;
    if (B) {
      const p = L.pieceAt(B.x, L.maxZ - 1);
      if (p) L.openEdges.add(`${p.i},${p.j},S`);
    }
    log.info(`terrain: ${this.field.zones.length} zones, ${this.field.ponds.length} ponds, ${this.field.highways.length} highways`);
  }

  /** Meshes that do not depend on streamed files. Call after world.shared exists. */
  init(collision) {
    const shared = this.world.shared;
    this.tiles = new TerrainTiles(this.field, this.cfg, this.group);
    this.props = new TerrainProps(this.field, this.cfg, this.group, collision);
    this.roadMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    const roads = buildHighways(this.field, this.cfg, this.roadMaterial);
    if (roads) this.group.add(roads);
    this.lampMaterial = new THREE.MeshBasicMaterial({ color: '#2a2622' });
    this.lampMaterial.userData.glow = 'glow';
    const bridge = buildBridge(this.field, this.cfg, shared.propMaterial, this.lampMaterial);
    if (bridge) {
      this.group.add(bridge.mesh);
      if (bridge.glow) this.group.add(bridge.glow);
      this.bridge = bridge;
    }
    this.backdrop = new Backdrop(this.cfg, this.group);
    this.lampOn = new THREE.Color('#ffd9a0').multiplyScalar(2.2);
    this.lampOff = new THREE.Color('#3a342c');
    this.addColliders(collision);

    // Streamed models → props.
    const groups = new Set(this.cfg.zones.map((z) => z.id).concat(['hills']));
    this.off = this.game.events.on('stream:loaded', ({ group }) => { if (groups.has(group)) this.loadModels(); });
  }

  /** The countryside models are here (or failed): plant the props. */
  async loadModels() {
    if (this.modelsAsked) return;
    this.modelsAsked = true;
    const assets = this.game.assets;
    assets.registerDefault(TERRAIN_MODELS, () => new THREE.Group());
    let lib = null;
    try { lib = await assets.load(TERRAIN_MODELS); } catch (err) { log.warn('terrain: countryside models missing (bare land)', err); }
    this.props.setModels(lib, this.world.shared.treeModels);
    log.info('terrain: countryside props ready');
  }

  /** Static obstacles: edge of the land, sea, river (with the bridge gap), bridge rails, ponds. */
  addColliders(col) {
    const f = this.field, b = f.bounds, L = this.world.layout;
    const far = 3000, flags = COLLIDE.SOLID;
    let n = 0;
    const add = (x0, z0, x1, z1, fl = flags) => { col.add(x0, z0, x1, z1, fl); n++; };
    add(b.x0 - far, b.z0 - far, b.x1 + far, b.z0, flags | COLLIDE.CAMERA); // north
    add(b.x0 - far, b.z1, b.x1 + far, b.z1 + far, flags | COLLIDE.CAMERA); // south
    add(b.x0 - far, b.z0, b.x0, b.z1, flags | COLLIDE.CAMERA);             // west
    add(b.x1, b.z0, b.x1 + far, b.z1, flags | COLLIDE.CAMERA);             // east
    // Sea: strips of 40 m along the wobbly shore, a few metres into the water.
    const S = this.cfg.sea;
    let seaMin = Infinity;
    for (let z = b.z0; z < b.z1; z += 40) {
      const sx = Math.max(f.shoreX(z), f.shoreX(z + 20), f.shoreX(z + 40)) + S.wadeMetres;
      seaMin = Math.min(seaMin, sx);
      add(sx, z, b.x1, z + 40);
    }
    // River: from the city's south edge to the far bank, the bridge corridor left open.
    const R = f.river;
    const rz0 = L.maxZ - 0.3, rz1 = R.z1 - 2;
    const B = f.bridge;
    if (B) {
      add(b.x0, rz0, B.x - B.half - 0.2, rz1);
      add(B.x + B.half + 0.2, rz0, seaMin, rz1);
      // Bridge parapets (can't fall off), from the city edge to where the deck lands.
      add(B.x - B.half - 0.35, rz0, B.x - B.half + 0.05, B.landZ, flags);
      add(B.x + B.half - 0.05, rz0, B.x + B.half + 0.35, B.landZ, flags);
    } else {
      add(b.x0, rz0, seaMin, rz1);
    }
    // Ponds: a square inside the round water (you can paddle at the edge).
    for (const p of f.ponds) {
      const h = p.r * 0.7;
      add(p.x - h, p.z - h, p.x + h, p.z + h);
    }
    log.info(`terrain: ${n} collision boxes`);
  }

  /** Water surfaces for water.js: the sea, the river (up to the sea) and the ponds. */
  waterShapes() {
    const f = this.field, b = f.bounds, S = this.cfg.sea;
    let seaX = Infinity;
    for (let z = b.z0 - 400; z < b.z1 + 400; z += 10) seaX = Math.min(seaX, f.shoreX(z));
    seaX -= 12;
    const sea = hexToLinear(S.color);
    return {
      riverX: [b.x0, seaX],
      quads: [{ x0: seaX, z0: b.z0 - 1500, x1: f.sea.x + S.farEast, z1: b.z1 + 1500, color: sea }],
      discs: f.ponds.map((p) => ({ x: p.x, z: p.z, r: p.r + 2 })),
    };
  }

  heightAt(x, z) { return this.field.heightAt(x, z); }
  zoneAt(x, z) { return this.field.zoneAt(x, z); }

  setQuality(quality) {
    this.quality = quality;
    this.props?.setQuality(quality);
  }

  /** Build/hide tiles, refresh props, move the horizon mountains, light the bridge at night. */
  update(focus, view, camera, all = false) {
    this.tiles.update(focus, view, all);
    this.props.update(this.tiles.tiles);
    const sky = this.world.sky;
    this.backdrop.update(camera, this.game.scene.fog, sky.radius);
    // Fallback when the streaming feature is switched off: load the models when close.
    if (!this.modelsAsked && !this.game.streamer && this.field.cityDistance(focus.x, focus.z) < 1 && this.nearEdge(focus)) this.loadModels();
    const night = this.world.cityShading?.windows ?? 0;
    if (this.lampMaterial && Math.abs(night - (this.night ?? -1)) > 0.01) {
      this.night = night;
      this.lampMaterial.color.copy(this.lampOff).lerp(this.lampOn, night);
    }
  }

  nearEdge(p) {
    const c = this.field.city;
    return Math.min(p.x - c.x0, c.x1 - p.x, p.z - c.z0, c.z1 - p.z) < 300;
  }

  dispose() {
    this.off?.();
    this.tiles.dispose();
    this.props.dispose();
    this.backdrop.dispose();
  }
}
