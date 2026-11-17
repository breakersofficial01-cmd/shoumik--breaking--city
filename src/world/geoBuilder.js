// GeoBuilder: collects quads/triangles into ONE BufferGeometry (merged static geometry =
// one draw call per chunk). Every vertex has position, flat normal, colour and UV.
//
// Colours are [r, g, b] in LINEAR space — get them with hexToLinear('#aabbcc').
// Conventions: x = east, y = up, z = south. Sides: N = -z, S = +z, W = -x, E = +x.

import * as THREE from 'three';
import { tileU } from '../assets/proceduralTextures.js';

const colorCache = new Map();
const tmpColor = new THREE.Color();

/** '#rrggbb' -> [r,g,b] linear floats (cached). */
export function hexToLinear(hex) {
  let c = colorCache.get(hex);
  if (!c) {
    tmpColor.set(hex);
    c = [tmpColor.r, tmpColor.g, tmpColor.b];
    colorCache.set(hex, c);
  }
  return c;
}

/** Multiply a colour by a brightness factor. */
export const shade = (c, f) => [c[0] * f, c[1] * f, c[2] * f];

export const WHITE = [1, 1, 1];

export class GeoBuilder {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.uv = [];
    this.idx = [];
    this.count = 0;
  }

  get isEmpty() {
    return this.count === 0;
  }

  vertex(x, y, z, nx, ny, nz, c, u, v) {
    this.pos.push(x, y, z);
    this.nor.push(nx, ny, nz);
    this.col.push(c[0], c[1], c[2]);
    this.uv.push(u, v);
    return this.count++;
  }

  /**
   * Vertical wall from ground point (ax,az) to (bx,bz), between heights y0 and y1.
   * Give the two points LEFT then RIGHT as seen by someone standing in front of the wall;
   * the wall then faces that person. (box() below shows the order for each side.)
   * cBottom/cTop give a cheap vertical colour gradient (fake ambient shading).
   */
  wall(ax, az, bx, bz, y0, y1, cBottom, cTop, tile, v0 = 0, v1 = 1) {
    const ex = bx - ax;
    const ez = bz - az;
    const len = Math.hypot(ex, ez) || 1;
    const nx = -ez / len;
    const nz = ex / len;
    const [u0, u1] = tileU(tile);
    const a = this.vertex(ax, y0, az, nx, 0, nz, cBottom, u0, v0);
    const b = this.vertex(bx, y0, bz, nx, 0, nz, cBottom, u1, v0);
    const c = this.vertex(bx, y1, bz, nx, 0, nz, cTop, u1, v1);
    const d = this.vertex(ax, y1, az, nx, 0, nz, cTop, u0, v1);
    this.idx.push(a, b, c, a, c, d);
  }

  /**
   * Flat quad at height y covering x0..x1, z0..z1.
   * alongX=false: texture U runs across x, V repeats along z (a road running north-south).
   * alongX=true : U across z, V along x (a road running east-west).
   * up=false makes it face down (undersides).
   */
  flat(x0, z0, x1, z1, y, c, tile, v0 = 0, v1 = 1, alongX = false, up = true) {
    const [u0, u1] = tileU(tile);
    const ny = up ? 1 : -1;
    let a, b, cc, d;
    if (alongX) {
      a = this.vertex(x0, y, z0, 0, ny, 0, c, u0, v0);
      b = this.vertex(x0, y, z1, 0, ny, 0, c, u1, v0);
      cc = this.vertex(x1, y, z1, 0, ny, 0, c, u1, v1);
      d = this.vertex(x1, y, z0, 0, ny, 0, c, u0, v1);
    } else {
      a = this.vertex(x0, y, z0, 0, ny, 0, c, u0, v0);
      b = this.vertex(x0, y, z1, 0, ny, 0, c, u0, v1);
      cc = this.vertex(x1, y, z1, 0, ny, 0, c, u1, v1);
      d = this.vertex(x1, y, z0, 0, ny, 0, c, u1, v0);
    }
    if (up) this.idx.push(a, b, cc, a, cc, d);
    else this.idx.push(a, cc, b, a, d, cc);
  }

  /** Flat area cut into strips so a square tile repeats in BOTH directions. */
  tiled(x0, z0, x1, z1, y, c, tile, size) {
    const n = Math.max(1, Math.round((x1 - x0) / size));
    const w = (x1 - x0) / n;
    const v1 = Math.max(1, Math.round((z1 - z0) / size));
    for (let i = 0; i < n; i++) this.flat(x0 + i * w, z0, x0 + (i + 1) * w, z1, y, c, tile, 0, v1);
  }

  /**
   * Axis-aligned box. `faces` picks which sides to build: any of the letters n s w e t b
   * (north, south, west, east, top, bottom). Hidden sides should be left out.
   */
  box(x0, y0, z0, x1, y1, z1, cBottom, cTop, tile, faces = 'nswet', vRepeat = 1) {
    if (faces.includes('s')) this.wall(x0, z1, x1, z1, y0, y1, cBottom, cTop, tile, 0, vRepeat);
    if (faces.includes('n')) this.wall(x1, z0, x0, z0, y0, y1, cBottom, cTop, tile, 0, vRepeat);
    if (faces.includes('e')) this.wall(x1, z1, x1, z0, y0, y1, cBottom, cTop, tile, 0, vRepeat);
    if (faces.includes('w')) this.wall(x0, z0, x0, z1, y0, y1, cBottom, cTop, tile, 0, vRepeat);
    if (faces.includes('t')) this.flat(x0, z0, x1, z1, y1, cTop, tile);
    if (faces.includes('b')) this.flat(x0, z0, x1, z1, y0, cBottom, tile, 0, 1, false, false);
  }

  /**
   * Upright n-sided prism / cone section centred on (cx, cz): radius r0 at y0, r1 at y1.
   * Used for poles, tanks and trees. `cap` adds a flat top.
   */
  prism(cx, cz, y0, y1, r0, r1, sides, cBottom, cTop, cap = false) {
    const slope = (r0 - r1) / (y1 - y0 || 1);
    for (let i = 0; i < sides; i++) {
      const a0 = (i / sides) * Math.PI * 2;
      const a1 = ((i + 1) / sides) * Math.PI * 2;
      const am = (a0 + a1) / 2;
      const nl = Math.hypot(1, slope);
      const nx = Math.cos(am) / nl;
      const nz = Math.sin(am) / nl;
      const ny = slope / nl;
      // Going a1 -> a0 keeps the outside face counter-clockwise.
      const a = this.vertex(cx + Math.cos(a1) * r0, y0, cz + Math.sin(a1) * r0, nx, ny, nz, cBottom, 0, 0);
      const b = this.vertex(cx + Math.cos(a0) * r0, y0, cz + Math.sin(a0) * r0, nx, ny, nz, cBottom, 1, 0);
      const c = this.vertex(cx + Math.cos(a0) * r1, y1, cz + Math.sin(a0) * r1, nx, ny, nz, cTop, 1, 1);
      const d = this.vertex(cx + Math.cos(a1) * r1, y1, cz + Math.sin(a1) * r1, nx, ny, nz, cTop, 0, 1);
      this.idx.push(a, b, c, a, c, d);
      if (cap && r1 > 0.001) {
        const m = this.vertex(cx, y1, cz, 0, 1, 0, cTop, 0.5, 0.5);
        const p = this.vertex(cx + Math.cos(a1) * r1, y1, cz + Math.sin(a1) * r1, 0, 1, 0, cTop, 0, 0);
        const q = this.vertex(cx + Math.cos(a0) * r1, y1, cz + Math.sin(a0) * r1, 0, 1, 0, cTop, 1, 0);
        this.idx.push(m, p, q);
      }
    }
  }

  /** Turn everything collected so far into a BufferGeometry. */
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}
