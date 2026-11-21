// Street look planner (Roadmap 2, Session 1). PURE DATA — no Three.js here.
// Adds to every city piece a `street` list of small things to draw with instancing:
//     piece.street = { lamp:[], lampDouble:[], bench:[], bin:[], dumpster:[], transformer:[],
//                      cone:[], barrier:[], fence:[], scaffold:[], net:[] }
// Each item = { x, y, z, rot, sx?, sy?, sz?, tint? }  (rot = heading, model +z faces that way).
// Extra street trees go straight into piece.content.trees (drawn + collided like the old ones).
// Also returns colliders and the footbridge list (footbridges.js builds their meshes).
//
// Uses its OWN seeded Rng per piece (hashInts(seed, i, j, 7001)), so the buildings, signs and
// old trees of the city stay exactly as they were. Numbers: data/street.json.

import { Rng, hashInts } from '../../core/rng.js';
import { KIND } from '../layout.js';
import { planFootbridges } from './footbridgePlan.js';

export const STREET_KINDS = ['lamp', 'lampDouble', 'bench', 'bin', 'dumpster', 'transformer', 'cone', 'barrier', 'fence', 'scaffold', 'net'];

export const emptyStreet = () => Object.fromEntries(STREET_KINDS.map((k) => [k, []]));

/**
 * The four sidewalk edges of a block piece, walked clockwise like blockgen.js does.
 * pos(t, d) = world point at fraction t along the edge (between the pole insets) and d metres
 * in from the kerb. rot = heading that faces the road. (dx, dz) = unit vector along the edge.
 */
export function blockEdges(piece, inset) {
  const { x, z, w, d } = piece;
  const X0 = x + inset, X1 = x + w - inset, Z0 = z + inset, Z1 = z + d - inset;
  return [
    { side: 'N', di: 0, dj: -1, rot: Math.PI, len: X1 - X0, dx: 1, dz: 0, pos: (t, k) => ({ x: X0 + (X1 - X0) * t, z: z + k }) },
    { side: 'E', di: 1, dj: 0, rot: Math.PI / 2, len: Z1 - Z0, dx: 0, dz: 1, pos: (t, k) => ({ x: x + w - k, z: Z0 + (Z1 - Z0) * t }) },
    { side: 'S', di: 0, dj: 1, rot: 0, len: X1 - X0, dx: -1, dz: 0, pos: (t, k) => ({ x: X1 - (X1 - X0) * t, z: z + d - k }) },
    { side: 'W', di: -1, dj: 0, rot: -Math.PI / 2, len: Z1 - Z0, dx: 0, dz: -1, pos: (t, k) => ({ x: x + k, z: Z1 - (Z1 - Z0) * t }) },
  ];
}

/** Rectangles where nothing small may stand (construction fences, footbridge stairs). */
const inside = (r, x, z, pad = 0) => x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad;

export class StreetPlan {
  /**
   * @param {import('../layout.js').CityLayout} layout
   * @param {object} cfg  data/street.json
   * @param {{ramps:object, landmarks:object, roads:object, viaducts:Array}} ctx
   */
  constructor(layout, cfg, ctx) {
    this.layout = layout;
    this.cfg = cfg;
    this.world = layout.world;
    this.colliders = [];  // { x0, z0, x1, z1 }
    this.sites = 0;
    const areaLandmarks = new Set(ctx.landmarks.sites.filter((s) => !s.piece).map((s) => s.place.landmark.area));
    for (const p of layout.pieces) {
      if (p.kind === KIND.BLOCK && p.content) this.planBlock(p, ctx);
      else if (p.kind === KIND.PARK && p.content && !areaLandmarks.has(p.area?.id)) this.planPark(p, ctx);
    }
    // Footbridges last: they clear the small things standing where their stairs go.
    this.footbridges = planFootbridges(layout, cfg.footbridges, ctx, this);
    for (const p of layout.pieces) if (p.street) this.collectColliders(p);
  }

  rng(p) { return new Rng(hashInts(this.layout.seed, p.i, p.j, 7001)); }

  street(p) { return p.street || (p.street = emptyStreet()); }

  // ---- city blocks -----------------------------------------------------------------------
  planBlock(p, ctx) {
    const { cfg, world } = this;
    const rng = this.rng(p);
    const S = this.street(p);
    const y = p.y;
    const spacing = world.props.pole.spacing;
    p.noSmall = []; // rectangles where benches / bins / trees must not go
    this.planConstruction(p, rng, S);

    for (const e of blockEdges(p, world.props.pole.inset)) {
      const n = Math.max(2, Math.round(e.len / spacing));
      const gap = (k, slot) => (k + 0.5 + slot) / n; // between pole k and pole k+1
      for (let k = 0; k < n - 1; k++) {
        if (rng.chance(cfg.lamps.chance)) {
          const at = e.pos(gap(k, cfg.lamps.slot), cfg.lamps.fromKerb);
          S.lamp.push({ x: at.x, y, z: at.z, rot: e.rot });
        }
        // Extra street tree where blockgen left a gap.
        if (rng.chance(cfg.trees.chance)) {
          const at = e.pos(gap(k, cfg.trees.slot), cfg.trees.fromKerb);
          if (this.treeFits(p, at.x, at.z, ctx)) {
            const t = world.props.tree;
            p.content.trees.push({ x: at.x, z: at.z, h: rng.range(t.height[0], t.height[1]) * 0.8, tint: rng.int(0, t.colors.length - 1), rot: rng.range(0, Math.PI * 2) });
          }
        }
        // A bench facing the road, maybe with a dustbin; or a dustbin on its own at the kerb.
        if (rng.chance(cfg.benches.chance)) {
          const at = e.pos(gap(k, cfg.benches.slot), cfg.benches.fromKerb);
          S.bench.push({ x: at.x, y, z: at.z, rot: e.rot });
          if (rng.chance(cfg.benches.binChance)) S.bin.push({ x: at.x + e.dx * 1.35, y, z: at.z + e.dz * 1.35, rot: e.rot, tint: rng.int(0, cfg.bins.colors.length - 1) });
        } else if (rng.chance(cfg.bins.chance)) {
          const at = e.pos(gap(k, cfg.bins.slot), cfg.bins.fromKerb);
          S.bin.push({ x: at.x, y, z: at.z, rot: e.rot, tint: rng.int(0, cfg.bins.colors.length - 1) });
        }
      }
    }
    // Transformers on some of the old electric poles (second pole goes along the edge).
    for (const pole of p.content.poles) {
      if (!rng.chance(cfg.transformers.chance)) continue;
      S.transformer.push({ x: pole.x, y, z: pole.z, rot: pole.rot });
    }
    // Waste containers in the small lanes.
    for (const lane of p.content.patches) {
      if (!lane.lane || !rng.chance(cfg.dumpsters.chance)) continue;
      const along = lane.alongX ? lane.x1 - lane.x0 : lane.z1 - lane.z0;
      if (along < 10) continue;
      const u = rng.range(3, along - 3);
      const side = rng.chance(0.5);
      const off = cfg.dumpsters.fromSide;
      S.dumpster.push(lane.alongX
        ? { x: lane.x0 + u, y, z: side ? lane.z0 + off : lane.z1 - off, rot: Math.PI / 2 }
        : { x: side ? lane.x0 + off : lane.x1 - off, y, z: lane.z0 + u, rot: 0 });
    }
    this.clearSmall(p);
  }

  /** One construction site in some blocks: bamboo scaffolding round a building + site fence. */
  planConstruction(p, rng, S) {
    const C = this.cfg.construction;
    if (!rng.chance(C.chance)) return;
    const sw = this.world.grid.sidewalkWidth;
    const inner = { x0: p.x + sw, z0: p.z + sw, x1: p.x + p.w - sw, z1: p.z + p.d - sw };
    // Buildings next to a main road (within 4 m of the sidewalk), tall enough.
    const near = 4;
    const options = p.content.buildings.filter((b) => b.floors >= C.minFloors && (
      b.z0 - inner.z0 < near || inner.z1 - b.z1 < near || b.x0 - inner.x0 < near || inner.x1 - b.x1 < near));
    if (!options.length) return;
    const b = options[rng.int(0, options.length - 1)];
    b.construction = true;
    this.sites++;
    const [bayW, bayH] = C.bay;
    const net = rng.chance(C.netChance);
    // Walls of the building: (a → b) left to right seen from outside, (ox, oz) outward.
    const sides = [
      { ax: b.x0, az: b.z1, bx: b.x1, bz: b.z1, ox: 0, oz: 1, road: inner.z1 - b.z1 < near, edge: 'S' },
      { ax: b.x1, az: b.z0, bx: b.x0, bz: b.z0, ox: 0, oz: -1, road: b.z0 - inner.z0 < near, edge: 'N' },
      { ax: b.x1, az: b.z1, bx: b.x1, bz: b.z0, ox: 1, oz: 0, road: inner.x1 - b.x1 < near, edge: 'E' },
      { ax: b.x0, az: b.z0, bx: b.x0, bz: b.z1, ox: -1, oz: 0, road: b.x0 - inner.x0 < near, edge: 'W' },
    ];
    const levels = Math.ceil((b.h + 1.2) / bayH);
    for (const s of sides) {
      if (!s.road && !(b.front & { S: 2, N: 1, E: 8, W: 4 }[s.edge])) continue;
      const len = Math.hypot(s.bx - s.ax, s.bz - s.az);
      const bays = Math.max(1, Math.round(len / bayW));
      const rot = Math.atan2(s.ox, s.oz);
      const stretch = len / bays / bayW;
      for (let k = 0; k < bays; k++) {
        const t = (k + 0.5) / bays;
        const x = s.ax + (s.bx - s.ax) * t + s.ox * C.offset;
        const z = s.az + (s.bz - s.az) * t + s.oz * C.offset;
        for (let l = 0; l < levels; l++) S.scaffold.push({ x, y: p.y + l * bayH, z, rot, sx: stretch });
      }
      if (net) {
        const x = (s.ax + s.bx) / 2 + s.ox * (C.offset + 0.75), z = (s.az + s.bz) / 2 + s.oz * (C.offset + 0.75);
        S.net.push({ x, y: p.y + bayH, z, rot, sx: len + 0.6, sy: levels * bayH - bayH });
      }
      if (s.road) this.siteFence(p, s, len, rot, S, rng);
    }
  }

  /** Fence on the sidewalk in front of a construction site, cones and barriers at the kerb. */
  siteFence(p, s, len, rot, S, rng) {
    const C = this.cfg.construction;
    const y = p.y;
    // The sidewalk line in front of this wall: the same wall pushed out to the kerb.
    const kerb = s.edge === 'N' ? p.z : s.edge === 'S' ? p.z + p.d : s.edge === 'W' ? p.x : p.x + p.w;
    const across = (k) => kerb - (s.ox + s.oz) * k; // k metres in from the kerb (on the outward axis)
    const ux = (s.bx - s.ax) / len, uz = (s.bz - s.az) / len;
    const fenceLen = 3.36;
    const count = Math.max(1, Math.floor((len + 2) / fenceLen));
    const start = (len - count * fenceLen) / 2 + fenceLen / 2;
    const at = (u, k) => (s.ox !== 0 ? { x: across(k), z: s.az + uz * u } : { x: s.ax + ux * u, z: across(k) });
    for (let i = 0; i < count; i++) {
      const q = at(start + i * fenceLen, C.fenceFromKerb);
      S.fence.push({ x: q.x, y, z: q.z, rot });
    }
    for (let i = 0; i < C.cones; i++) {
      const q = at(((i + 0.5) / C.cones) * len, C.coneFromKerb);
      S.cone.push({ x: q.x, y, z: q.z, rot: rng.range(0, Math.PI * 2) });
    }
    if (rng.chance(C.barrierChance)) {
      for (const u of [-0.8, len + 0.8]) {
        const q = at(u, 1.6);
        S.barrier.push({ x: q.x, y, z: q.z, rot: rot + Math.PI / 2 });
      }
    }
    // Keep benches, bins and trees out of the fenced strip.
    const a = at(-1.5, 0), b = at(len + 1.5, this.world.grid.sidewalkWidth);
    p.noSmall.push({ x0: Math.min(a.x, b.x), z0: Math.min(a.z, b.z), x1: Math.max(a.x, b.x), z1: Math.max(a.z, b.z) });
  }

  // ---- parks -----------------------------------------------------------------------------
  planPark(p) {
    const L = this.cfg.lamps;
    if (!L.parkSpacing) return;
    const rng = this.rng(p);
    const S = this.street(p);
    const nx = Math.max(1, Math.floor((p.w - 2 * L.parkMargin) / L.parkSpacing) + 1);
    const nz = Math.max(1, Math.floor((p.d - 2 * L.parkMargin) / L.parkSpacing) + 1);
    const ox = p.x + (p.w - (nx - 1) * L.parkSpacing) / 2, oz = p.z + (p.d - (nz - 1) * L.parkSpacing) / 2;
    for (let a = 0; a < nx; a++) {
      for (let b = 0; b < nz; b++) {
        const x = ox + a * L.parkSpacing, z = oz + b * L.parkSpacing;
        const rot = (a + b) % 2 ? 0 : Math.PI / 2;
        S.lampDouble.push({ x, y: p.y, z, rot });
        if (rng.chance(this.cfg.benches.parkChance)) S.bench.push({ x: x + 1.6, y: p.y, z: z + 0.9, rot: rng.chance(0.5) ? 0 : Math.PI });
      }
    }
    // No tree right on top of a lamp or bench.
    p.content.trees = p.content.trees.filter((t) => ![...S.lampDouble, ...S.bench].some((o) => Math.hypot(o.x - t.x, o.z - t.z) < 2.6));
  }

  // ---- helpers ---------------------------------------------------------------------------
  treeFits(p, x, z, ctx) {
    const gap = this.cfg.trees.minGap;
    if (ctx.ramps.heightAt(x, z) > 0) return false;
    if (p.noSmall.some((r) => inside(r, x, z))) return false;
    for (const t of p.content.trees) if (Math.hypot(t.x - x, t.z - z) < gap) return false;
    for (const t of p.content.poles) if (Math.hypot(t.x - x, t.z - z) < 1.5) return false;
    return true;
  }

  /** Drop small things that ended up inside a no-go rectangle of the piece. */
  clearSmall(p, rects = p.noSmall) {
    if (!rects?.length || !p.street) return;
    const free = (o) => !rects.some((r) => inside(r, o.x, o.z, 0.6));
    for (const k of ['lamp', 'bench', 'bin', 'transformer']) p.street[k] = p.street[k].filter(free);
    p.content.trees = p.content.trees.filter(free);
  }

  /** Collision boxes (called once everything is placed). */
  collectColliders(p) {
    const S = p.street, c = this.cfg;
    const box = (x, z, hx, hz) => this.colliders.push({ x0: x - hx, z0: z - hz, x1: x + hx, z1: z + hz });
    const turned = (o) => Math.abs(Math.sin(o.rot)) > 0.7; // model x axis now runs along world z
    const lampR = c.lamps.colliderSize / 2;
    for (const o of [...S.lamp, ...S.lampDouble]) box(o.x, o.z, lampR, lampR);
    const [bw, bd] = c.benches.colliderSize;
    for (const o of S.bench) turned(o) ? box(o.x, o.z, bd / 2, bw / 2) : box(o.x, o.z, bw / 2, bd / 2);
    for (const o of S.bin) box(o.x, o.z, c.bins.colliderSize / 2, c.bins.colliderSize / 2);
    const [dw, dd] = c.dumpsters.colliderSize;
    for (const o of S.dumpster) turned(o) ? box(o.x, o.z, dd / 2, dw / 2) : box(o.x, o.z, dw / 2, dd / 2);
    const t = c.transformers;
    for (const o of S.transformer) box(o.x + Math.cos(o.rot) * t.gap, o.z - Math.sin(o.rot) * t.gap, t.colliderSize / 2, t.colliderSize / 2);
    for (const o of S.fence) turned(o) ? box(o.x, o.z, 0.2, 1.7) : box(o.x, o.z, 1.7, 0.2);
    for (const o of S.barrier) turned(o) ? box(o.x, o.z, 0.5, 0.9) : box(o.x, o.z, 0.9, 0.5);
  }
}
