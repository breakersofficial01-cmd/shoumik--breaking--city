// Street props drawn with instancing (one draw call per prop type per chunk):
// electric poles, roof water tanks, trees — and the tangled overhead wires (line segments).
// The unit shapes are built once and registered in the asset registry, so real models can
// replace them later.

import * as THREE from 'three';
import { Rng, hashInts } from '../core/rng.js';
import { GeoBuilder, hexToLinear, shade, WHITE } from './geoBuilder.js';

/** Unit pole: `height` tall, with a cross-arm and a junction box. Kept very low-poly:
 *  there are thousands of these. */
export function makePoleGeometry(world) {
  const h = world.props.pole.height;
  const gb = new GeoBuilder();
  const c = hexToLinear('#8f8a80');
  gb.prism(0, 0, 0, h, 0.14, 0.1, 4, shade(c, 0.7), c);
  const arm = hexToLinear('#5c564e');
  gb.box(-0.85, h - 0.75, -0.06, 0.85, h - 0.63, 0.06, shade(arm, 0.8), arm, 0, 'nstb');
  const box = hexToLinear('#6b7078'); // transformer / junction box
  gb.box(-0.22, h - 2.6, 0.1, 0.22, h - 1.9, 0.5, shade(box, 0.7), box, 0, 'nswe');
  return gb.build();
}

/** Unit tank: radius 1, height 1 (scaled per instance). White so instance colour tints it. */
export function makeTankGeometry() {
  const gb = new GeoBuilder();
  gb.prism(0, 0, 0, 0.82, 1, 1, 6, shade(WHITE, 0.75), WHITE);
  gb.prism(0, 0, 0.82, 1, 1, 0.4, 6, WHITE, shade(WHITE, 1.15), true);
  return gb.build();
}

/** Unit tree: height 1, crown radius ~0.3 (scaled per instance). */
export function makeTreeGeometry(world) {
  const gb = new GeoBuilder();
  // The per-tree instance colour (a green) multiplies every vertex, so the trunk colour is
  // divided by the average green here to still come out brown.
  const greens = world.props.tree.colors.map(hexToLinear);
  const avg = [0, 1, 2].map((k) => greens.reduce((sum, g) => sum + g[k], 0) / greens.length);
  const brown = hexToLinear(world.props.tree.trunk);
  const trunk = brown.map((value, k) => value / Math.max(0.02, avg[k]));
  gb.prism(0, 0, 0, 0.42, 0.035, 0.025, 4, shade(trunk, 0.7), trunk);
  gb.prism(0, 0, 0.36, 0.62, 0.1, 0.3, 5, shade(WHITE, 0.55), shade(WHITE, 0.85));
  gb.prism(0, 0, 0.62, 1, 0.3, 0.04, 5, shade(WHITE, 0.85), shade(WHITE, 1.12), true);
  return gb.build();
}

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const v = new THREE.Vector3();
const s = new THREE.Vector3();
const up = new THREE.Vector3(0, 1, 0);
const col = new THREE.Color();

/** Keep only a share of a list (quality "propDensity"), always the same items. */
function thin(list, density) {
  if (density >= 1) return list;
  return list.filter((_, i) => (hashInts(i, 77) % 1000) / 1000 < density);
}

/**
 * Real tree models: one InstancedMesh per model kind. Which kind = a fixed hash of the tree's
 * spot, weighted per district (data/world.json → props.tree.models: palms by the lakes...).
 */
function buildRealTrees(trees, M, shared, kerb, districtOf) {
  const byKind = new Map();
  const mixes = new Map();
  for (const p of trees) {
    const d = districtOf(p.x, p.z) || '';
    if (!mixes.has(d)) {
      const w = { ...M.weights, ...(M.districts?.[d] || {}) };
      const kinds = Object.keys(w).filter((k) => w[k] > 0 && shared.treeModels.has(k));
      const total = kinds.reduce((sum, k) => sum + w[k], 0);
      mixes.set(d, { kinds, w, total });
    }
    const mix = mixes.get(d);
    if (!mix.kinds.length) continue;
    let r = ((hashInts(Math.round(p.x * 10), Math.round(p.z * 10), 31) % 10000) / 10000) * mix.total;
    let kind = mix.kinds[mix.kinds.length - 1];
    for (const k of mix.kinds) { r -= mix.w[k]; if (r < 0) { kind = k; break; } }
    if (!byKind.has(kind)) byKind.set(kind, []);
    byKind.get(kind).push(p);
  }
  const out = [];
  for (const [kind, list] of byKind) {
    const mesh = new THREE.InstancedMesh(shared.treeModels.get(kind), shared.propMaterial, list.length);
    list.forEach((p, i) => {
      q.setFromAxisAngle(up, p.rot);
      const h = p.h * (M.heightScale ?? 1);
      m4.compose(v.set(p.x, kerb, p.z), q, s.set(h, h, h));
      mesh.setMatrixAt(i, m4);
      mesh.setColorAt(i, col.set(M.tints[p.tint % M.tints.length]));
    });
    out.push(mesh);
  }
  return out;
}

/**
 * Build the instanced meshes for a chunk.
 * @param {{poles:any[], tanks:any[], trees:any[]}} lists  collected from the chunk's pieces
 * @param {(x:number, z:number) => string|null} districtOf  district id at a spot (tree mix)
 * @returns {THREE.Object3D[]}
 */
export function buildProps(lists, world, shared, quality, kerb, districtOf = () => null) {
  const out = [];
  const poles = thin(lists.poles, quality.propDensity);
  if (poles.length) {
    const mesh = new THREE.InstancedMesh(shared.poleGeo, shared.propMaterial, poles.length);
    poles.forEach((p, i) => {
      q.setFromAxisAngle(up, p.rot);
      m4.compose(v.set(p.x, kerb, p.z), q, s.set(1, 1, 1));
      mesh.setMatrixAt(i, m4);
    });
    out.push(mesh);
  }
  const tanks = thin(lists.tanks, quality.propDensity);
  if (tanks.length) {
    const t = world.props.tank;
    const mesh = new THREE.InstancedMesh(shared.tankGeo, shared.propMaterial, tanks.length);
    q.identity();
    tanks.forEach((p, i) => {
      m4.compose(v.set(p.x, kerb + p.y, p.z), q, s.set(t.radius * p.scale, t.height * p.scale, t.radius * p.scale));
      mesh.setMatrixAt(i, m4);
      mesh.setColorAt(i, col.set(t.colors[p.tint]));
    });
    out.push(mesh);
  }
  const trees = thin(lists.trees, quality.propDensity);
  if (trees.length) {
    const t = world.props.tree;
    const mesh = new THREE.InstancedMesh(shared.treeGeo, shared.propMaterial, trees.length);
    trees.forEach((p, i) => {
      q.setFromAxisAngle(up, p.rot);
      m4.compose(v.set(p.x, kerb, p.z), q, s.set(p.h, p.h, p.h));
      mesh.setMatrixAt(i, m4);
      mesh.setColorAt(i, col.set(t.colors[p.tint]));
    });
    out.push(mesh);
    // Roadmap 2 G1: real tree models (Kenney Nature Kit) for the chunks near the player.
    // The simple trees above stay for far chunks; chunks.js switches between the two.
    const near = quality.realTrees && shared.treeModels?.size ? buildRealTrees(trees, t.models, shared, kerb, districtOf) : [];
    for (const m of near) { m.userData.nearTrees = true; m.userData.noCastShadow = !quality.treeShadows; }
    if (near.length) mesh.userData.farTrees = true;
    out.push(...near);
  }
  for (const mesh of out) {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }
  return out;
}

/**
 * Overhead wires for a chunk: every span becomes several sagging strands.
 * @param {Array<{a:number[], b:number[], strands:number}>} spans
 */
export function buildWires(spans, world, shared, quality, seed) {
  if (!quality.wires || spans.length === 0) return null;
  const w = world.props.wire;
  const rng = new Rng(seed);
  const pos = [];
  const seg = w.segments;
  for (const span of spans) {
    const strands = Math.max(1, Math.round(span.strands * quality.wireStrandScale));
    for (let k = 0; k < strands; k++) {
      const sag = rng.range(w.sagMin, w.sagMax);
      // Each strand hangs from a slightly different height and spot on the pole.
      const dropA = rng.range(0, w.heightMax - w.heightMin) * (k === 0 ? 0 : 1);
      const dropB = dropA + rng.range(-0.3, 0.3);
      const jx = rng.range(-0.35, 0.35);
      const jz = rng.range(-0.35, 0.35);
      let px = 0, py = 0, pz = 0;
      for (let i = 0; i <= seg; i++) {
        const t = i / seg;
        const x = span.a[0] + (span.b[0] - span.a[0]) * t + jx;
        const y = span.a[1] - dropA + (span.b[1] - dropB - (span.a[1] - dropA)) * t - sag * 4 * t * (1 - t);
        const z = span.a[2] + (span.b[2] - span.a[2]) * t + jz;
        if (i > 0) pos.push(px, py, pz, x, y, z);
        px = x; py = y; pz = z;
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeBoundingSphere();
  return new THREE.LineSegments(geo, shared.wireMaterial);
}
