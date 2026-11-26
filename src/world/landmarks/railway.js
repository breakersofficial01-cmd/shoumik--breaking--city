// Railway (Roadmap 2 S6): a ground-level railway line from the city's edge into the
// countryside, with stations. Data: data/landmarks.json → railways (path and stations in
// junction units [col, row] like the viaducts; they may lie outside the city).
// Built by landmarks/index.js like the viaducts; the trains run in features/railway.
//
//   track     ballast bed + sleepers + two rails, following the (smoothed) ground height
//   stations  a walkable platform (Kit.platform → part of world.heightAt), a canopy with a
//             wavy "umbrella" roof (Kamalapur-style) or a simple pitched roof, a station
//             house with its name board (sign atlas: Bangla + English), lamps, benches
//
//   buildRailway(layout, line, C, makeBuilders, sign, groundAt) →
//     { id, line, path, sections: [{ kit, cx, cz }], stations: [...], heightAt(s) }

import { Kit } from './kit.js';
import { ViaductPath } from './viaduct.js';

const WORLD = { cx: 0, cz: 0, y: 0, angle: 0 };
const _a = {};
const _b = {};

/** Smoothed height of the rail top along the path (sampled every 4 m). */
function profile(path, groundAt, R) {
  const step = 4;
  const n = Math.ceil(path.length / step) + 1;
  const raw = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    path.at(Math.min(path.length, i * step), _a);
    raw[i] = Math.max(R.minGround, groundAt(_a.x, _a.z));
  }
  // Moving average twice: gentle slopes; small dips (ditches, pond edges) are bridged.
  let cur = raw;
  for (let pass = 0; pass < 2; pass++) {
    const out = new Float32Array(n);
    const k = R.smooth;
    for (let i = 0; i < n; i++) {
      let sum = 0, cnt = 0;
      for (let j = Math.max(0, i - k); j <= Math.min(n - 1, i + k); j++) { sum += cur[j]; cnt++; }
      out[i] = Math.max(sum / cnt, raw[i] - 0.05);
    }
    cur = out;
  }
  const top = R.bed + R.sleeper + R.railHeight;
  return (s) => {
    const f = Math.max(0, Math.min(n - 1.001, s / step));
    const i = Math.floor(f), t = f - i;
    return cur[i] * (1 - t) + cur[i + 1] * t + top;
  };
}

/** One piece of track from s0 to s1 into the kit (world frame). */
function track(k, path, railTop, R, C, s0, s1) {
  const g = R.gauge / 2;
  const frame = (s, out) => { path.at(s, out); out.lx = Math.cos(out.heading); out.lz = -Math.sin(out.heading); out.y = railTop(s); return out; };
  const P = (f, side, y) => [f.x + f.lx * side, y, f.z + f.lz * side];
  // Ballast bed (top + two slopes) in 4 m pieces.
  for (let s = s0; s < s1 - 0.01; s += 4) {
    const a = frame(s, _a), b = frame(Math.min(s1, s + 4), _b);
    const ya = a.y - R.railHeight - R.sleeper, yb = b.y - R.railHeight - R.sleeper;
    const w = R.bedWidth / 2, wb = w + R.bed * 1.6;
    k.quad(P(a, -w, ya), P(a, w, ya), P(b, w, yb), P(b, -w, yb), C.ballast, { inside: [a.x, ya - 5, a.z] });
    for (const sd of [-1, 1]) k.quad(P(a, sd * w, ya), P(a, sd * wb, ya - R.bed - 0.3), P(b, sd * wb, yb - R.bed - 0.3), P(b, sd * w, yb), C.ballastSide, { inside: [a.x, ya - 5, a.z] });
  }
  // Sleepers.
  for (let s = s0; s < s1; s += R.sleeperEvery) {
    const a = frame(s, _a);
    const y = a.y - R.railHeight, y0 = y - R.sleeper;
    const hw = R.sleeperLength / 2, hd = 0.12;
    const fx = Math.sin(a.heading) * hd, fz = Math.cos(a.heading) * hd;
    const c = (side, along, yy) => [a.x + a.lx * side + fx * along, yy, a.z + a.lz * side + fz * along];
    k.quad(c(-hw, -1, y), c(hw, -1, y), c(hw, 1, y), c(-hw, 1, y), C.sleeper, { inside: [a.x, y - 3, a.z] });
    k.quad(c(-hw, 1, y0), c(hw, 1, y0), c(hw, 1, y), c(-hw, 1, y), C.sleeper, { inside: [a.x, y, a.z] });
    k.quad(c(-hw, -1, y0), c(hw, -1, y0), c(hw, -1, y), c(-hw, -1, y), C.sleeper, { inside: [a.x, y, a.z] });
  }
  // Rails (top + both faces) in 3 m pieces.
  for (let s = s0; s < s1 - 0.01; s += 3) {
    const a = frame(s, _a), b = frame(Math.min(s1, s + 3), _b);
    for (const sd of [-1, 1]) {
      const o0 = sd * g - 0.04, o1 = sd * g + 0.04;
      const mid = [a.x + a.lx * sd * g, a.y - 0.05, a.z + a.lz * sd * g];
      k.quad(P(a, o0, a.y), P(a, o1, a.y), P(b, o1, b.y), P(b, o0, b.y), C.rail, { inside: [a.x, a.y - 3, a.z] });
      k.quad(P(a, o0, a.y - R.railHeight), P(b, o0, b.y - R.railHeight), P(b, o0, b.y), P(a, o0, a.y), C.railSide, { inside: mid });
      k.quad(P(a, o1, a.y - R.railHeight), P(b, o1, b.y - R.railHeight), P(b, o1, b.y), P(a, o1, a.y), C.railSide, { inside: mid });
    }
  }
}

/** A station: platform on one side (side +1 = left of the +s direction), canopy, house, sign. */
function station(k, line, st, C, uv) {
  const S = line.station;
  const L = S.length / 2;
  const sd = st.platformSide;
  const x0 = sd * S.edge, x1 = sd * (S.edge + S.width);
  const lo = Math.min(x0, x1), hi = Math.max(x0, x1);
  const H = S.height;
  // Platform: concrete block with a yellow safety line, walkable (part of world.heightAt).
  k.box(lo, -0.4, -L, hi, H, L, C.platformSide, { flat: true, top: C.platform, faces: 'nsewt' });
  const yl = sd > 0 ? lo + 0.25 : hi - 0.25;
  k.ground(Math.min(yl, yl + sd * 0.25), -L, Math.max(yl, yl + sd * 0.25), L, C.safety, H + 0.015);
  k.platform(lo, -L, hi, L, H, 0.45);
  // Canopy: columns + roof. 'waves' = a row of small vaults across the platform (Kamalapur's
  // famous umbrella roof, simplified); otherwise one pitched roof.
  const roofY = H + S.roofHeight;
  const cx = (lo + hi) / 2;
  for (let z = -L + 3; z <= L - 3; z += S.columnEvery) k.prism(cx, z, H, roofY, 0.18, 0.18, 6, C.column);
  if (st.roof === 'waves') {
    for (let z = -L; z < L - 0.1; z += S.waveLength) k.vault(lo - 1.2, z, hi + 1.2, Math.min(L, z + S.waveLength), roofY, S.waveRise, C.roof, 'x', 5, C.roofEdge);
  } else {
    k.gable(lo - 0.8, -L * 0.7, hi + 0.8, L * 0.7, roofY, 1.1, C.roof, 'z', C.roofEdge);
  }
  // Station house behind the platform, with the name board facing the track.
  const hx0 = sd > 0 ? hi : lo - S.houseDepth, hx1 = sd > 0 ? hi + S.houseDepth : lo;
  const hl = S.houseLength / 2;
  k.box(hx0, 0, -hl, hx1, S.houseHeight, hl, C.house, { flat: true, top: C.houseRoof, grad: 0.8 });
  k.solid(hx0, -hl, hx1, hl, true);
  if (uv) {
    const bw = 8, bh = bw * uv.aspect, x = sd > 0 ? hi + 0.02 : lo - 0.02;
    k.sign(uv, x, sd > 0 ? bw / 2 : -bw / 2, x, sd > 0 ? -bw / 2 : bw / 2, S.houseHeight - bh - 0.3, S.houseHeight - 0.3, 0.05);
  }
  // Lamps and benches along the platform.
  for (let z = -L + 6; z <= L - 6; z += 14) {
    k.lamp(sd > 0 ? hi - 0.6 : lo + 0.6, z, H + 3.6, C.lampPost, C.lamp);
    const bx = sd > 0 ? hi - 1.3 : lo + 0.9;
    k.box(bx, H, z + 3, bx + 0.4, H + 0.45, z + 5, C.bench, { flat: true });
  }
}

export function buildRailway(layout, line, C, makeBuilders, sign, groundAt) {
  const path = new ViaductPath(layout, line.path, line.cornerRadius);
  const R = line.track;
  const railTop = profile(path, groundAt, R);
  const sections = [];
  for (let s0 = 0; s0 < path.length; s0 += line.sectionLength) {
    const s1 = Math.min(path.length, s0 + line.sectionLength);
    const kit = new Kit(makeBuilders(), WORLD);
    track(kit, path, railTop, R, C, s0, s1);
    path.at((s0 + s1) / 2, _a);
    sections.push({ kit, cx: _a.x, cz: _a.z });
  }
  const stations = [];
  for (const st of line.stations) {
    const jx = layout.minX + st.at[0] * layout.P + layout.W / 2, jz = layout.minZ + st.at[1] * layout.P + layout.W / 2;
    const s = path.nearest(jx, jz);
    const here = path.at(s, {});
    const base = railTop(s) - R.bed - R.sleeper - R.railHeight;
    const kit = new Kit(makeBuilders(), { cx: here.x, cz: here.z, y: base, angle: here.heading });
    station(kit, line, st, C, sign(st.id));
    sections.push({ kit, cx: here.x, cz: here.z, station: st.id });
    stations.push({ id: st.id, name: st.name, s, x: here.x, z: here.z, heading: here.heading, platformSide: st.platformSide, base, roof: st.roof });
  }
  const bounds = { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity };
  for (const p of path.pts) { bounds.x0 = Math.min(bounds.x0, p.x); bounds.x1 = Math.max(bounds.x1, p.x); bounds.z0 = Math.min(bounds.z0, p.z); bounds.z1 = Math.max(bounds.z1, p.z); }
  return { id: line.id, kind: 'railway', line, path, sections, stations, bounds, heightAt: railTop };
}
