// Dishes: the 3D food and drinks the waiter puts on the table (Roadmap 2 S4).
//
// Every menu item (data/menu.json → items.<id>.model) is a list of PARTS:
//   { serve: plate | bowl | board | glass | tall | cup | bottle | coconut | coupe | clayPot, liquid, top, fruit, straw, leaves, cap, clear }
//   { kit: <name>, at, rot, scale, fb }   a CC0 model from assets/food/food.glb (tools/food-kit/)
//   { code: <shape>, color, color2, n, r, h, ring, at, ... }   a little code-built shape (below)
// The result is three geometries per item (cached, shared by every copy):
//   base   plates, cups, bottle caps, straws — stays after eating
//   food   what gets eaten / drunk — shrinks while Shoumik eats
//   glass  see-through glasses and bottles (drawn with the glass material)
// All metres, the dish stands on y = 0, centred on x/z = 0, +z = towards the diner.
// When the food GLB is missing (or not streamed yet) kit parts become coloured blobs (fb).

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hexToLinear } from '../../world/geoBuilder.js';

const TAU = Math.PI * 2;
const WHITE = '#f4f3ee';
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

/** Little seeded number list so every copy of a dish looks the same. */
function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const hash = (str) => [...str].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

/** Geometry → plain non-indexed (position, normal, color) placed with a transform. */
function prep(geo, hex, x = 0, y = 0, z = 0, o = {}) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) {
    if (k !== 'position' && k !== 'normal' && k !== 'color') { g.deleteAttribute(k); continue; }
    // Compressed models can store quantised or RGBA attributes: make every one plain xyz floats
    // so all parts merge.
    const a = g.attributes[k];
    if (a.itemSize !== 3 || !(a.array instanceof Float32Array) || a.normalized || a.isInterleavedBufferAttribute) {
      const f = new Float32Array(a.count * 3);
      for (let i = 0; i < a.count; i++) { f[i * 3] = a.getX(i); f[i * 3 + 1] = a.getY(i); f[i * 3 + 2] = a.getZ(i); }
      g.setAttribute(k, new THREE.BufferAttribute(f, 3));
    }
  }
  _e.set(o.rx || 0, o.ry || 0, o.rz || 0);
  _q.setFromEuler(_e);
  _s.set(o.sx ?? o.s ?? 1, o.sy ?? o.s ?? 1, o.sz ?? o.s ?? 1);
  _m.compose(_p.set(x, y, z), _q, _s);
  g.applyMatrix4(_m);
  if (hex) {
    const c = hexToLinear(hex);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set(c, i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  return g;
}

const cyl = (r0, r1, h, seg = 12) => new THREE.CylinderGeometry(r1, r0, h, seg).translate(0, h / 2, 0);
const ball = (r, w = 8, hh = 6) => new THREE.SphereGeometry(r, w, hh);
const dome = (r) => new THREE.SphereGeometry(r, 10, 5, 0, TAU, 0, Math.PI / 2);

/** Height of the surface food sits on, per container. */
const TOP = { plate: 0.016, bowl: 0.062, board: 0.022, none: 0 };

export class DishMaker {
  /**
   * @param {Record<string, object>} items  data/menu.json → items
   * @param {THREE.Object3D|null} kit        the loaded food.glb scene (child meshes by name) or null
   */
  constructor(items, kit = null) {
    this.items = items;
    this.kit = kit;
    kit?.updateMatrixWorld(true);
    this.cache = new Map();
  }

  /** The food models arrived (stream): forget cached stand-ins. */
  setKit(kit) {
    this.kit = kit;
    kit?.updateMatrixWorld(true);
    for (const v of this.cache.values()) for (const g of Object.values(v)) g?.dispose();
    this.cache.clear();
  }

  /** { base, food, glass } geometries for a menu item (null parts are left out). */
  get(id) {
    if (this.cache.has(id)) return this.cache.get(id);
    const item = this.items[id];
    const out = { base: [], food: [], glass: [] };
    let top = 0;
    const rnd = seeded(hash(id));
    for (const p of item?.model || [{ serve: 'plate' }, { code: 'mound', color: '#c98b2e' }]) {
      if (p.serve) top = this.serve(p, out);
      else if (p.kit) this.kitPart(p, top, out);
      else if (p.code) this.codePart(p, top, out, rnd);
    }
    const merge = (list) => (list.length ? mergeGeometries(list) : null);
    const res = { base: merge(out.base), food: merge(out.food), glass: merge(out.glass) };
    for (const g of [...out.base, ...out.food, ...out.glass]) g.dispose();
    this.cache.set(id, res);
    return res;
  }

  // ---- containers (return the height food sits on)
  serve(p, out) {
    const B = out.base, F = out.food, G = out.glass;
    const liquid = p.liquid || '#c89a6a';
    switch (p.serve) {
      case 'plate':
        B.push(prep(cyl(0.11, 0.14, 0.016, 16), WHITE));
        return TOP.plate;
      case 'bowl':
        B.push(prep(cyl(0.055, 0.095, 0.06, 14), WHITE));
        return TOP.bowl;
      case 'board':
        B.push(prep(new THREE.BoxGeometry(0.34, 0.022, 0.3).translate(0, 0.011, 0), '#8a5a32'));
        return TOP.board;
      case 'glass':
      case 'tall': {
        const h = p.serve === 'tall' ? 0.16 : 0.11, r = p.serve === 'tall' ? 0.036 : 0.038;
        G.push(prep(cyl(r * 0.85, r, h, 12)));
        F.push(prep(cyl(r * 0.78, r * 0.9, h * 0.82, 10), liquid, 0, 0.004, 0));
        if (p.top) F.push(prep(cyl(r * 0.9, r * 0.92, 0.014, 10), p.top, 0, h * 0.82, 0));
        if (p.leaves) for (let i = 0; i < 4; i++) F.push(prep(new THREE.BoxGeometry(0.014, 0.004, 0.009), p.leaves, Math.cos(i * 1.7) * r * 0.5, h * 0.83, Math.sin(i * 1.7) * r * 0.5, { ry: i }));
        if (p.fruit) B.push(prep(cyl(0.024, 0.024, 0.006, 10), p.fruit, r * 0.9, h * 0.9, 0, { rz: Math.PI / 2 }));
        if (p.straw) B.push(prep(cyl(0.004, 0.004, h * 0.9, 5), p.straw, -r * 0.3, h * 0.35, 0, { rz: -0.25 }));
        return h;
      }
      case 'cup':
        B.push(prep(cyl(0.06, 0.07, 0.008, 14), WHITE));
        B.push(prep(cyl(0.03, 0.04, 0.055, 12), WHITE, 0, 0.008, 0));
        B.push(prep(new THREE.TorusGeometry(0.017, 0.005, 5, 10), WHITE, 0.045, 0.036, 0));
        F.push(prep(cyl(0.037, 0.037, 0.004, 12), liquid, 0, 0.058, 0));
        return 0.06;
      case 'bottle': {
        G.push(prep(cyl(0.03, 0.03, 0.15, 10)));
        G.push(prep(cyl(0.03, 0.012, 0.05, 10), null, 0, 0.15, 0));
        F.push(prep(cyl(0.027, 0.027, 0.13, 10), liquid, 0, 0.004, 0));
        B.push(prep(cyl(0.013, 0.013, 0.018, 8), p.cap || '#d82a2a', 0, 0.2, 0));
        return 0.22;
      }
      case 'coconut':
        B.push(prep(ball(0.09, 10, 8), '#5fa83a', 0, 0.09, 0, { sy: 1.12 }));
        B.push(prep(cyl(0.035, 0.035, 0.004, 10), '#f4f0dc', 0, 0.19, 0));
        B.push(prep(cyl(0.004, 0.004, 0.12, 5), '#f7c21e', 0.01, 0.2, 0, { rz: -0.3 }));
        return 0.2;
      case 'coupe': {
        G.push(prep(cyl(0.035, 0.035, 0.004, 12)));
        G.push(prep(cyl(0.004, 0.004, 0.07, 6), null, 0, 0.004, 0));
        G.push(prep(new THREE.ConeGeometry(0.055, 0.06, 12, 1, true).rotateX(Math.PI).translate(0, 0.104, 0)));
        F.push(prep(new THREE.ConeGeometry(0.046, 0.05, 12).rotateX(Math.PI).translate(0, 0.1, 0), liquid));
        if (p.fruit) B.push(prep(cyl(0.02, 0.02, 0.005, 10), p.fruit, 0.05, 0.13, 0, { rz: Math.PI / 2 }));
        return 0.13;
      }
      case 'clayPot':
        B.push(prep(cyl(0.05, 0.068, 0.065, 12), '#b5653a'));
        F.push(prep(cyl(0.064, 0.064, 0.006, 12), liquid, 0, 0.062, 0));
        return 0.068;
      default:
        return 0;
    }
  }

  // ---- a model from the food kit (or a blob while it is missing)
  kitPart(p, top, out) {
    const [ax = 0, ay = 0, az = 0] = p.at || [];
    const o = { ry: ((p.rot || 0) * Math.PI) / 180, s: p.scale || 1 };
    const src = this.kit?.getObjectByName(p.kit);
    if (src?.geometry) {
      const g = src.geometry.clone().applyMatrix4(src.matrixWorld); // compressed files keep a node scale
      out.food.push(prep(g, g.attributes.color ? null : p.fb || '#c88a4a', ax, top + ay, az, o));
    } else {
      out.food.push(prep(ball(0.05, 8, 5), p.fb || '#c88a4a', ax, top + ay + 0.02, az, { ...o, sy: 0.5 }));
    }
  }

  // ---- code-built food (rice, curry, fuchka, jilapi…)
  codePart(p, top, out, rnd) {
    const F = out.food;
    const [ax = 0, ay = 0, az = 0] = p.at || [];
    const y0 = (p.y ?? top) + ay;
    const c = p.color || '#c98b2e', c2 = p.color2 || '#7a3b1e';
    const n = p.n || 1;
    const around = (i, rad) => [ax + Math.cos((i / n) * TAU + 0.4) * rad, az + Math.sin((i / n) * TAU + 0.4) * rad];
    switch (p.code) {
      case 'mound': {
        const r = p.r || 0.08, h = p.h || 0.05;
        F.push(prep(dome(r), c, ax, y0, az, { sy: h / r }));
        for (let i = 0; i < n; i++) {
          const a = rnd() * TAU, d = Math.sqrt(rnd()) * r * 0.75;
          const yy = y0 + h * Math.sqrt(Math.max(0, 1 - (d / r) ** 2));
          F.push(prep(new THREE.BoxGeometry(0.022, 0.016, 0.02), c2, ax + Math.cos(a) * d, yy, az + Math.sin(a) * d, { ry: a }));
        }
        break;
      }
      case 'fill': {
        const yy = p.low ? 0.04 : 0.055;
        F.push(prep(cyl(0.086, 0.088, 0.008, 14), c, ax, yy, az));
        const sz = p.big ? 0.032 : 0.016;
        for (let i = 0; i < n; i++) {
          const a = rnd() * TAU, d = Math.sqrt(rnd()) * 0.06;
          F.push(prep(new THREE.BoxGeometry(sz, sz * 0.6, sz * 0.8), c2, ax + Math.cos(a) * d, yy + 0.008, az + Math.sin(a) * d, { ry: a }));
        }
        break;
      }
      case 'puddle':
        F.push(prep(cyl(0.09, 0.09, 0.004, 14), c, ax, y0, az));
        break;
      case 'balls': {
        const r = p.r || 0.022;
        for (let i = 0; i < n; i++) {
          const [x, z] = n === 1 ? [ax, az] : around(i, p.ring || 0.05);
          F.push(prep(ball(r), c, x, y0 + r * 0.9, z));
        }
        break;
      }
      case 'egg':
        F.push(prep(dome(0.024), '#f8f6ee', ax, y0, az, { sy: 0.9 }));
        F.push(prep(cyl(0.013, 0.013, 0.003, 8), '#f2b81e', ax, y0 + 0.021, az));
        break;
      case 'chilli':
        F.push(prep(cyl(0.006, 0.004, 0.06, 6), '#2f9e3a', ax, y0 + 0.006, az, { rz: Math.PI / 2, ry: 0.6 }));
        break;
      case 'pyramids':
        for (let i = 0; i < n; i++) {
          const [x, z] = around(i, 0.05);
          F.push(prep(new THREE.ConeGeometry(0.036, 0.05, 3).translate(0, 0.025, 0), c, x, y0, z, { ry: i }));
        }
        break;
      case 'triangles':
        for (let i = 0; i < n; i++) {
          const [x, z] = around(i, 0.05);
          F.push(prep(cyl(0.042, 0.042, 0.02, 3), c, x, y0, z, { ry: i * 0.9 }));
        }
        break;
      case 'discs':
        for (let i = 0; i < n; i++) {
          const [x, z] = around(i, 0.055);
          F.push(prep(cyl(p.r || 0.022, p.r || 0.022, 0.014, 8), c, x, y0 + (i % 2) * 0.004, z, { rx: 0.15 }));
        }
        break;
      case 'slices':
        for (let i = 0; i < n; i++) F.push(prep(new THREE.BoxGeometry(0.09, 0.012, 0.03).translate(0, 0.006, 0), c, ax, y0 + (i % 2) * 0.006, az + (i - (n - 1) / 2) * 0.034, { ry: 0.3 + i * 0.1 }));
        break;
      case 'flat':
        F.push(prep(cyl(p.r || 0.1, p.r || 0.1, 0.008, 14), c, ax, y0, az));
        break;
      case 'ovals':
        for (let i = 0; i < n; i++) {
          const [x, z] = around(i, 0.05);
          F.push(prep(ball(0.026), c, x, y0 + 0.016, z, { sx: 1.5, sy: 0.7, sz: 0.85, ry: i }));
        }
        break;
      case 'spirals':
        for (let i = 0; i < n; i++) {
          const [x, z] = around(i, 0.055);
          F.push(prep(new THREE.TorusGeometry(0.03, 0.007, 4, 12), c, x, y0 + 0.007, z, { rx: Math.PI / 2 }));
          F.push(prep(new THREE.TorusGeometry(0.016, 0.007, 4, 10), c, x, y0 + 0.007, z, { rx: Math.PI / 2 }));
        }
        break;
      case 'pasta':
        F.push(prep(dome(0.08), c, ax, y0, az, { sy: 0.4 }));
        for (let i = 0; i < 5; i++) F.push(prep(new THREE.TorusGeometry(0.03 + i * 0.008, 0.004, 4, 12), c, ax, y0 + 0.012 + i * 0.002, az, { rx: Math.PI / 2 + (rnd() - 0.5) * 0.4 }));
        F.push(prep(dome(0.04), c2, ax, y0 + 0.022, az, { sy: 0.35 }));
        break;
      case 'slice':
        F.push(prep(cyl(0.025, 0.025, 0.006, 10), c, ax, y0, az));
        break;
      case 'cupSmall':
        out.base.push(prep(cyl(0.022, 0.032, 0.035, 10), WHITE, ax, y0, az));
        F.push(prep(cyl(0.029, 0.029, 0.004, 10), p.liquid || '#6b3b1a', ax, y0 + 0.033, az));
        break;
      default:
        F.push(prep(ball(0.04, 8, 5), c, ax, y0 + 0.02, az, { sy: 0.6 }));
    }
  }

  dispose() {
    this.setKit(null);
  }
}

/** One dish on a table: a group of up to three meshes (base / food / glass). */
export function makeDish(maker, id, materials, scale = 1) {
  const g = maker.get(id);
  const group = new THREE.Group();
  group.name = `dish-${id}`;
  let food = null;
  if (g.base) group.add(new THREE.Mesh(g.base, materials.food));
  if (g.food) { food = new THREE.Mesh(g.food, materials.food); group.add(food); }
  if (g.glass) { const m = new THREE.Mesh(g.glass, materials.glass); m.renderOrder = 2; group.add(m); }
  group.scale.setScalar(scale);
  return { id, group, food, eaten: 0 };
}
