// TerrainField (Roadmap 2 S3): the shape and look of the land AROUND the city, as pure maths.
// Everything here is a function of (x, z) + data/terrain.json, so the same land comes out on
// every device and the mesh, the gameplay height, the map and the props all agree.
//
//   field.heightAt(x, z)   gameplay ground height outside the city (bridge deck included;
//                          matches the drawn triangles exactly: it interpolates the same grid)
//   field.sample(x, z, o)  height + colour + what grows there (used by tiles.js / props.js)
//   field.zoneAt(x, z)     { id, name } of the countryside zone (for the HUD), or null
//   field.mapColor(x, z)   colour for the minimap painter
//   field.highways / ponds / bridge / sea / river   the planned features (metres)
//
// Layers, in order: zone land (fields / desert dunes / coast) → flattened next to the city →
// outer mountains → highways (flattened corridors) → ponds → beach + sea → the river.

import { Rng } from '../../core/rng.js';
import { hexToLinear } from '../geoBuilder.js';
import { fbm, noise2, smoothstep, segDistance } from './noise.js';

const lerp = (a, b, t) => a + (b - a) * t;
const mix3 = (out, a, b, t) => { out[0] = lerp(a[0], b[0], t); out[1] = lerp(a[1], b[1], t); out[2] = lerp(a[2], b[2], t); return out; };

export class TerrainField {
  /**
   * @param {import('../layout.js').CityLayout} layout
   * @param {object} cfg       data/terrain.json
   * @param {object} worldCfg  data/world.json
   */
  constructor(layout, cfg, worldCfg) {
    this.L = layout;
    this.cfg = cfg;
    this.seed = cfg.seed;
    const half = layout.W / 2;
    this.X = (col) => layout.minX + half + col * layout.P;
    this.Z = (row) => layout.minZ + half + row * layout.P;
    const b = cfg.bounds;
    this.bounds = { x0: this.X(b.col0), z0: this.Z(b.row0), x1: this.X(b.col1), z1: this.Z(b.row1) };
    this.city = { x0: layout.minX, z0: layout.minZ, x1: layout.maxX, z1: layout.maxZ };
    this.waterLevel = worldCfg.water.level;

    this.zones = cfg.zones.map((z) => ({
      ...z, T: cfg.types[z.type],
      x0: this.X(z.rect.col0), z0: this.Z(z.rect.row0), x1: this.X(z.rect.col1), z1: this.Z(z.rect.row1),
    }));
    this.colors = {};
    for (const [id, T] of Object.entries(cfg.types)) {
      this.colors[id] = Object.fromEntries(Object.entries(T.colors).map(([k, v]) => [k, hexToLinear(v)]));
    }
    this.mcol = Object.fromEntries(Object.entries(cfg.mountains.colors).map(([k, v]) => [k, hexToLinear(v)]));
    this.sand = hexToLinear(cfg.sea.sand);
    this.wetSand = hexToLinear(cfg.sea.wetSand);
    this.riverSand = hexToLinear(cfg.river.sand);
    this.pondBank = hexToLinear(cfg.ponds.bankColor);
    this.dry = this.colors.fields.dry;

    // River: from the city's south edge, river width wide, west bound → the sea.
    this.river = { z0: layout.maxZ, z1: layout.maxZ + worldCfg.water.riverWidth };
    // Sea: the shore line wobbles a little (shoreX(z)).
    const s = cfg.sea;
    this.sea = { x: this.X(s.shoreCol), wobble: s.wobble, period: s.wobbleMetres };

    // Highways: straight segments in metres.
    const H = cfg.highways;
    this.roadHalf = H.width / 2;
    this.roadReach = this.roadHalf + H.shoulder + H.fade;
    this.highways = H.list.map((h, k) => ({ ...h, index: k, pts: h.points.map(([c, r]) => [this.X(c), this.Z(r)]) }));
    this.segs = [];
    for (const h of this.highways) {
      for (let i = 1; i < h.pts.length; i++) {
        const [ax, az] = h.pts[i - 1], [bx, bz] = h.pts[i];
        this.segs.push({ ax, az, bx, bz, x0: Math.min(ax, bx) - this.roadReach, x1: Math.max(ax, bx) + this.roadReach, z0: Math.min(az, bz) - this.roadReach, z1: Math.max(az, bz) + this.roadReach, h });
      }
    }

    // Bridge over the river (gameplay deck + where the river collider has a gap).
    const B = cfg.bridge;
    this.bridge = B ? {
      ...B, x: this.X(B.col), half: B.width / 2,
      z0: this.river.z0, z1: this.river.z1 + B.ramp * 0.25,
      landZ: this.river.z1 + B.ramp * 0.25,
    } : null;

    // GPS lines out of the city: highways that start at a city junction, and the bridge (+ the
    // road that continues from its south end).
    this.routeLines = [];
    for (const h of this.highways) {
      const [c, r] = h.points[0];
      if (Number.isInteger(c) && Number.isInteger(r) && this.inCity(h.pts[0][0], h.pts[0][1])) this.routeLines.push({ c, r, pts: h.pts });
    }
    if (this.bridge) {
      const B = this.bridge;
      const on = this.highways.find((h) => Math.hypot(h.pts[0][0] - B.x, h.pts[0][1] - B.landZ) < 60);
      this.routeLines.push({ c: B.col, r: layout.rows, pts: [[B.x, this.Z(layout.rows)], [B.x, B.landZ], ...(on ? on.pts : [])] });
    }

    this.ponds = this.planPonds();
    this.cache = new Map(); // grid point heights for heightAt (same points as the mesh)
    this.cell = cfg.cell;
    this._o = { h: 0, col: [0, 0, 0], field: 0, cls: null, slopeOk: true, zone: null };
    this._t = { t: 0 };
  }

  // ---------------------------------------------------------------- small helpers
  inCity(x, z) { const c = this.city; return x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1; }
  inBounds(x, z) { const b = this.bounds; return x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1; }
  cityDistance(x, z) {
    const c = this.city;
    return Math.hypot(Math.max(c.x0 - x, 0, x - c.x1), Math.max(c.z0 - z, 0, z - c.z1));
  }
  shoreX(z) {
    const S = this.sea;
    return S.x + S.wobble * (Math.sin(z / S.period * Math.PI * 2) + 0.4 * Math.sin(z / (S.period * 0.37) + 1.3));
  }

  /** 0..1: how far into the outer mountain band (0 = foot, 1 = the edge). */
  mountainRaw(x, z) {
    const M = this.cfg.mountains, b = this.bounds;
    const jitter = (noise2(x / 230, z / 230, this.seed + 3) - 0.5) * M.band * 0.6;
    let m = 0;
    for (const side of M.sides) {
      const d = side === 'west' ? x - b.x0 : side === 'east' ? b.x1 - x : side === 'north' ? z - b.z0 : b.z1 - z;
      m = Math.max(m, 1 - (d + jitter) / M.band);
    }
    return Math.min(1, Math.max(0, m));
  }

  /** Smooth mountain height (no small bumps): also the height highways follow. */
  mountainSmooth(x, z, raw = this.mountainRaw(x, z)) {
    if (raw <= 0) return 0;
    const M = this.cfg.mountains;
    const k = Math.pow(smoothstep(0, 1, raw), 1.4);
    return M.height * k * (0.5 + 0.7 * fbm(x / M.noiseScale, z / M.noiseScale, this.seed + 7, 3));
  }

  /** Zone weights → writes the blended land height + colour into o. */
  zoneLand(x, z, o) {
    const blend = this.cfg.blend;
    let remaining = 1, h = 0, field = 0, best = null, bestW = 0;
    const col = o.col; col[0] = col[1] = col[2] = 0;
    const jitter = (noise2(x / 150, z / 150, this.seed + 11) - 0.5) * blend;
    for (const zn of this.zones) {
      if (remaining <= 0) break;
      const inside = Math.min(x - zn.x0, zn.x1 - x, z - zn.z0, zn.z1 - z) + jitter;
      const w = remaining * smoothstep(-blend / 2, blend / 2, inside);
      if (w <= 0) continue;
      remaining -= w;
      const lh = this.landHeight(zn, x, z, o._c || (o._c = [0, 0, 0]));
      h += lh * w;
      col[0] += o._c[0] * w; col[1] += o._c[1] * w; col[2] += o._c[2] * w;
      if (zn.type === 'fields') field += w;
      if (w > bestW) { bestW = w; best = zn; }
    }
    if (remaining > 0) { // outside every zone: plain fields colour
      const c = this.colors.fields.a;
      col[0] += c[0] * remaining; col[1] += c[1] * remaining; col[2] += c[2] * remaining;
    }
    o.zone = best;
    o.field = field;
    return h;
  }

  /** Height + colour of one zone's land at (x, z). */
  landHeight(zn, x, z, outCol) {
    const T = zn.T, C = this.colors[zn.type];
    const n = fbm(x / T.noiseScale, z / T.noiseScale, this.seed + 21, 3);
    if (zn.type === 'desert') {
      // Dunes: long wavy ridges across the wind, rounder on top.
      const warp = fbm(x / 260, z / 260, this.seed + 31, 2) * 6;
      const ridge = 0.5 + 0.5 * Math.sin((x * 0.8 + z * 0.6) / T.duneSpacing * Math.PI * 2 + warp);
      const h = T.height * ridge * ridge * (0.45 + 0.9 * n);
      mix3(outCol, C.b, C.a, Math.min(1, ridge * 0.8 + n * 0.4));
      if (ridge > 0.8) mix3(outCol, outCol, C.c, (ridge - 0.8) * 3);
      return h;
    }
    mix3(outCol, C.a, C.b, n);
    if (C.c && n > 0.62) mix3(outCol, outCol, C.c, (n - 0.62) * 2);
    return T.height * (n - 0.5) * 2;
  }

  // ---------------------------------------------------------------- the full sample
  /**
   * Everything about one point of land. Writes into o (returned):
   *   h      height in metres            col  linear RGB
   *   field  0..1 weight of the paddy-plot pattern (shader)
   *   cls    what grows there: 'fields' | 'desert' | 'coast' | 'beach' | 'mountains' | null
   */
  sample(x, z, o = this._o) {
    if (this.inCity(x, z)) {
      o.h = this.cfg.underCity; o.field = 0; o.cls = null; o.zone = null;
      o.col[0] = o.col[1] = o.col[2] = 0.3;
      return o;
    }
    let h = this.zoneLand(x, z, o);
    const col = o.col;
    let field = o.field;
    let cls = o.zone?.type || 'fields';
    // Flat next to the city, rising further out.
    const f = smoothstep(this.cfg.flat, this.cfg.flat + this.cfg.rise, this.cityDistance(x, z));
    h *= f;

    // Outer mountains.
    const raw = this.mountainRaw(x, z);
    const ms = this.mountainSmooth(x, z, raw);
    if (raw > 0) {
      const M = this.cfg.mountains;
      const detail = M.height * raw * raw * 0.12 * (noise2(x / 38, z / 38, this.seed + 41) - 0.5) * 2;
      h += ms + detail;
      const wm = smoothstep(0.05, 0.4, raw);
      const desert = o.zone?.type === 'desert';
      const top = smoothstep(M.height * 0.45, M.height * 0.85, h);
      const mc = this._mc || (this._mc = [0, 0, 0]);
      mix3(mc, this.mcol.forest, this.mcol.high, noise2(x / 60, z / 60, this.seed + 43));
      mix3(mc, mc, desert ? this.mcol.desertRock : this.mcol.rock, desert ? Math.max(top, 0.6) : top);
      mix3(col, col, mc, wm);
      field *= 1 - wm;
      if (wm > 0.5) cls = 'mountains';
    }

    // Highways: flatten a corridor to the smooth mountain height.
    let road = 0;
    for (const s of this.segs) {
      if (x < s.x0 || x > s.x1 || z < s.z0 || z > s.z1) continue;
      const d = segDistance(x, z, s.ax, s.az, s.bx, s.bz);
      if (d >= this.roadReach) continue;
      const k = smoothstep(this.roadHalf + this.cfg.highways.shoulder, this.roadReach, d);
      h = lerp(ms, h, k);
      road = Math.max(road, 1 - smoothstep(this.roadHalf, this.roadHalf + this.cfg.highways.shoulder, d));
      mix3(col, col, this.dry, (1 - k) * 0.7);
      field *= k;
    }
    if (road > 0.2) cls = null;

    // Ponds: a bowl under the water level with a muddy rim.
    for (const p of this.ponds) {
      const d = Math.hypot(x - p.x, z - p.z);
      if (d > p.r + this.cfg.ponds.edge * 2) continue;
      const k = smoothstep(p.r * 0.75, p.r + this.cfg.ponds.edge, d);
      h = lerp(this.waterLevel - this.cfg.ponds.depth, h, k);
      mix3(col, col, this.pondBank, (1 - smoothstep(p.r, p.r + this.cfg.ponds.edge * 2, d)) * 0.8);
      field *= smoothstep(p.r, p.r + this.cfg.ponds.edge * 2, d);
      if (d < p.r + 1.5) cls = null;
      else if (p.palms && d < p.r + 14 && cls) cls = 'oasis';
    }

    // Beach and sea (east).
    const S = this.cfg.sea;
    const sx = this.shoreX(z);
    const inland = sx - x;
    if (inland < S.beach + 60) {
      const hb = inland > 0 ? S.beachTop * Math.min(1, inland / S.beach) : Math.max(-S.bedDepth, inland * S.dropPerMetre + this.waterLevel * 0.5);
      const k = smoothstep(S.beach, S.beach + 60, inland);
      h = lerp(hb, h, k);
      const sand = mix3(this._sc || (this._sc = [0, 0, 0]), this.wetSand, this.sand, smoothstep(0, 14, inland));
      mix3(col, col, sand, 1 - smoothstep(S.beach * 0.8, S.beach + 20, inland));
      field *= k;
      if (inland < S.beach * 0.85 && inland > 4 && cls !== 'mountains') cls = 'beach';
      if (inland <= 4) cls = null;
    }

    // The river: a wide bed with sloping sandy banks (the city side is a stone embankment).
    const R = this.cfg.river;
    const rv = this.river;
    if (z > rv.z0 - R.bankWidth - ms && z < rv.z1 + R.bankWidth + ms && inland > -40) {
      const dIn = Math.min(z - rv.z0, rv.z1 - z); // > 0 inside the river
      const bank = R.bankWidth + ms * 1.2;
      if (dIn > 0) {
        h = lerp(this.waterLevel - 0.3, this.waterLevel - R.bedDepth, smoothstep(0, 30, dIn));
        mix3(col, this.riverSand, this.wetSand, 0.5);
        field = 0; cls = null;
      } else if (-dIn < bank) {
        const k = smoothstep(0, bank, -dIn);
        h = lerp(this.waterLevel - 0.3, h, k);
        mix3(col, col, this.riverSand, (1 - k) * 0.9);
        field *= k;
        if (k < 0.4) cls = null;
      }
    }

    o.h = h; o.field = field; o.cls = cls;
    return o;
  }

  // ---------------------------------------------------------------- gameplay height
  /** Height of the grid point (ix, iz) — cached, the mesh uses exactly these. */
  gridHeight(ix, iz) {
    const key = (ix + 40000) * 80000 + (iz + 40000);
    let h = this.cache.get(key);
    if (h === undefined) {
      if (this.cache.size > 60000) this.cache.clear();
      h = this.sample(ix * this.cell, iz * this.cell, this._g || (this._g = { col: [0, 0, 0] })).h;
      this.cache.set(key, h);
    }
    return h;
  }

  /** Ground height between grid points, split like the mesh triangles (diagonal b–c). */
  groundAt(x, z) {
    const s = this.cell;
    const gx = x / s, gz = z / s;
    const ix = Math.floor(gx), iz = Math.floor(gz);
    const fx = gx - ix, fz = gz - iz;
    if (fx + fz <= 1) {
      const a = this.gridHeight(ix, iz), b = this.gridHeight(ix + 1, iz), c = this.gridHeight(ix, iz + 1);
      return a + (b - a) * fx + (c - a) * fz;
    }
    const b = this.gridHeight(ix + 1, iz), c = this.gridHeight(ix, iz + 1), d = this.gridHeight(ix + 1, iz + 1);
    return d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
  }

  /** Bridge deck height at (x, z), or null when not on the deck. */
  deckAt(x, z) {
    const B = this.bridge;
    if (!B || Math.abs(x - B.x) > B.half || z < B.z0 || z > B.landZ) return null;
    const u = z - B.z0, len = B.landZ - B.z0;
    return B.height * smoothstep(0, B.ramp, u) * (1 - smoothstep(len - B.ramp, len, u));
  }

  /** Gameplay height outside the city (0 inside: the city layout handles it). */
  heightAt(x, z) {
    if (this.inCity(x, z)) return 0;
    const deck = this.deckAt(x, z);
    if (deck !== null) return deck;
    return this.groundAt(x, z);
  }

  // ---------------------------------------------------------------- names + map
  zoneAt(x, z) {
    if (this.inCity(x, z) || !this.inBounds(x, z)) return null;
    if (this.deckAt(x, z) !== null) return this.bridge;
    if (this.mountainRaw(x, z) > 0.55) return this.cfg.mountains.name ? { id: 'hills', name: this.cfg.mountains.name } : null;
    if (this.shoreX(z) - x < this.cfg.sea.beach) return { id: 'beach', name: this.cfg.sea.name };
    for (const zn of this.zones) {
      if (x >= zn.x0 && x <= zn.x1 && z >= zn.z0 && z <= zn.z1) return zn;
    }
    return null;
  }

  /** Flat colour for the map painter (CSS string). */
  mapColor(x, z) {
    const sx = this.shoreX(z);
    if (x > sx) return this.cfg.sea.minimapColor;
    if (z > this.river.z0 && z < this.river.z1) return this.cfg.river.minimapColor;
    for (const p of this.ponds) if (Math.hypot(x - p.x, z - p.z) < p.r) return this.cfg.river.minimapColor;
    if (sx - x < this.cfg.sea.beach) return this.cfg.sea.sand;
    const raw = this.mountainRaw(x, z);
    let base = this.cfg.types.fields.minimapColor;
    for (const zn of this.zones) {
      if (x >= zn.x0 && x <= zn.x1 && z >= zn.z0 && z <= zn.z1) { base = zn.T.minimapColor; break; }
    }
    if (raw > 0.45) return raw > 0.75 ? '#5d5a48' : '#4c6a3c';
    return base;
  }

  /**
   * GPS help for a countryside target: the highway that gets closest to it, the city junction
   * where that highway starts, and its points up to the spot nearest the target.
   * @returns {{ junction:{c:number, r:number}, points:Array<[number, number]> } | null}
   */
  routeVia(tx, tz, fromX, fromZ) {
    if (this.inCity(tx, tz) || this.cityDistance(tx, tz) < 60) return null;
    if (fromX !== undefined && !this.inCity(fromX, fromZ)) return null; // already outside: straight line
    let best = null;
    for (const h of this.routeLines) {
      const { c, r } = h;
      for (let i = 1; i < h.pts.length; i++) {
        const [ax, az] = h.pts[i - 1], [bx, bz] = h.pts[i];
        const d = segDistance(tx, tz, ax, az, bx, bz, this._t);
        if (!best || d < best.d) {
          const pts = h.pts.slice(1, i).map((q) => [q[0], q[1]]);
          pts.push([ax + (bx - ax) * this._t.t, az + (bz - az) * this._t.t]);
          best = { d, junction: { c, r }, points: pts };
        }
      }
    }
    // Only worth it when the highway really comes closer than the city edge does.
    return best && best.d < this.cityDistance(tx, tz) ? best : null;
  }

  // ---------------------------------------------------------------- ponds
  planPonds() {
    const P = this.cfg.ponds;
    const out = [];
    const ok = (x, z, r) => {
      if (this.cityDistance(x, z) < 120 + r) return false;
      if (this.mountainRaw(x, z) > 0.1) return false;
      if (this.shoreX(z) - x < this.cfg.sea.beach + 80 + r) return false;
      if (z > this.river.z0 - 80 - r && z < this.river.z1 + 80 + r) return false;
      for (const s of this.segs) if (segDistance(x, z, s.ax, s.az, s.bx, s.bz) < this.roadReach + r + 10) return false;
      for (const p of out) if (Math.hypot(x - p.x, z - p.z) < P.minGap + r + p.r) return false;
      return true;
    };
    for (const f of P.list || []) {
      out.push({ id: f.id, x: this.X(f.at[0]), z: this.Z(f.at[1]), r: f.radius, palms: !!f.palms });
    }
    for (const zn of this.zones) {
      const rng = new Rng(this.seed * 31 + zn.id.length * 7 + Math.round(zn.x0));
      let placed = 0;
      for (let tries = 0; tries < 80 && placed < (zn.ponds || 0); tries++) {
        const r = rng.range(P.radius[0], P.radius[1]);
        const x = rng.range(zn.x0 + 60, zn.x1 - 60), z = rng.range(zn.z0 + 60, zn.z1 - 60);
        if (!ok(x, z, r)) continue;
        out.push({ id: `${zn.id}-${placed}`, x, z, r, palms: zn.type === 'desert' });
        placed++;
      }
    }
    return out;
  }
}
