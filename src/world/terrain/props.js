// Countryside props (Roadmap 2 S3): paddy, cacti, rocks, palms, canoes, beach umbrellas, hill
// trees... Kenney Nature Kit models (CC0) from assets/nature/outskirts.glb + the city's
// trees.glb. The models are STREAMED: data/streaming.json → areas loads the GLB only when
// Shoumik comes near the countryside, so the first start stays small. Until then the land is
// bare; Terrain calls setModels() when 'stream:loaded' arrives.
//
// Placement is fixed per tile (seeded), only for tiles within props.nearDistance. Every kind
// is ONE InstancedMesh for all near tiles together (few draw calls), refilled when the set of
// near tiles changes. Big things (trees, cacti, rocks) also get a collider the first time
// their tile is planted.

import * as THREE from 'three';
import { Rng, hashInts } from '../../core/rng.js';
import { COLLIDE } from '../collision.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

/** A 1 m tall beach umbrella (white canopy, tinted per instance). */
function makeUmbrella() {
  const pole = new THREE.CylinderGeometry(0.02, 0.02, 0.95, 5).translate(0, 0.475, 0);
  const top = new THREE.ConeGeometry(0.55, 0.22, 10, 1, true).translate(0, 0.9, 0);
  const paint = (g, hex) => {
    const c = new THREE.Color(hex);
    const a = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < a.length; i += 3) { a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    g.deleteAttribute('uv');
    return g.toNonIndexed();
  };
  const parts = [paint(pole, '#d8d8d8'), paint(top, '#ffffff')];
  const geo = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color']) {
    const arrays = parts.map((p) => p.attributes[name].array);
    const out = new Float32Array(arrays.reduce((n, a) => n + a.length, 0));
    let o = 0;
    for (const a of arrays) { out.set(a, o); o += a.length; }
    geo.setAttribute(name, new THREE.BufferAttribute(out, 3));
  }
  return geo;
}

export class TerrainProps {
  /**
   * @param {import('./field.js').TerrainField} field
   * @param {object} cfg  data/terrain.json
   * @param {THREE.Object3D} parent
   * @param {import('../collision.js').CollisionWorld} collision
   */
  constructor(field, cfg, parent, collision) {
    this.field = field;
    this.cfg = cfg;
    this.P = cfg.props;
    this.collision = collision;
    this.group = new THREE.Group();
    this.group.name = 'terrain-props';
    parent.add(this.group);
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.geos = new Map();   // kind -> geometry (1 m tall, standing on 0)
    this.meshes = new Map(); // kind -> InstancedMesh
    this.planted = new Map(); // tile key -> [{ kind, x, y, z, rot, s, tint }]
    this.near = new Set();
    this.dirty = false;
    this.density = 1;
    this.treeShadows = false;
    this.geos.set('umbrella', makeUmbrella());
  }

  /** Models arrived (streamed): outskirts.glb children + the tree kinds from trees.glb. */
  setModels(outskirts, treeModels) {
    if (outskirts) {
      outskirts.updateMatrixWorld(true);
      outskirts.traverse((o) => { if (o.isMesh && !o.name.endsWith('.glow')) this.geos.set(o.name, o.geometry.clone().applyMatrix4(o.matrixWorld)); });
    }
    for (const [name, g] of treeModels || []) this.geos.set(`tree:${name}`, g);
    this.ready = true;
    this.dirty = true;
  }

  setQuality(quality) {
    const d = quality.propDensity ?? 1;
    if (d !== this.density) { this.density = d; this.planted.clear(); this.dirty = true; }
    this.treeShadows = !!quality.treeShadows;
    for (const [kind, m] of this.meshes) m.userData.noCastShadow = this.noShadow(kind);
  }

  noShadow(kind) {
    if (kind.startsWith('tree:') || kind === 'pine') return !this.treeShadows;
    return ['paddy', 'grass', 'dryBush', 'bush', 'umbrella'].includes(kind);
  }

  /** Plant one tile (once): seeded spots, kept only where the land matches the list. */
  plant(t) {
    const key = `${t.x0},${t.z0}`;
    let list = this.planted.get(key);
    if (list) return list;
    list = [];
    const f = this.field;
    const rng = new Rng(hashInts(this.cfg.seed, Math.round(t.x0), Math.round(t.z0)));
    const area = (t.x1 - t.x0) * (t.z1 - t.z0) / 10000;
    const o = { col: [0, 0, 0] };
    for (const cls of ['fields', 'desert', 'coast', 'beach', 'mountains', 'oasis']) {
      for (const item of this.P[cls] || []) {
        if (!this.geos.has(item.kind)) continue;
        const n = Math.round(item.per * area * this.density);
        for (let k = 0; k < n; k++) {
          const x = rng.range(t.x0, t.x1), z = rng.range(t.z0, t.z1);
          const rot = rng.range(0, Math.PI * 2), s = rng.range(item.size[0], item.size[1]), tint = rng.int(0, 7);
          if (!f.inBounds(x, z)) continue;
          const here = f.sample(x, z, o);
          if (here.cls !== cls) continue;
          if (item.onPlots && here.field < 0.6) continue;
          list.push({ kind: item.kind, x, y: f.groundAt(x, z) - 0.05, z, rot, s, tint });
        }
      }
    }
    this.planted.set(key, list);
    if (!t.collided) {
      t.collided = true;
      for (const p of list) {
        if (!this.P.colliders.some((c) => p.kind.startsWith(c))) continue;
        const g = this.geos.get(p.kind);
        if (!g.boundingBox) g.computeBoundingBox();
        const bb = g.boundingBox;
        const r = p.kind.startsWith('tree:') || p.kind === 'pine' || p.kind === 'bamboo'
          ? 0.3 : Math.max(0.3, Math.min(bb.max.x - bb.min.x, bb.max.z - bb.min.z) * p.s * 0.32);
        this.collision.add(p.x - r, p.z - r, p.x + r, p.z + r, COLLIDE.SOLID | COLLIDE.CAMERA);
      }
    }
    return list;
  }

  /**
   * @param {Array<object>} tiles  TerrainTiles.tiles (with .dist set this frame)
   */
  update(tiles) {
    if (!this.ready) return;
    const reach = this.P.nearDistance;
    let changed = this.dirty;
    const now = new Set();
    for (const t of tiles) if (t.dist < reach) now.add(t);
    if (now.size !== this.near.size) changed = true;
    else for (const t of now) if (!this.near.has(t)) { changed = true; break; }
    if (!changed) return;
    // Plant at most two new tiles per frame (each takes a few ms); draw when all are ready.
    let fresh = 0;
    for (const t of now) {
      if (this.planted.has(`${t.x0},${t.z0}`)) continue;
      if (fresh++ >= 2) { this.dirty = true; return; }
      this.plant(t);
    }
    this.near = now;
    this.dirty = false;
    // Count + fill per kind.
    const byKind = new Map();
    for (const t of now) {
      for (const p of this.plant(t)) {
        let a = byKind.get(p.kind);
        if (!a) byKind.set(p.kind, (a = []));
        a.push(p);
      }
    }
    for (const [kind, mesh] of this.meshes) {
      if (!byKind.has(kind)) { mesh.count = 0; mesh.visible = false; }
    }
    const colors = this.P.umbrellaColors;
    for (const [kind, list] of byKind) {
      let mesh = this.meshes.get(kind);
      if (!mesh || mesh.instanceMatrix.count < list.length) {
        if (mesh) { this.group.remove(mesh); mesh.dispose(); }
        mesh = new THREE.InstancedMesh(this.geos.get(kind), this.material, Math.ceil(list.length * 1.4) + 8);
        mesh.name = `terrain-${kind}`;
        mesh.frustumCulled = false;
        mesh.userData.noCastShadow = this.noShadow(kind);
        this.meshes.set(kind, mesh);
        this.group.add(mesh);
      }
      list.forEach((p, i) => {
        _q.setFromAxisAngle(UP, p.rot);
        _m.compose(_p.set(p.x, p.y, p.z), _q, _s.set(p.s, p.s, p.s));
        mesh.setMatrixAt(i, _m);
        if (kind === 'umbrella') _c.set(colors[p.tint % colors.length]);
        else _c.setScalar(0.88 + (p.tint / 7) * 0.2);
        mesh.setColorAt(i, _c);
      });
      mesh.count = list.length;
      mesh.visible = true;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  /** How many props are drawn now (debug). */
  count() {
    let n = 0;
    for (const m of this.meshes.values()) n += m.visible ? m.count : 0;
    return n;
  }

  dispose() {
    for (const m of this.meshes.values()) m.dispose();
    this.material.dispose();
  }
}
