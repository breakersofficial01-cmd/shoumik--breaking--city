// VBuilder: collects flat-shaded, vertex-coloured quads into ONE BufferGeometry — the body of
// a vehicle is a single draw call. Vehicle models (models*.js) are made of:
//   box()   a box whose top can be smaller than its bottom and whose front can be narrower
//           than its back (bonnets, windscreens, cabins, noses)
//   beam()  a thin bar between two points (bicycle frames, forks, handlebars)
//
// Vehicle space: +z = forward, +x = the vehicle's LEFT, y = up, origin on the ground under
// the middle of the vehicle. Colours are '#rrggbb' strings.

import * as THREE from 'three';
import { hexToLinear } from '../../world/geoBuilder.js';

export class VBuilder {
  /** @param {number} dent  metres of random wobble per corner (dented buses), 0 = clean */
  constructor(dent = 0, seed = 1) {
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.idx = [];
    this.count = 0;
    this.dent = dent;
    this.seed = seed;
  }

  /** Same corner → same wobble, so neighbouring panels stay welded together. */
  wobble(p) {
    if (!this.dent) return p;
    const h = (n) => {
      const s = Math.sin(p[0] * 12.9898 + p[1] * 78.233 + p[2] * 37.719 + this.seed * 0.137 + n * 4.71) * 43758.5453;
      return (s - Math.floor(s) - 0.5) * 2 * this.dent;
    };
    return [p[0] + h(1), p[1] + h(2) * 0.5, p[2] + h(3)];
  }

  /**
   * One flat quad. The corner order does not matter for facing: the quad is turned so it
   * faces away from `inside` (a point inside the shape).
   */
  quad(a, b, c, d, color, inside) {
    a = this.wobble(a); b = this.wobble(b); c = this.wobble(c); d = this.wobble(d);
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    const cx = (a[0] + b[0] + c[0] + d[0]) / 4 - inside[0];
    const cy = (a[1] + b[1] + c[1] + d[1]) / 4 - inside[1];
    const cz = (a[2] + b[2] + c[2] + d[2]) / 4 - inside[2];
    let pts = [a, b, c, d];
    if (nx * cx + ny * cy + nz * cz < 0) {
      pts = [a, d, c, b];
      nx = -nx; ny = -ny; nz = -nz;
    }
    const col = hexToLinear(color);
    const i = this.count;
    for (const p of pts) {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(nx, ny, nz);
      this.col.push(col[0], col[1], col[2]);
    }
    this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
    this.count += 4;
  }

  /**
   * A box from y0 to y1 and z0 (back) to z1 (front).
   *   w   half width at the bottom-back      wf  half width at the bottom-front (default w)
   *   tw  half width at the top (default w)  twf half width at the top-front (default tw)
   *   tz0 / tz1  where the TOP starts and ends (default z0 / z1) → sloped ends
   *   x   sideways offset of the whole box
   *   c   one colour, or { side, top, front, back, bottom } (missing ones use `side`)
   *   skip letters of faces to leave out: l r f k(back) t b   (default 'b' = no underside)
   */
  box(o) {
    const x = o.x || 0;
    const w = o.w, wf = o.wf ?? w, tw = o.tw ?? w, twf = o.twf ?? (o.tw != null ? o.tw * (wf / w) : wf);
    const { y0, y1, z0, z1 } = o;
    const tz0 = o.tz0 ?? z0, tz1 = o.tz1 ?? z1;
    const c = typeof o.c === 'string' ? { side: o.c } : o.c;
    const skip = o.skip ?? 'b';
    const b0 = [x - w, y0, z0], b1 = [x + w, y0, z0], b2 = [x + wf, y0, z1], b3 = [x - wf, y0, z1];
    const t0 = [x - tw, y1, tz0], t1 = [x + tw, y1, tz0], t2 = [x + twf, y1, tz1], t3 = [x - twf, y1, tz1];
    const mid = [x, (y0 + y1) / 2, (z0 + z1 + tz0 + tz1) / 4];
    if (!skip.includes('k')) this.quad(b0, b1, t1, t0, c.back || c.side, mid);
    if (!skip.includes('f')) this.quad(b3, b2, t2, t3, c.front || c.side, mid);
    if (!skip.includes('l')) this.quad(b1, b2, t2, t1, c.side, mid);
    if (!skip.includes('r')) this.quad(b0, b3, t3, t0, c.side, mid);
    if (!skip.includes('t')) this.quad(t0, t1, t2, t3, c.top || c.side, mid);
    if (!skip.includes('b')) this.quad(b0, b1, b2, b3, c.bottom || c.side, mid);
  }

  /** A square bar of thickness `t` from point a to point b. */
  beam(a, b, t, color) {
    const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
    const up = Math.abs(d.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const s = new THREE.Vector3().crossVectors(d, up).normalize().multiplyScalar(t / 2);
    const u = new THREE.Vector3().crossVectors(s, d).normalize().multiplyScalar(t / 2);
    const corner = (p, i, j) => [p[0] + s.x * i + u.x * j, p[1] + s.y * i + u.y * j, p[2] + s.z * i + u.z * j];
    const A = [corner(a, -1, -1), corner(a, 1, -1), corner(a, 1, 1), corner(a, -1, 1)];
    const B = [corner(b, -1, -1), corner(b, 1, -1), corner(b, 1, 1), corner(b, -1, 1)];
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      this.quad(A[i], A[j], B[j], B[i], color, mid);
    }
    this.quad(A[0], A[1], A[2], A[3], color, mid);
    this.quad(B[0], B[1], B[2], B[3], color, mid);
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

/** Shared wheel: a dark tyre 1 m across and 1 m wide lying on the x axis, with a light hub disc on each side. */
export function makeWheelGeometry(tyreHex, hubHex) {
  const parts = [
    [new THREE.CylinderGeometry(0.5, 0.5, 1, 10, 1).rotateZ(Math.PI / 2), tyreHex],
    [new THREE.CircleGeometry(0.27, 8).rotateY(Math.PI / 2).translate(0.505, 0, 0), hubHex],
    [new THREE.CircleGeometry(0.27, 8).rotateY(-Math.PI / 2).translate(-0.505, 0, 0), hubHex],
  ];
  const pos = [], nor = [], col = [];
  for (const [geo, hex] of parts) {
    const flat = geo.toNonIndexed();
    const c = hexToLinear(hex);
    pos.push(...flat.getAttribute('position').array);
    nor.push(...flat.getAttribute('normal').array);
    for (let k = 0; k < flat.getAttribute('position').count; k++) col.push(c[0], c[1], c[2]);
    geo.dispose();
    flat.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

/** Darker / lighter version of a '#rrggbb' colour (f < 1 darker, f > 1 lighter). */
export function tint(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  const r = ch(n >> 16), g = ch((n >> 8) & 255), b = ch(n & 255);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}
