// Kit: the little modelling toolbox every landmark is built with.
//
// A landmark is designed in its own LOCAL space and the kit turns it to face the right way:
//     x = to the right of somebody looking out of the front door... no need to think about it:
//     +z = the FRONT of the landmark,  y = up (0 = the ground of its plot),  origin = plot centre.
// The kit writes into three GeoBuilders:
//     lit    normal sun-lit walls (facade atlas + vertex colours)      — default
//     glow   unlit colours: neon, LED strips, lamps, lit windows         — pass { glow: true }
//     sign   unlit quads showing a name board from the sign atlas        — kit.sign()
// It also collects colliders (kit.solid) and walkable platforms (kit.platform).
//
// Colours are '#rrggbb' strings. Quads are flat-shaded; a quad is turned to face away from
// `inside` when that option is given, otherwise the corner order decides (counter-clockwise
// seen from outside).

import { tileU, FACADE, TILE, ATLAS_COLS } from '../../assets/proceduralTextures.js';
import { hexToLinear } from '../geoBuilder.js';

// One plain texel of the PLAIN facade tile: gives a flat colour through the shared material.
const FLAT_U = (FACADE.PLAIN * TILE + 30.5) / (TILE * ATLAS_COLS);
const FLAT_V = 0.5;
const TAU = Math.PI * 2;

export class Kit {
  /**
   * @param {{lit:object, glow:object, sign:object}} builders  GeoBuilders
   * @param {{cx:number, cz:number, y:number, angle:number}} site  where and which way
   */
  constructor(builders, site) {
    this.b = builders;
    this.site = site;
    this.cos = Math.cos(site.angle);
    this.sin = Math.sin(site.angle);
    this.colliders = [];
    this.platforms = [];
  }

  /** Local point → world point. */
  P(p) {
    return [
      this.site.cx + p[0] * this.cos + p[2] * this.sin,
      this.site.y + p[1],
      this.site.cz - p[0] * this.sin + p[2] * this.cos,
    ];
  }

  /**
   * One flat quad a → b → c → d (local points).
   * o: { inside:[x,y,z], glow, tile, v (tile repeats), grad (0-1: darker at the lowest corners) }
   * With a tile, a/b are the bottom-left/right corners and c/d the top-right/left ones.
   */
  quad(a, b, c, d, hex, o = {}) {
    const gb = o.glow ? this.b.glow : this.b.lit;
    let pts = [this.P(a), this.P(b), this.P(c), this.P(d)];
    let uv = null;
    if (o.tile != null) {
      const [u0, u1] = tileU(o.tile);
      const v = o.v || 1;
      uv = [[u0, 0], [u1, 0], [u1, v], [u0, v]];
    }
    const [A, B, , D] = pts;
    let nx = (B[1] - A[1]) * (D[2] - A[2]) - (B[2] - A[2]) * (D[1] - A[1]);
    let ny = (B[2] - A[2]) * (D[0] - A[0]) - (B[0] - A[0]) * (D[2] - A[2]);
    let nz = (B[0] - A[0]) * (D[1] - A[1]) - (B[1] - A[1]) * (D[0] - A[0]);
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    if (o.inside) {
      const I = this.P(o.inside);
      const cx = (pts[0][0] + pts[1][0] + pts[2][0] + pts[3][0]) / 4 - I[0];
      const cy = (pts[0][1] + pts[1][1] + pts[2][1] + pts[3][1]) / 4 - I[1];
      const cz = (pts[0][2] + pts[1][2] + pts[2][2] + pts[3][2]) / 4 - I[2];
      if (nx * cx + ny * cy + nz * cz < 0) {
        pts = [pts[0], pts[3], pts[2], pts[1]];
        if (uv) uv = [uv[0], uv[3], uv[2], uv[1]];
        nx = -nx; ny = -ny; nz = -nz;
      }
    }
    const col = hexToLinear(hex);
    let low = col, minY = 0;
    if (o.grad) {
      low = [col[0] * o.grad, col[1] * o.grad, col[2] * o.grad];
      minY = Math.min(pts[0][1], pts[1][1], pts[2][1], pts[3][1]) + 0.01;
    }
    const i = gb.count;
    for (let k = 0; k < 4; k++) {
      const p = pts[k];
      gb.vertex(p[0], p[1], p[2], nx, ny, nz, o.grad && p[1] < minY ? low : col, uv ? uv[k][0] : FLAT_U, uv ? uv[k][1] : FLAT_V);
    }
    gb.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }

  tri(a, b, c, hex, o) { this.quad(a, b, c, c, hex, o); }

  /**
   * Upright wall from (ax,az) to (bx,bz) — left then right as seen from outside.
   * o: { tile (default plain plaster), floors (tile repeats), grad, glow, flat (no texture) }
   */
  wall(ax, az, bx, bz, y0, y1, hex, o = {}) {
    const q = { glow: o.glow, grad: o.grad ?? 0.8 };
    if (!o.flat && !o.glow) { q.tile = o.tile ?? FACADE.PLAIN; q.v = o.floors || 1; }
    this.quad([ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az], hex, q);
  }

  /** A wall cut into window bays (each bay shows one facade tile per floor). */
  facade(ax, az, bx, bz, y0, y1, hex, tile, floors, bayWidth = 3.2) {
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / bayWidth));
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n;
      this.wall(ax + (bx - ax) * t0, az + (bz - az) * t0, ax + (bx - ax) * t1, az + (bz - az) * t1, y0, y1, hex, { tile, floors });
    }
  }

  /**
   * Box. o: { faces: letters of n s e w t b (default 'nsewt'; s = front), top (roof colour),
   *           tile + floors (window tile on the walls, cut into bays), flat, glow, grad }
   */
  box(x0, y0, z0, x1, y1, z1, hex, o = {}) {
    const f = o.faces || 'nsewt';
    const side = (ax, az, bx, bz) => {
      if (o.tile != null && !o.glow) this.facade(ax, az, bx, bz, y0, y1, hex, o.tile, o.floors || 1, o.bay);
      else this.wall(ax, az, bx, bz, y0, y1, hex, o);
    };
    if (f.includes('s')) side(x0, z1, x1, z1);
    if (f.includes('n')) side(x1, z0, x0, z0);
    if (f.includes('e')) side(x1, z1, x1, z0);
    if (f.includes('w')) side(x0, z0, x0, z1);
    if (f.includes('t')) this.quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], o.top || hex, { glow: o.glow });
    if (f.includes('b')) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], hex, { glow: o.glow });
  }

  /** Flat coloured patch lying on the ground (lawns, pools, paths). */
  ground(x0, z0, x1, z1, hex, y = 0.03, o) {
    this.quad([x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0], hex, o);
  }

  /**
   * Upright prism / cone / tapered column around (cx, cz).
   * o: { cap, rot (radians), sx, sz (stretch), glow, grad, arc (0-1 share of the circle), tile, floors }
   */
  prism(cx, cz, y0, y1, r0, r1, sides, hex, o = {}) {
    const sx = o.sx || 1, sz = o.sz || 1, rot = o.rot || 0;
    const arc = (o.arc ?? 1) * TAU;
    const at = (a, r, y) => [cx + Math.cos(a) * r * sx, y, cz + Math.sin(a) * r * sz];
    const q = { inside: [cx, (y0 + y1) / 2, cz], glow: o.glow, grad: o.grad };
    if (o.tile != null) { q.tile = o.tile; q.v = o.floors || 1; }
    for (let i = 0; i < sides; i++) {
      const a0 = rot + (i / sides) * arc, a1 = rot + ((i + 1) / sides) * arc;
      this.quad(at(a1, r0, y0), at(a0, r0, y0), at(a0, r1, y1), at(a1, r1, y1), hex, q);
      if (o.cap && r1 > 0.01) this.tri([cx, y1, cz], at(a1, r1, y1), at(a0, r1, y1), o.top || hex, { glow: o.glow, inside: [cx, y0, cz] });
    }
  }

  /** Half-sphere dome (rings of flat faces), optionally pointed. */
  dome(cx, cz, y0, r, h, sides, rings, hex, o = {}) {
    for (let k = 0; k < rings; k++) {
      const a0 = (k / rings) * Math.PI / 2, a1 = ((k + 1) / rings) * Math.PI / 2;
      this.prism(cx, cz, y0 + Math.sin(a0) * h, y0 + Math.sin(a1) * h, Math.cos(a0) * r, Math.cos(a1) * r, sides, hex, o);
    }
  }

  /** Box whose top is smaller than its bottom (roofs, plinths, pyramids). inset = metres per side. */
  frustum(x0, z0, x1, z1, y0, y1, inset, hex, o = {}) {
    const ix = Math.min(inset, (x1 - x0) / 2), iz = Math.min(inset, (z1 - z0) / 2);
    const b = [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]];
    const t = [[x0 + ix, y1, z0 + iz], [x1 - ix, y1, z0 + iz], [x1 - ix, y1, z1 - iz], [x0 + ix, y1, z1 - iz]];
    const q = { inside: [(x0 + x1) / 2, y0, (z0 + z1) / 2], glow: o.glow, grad: o.grad };
    for (let i = 0; i < 4; i++) this.quad(b[i], b[(i + 1) % 4], t[(i + 1) % 4], t[i], hex, q);
    this.quad(t[0], t[1], t[2], t[3], o.top || hex, q);
  }

  /** Pitched roof over a rectangle; the ridge runs along x ('x') or z ('z'). */
  gable(x0, z0, x1, z1, y, h, hex, axis = 'x', end = hex) {
    const q = { inside: [(x0 + x1) / 2, y - 1, (z0 + z1) / 2] };
    if (axis === 'x') {
      const m = (z0 + z1) / 2;
      this.quad([x0, y, z0], [x1, y, z0], [x1, y + h, m], [x0, y + h, m], hex, q);
      this.quad([x0, y, z1], [x1, y, z1], [x1, y + h, m], [x0, y + h, m], hex, q);
      this.tri([x0, y, z0], [x0, y, z1], [x0, y + h, m], end, q);
      this.tri([x1, y, z0], [x1, y, z1], [x1, y + h, m], end, q);
    } else {
      const m = (x0 + x1) / 2;
      this.quad([x0, y, z0], [x0, y, z1], [m, y + h, z1], [m, y + h, z0], hex, q);
      this.quad([x1, y, z0], [x1, y, z1], [m, y + h, z1], [m, y + h, z0], hex, q);
      this.tri([x0, y, z0], [x1, y, z0], [m, y + h, z0], end, q);
      this.tri([x0, y, z1], [x1, y, z1], [m, y + h, z1], end, q);
    }
  }

  /**
   * A flat shape painted just in front of a wall (dark arches, round holes, door panels).
   * The wall runs (ax,az) → (bx,bz), left to right seen from outside. `pts` are [t, y]
   * pairs: t = metres along the wall from a, y = height. Must be convex.
   */
  shape(ax, az, bx, bz, pts, hex, o = {}) {
    const len = Math.hypot(bx - ax, bz - az) || 1;
    const ex = (bx - ax) / len, ez = (bz - az) / len;
    const d = o.depth ?? 0.05;
    const nx = -ez * d, nz = ex * d;
    const p = ([t, y]) => [ax + ex * t + nx, y, az + ez * t + nz];
    const c = [pts.reduce((s, q) => s + q[0], 0) / pts.length, pts.reduce((s, q) => s + q[1], 0) / pts.length];
    const inside = [ax + ex * c[0] - nx * 20, c[1], az + ez * c[0] - nz * 20];
    for (let i = 0; i < pts.length; i++) this.tri(p(c), p(pts[i]), p(pts[(i + 1) % pts.length]), hex, { inside, glow: o.glow });
  }

  /** Arch-shaped opening painted on a wall: t0..t1 along the wall, y0 up to y1. pointed = Mughal style. */
  arch(ax, az, bx, bz, t0, t1, y0, y1, hex, o = {}) {
    const half = (t1 - t0) / 2, mid = (t0 + t1) / 2;
    const rise = Math.min(y1 - y0, half * (o.pointed ? 1.35 : 1));
    const spring = y1 - rise;
    const pts = [[t0, y0], [t1, y0]];
    const n = o.segments || 5;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI;
      const s = o.pointed ? Math.pow(Math.sin(a), 0.75) : Math.sin(a);
      pts.push([mid + Math.cos(a) * half, spring + s * rise]);
    }
    this.shape(ax, az, bx, bz, pts, hex, o);
  }

  /** A row of arches along a wall between heights y0..y1 (arcades, verandas). */
  arcade(ax, az, bx, bz, count, y0, y1, hex, o = {}) {
    const len = Math.hypot(bx - ax, bz - az);
    const bay = len / count, gap = o.gap ?? bay * 0.16;
    for (let k = 0; k < count; k++) this.arch(ax, az, bx, bz, k * bay + gap, (k + 1) * bay - gap, y0, y1, hex, o);
  }

  /** Round hole / disc painted on a wall, centred t metres along it at height y. */
  disc(ax, az, bx, bz, t, y, r, hex, o = {}) {
    const n = o.segments || 10, pts = [];
    for (let i = 0; i < n; i++) pts.push([t + Math.cos((i / n) * TAU) * r, y + Math.sin((i / n) * TAU) * r]);
    this.shape(ax, az, bx, bz, pts, hex, o);
  }

  /** Steps climbing from z = zFront (ground) back to zBack (height h). */
  steps(x0, x1, zFront, zBack, h, n, hex, y = 0) {
    for (let i = 0; i < n; i++) {
      const za = zFront + ((zBack - zFront) * i) / n;
      const lo = Math.min(za, zBack), hi = Math.max(za, zBack);
      this.box(x0, y, lo, x1, y + (h * (i + 1)) / n, hi, hex, { faces: zBack < zFront ? 'sewt' : 'newt', flat: true, grad: 0.85 });
    }
  }

  /** Row of round columns from (ax,az) to (bx,bz). */
  columns(ax, az, bx, bz, count, y0, y1, r, hex, sides = 6) {
    for (let k = 0; k < count; k++) {
      const t = count === 1 ? 0.5 : k / (count - 1);
      this.prism(ax + (bx - ax) * t, az + (bz - az) * t, y0, y1, r, r, sides, hex, { grad: 0.8 });
    }
  }

  /** The same kit turned by `quarterTurns` × 90° around the plot centre (for 4-way symmetric buildings). */
  turned(quarterTurns) {
    const k = new Kit(this.b, { ...this.site, angle: this.site.angle + (quarterTurns * Math.PI) / 2 });
    k.colliders = this.colliders;
    k.platforms = this.platforms;
    return k;
  }

  /** A square bar of thickness t between two points (frames, railings, masts). */
  beam(a, b, t, hex, o = {}) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const len = Math.hypot(dx, dy, dz) || 1;
    // Two directions at right angles to the bar.
    let sx = dz / len, sy = 0, sz = -dx / len;
    if (Math.hypot(sx, sz) < 0.05) { sx = 1; sz = 0; }
    const sl = Math.hypot(sx, sz); sx /= sl; sz /= sl;
    const ux = (sy * dz - sz * dy) / len, uy = (sz * dx - sx * dz) / len, uz = (sx * dy - sy * dx) / len;
    const h = t / 2;
    const corner = (p, i, j) => [p[0] + (sx * i + ux * j) * h, p[1] + (sy * i + uy * j) * h, p[2] + (sz * i + uz * j) * h];
    const order = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    const A = order.map(([i, j]) => corner(a, i, j)), B = order.map(([i, j]) => corner(b, i, j));
    const inside = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    for (let i = 0; i < 4; i++) this.quad(A[i], A[(i + 1) % 4], B[(i + 1) % 4], B[i], hex, { inside, glow: o.glow });
    this.quad(A[0], A[1], A[2], A[3], hex, { inside, glow: o.glow });
    this.quad(B[0], B[1], B[2], B[3], hex, { inside, glow: o.glow });
  }

  /** Barrel-vault roof over a rectangle; the vault runs along z ('z') or x ('x'). */
  vault(x0, z0, x1, z1, y, h, hex, axis = 'z', segments = 6, end = hex) {
    const along = axis === 'z';
    const mid = along ? (x0 + x1) / 2 : (z0 + z1) / 2;
    const half = along ? (x1 - x0) / 2 : (z1 - z0) / 2;
    const pt = (a, far) => {
      const off = mid + Math.cos(a) * half, yy = y + Math.sin(a) * h;
      return along ? [off, yy, far ? z1 : z0] : [far ? x1 : x0, yy, off];
    };
    const inside = [(x0 + x1) / 2, y - 1, (z0 + z1) / 2];
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI, a1 = ((i + 1) / segments) * Math.PI;
      this.quad(pt(a0, false), pt(a0, true), pt(a1, true), pt(a1, false), hex, { inside });
      for (const far of [false, true]) {
        const c = along ? [mid, y, far ? z1 : z0] : [far ? x1 : x0, y, mid];
        this.tri(c, pt(a0, far), pt(a1, far), end, { inside });
      }
    }
  }

  /** Where the glowing entrance marker of this landmark stands (local x, z). */
  marker(x, z) {
    const p = this.P([x, 0, z]);
    this.markerAt = { x: p[0], y: p[1], z: p[2] };
  }

  /** A tree-ish lamp post with a glowing head. */
  lamp(x, z, h, hex, glowHex) {
    this.prism(x, z, 0, h, 0.09, 0.06, 4, hex);
    this.box(x - 0.22, h, z - 0.22, x + 0.22, h + 0.3, z + 0.22, glowHex, { glow: true, faces: 'nsewtb' });
  }

  /**
   * A name board from the sign atlas on an upright rectangle (a → b left to right from
   * outside). `uv` = { u0, v0, u1, v1 } from signs.js. Unlit, so it glows a little.
   */
  sign(uv, ax, az, bx, bz, y0, y1, depth = 0.06) {
    if (!uv) return;
    const len = Math.hypot(bx - ax, bz - az) || 1;
    const nx = (-(bz - az) / len) * depth, nz = ((bx - ax) / len) * depth;
    const gb = this.b.sign;
    const pts = [[ax + nx, y0, az + nz], [bx + nx, y0, bz + nz], [bx + nx, y1, bz + nz], [ax + nx, y1, az + nz]].map((p) => this.P(p));
    const uvs = [[uv.u0, uv.v0], [uv.u1, uv.v0], [uv.u1, uv.v1], [uv.u0, uv.v1]];
    const n = this.P([nx * 1000, 0, nz * 1000]);
    const nl = Math.hypot(n[0] - this.site.cx, n[2] - this.site.cz) || 1;
    const i = gb.count;
    for (let k = 0; k < 4; k++) gb.vertex(pts[k][0], pts[k][1], pts[k][2], (n[0] - this.site.cx) / nl, 0, (n[2] - this.site.cz) / nl, [1, 1, 1], uvs[k][0], uvs[k][1]);
    gb.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }

  /** A free-standing name board on two posts, facing the front (+z). */
  nameBoard(uv, x, z, width, hex = '#3a3d42', y = 2.1) {
    if (!uv) return;
    const h = width * uv.aspect;
    this.box(x - width / 2 - 0.12, 0, z - 0.1, x - width / 2, y + h, z, hex, { flat: true });
    this.box(x + width / 2, 0, z - 0.1, x + width / 2 + 0.12, y + h, z, hex, { flat: true });
    this.box(x - width / 2, y - 0.08, z - 0.1, x + width / 2, y + h + 0.08, z - 0.02, hex, { flat: true });
    this.sign(uv, x - width / 2, z, x + width / 2, z, y, y + h, 0.02);
    this.solid(x - width / 2 - 0.12, z - 0.15, x + width / 2 + 0.12, z + 0.05, false);
  }

  /** Something you cannot walk through (local rectangle). camera=false lets the camera pass. */
  solid(x0, z0, x1, z1, camera = true) {
    const a = this.P([x0, 0, z0]), b = this.P([x1, 0, z1]);
    this.colliders.push({ x0: Math.min(a[0], b[0]), z0: Math.min(a[2], b[2]), x1: Math.max(a[0], b[0]), z1: Math.max(a[2], b[2]), camera });
  }

  /** A raised floor you can walk (and drive) up onto: h metres high with `run` metres of steps around it. */
  platform(x0, z0, x1, z1, h, run) {
    const a = this.P([x0, 0, z0]), b = this.P([x1, 0, z1]);
    this.platforms.push({ x0: Math.min(a[0], b[0]), z0: Math.min(a[2], b[2]), x1: Math.max(a[0], b[0]), z1: Math.max(a[2], b[2]), h, run });
  }
}
