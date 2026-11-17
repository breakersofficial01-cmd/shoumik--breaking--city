// Viaducts: MRT Line 6 and the elevated expressway (flyover). Both are a deck on pillars
// that follows the middle of the roads. Lines, heights and stations: data/landmarks.json →
// viaducts. A line's `path` is a list of road junctions [col, row] (fractions allowed; a
// value outside the grid runs the line out of the city into the haze).
//
// Pillars stand on the centre line of the road, only in the straight stretch between two
// junctions, and are slimmer than the gap between the two inner traffic lanes — AI drivers
// do not look for static obstacles (docs/HANDOFF.md §13). Each pillar has a collider.
// The deck itself is scenery: nothing drives or walks on it (see docs/NEXT.md).

import { KIND } from '../layout.js';
import { Kit } from './kit.js';

/** A smooth line through junction points with rounded corners. Distances in metres. */
export class ViaductPath {
  /** @param {import('../layout.js').CityLayout} layout  @param {number[][]} junctions [col,row] list */
  constructor(layout, junctions, cornerRadius) {
    const pts = junctions.map(([c, r]) => ({ x: layout.minX + c * layout.P + layout.W / 2, z: layout.minZ + r * layout.P + layout.W / 2 }));
    this.pts = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[i - 1], b = pts[i], c = pts[i + 1];
      const la = Math.hypot(a.x - b.x, a.z - b.z), lc = Math.hypot(c.x - b.x, c.z - b.z);
      const r = Math.min(cornerRadius, la / 2, lc / 2);
      const p0 = { x: b.x + ((a.x - b.x) / la) * r, z: b.z + ((a.z - b.z) / la) * r };
      const p1 = { x: b.x + ((c.x - b.x) / lc) * r, z: b.z + ((c.z - b.z) / lc) * r };
      for (let k = 0; k <= 8; k++) {
        const t = k / 8, u = 1 - t; // quadratic curve through the corner
        this.pts.push({ x: u * u * p0.x + 2 * u * t * b.x + t * t * p1.x, z: u * u * p0.z + 2 * u * t * b.z + t * t * p1.z });
      }
    }
    this.pts.push(pts[pts.length - 1]);
    this.dist = [0];
    for (let i = 1; i < this.pts.length; i++) this.dist.push(this.dist[i - 1] + Math.hypot(this.pts[i].x - this.pts[i - 1].x, this.pts[i].z - this.pts[i - 1].z));
    this.length = this.dist[this.dist.length - 1];
    this.cursor = 1;
  }

  /** Position and heading at `s` metres along the line. `side` = metres to the LEFT of travel. */
  at(s, out = {}, side = 0) {
    s = Math.max(0, Math.min(this.length, s));
    let i = this.cursor;
    if (i >= this.dist.length || this.dist[i - 1] > s) i = 1;
    while (i < this.dist.length - 1 && this.dist[i] < s) i++;
    this.cursor = i;
    const a = this.pts[i - 1], b = this.pts[i];
    const seg = this.dist[i] - this.dist[i - 1] || 1;
    const t = (s - this.dist[i - 1]) / seg;
    const fx = (b.x - a.x) / seg, fz = (b.z - a.z) / seg;
    out.x = a.x + (b.x - a.x) * t + fz * side;
    out.z = a.z + (b.z - a.z) * t - fx * side;
    out.heading = Math.atan2(fx, fz);
    return out;
  }

  /** Distance along the line of the point nearest to (x, z). */
  nearest(x, z) {
    let best = 0, bestD = Infinity;
    for (let i = 1; i < this.pts.length; i++) {
      const a = this.pts[i - 1], b = this.pts[i];
      const dx = b.x - a.x, dz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
      const d = Math.hypot(a.x + dx * t - x, a.z + dz * t - z);
      if (d < bestD) { bestD = d; best = this.dist[i - 1] + (this.dist[i] - this.dist[i - 1]) * t; }
    }
    return best;
  }
}

/** The deck's cross-section as a closed loop of [offset to the right, height] + a colour per edge. */
function profile(line, C) {
  const w = line.deckWidth / 2, b = line.deckY, t = b + line.deckThickness, p = t + line.parapet, i = w - 0.25;
  return {
    pts: [[-i, t], [i, t], [i, p], [w, p], [w, b + 0.5], [w * 0.45, b], [-w * 0.45, b], [-w, b + 0.5], [-w, p], [-i, p]],
    colors: [C.deck, C.concrete, C.concrete, C.concrete, C.under, C.under, C.under, C.concrete, C.concrete, C.concrete],
  };
}

/** One pillar with its hammer-head. Local space: z along the road. */
function pillar(k, line, C) {
  const hw = line.pillar.width / 2, hl = line.pillar.length / 2;
  const top = line.deckY - line.pillar.head;
  k.box(-hw, 0, -hl, hw, top, hl, C.pillar, { floors: 3, grad: 0.7 });
  k.frustum(-line.deckWidth * 0.4, -hl, line.deckWidth * 0.4, hl, line.deckY, top - 0.3, line.deckWidth * 0.4 - hw, C.pillar, { top: C.pillar, grad: 0.85 });
  const c = line.pillar.collider / 2;
  k.solid(-c, -hl * 0.85, c, hl * 0.85, false);
}

/** A station: platforms either side, a vaulted roof, legs down to the sidewalks, name boards. */
function station(k, line, st, C, uv) {
  const L = line.station.length / 2, w = line.deckWidth / 2, pw = w + line.station.platform;
  const floor = line.deckY + line.deckThickness, roofY = floor + line.station.roofHeight;
  for (const s of [-1, 1]) {
    k.box(s > 0 ? w : -pw, line.deckY + 0.4, -L, s > 0 ? pw : -w, floor + 0.5, L, C.concrete, { flat: true, top: C.platform, faces: 'nsewtb' });
    k.box(s > 0 ? pw - 0.2 : -pw, floor + 0.5, -L, s > 0 ? pw : -pw + 0.2, floor + 2.4, L, C.stationWall, { flat: true });
    k.box(s > 0 ? pw - 0.12 : -pw - 0.02, floor + 2.4, -L, s > 0 ? pw + 0.02 : -pw + 0.12, floor + 3.6, L, C.stationGlow, { glow: true, faces: 'ew' });
    k.columns(s * (pw - 0.3), -L + 1, s * (pw - 0.3), L - 1, 6, floor + 0.5, roofY, 0.16, C.pillar, 4);
    // Legs standing on the sidewalk, and the covered stairway down.
    for (const z of [-L * 0.8, -L * 0.3, L * 0.3, L * 0.8]) {
      k.box(s * line.station.legOffset - 0.3, 0, z - 0.3, s * line.station.legOffset + 0.3, line.deckY + 0.4, z + 0.3, C.pillar, { floors: 2, grad: 0.7 });
      k.solid(s * line.station.legOffset - 0.3, z - 0.3, s * line.station.legOffset + 0.3, z + 0.3, false);
      k.beam([s * line.station.legOffset, line.deckY + 0.1, z], [s * (pw - 0.6), line.deckY + 0.1, z], 0.6, C.pillar);
    }
    k.beam([s * line.station.legOffset, 0.4, L * 0.72], [s * line.station.legOffset, line.deckY + 1, L * 0.36], 1.5, C.stationWall);
    if (uv) {
      const bw = 9, bh = bw * uv.aspect, x = s * (pw + 0.03);
      k.sign(uv, x, s > 0 ? bw / 2 : -bw / 2, x, s > 0 ? -bw / 2 : bw / 2, floor + 0.55, floor + 0.55 + bh, 0.04);
    }
  }
  k.vault(-pw - 0.4, -L, pw + 0.4, L, roofY, line.station.roofRise, C.roof, 'z', 6, C.stationWall);
}

/**
 * Build one line. Returns { path, sections: [{ kit, cx, cz }], pillars: [{ x, z, heading }], stations }.
 * `makeBuilders()` gives a fresh { lit, glow, sign } set for each section (= one culled mesh group).
 */
export function buildViaduct(layout, line, C, makeBuilders, sign) {
  const path = new ViaductPath(layout, line.path, line.cornerRadius);
  const prof = profile(line, C);
  const sections = [];
  const pillars = [];
  const seenPieces = new Set();
  const here = {}, next = {};
  const R = (p) => [-Math.cos(p.heading), Math.sin(p.heading)]; // right of travel
  const ring = (p) => { const r = R(p); return prof.pts.map(([o, y]) => [p.x + r[0] * o, y, p.z + r[1] * o]); };
  let kit = null, sectionStart = 0;
  const step = line.step;

  for (let s = 0; s < path.length - 0.01; s += step) {
    if (!kit || s - sectionStart >= line.sectionLength) {
      path.at(Math.min(path.length, s + line.sectionLength / 2), here);
      kit = new Kit(makeBuilders(), { cx: 0, cz: 0, y: 0, angle: 0 });
      sections.push({ kit, cx: here.x, cz: here.z });
      sectionStart = s;
    }
    const s1 = Math.min(path.length, s + step);
    path.at(s, here);
    path.at(s1, next);
    const a = ring(here), b = ring(next);
    for (let e = 0; e < a.length; e++) {
      const f = (e + 1) % a.length;
      kit.quad(a[e], a[f], b[f], b[e], prof.colors[e]);
    }
    const top = line.deckY + line.deckThickness + line.parapet, w = line.deckWidth / 2, r = R(here);
    const edge = (side, y) => [here.x + r[0] * side, y, here.z + r[1] * side];
    const n = Math.round(s / step);
    if (line.kind === 'rail') {
      // Rails, and a power-line portal every few steps.
      for (const o of [-2.6, -1.2, 1.2, 2.6]) kit.quad(edge(o - 0.09, top - line.parapet + 0.04), edge(o + 0.09, top - line.parapet + 0.04), [next.x + R(next)[0] * (o + 0.09), top - line.parapet + 0.04, next.z + R(next)[1] * (o + 0.09)], [next.x + R(next)[0] * (o - 0.09), top - line.parapet + 0.04, next.z + R(next)[1] * (o - 0.09)], C.rail);
      if (n % line.mastEvery === 0) {
        kit.beam(edge(-w + 0.12, top), edge(-w + 0.12, top + 5.2), 0.2, C.mast);
        kit.beam(edge(w - 0.12, top), edge(w - 0.12, top + 5.2), 0.2, C.mast);
        kit.beam(edge(-w + 0.12, top + 5.2), edge(w - 0.12, top + 5.2), 0.16, C.mast);
      }
    } else if (n % line.mastEvery === 0) {
      // Road flyover: street lamps leaning in from both sides.
      for (const side of [-1, 1]) {
        kit.beam(edge(side * (w - 0.12), top), edge(side * (w - 0.12), top + 6), 0.16, C.mast);
        kit.beam(edge(side * (w - 0.12), top + 6), edge(side * (w - 1.7), top + 6.3), 0.12, C.mast);
        const l = edge(side * (w - 1.7), top + 6.05);
        kit.box(l[0] - 0.3, l[1], l[2] - 0.3, l[0] + 0.3, l[1] + 0.22, l[2] + 0.3, C.lamp, { glow: true, faces: 'nsewb' });
      }
    }
    // Pillars: four along every straight road piece the line passes over.
    const piece = layout.pieceAt(here.x, here.z);
    if (piece && (piece.kind === KIND.ROAD_NS || piece.kind === KIND.ROAD_EW) && !seenPieces.has(piece)) {
      const ns = piece.kind === KIND.ROAD_NS;
      const mid = ns ? piece.x + piece.w / 2 : piece.z + piece.d / 2;
      if (Math.abs((ns ? here.x : here.z) - mid) < 0.4) {
        seenPieces.add(piece);
        const len = ns ? piece.d : piece.w;
        for (let i = 0; i < line.pillar.perBlock; i++) {
          const u = line.pillar.fromJunction + ((len - 2 * line.pillar.fromJunction) * i) / (line.pillar.perBlock - 1);
          const x = ns ? mid : piece.x + u, z = ns ? piece.z + u : mid;
          const heading = ns ? 0 : Math.PI / 2;
          const pk = new Kit(kit.b, { cx: x, cz: z, y: 0, angle: heading });
          pillar(pk, line, C);
          kit.colliders.push(...pk.colliders);
          pillars.push({ x, z, heading, line: line.id });
        }
      }
    }
  }
  // Stations go into whichever section is nearest.
  const stations = [];
  for (const st of line.stations || []) {
    const jx = layout.minX + st.at[0] * layout.P + layout.W / 2, jz = layout.minZ + st.at[1] * layout.P + layout.W / 2;
    const s = path.nearest(jx, jz);
    path.at(s, here);
    const sec = sections.reduce((best, c) => (Math.hypot(c.cx - here.x, c.cz - here.z) < Math.hypot(best.cx - here.x, best.cz - here.z) ? c : best), sections[0]);
    const k = new Kit(sec.kit.b, { cx: here.x, cz: here.z, y: 0, angle: here.heading });
    station(k, line, st, C, sign(st.id));
    sec.kit.colliders.push(...k.colliders);
    stations.push({ id: st.id, name: st.name, s, x: here.x, z: here.z, heading: here.heading });
  }
  return { id: line.id, kind: line.kind, line, path, sections, pillars, stations };
}
