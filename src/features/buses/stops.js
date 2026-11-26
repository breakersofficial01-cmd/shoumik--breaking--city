// Bus-stop names and routes for the buses feature (Roadmap 2 S6).
// The stops themselves come from the road network (world.roads.busStops, made from
// data/traffic.json → busStops); each gets the name of the nearest place in data/places.json
// ("শাহবাগ" / "Shahbag"), with a number when two stops share a place.

import { DIRS } from '../../world/roads.js';

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
const bnNum = (n) => String(n).replace(/\d/g, (d) => BN_DIGITS[d]);

/** Give every bus stop { id, name: { en, bn } }. */
export function nameStops(stops, places) {
  const used = new Map();
  for (const st of stops) {
    const D = DIRS[st.d];
    const mc = st.c + D.dc * 0.55, mr = st.r + D.dr * 0.55;
    let best = null, bestD = Infinity;
    for (const p of places) {
      if (!Number.isFinite(p.col)) continue;
      const d = Math.hypot(p.col - mc, p.row - mr);
      if (d < bestD) { bestD = d; best = p; }
    }
    const base = best?.name || { en: 'Bus stop', bn: 'বাস স্টপ' };
    const n = (used.get(base.en) || 0) + 1;
    used.set(base.en, n);
    st.id = `bus-${st.c}-${st.r}-${st.d}`;
    st.name = n === 1 ? { en: base.en, bn: base.bn } : { en: `${base.en} ${n}`, bn: `${base.bn} ${bnNum(n)}` };
  }
}

/**
 * Plan the roads from the end of segment (c, r, d) to bus stop `to`:
 * returns { route: [direction at each junction], segs: [{ c, r, d }] (the segments after this one) }.
 */
export function routeTo(roads, c, r, d, to) {
  const D = DIRS[d];
  const jc = c + D.dc, jr = r + D.dr;
  let dirs;
  if (jc === to.c && jr === to.r) dirs = [];
  else {
    dirs = roads.route(jc, jr, to.c, to.r);
    if (!dirs) return null;
  }
  dirs = [...dirs, to.d];
  const segs = [];
  let cc = c, rr = r, dd = d;
  for (const step of dirs) { cc += DIRS[dd].dc; rr += DIRS[dd].dr; dd = step; segs.push({ c: cc, r: rr, d: dd }); }
  if (!segs.every((s) => roads.hasRoad(s.c, s.r, s.d))) return null;
  return { route: dirs, segs };
}
