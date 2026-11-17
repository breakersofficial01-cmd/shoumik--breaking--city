// RoadNet: the city's roads as a graph that vehicles can follow. PURE DATA, built from the
// layout (no meshes). Available to every feature as  game.world.roads.
//
// A JUNCTION is a road crossing (c, r) of the city grid (c = 0..cols, r = 0..rows).
// A SEGMENT is the road from junction (c, r) towards direction d to the next junction.
// Directions: 0 = north (-z), 1 = east (+x), 2 = south (+z), 3 = west (-x).
// Bangladesh drives on the LEFT, so the lane of a segment lies to the left of its direction.
//
//   roads.exits(c, r)                 directions you can leave a junction by
//   roads.segment(c, r, d, offset)    start/end points of that lane (offset = metres left of the centre line)
//   roads.signalGreen(c, r, d)        may traffic arriving in direction d enter junction (c, r)?
//   roads.route(c0, r0, c1, r1)       list of directions from one junction to another
//   roads.nearestSegment(x, z)        the road nearest to a point
//   roads.busStops                    [{ c, r, d, u, x, z, sx, sz, heading }]  (Session 4: poster slots)
// Numbers: data/traffic.json.

import { KIND, isRaised } from './layout.js';
import { hashInts } from '../core/rng.js';

export const DIRS = [
  { name: 'N', dc: 0, dr: -1, fx: 0, fz: -1, heading: Math.PI },
  { name: 'E', dc: 1, dr: 0, fx: 1, fz: 0, heading: Math.PI / 2 },
  { name: 'S', dc: 0, dr: 1, fx: 0, fz: 1, heading: 0 },
  { name: 'W', dc: -1, dr: 0, fx: -1, fz: 0, heading: -Math.PI / 2 },
];
export const dirByName = (name) => Math.max(0, DIRS.findIndex((d) => d.name === name));
export const opposite = (d) => (d + 2) % 4;
const isRoadPiece = (p) => !!p && (p.kind === KIND.ROAD_EW || p.kind === KIND.ROAD_NS);

export class RoadNet {
  /** @param {import('./layout.js').CityLayout} layout  @param {object} cfg data/traffic.json */
  constructor(layout, cfg) {
    this.layout = layout;
    this.cfg = cfg;
    this.exitCache = new Map();
    this.time = 0; // seconds of game time; the vehicles feature advances it (signals use it)
    this.jams = (cfg.jams || []).map((j) => ({ ...j, ...layout.crossingCentre(j.col, j.row) }));
    this.buildBusStops();
  }

  key(c, r, d = 0) { return (c * 64 + r) * 4 + d; }

  isJunction(c, r) {
    const p = this.layout.piece(2 * c, 2 * r);
    return !!p && p.kind === KIND.CROSSING;
  }

  /** The road piece leaving junction (c, r) in direction d (may be a lake or park instead). */
  roadPiece(c, r, d) {
    return this.layout.piece(2 * c + DIRS[d].dc, 2 * r + DIRS[d].dr);
  }

  hasRoad(c, r, d) {
    return isRoadPiece(this.roadPiece(c, r, d)) && this.isJunction(c + DIRS[d].dc, r + DIRS[d].dr);
  }

  exits(c, r) {
    const k = this.key(c, r);
    let list = this.exitCache.get(k);
    if (!list) {
      list = [0, 1, 2, 3].filter((d) => this.hasRoad(c, r, d));
      this.exitCache.set(k, list);
    }
    return list;
  }

  centre(c, r) {
    return this.layout.crossingCentre(c, r);
  }

  /** One lane of a segment: from the edge of junction (c, r) to the edge of the next junction. */
  segment(c, r, d, offset) {
    const D = DIRS[d];
    const half = this.layout.W / 2;
    const a = this.centre(c, r), b = this.centre(c + D.dc, r + D.dr);
    const lx = D.fz, lz = -D.fx; // left of the direction of travel
    const ax = a.x + D.fx * half + lx * offset, az = a.z + D.fz * half + lz * offset;
    const bx = b.x - D.fx * half + lx * offset, bz = b.z - D.fz * half + lz * offset;
    return { c, r, d, ax, az, bx, bz, fx: D.fx, fz: D.fz, lx, lz, heading: D.heading, len: Math.hypot(bx - ax, bz - az) };
  }

  /** The jam zone a point is inside, or null. */
  jamAt(x, z) {
    for (const j of this.jams) if (Math.hypot(x - j.x, z - j.z) < j.radius) return j;
    return null;
  }

  /** Junctions take turns: north-south traffic, everybody stops, east-west traffic, everybody stops. */
  signalGreen(c, r, d, time = this.time) {
    if (this.exits(c, r).length <= 2) return true; // a bend or a plain road: nothing to wait for
    const s = this.cfg.signals;
    const jam = this.jams.find((j) => j.col === c && j.row === r);
    const green = s.greenSeconds * (jam ? jam.greenFactor : 1);
    const red = s.allRedSeconds / (jam ? jam.greenFactor : 1);
    const period = 2 * (green + red);
    const t = (time + (hashInts(c, r, 5) % 1000) / 1000 * period) % period;
    return d % 2 === 0 ? t < green : t >= green + red && t < 2 * green + red;
  }

  /** Road nearest to (x, z) as a segment going east (d = 1) or south (d = 2); t = 0..1 along it. */
  nearestSegment(x, z) {
    const L = this.layout;
    const p = L.pieceAt(x, z);
    if (!p) return null;
    let best = isRoadPiece(p) ? p : null;
    if (!best) {
      let bestD = Infinity;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const q = L.piece(p.i + di, p.j + dj);
        if (!isRoadPiece(q)) continue;
        const dx = Math.max(q.x - x, 0, x - (q.x + q.w)), dz = Math.max(q.z - z, 0, z - (q.z + q.d));
        if (dx * dx + dz * dz < bestD) { bestD = dx * dx + dz * dz; best = q; }
      }
    }
    if (!best) return null;
    const ew = best.kind === KIND.ROAD_EW;
    const c = best.i >> 1, r = best.j >> 1, d = ew ? 1 : 2;
    if (!this.hasRoad(c, r, d)) return null;
    const t = ew ? (x - best.x) / best.w : (z - best.z) / best.d;
    return { c, r, d, t: Math.max(0, Math.min(1, t)) };
  }

  /** Nearest junction that really is a junction (not inside a park or lake). */
  nearestJunction(x, z) {
    const L = this.layout;
    const c0 = Math.round((x - L.minX - L.W / 2) / L.P), r0 = Math.round((z - L.minZ - L.W / 2) / L.P);
    let best = null, bestD = Infinity;
    for (let c = c0 - 2; c <= c0 + 2; c++) {
      for (let r = r0 - 2; r <= r0 + 2; r++) {
        if (!this.isJunction(c, r) || this.exits(c, r).length === 0) continue;
        const p = this.centre(c, r);
        const d = Math.hypot(p.x - x, p.z - z);
        if (d < bestD) { bestD = d; best = { c, r }; }
      }
    }
    return best;
  }

  /** Shortest way (fewest junctions) from one junction to another. Returns directions, or null. */
  route(c0, r0, c1, r1) {
    const start = this.key(c0, r0), goal = this.key(c1, r1);
    if (start === goal) return [];
    const from = new Map([[start, null]]);
    const queue = [[c0, r0]];
    while (queue.length) {
      const [c, r] = queue.shift();
      for (const d of this.exits(c, r)) {
        const nc = c + DIRS[d].dc, nr = r + DIRS[d].dr;
        const k = this.key(nc, nr);
        if (from.has(k)) continue;
        from.set(k, { c, r, d });
        if (k === goal) {
          const path = [];
          for (let step = from.get(k); step; step = from.get(this.key(step.c, step.r))) path.unshift(step.d);
          return path;
        }
        queue.push([nc, nr]);
      }
    }
    return null;
  }

  busStopOn(c, r, d) {
    return this.busStopMap.get(this.key(c, r, d)) || null;
  }

  buildBusStops() {
    const L = this.layout;
    const b = this.cfg.busStops;
    this.busStops = [];
    this.busStopMap = new Map();
    for (let c = 0; c <= L.cols; c++) {
      for (let r = 0; r <= L.rows; r++) {
        for (let d = 0; d < 4; d++) {
          if (!this.hasRoad(c, r, d) || hashInts(L.seed, c, r, d, 77) % b.every !== 0) continue;
          const seg = this.segment(c, r, d, this.cfg.lanes.outer);
          // The shelter needs a sidewalk on the left of the road.
          const road = this.roadPiece(c, r, d);
          const side = L.piece(road.i + Math.sign(seg.lx), road.j + Math.sign(seg.lz));
          if (!side || !isRaised(side) || side.kind !== KIND.BLOCK) continue;
          const u = seg.len * b.at;
          const kerb = L.W / 2 - this.cfg.lanes.outer + b.shelter.fromKerb + b.shelter.depth / 2;
          const stop = {
            c, r, d, u, heading: seg.heading,
            x: seg.ax + seg.fx * u, z: seg.az + seg.fz * u,
            sx: seg.ax + seg.fx * u + seg.lx * kerb, sz: seg.az + seg.fz * u + seg.lz * kerb,
            lx: seg.lx, lz: seg.lz, y: side.y,
          };
          this.busStops.push(stop);
          this.busStopMap.set(this.key(c, r, d), stop);
        }
      }
    }
  }
}
