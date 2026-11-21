// Where the foot overbridges go (Roadmap 2, Session 1). PURE DATA.
// A footbridge crosses a road between two ordinary city blocks, a little after an electric
// pole, with its stairs running along the kerb on both sidewalks (towards the next pole).
// Never under the MRT / flyover, next to a landmark, on a stunt ramp or at a bus stop.
// Settings: data/street.json → footbridges. Meshes: footbridges.js.
//
// Each bridge: { id, cx, cz, ux, uz, half, d0, piece, sides:[blockPiece, blockPiece] }
//   (cx, cz)  centre of the deck (middle of the road)      (ux, uz) direction the stairs run
//   half      half the road width (deck spans 2*(half + stair width) across)

import { Rng, hashInts } from '../../core/rng.js';
import { KIND } from '../layout.js';

/** Road pieces under a viaduct: path = junctions [col, row]; straight runs only. */
function viaductRoads(viaducts) {
  const set = new Set();
  for (const v of viaducts || []) {
    const path = v.path || [];
    for (let k = 1; k < path.length; k++) {
      const [c1, r1] = path[k - 1], [c2, r2] = path[k];
      if (c1 === c2) for (let j = 2 * Math.min(r1, r2) + 1; j < 2 * Math.max(r1, r2); j += 2) set.add(`${2 * c1},${j}`);
      if (r1 === r2) for (let i = 2 * Math.min(c1, c2) + 1; i < 2 * Math.max(c1, c2); i += 2) set.add(`${i},${2 * r1}`);
    }
  }
  return set;
}

/**
 * @param {import('../layout.js').CityLayout} L
 * @param {object} F  data/street.json → footbridges
 * @param {{ramps, roads, viaducts}} ctx
 * @param {import('./plan.js').StreetPlan} plan  (clearSmall + colliders)
 */
export function planFootbridges(L, F, ctx, plan) {
  if (!F || !F.maxCount) return [];
  const under = viaductRoads(ctx.viaducts);
  const { pole } = L.world.props;
  const sw = L.world.grid.sidewalkWidth;
  const half = L.W / 2;
  const isBlock = (p) => p && p.kind === KIND.BLOCK && !p.landmark && p.content;
  const candidates = [];
  for (const p of L.pieces) {
    const ew = p.kind === KIND.ROAD_EW, ns = p.kind === KIND.ROAD_NS;
    if (!ew && !ns || p.area || under.has(`${p.i},${p.j}`)) continue;
    const a = ew ? L.piece(p.i, p.j - 1) : L.piece(p.i - 1, p.j);
    const b = ew ? L.piece(p.i, p.j + 1) : L.piece(p.i + 1, p.j);
    if (!isBlock(a) || !isBlock(b)) continue;
    const rng = new Rng(hashInts(L.seed, p.i, p.j, 7101));
    if (!rng.chance(F.chance)) continue;
    candidates.push({ p, a, b, ew, order: rng.next() });
  }
  candidates.sort((u, v) => u.order - v.order);

  const chosen = [];
  for (const c of candidates) {
    if (chosen.length >= F.maxCount) break;
    const { p, ew } = c;
    // Not too close to another bridge on the same road line.
    if (chosen.some((o) => (ew ? o.piece.j === p.j && Math.abs(o.piece.i - p.i) < 2 * F.minGap + 1
      : o.piece.i === p.i && Math.abs(o.piece.j - p.j) < 2 * F.minGap + 1))) continue;
    // Poles along this road (same spots on both blocks); start the deck just after the middle one.
    const s0 = (ew ? p.x : p.z) + pole.inset, s1 = (ew ? p.x + p.w : p.z + p.d) - pole.inset;
    const n = Math.max(2, Math.round((s1 - s0) / pole.spacing));
    const k = Math.floor((n - 1) / 2);
    const poleAt = s0 + ((k + 0.5) / n) * (s1 - s0);
    const nextPole = s0 + ((k + 1.5) / n) * (s1 - s0);
    const d0 = poleAt + F.fromPole;
    const end = d0 + F.deckWidth + F.stairRun;
    if (end + 0.8 > nextPole) continue;
    const mid = d0 + F.deckWidth / 2;
    const roadMid = (ew ? p.z : p.x) + half;
    const cx = ew ? mid : roadMid, cz = ew ? roadMid : mid;
    // Stunt ramps and bus stops keep their space.
    if (ctx.ramps.heightAt(cx, cz) > 0) continue;
    const span = F.stairRun + F.deckWidth;
    if ((ctx.roads.busStops || []).some((s) => Math.hypot(s.sx - cx, s.sz - cz) < F.busStopGap + span / 2)) continue;

    // Clear the stair strip on both sidewalks and make the stairs solid.
    for (const side of [-1, 1]) {
      const k0 = roadMid + side * half;             // kerb line
      const k1 = roadMid + side * (half + sw);      // building side of the sidewalk
      const sMin = d0 - 1, sMax = end + 1;
      const clear = ew ? { x0: sMin, x1: sMax, z0: Math.min(k0, k1), z1: Math.max(k0, k1) }
        : { z0: sMin, z1: sMax, x0: Math.min(k0, k1), x1: Math.max(k0, k1) };
      const block = side < 0 ? c.a : c.b;
      plan.street(block);
      plan.clearSmall(block, [clear]);
      const w0 = roadMid + side * (half + 0.05), w1 = roadMid + side * (half + F.stairWidth + 0.2);
      const solid = ew ? { x0: d0, x1: end, z0: Math.min(w0, w1), z1: Math.max(w0, w1) }
        : { z0: d0, z1: end, x0: Math.min(w0, w1), x1: Math.max(w0, w1) };
      plan.colliders.push(solid);
    }
    chosen.push({ id: `fob-${p.i}-${p.j}`, piece: p, cx, cz, ux: ew ? 1 : 0, uz: ew ? 0 : 1, half, y: p.y, kerb: L.kerb });
  }
  return chosen;
}
