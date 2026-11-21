// Street look (Roadmap 2, Session 1) — world code, available as game.world.street.
//
//   street.plan          StreetPlan: what stands where (plan.js, pure data)
//   street.heads         Float32Array [x, y, z, ...] of every lamp bulb (streetLights feature)
//   street.materials     { bulb, pool } — the night look is set by the streetLights feature
//   street.footbridges   Footbridges (meshes + culling)
//   street.buildChunk(pieces, quality)  → instanced meshes for one city chunk (chunks.js)
//
// Models: 'model.street.props' (assets/street/street-props.glb, Kenney City Kit Roads, CC0,
// packed by tools/street-kit/pack-props.js). Code-built: benches, bins, transformers, bamboo
// scaffolding, nets, footbridges (meshes.js, footbridges.js). Numbers: data/street.json.

import * as THREE from 'three';
import { hashInts } from '../../core/rng.js';
import { log } from '../../core/debug.js';
import { StreetPlan, STREET_KINDS, emptyStreet } from './plan.js';
import { Footbridges } from './footbridges.js';
import {
  makeBench, makeBin, makeTransformer, makeScaffoldCell, makeNet, makePoolQuad, makeFallbackKit,
} from './meshes.js';

const KIT = ['lamp', 'lampDouble', 'cone', 'barrier', 'fence', 'dumpster'];
const THIN = new Set(['bench', 'bin', 'dumpster']); // fewer of these on Low (quality.propDensity)
const INSTANCED = ['scaffold', 'net'];                 // many copies of one shape: InstancedMesh
const MERGED = STREET_KINDS.filter((k) => !INSTANCED.includes(k)); // merged into one mesh per chunk
const LAMPS = ['lamp', 'lampDouble'];

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const v = new THREE.Vector3();
const s = new THREE.Vector3();
const up = new THREE.Vector3(0, 1, 0);
const col = new THREE.Color();

/**
 * Bake many placed copies of a few shapes into ONE non-indexed geometry
 * (position, normal, colour). groups = [[geometry, items, colourOf(item) | null], ...].
 * Items only turn round y, so normals just turn too.
 */
function mergeItems(groups) {
  let total = 0;
  for (const [geo, items] of groups) total += geo.attributes.position.count * items.length;
  const P = new Float32Array(total * 3), N = new Float32Array(total * 3), C = new Float32Array(total * 3);
  let o = 0;
  for (const [geo, items, colourOf] of groups) {
    const pos = geo.attributes.position, nor = geo.attributes.normal, colr = geo.attributes.color;
    const n = pos.count;
    for (const it of items) {
      const c = Math.cos(it.rot), sn = Math.sin(it.rot);
      const tint = colourOf ? col.set(colourOf(it) || '#ffffff') : null;
      for (let i = 0; i < n; i++, o += 3) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        P[o] = it.x + x * c + z * sn; P[o + 1] = it.y + y; P[o + 2] = it.z - x * sn + z * c;
        const nx = nor.getX(i), nz = nor.getZ(i);
        N[o] = nx * c + nz * sn; N[o + 1] = nor.getY(i); N[o + 2] = -nx * sn + nz * c;
        const r = colr ? colr.getX(i) : 1, g = colr ? colr.getY(i) : 1, b = colr ? colr.getZ(i) : 1;
        C[o] = tint ? r * tint.r : r; C[o + 1] = tint ? g * tint.g : g; C[o + 2] = tint ? b * tint.b : b;
      }
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  out.setAttribute('color', new THREE.BufferAttribute(C, 3));
  out.computeBoundingSphere();
  return out;
}

/** Soft round light-pool picture (white; the pool colour comes from the material). */
function makePoolTexture(stops) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [at, a] of stops) g.addColorStop(at, `rgba(255,255,255,${a})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Bulb positions of a lamp model (one per arm), from its glow geometry. */
function headsOf(geo) {
  if (!geo) return [];
  const p = geo.attributes.position;
  const sides = { [-1]: [0, 0, 0, 0], [1]: [0, 0, 0, 0] };
  for (let i = 0; i < p.count; i++) {
    const side = p.getZ(i) < 0 ? -1 : 1;
    const a = sides[side];
    a[0] += p.getX(i); a[1] += p.getY(i); a[2] += p.getZ(i); a[3]++;
  }
  return Object.values(sides).filter((a) => a[3] > 0).map((a) => [a[0] / a[3], a[1] / a[3], a[2] / a[3]]);
}

export class StreetDressing {
  /** @param {import('../world.js').World} world */
  constructor(world) {
    this.world = world;
    this.cfg = world.game.config.get('street');
  }

  /**
   * Plan everything (before colliders and chunks exist), load the models, make materials.
   * @param {{ramps, landmarks, roads}} ctx
   */
  async init(ctx) {
    const { game, layout, shared } = this.world;
    const { assets, config } = game;
    const cfg = this.cfg;
    this.plan = new StreetPlan(layout, cfg, { ...ctx, viaducts: config.get('landmarks').viaducts });

    // Kenney props (GLB) with the code stand-ins as the placeholder; code-built props.
    assets.registerDefault('model.street.props', () => makeFallbackKit());
    let kit = null;
    try { kit = await assets.load('model.street.props'); } catch (err) { log.warn('street props: no models', err); }
    const fallback = makeFallbackKit();
    const geoOf = (name) => (kit?.getObjectByName(name) || fallback.getObjectByName(name))?.geometry || null;
    this.geos = {};
    this.glowGeos = {};
    for (const name of KIT) {
      this.geos[name] = geoOf(name);
      this.glowGeos[name] = geoOf(`${name}.glow`);
    }
    this.geos.bench = makeBench(cfg.benches);
    this.geos.bin = makeBin();
    this.geos.transformer = makeTransformer(cfg.transformers, layout.world.props.pole.height);
    this.geos.scaffold = makeScaffoldCell(cfg.construction);
    this.geos.net = makeNet(cfg.construction);
    this.poolGeo = makePoolQuad();
    // Merging needs plain (non-indexed) triangle lists.
    for (const set of [this.geos, this.glowGeos]) for (const k of Object.keys(set)) if (set[k]?.index) set[k] = set[k].toNonIndexed();
    this.binColors = cfg.bins.colors;
    this.headOffsets = Object.fromEntries(LAMPS.map((k) => [k, headsOf(this.glowGeos[k])]));

    // Night materials: grey bulbs by day, glowing at night (streetLights feature sets the level).
    const N = cfg.night;
    const glowTex = makePoolTexture(N.poolSoftness);
    this.materials = {
      bulb: new THREE.MeshLambertMaterial({ color: N.bulbDay, emissive: N.bulb, emissiveIntensity: 0 }),
      pool: new THREE.MeshLambertMaterial({
        color: 0x000000, emissive: N.pool, emissiveMap: glowTex, emissiveIntensity: 0,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      }),
    };
    this.materials.pool.visible = false;
    // Construction nets: see-through green mesh cloth.
    this.netMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: cfg.construction.netOpacity, depthWrite: false, side: THREE.DoubleSide });
    // Load-shedding: lamps in the dark district go out too.
    this.world.cityShading?.patchCut(this.materials.bulb);
    this.world.cityShading?.patchCut(this.materials.pool);

    this.heads = this.collectHeads();
    this.footbridges = new Footbridges(this.plan.footbridges, cfg.footbridges, { lit: shared.facadeMaterial, glow: this.materials.bulb }, this.world.root);
    const count = (k) => layout.pieces.reduce((n, p) => n + (p.street ? p.street[k].length : 0), 0);
    log.info(`street: ${count('lamp') + count('lampDouble')} lamps, ${count('bench')} benches, ${count('bin')} bins, ${count('transformer')} transformers, ${this.plan.sites} construction sites, ${this.plan.footbridges.length} footbridges`);
  }

  /** Every lamp bulb in the city (world positions). */
  collectHeads() {
    const out = [];
    for (const p of this.world.layout.pieces) {
      if (!p.street) continue;
      for (const kind of LAMPS) {
        for (const o of p.street[kind]) {
          for (const h of this.headOffsets[kind]) {
            const c = Math.cos(o.rot), sn = Math.sin(o.rot);
            out.push(o.x + h[0] * c + h[2] * sn, o.y + h[1], o.z - h[0] * sn + h[2] * c);
          }
        }
      }
    }
    return new Float32Array(out);
  }

  /** Register the street colliders (lamps, benches, bins, fences, footbridge stairs...). */
  addColliders(collision, flags) {
    for (const c of this.plan.colliders) collision.add(c.x0, c.z0, c.x1, c.z1, flags);
    return this.plan.colliders.length;
  }

  /**
   * Instanced meshes for one chunk.
   * @param {Array<object>} pieces  the chunk's pieces
   * @param {object} quality        data/quality.json level
   */
  buildChunk(pieces, quality) {
    const lists = emptyStreet();
    for (const p of pieces) if (p.street) for (const k of STREET_KINDS) for (const o of p.street[k]) lists[k].push(o);
    const density = quality.propDensity;
    const keep = (kind) => {
      const items = lists[kind];
      if (!THIN.has(kind) || density >= 1) return items;
      return items.filter((o) => (hashInts(Math.round(o.x * 10), Math.round(o.z * 10), 5) % 1000) / 1000 < density);
    };
    // Small props are MERGED into one mesh per chunk (1 draw call instead of one per kind —
    // matters on phones); the many identical scaffold cells and nets stay instanced.
    const solid = [], glow = [];
    for (const kind of MERGED) {
      const items = keep(kind);
      if (!items.length || !this.geos[kind]) continue;
      solid.push([this.geos[kind], items, kind === 'bin' ? (o) => this.binColors[o.tint] : null]);
      if (this.glowGeos[kind]) glow.push([this.glowGeos[kind], items, null]);
    }
    const out = [];
    if (solid.length) out.push(new THREE.Mesh(mergeItems(solid), this.world.shared.propMaterial));
    if (glow.length) {
      const bulbs = new THREE.Mesh(mergeItems(glow), this.materials.bulb);
      bulbs.userData.noCastShadow = true;
      out.push(bulbs);
    }
    for (const kind of INSTANCED) {
      const items = lists[kind];
      if (!items.length) continue;
      const mesh = this.instanced(this.geos[kind], kind === 'net' ? this.netMaterial : this.world.shared.propMaterial, items);
      if (kind === 'net') mesh.userData.noCastShadow = true;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      out.push(mesh);
    }
    const pools = this.pools(lists);
    if (pools) {
      pools.instanceMatrix.needsUpdate = true;
      pools.computeBoundingSphere();
      out.push(pools);
    }
    return out;
  }

  instanced(geo, material, items) {
    const mesh = new THREE.InstancedMesh(geo, material, items.length);
    items.forEach((o, i) => {
      q.setFromAxisAngle(up, o.rot);
      m4.compose(v.set(o.x, o.y, o.z), q, s.set(o.sx || 1, o.sy || 1, o.sz || 1));
      mesh.setMatrixAt(i, m4);
    });
    return mesh;
  }

  /** Soft warm circles on the ground under every bulb (only visible at night). */
  pools(lists) {
    const N = this.cfg.night;
    const spots = [];
    for (const kind of LAMPS) {
      for (const o of lists[kind]) {
        const c = Math.cos(o.rot), sn = Math.sin(o.rot);
        for (const h of this.headOffsets[kind]) spots.push([o.x + h[0] * c + h[2] * sn, o.y + N.poolLift, o.z - h[0] * sn + h[2] * c]);
      }
    }
    if (!spots.length) return null;
    const mesh = new THREE.InstancedMesh(this.poolGeo, this.materials.pool, spots.length);
    q.identity();
    spots.forEach((p, i) => mesh.setMatrixAt(i, m4.compose(v.set(p[0], p[1], p[2]), q, s.set(N.poolRadius * 2, 1, N.poolRadius * 2))));
    mesh.userData.noCastShadow = true;
    mesh.renderOrder = 2;
    return mesh;
  }

  /** @param {{x:number, z:number}} focus */
  update(focus, viewDistance) {
    this.footbridges?.update(focus, viewDistance);
  }
}
