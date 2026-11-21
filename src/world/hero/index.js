// 3D "hero" buildings: in a few zones (start area, some landmarks) the normal buildings get real
// Downtown City MegaKit pieces (assets/city/kit-pieces.glb) instead of flat textured walls.
// Settings: data/heroBuildings.json; on/off per quality: data/quality.json → heroBuildings.
//
// How it fits together
//   load()        loads the piece library once, then marks the chosen buildings  b.hero = zoneId
//                 (buildingMesher.js then skips their walls and balconies; roof and shop signs stay)
//   update(focus) builds a zone's meshes when Shoumik comes near, drops them when far:
//                 all pieces of a zone are merged into ONE mesh per kit material (~7 draw calls).
//   setQuality()  hides / shows them; the chunk manager rebuilds the plain walls when needed.
// If the library fails to load nothing is marked, so the city simply keeps its normal walls.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { log, debugLine } from '../../core/debug.js';
import { designBuilding } from './design.js';

export class HeroBuildings {
  /**
   * @param {object} world  the World (layout, landmarks, cfg)
   * @param {object} H      data/heroBuildings.json
   * @param {THREE.Object3D} parent
   */
  constructor(world, H, parent) {
    this.world = world;
    this.H = H;
    this.group = new THREE.Group();
    this.group.name = 'hero-buildings';
    parent.add(this.group);
    this.lib = null;          // piece name -> { width, tris, parts: [{ geo, mat }] }
    this.zones = [];          // { id, x, z, radius, buildings: [{ b, baseY }], mesh: Group|null, tris }
    this.enabled = false;
    this.loading = null;
  }

  /** Zone centres: Shoumik's start crossing or a landmark site. */
  zoneCentre(z, spawn) {
    if (z.at === 'spawn') {
      const c = this.world.layout.crossingCentre(spawn.col, spawn.row);
      return { x: c.x, z: c.z };
    }
    const site = this.world.landmarks?.sites.find((s) => s.id === z.at);
    if (!site) { log.warn(`hero buildings: zone "${z.id}" — place "${z.at}" not found`); return null; }
    return { x: site.cx, z: site.cz };
  }

  /** Load the piece library and pick the buildings of every zone (once). */
  load(url, spawn) {
    if (this.loading) return this.loading;
    this.loading = (async () => {
      // Through the asset registry: it may already be downloading since the boot (prefetch),
      // and it reads meshopt-compressed files. `url` only says that a file is configured.
      const scene = await this.world.game.assets.load('model.city.kitPieces');
      this.lib = new Map();
      scene.updateMatrixWorld(true);
      // The file holds one group ('kit-pieces') whose children are the pieces.
      const root = scene.getObjectByName('kit-pieces') || scene;
      for (const piece of root.children) {
        const parts = [];
        const box = new THREE.Box3();
        let tris = 0;
        piece.traverse((o) => {
          if (!o.isMesh) return;
          const g = o.geometry.clone();
          g.applyMatrix4(new THREE.Matrix4().copy(piece.matrixWorld).invert().multiply(o.matrixWorld));
          if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
          if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]);
          for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
          g.computeBoundingBox(); box.union(g.boundingBox);
          tris += g.index.count / 3;
          parts.push({ geo: g, mat: o.material });
        });
        const width = Math.max(1, Math.round((box.max.x - box.min.x) / 2) * 2);
        this.lib.set(piece.name, { width, tris, parts });
      }
      this.materials = new Map();
      for (const e of this.lib.values()) for (const p of e.parts) this.materials.set(p.mat.name, p.mat);
      const glass = this.materials.get('Glass');
      if (glass) { glass.transparent = false; glass.opacity = 1; glass.color.set(this.H.glassColor || '#1c2a38'); glass.envMapIntensity = 2; }
      for (const m of this.materials.values()) if (m.name !== 'Glass') m.color.multiplyScalar(this.H.brightness ?? 1);
      this.pickBuildings(spawn);
    })().catch((err) => {
      log.warn(`hero buildings: ${err.message} — keeping the normal walls`);
      this.lib = null;
    });
    return this.loading;
  }

  /** Nearest buildings of each zone, within its triangle budget, get b.hero = zone id. */
  pickBuildings(spawn) {
    const L = this.world.layout;
    const cfgB = this.world.cfg.buildings;
    for (const z of this.H.zones) {
      const c = this.zoneCentre(z, spawn);
      if (!c) continue;
      const near = [];
      for (const p of L.pieces) {
        for (const b of p?.content?.buildings || []) {
          if (b.hero || b.floors < this.H.minFloors || b.floors > (this.H.maxFloors || 99)) continue;
          const d = Math.hypot((b.x0 + b.x1) / 2 - c.x, (b.z0 + b.z1) / 2 - c.z);
          if (d < z.radius) near.push({ b, baseY: p.y, d });
        }
      }
      near.sort((a, b) => a.d - b.d);
      const zone = { id: z.id, x: c.x, z: c.z, radius: z.radius, buildings: [], mesh: null, tris: 0 };
      for (const n of near) {
        const d = designBuilding(n.b, n.baseY, this.H, cfgB, this.lib);
        if (!d || zone.tris + d.tris > z.maxTriangles) continue;
        n.b.hero = z.id;
        zone.tris += d.tris;
        zone.buildings.push(n);
      }
      this.zones.push(zone);
      log.info(`hero buildings: zone ${z.id} — ${zone.buildings.length} buildings, ${Math.round(zone.tris / 1000)}k triangles`);
    }
  }

  /** Merge every piece of a zone into one mesh per kit material. */
  buildZone(zone) {
    const cfgB = this.world.cfg.buildings;
    const buckets = new Map();
    for (const { b, baseY } of zone.buildings) {
      const d = designBuilding(b, baseY, this.H, cfgB, this.lib);
      for (const { piece, matrix } of d.placements) {
        for (const part of this.lib.get(piece).parts) {
          const g = part.geo.clone().applyMatrix4(matrix);
          if (!buckets.has(part.mat.name)) buckets.set(part.mat.name, []);
          buckets.get(part.mat.name).push(g);
        }
      }
    }
    const group = new THREE.Group();
    group.name = `hero-${zone.id}`;
    for (const [name, geos] of buckets) {
      const geo = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (!geo) continue;
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, this.materials.get(name));
      mesh.name = `hero-${zone.id}-${name}`;
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
    }
    this.group.add(group);
    zone.mesh = group;
  }

  dropZone(zone) {
    if (!zone.mesh) return;
    zone.mesh.traverse((o) => o.isMesh && o.geometry.dispose());
    zone.mesh.removeFromParent();
    zone.mesh = null;
  }

  setEnabled(on) {
    this.enabled = on && !!this.lib;
    this.group.visible = this.enabled;
    if (!this.enabled) for (const z of this.zones) this.dropZone(z);
  }

  /** @param {{x:number,z:number}} focus  @param {number} viewDistance */
  update(focus, viewDistance) {
    if (!this.enabled) return;
    let shown = 0;
    for (const z of this.zones) {
      const d = Math.hypot(z.x - focus.x, z.z - focus.z);
      if (!z.mesh && d < this.H.buildDistance) this.buildZone(z);
      else if (z.mesh && d > this.H.dropDistance) this.dropZone(z);
      if (z.mesh) { z.mesh.visible = d - z.radius < viewDistance; if (z.mesh.visible) shown += z.tris; }
    }
    debugLine('hero', `3D kit buildings ${Math.round(shown / 1000)}k tris`);
  }

  dispose() {
    for (const z of this.zones) this.dropZone(z);
    this.group.removeFromParent();
  }
}
