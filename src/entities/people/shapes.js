// Low-poly shape helpers that add smooth-shaded, vertex-coloured pieces to a GeoBuilder
// (src/world/geoBuilder.js). Used to build Shoumik and the shared pedestrian body parts.
// Colours are linear [r,g,b] (hexToLinear).

/**
 * Add triangle a-b-c the right way round: its face must point the same way as the
 * normals of its corners (so nobody has to think about winding order).
 */
function tri(gb, a, b, c) {
  const p = gb.pos, n = gb.nor;
  const ax = p[a * 3], ay = p[a * 3 + 1], az = p[a * 3 + 2];
  const ux = p[b * 3] - ax, uy = p[b * 3 + 1] - ay, uz = p[b * 3 + 2] - az;
  const vx = p[c * 3] - ax, vy = p[c * 3 + 1] - ay, vz = p[c * 3 + 2] - az;
  const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
  const sx = n[a * 3] + n[b * 3] + n[c * 3];
  const sy = n[a * 3 + 1] + n[b * 3 + 1] + n[c * 3 + 1];
  const sz = n[a * 3 + 2] + n[b * 3 + 2] + n[c * 3 + 2];
  if (fx * sx + fy * sy + fz * sz >= 0) gb.idx.push(a, b, c);
  else gb.idx.push(a, c, b);
}

/**
 * Loft: a tube through a list of elliptical rings.
 * @param {GeoBuilder} gb
 * @param {Array<{c:number[], rx:number, rz:number, col:number[]}>} rings  c = ring centre.
 *        For axis 'y' the ring lies in the x/z plane (rx across, rz front-back);
 *        for axis 'z' it lies in the x/y plane (rx across, rz = up-down radius).
 * @param {number} sides
 * @param {{axis?:'y'|'z', capStart?:boolean, capEnd?:boolean, colorAt?:(ring:number, side:number, angle:number)=>number[]|null}} o
 */
export function loft(gb, rings, sides, o = {}) {
  const axis = o.axis || 'y';
  const A = axis === 'y' ? 1 : 2;           // index of the axis coordinate
  const idx = [];
  const n = rings.length;
  for (let i = 0; i < n; i++) {
    const r = rings[i];
    const a = rings[Math.max(0, i - 1)];
    const b = rings[Math.min(n - 1, i + 1)];
    const run = (b.c[A] - a.c[A]) || 1e-6;
    const slope = ((b.rx + b.rz) - (a.rx + a.rz)) / 2 / run; // radius change along the axis
    const row = [];
    for (let s = 0; s < sides; s++) {
      const ang = (s / sides) * Math.PI * 2;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      let x, y, z, nx, ny, nz;
      // Ellipse normal ~ (cos/rx, sin/rz); the slope tips it along the axis.
      const ex = ca * r.rz, ez = sa * r.rx;
      const el = Math.hypot(ex, ez) || 1;
      if (axis === 'y') {
        x = r.c[0] + ca * r.rx; y = r.c[1]; z = r.c[2] + sa * r.rz;
        nx = ex / el; nz = ez / el; ny = -slope;
      } else {
        x = r.c[0] + ca * r.rx; y = r.c[1] + sa * r.rz; z = r.c[2];
        nx = ex / el; ny = ez / el; nz = -slope;
      }
      const nl = Math.hypot(nx, ny, nz) || 1;
      const col = (o.colorAt && o.colorAt(i, s, ang)) || r.col;
      row.push(gb.vertex(x, y, z, nx / nl, ny / nl, nz / nl, col, 0, 0));
    }
    idx.push(row);
  }
  for (let i = 0; i < n - 1; i++) {
    for (let s = 0; s < sides; s++) {
      const s1 = (s + 1) % sides;
      tri(gb, idx[i][s], idx[i][s1], idx[i + 1][s1]);
      tri(gb, idx[i][s], idx[i + 1][s1], idx[i + 1][s]);
    }
  }
  const cap = (ringIndex, dir) => {
    const r = rings[ringIndex];
    const nrm = [0, 0, 0];
    nrm[A] = dir;
    const centre = gb.vertex(r.c[0], r.c[1], r.c[2], nrm[0], nrm[1], nrm[2], r.col, 0, 0);
    const rim = [];
    for (let s = 0; s < sides; s++) {
      const ang = (s / sides) * Math.PI * 2;
      const x = r.c[0] + Math.cos(ang) * r.rx;
      const y = axis === 'y' ? r.c[1] : r.c[1] + Math.sin(ang) * r.rz;
      const z = axis === 'y' ? r.c[2] + Math.sin(ang) * r.rz : r.c[2];
      rim.push(gb.vertex(x, y, z, nrm[0], nrm[1], nrm[2], r.col, 0, 0));
    }
    for (let s = 0; s < sides; s++) tri(gb, centre, rim[s], rim[(s + 1) % sides]);
  };
  const dirEnd = Math.sign((rings[n - 1].c[A] - rings[0].c[A]) || 1);
  if (o.capStart) cap(0, -dirEnd);
  if (o.capEnd) cap(n - 1, dirEnd);
}

/**
 * Ellipsoid (or part of one).
 * @param {number[]} c centre  @param {number[]} r radii [rx, ry, rz]
 * @param {(nx:number, ny:number, nz:number)=>number[]} colorFn  colour from the direction
 * @param {(nx:number, ny:number, nz:number)=>boolean} [keep]    skip faces whose centre fails this
 */
export function ellipsoid(gb, c, r, lon, lat, colorFn, keep = null) {
  const rows = [];
  for (let j = 0; j <= lat; j++) {
    const v = (j / lat) * Math.PI;          // 0 = top
    const row = [];
    for (let i = 0; i < lon; i++) {
      const u = (i / lon) * Math.PI * 2;
      const dx = Math.sin(v) * Math.sin(u), dy = Math.cos(v), dz = Math.sin(v) * Math.cos(u);
      let nx = dx / r[0], ny = dy / r[1], nz = dz / r[2];
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;
      row.push({ d: [dx, dy, dz], i: gb.vertex(c[0] + dx * r[0], c[1] + dy * r[1], c[2] + dz * r[2], nx, ny, nz, colorFn(dx, dy, dz), 0, 0) });
    }
    rows.push(row);
  }
  for (let j = 0; j < lat; j++) {
    for (let i = 0; i < lon; i++) {
      const i1 = (i + 1) % lon;
      const a = rows[j][i], b = rows[j][i1], d = rows[j + 1][i], e = rows[j + 1][i1];
      if (keep) {
        const mx = (a.d[0] + b.d[0] + d.d[0] + e.d[0]) / 4;
        const my = (a.d[1] + b.d[1] + d.d[1] + e.d[1]) / 4;
        const mz = (a.d[2] + b.d[2] + d.d[2] + e.d[2]) / 4;
        if (!keep(mx, my, mz)) continue;
      }
      if (j > 0) tri(gb, a.i, e.i, b.i);
      if (j < lat - 1) tri(gb, a.i, d.i, e.i);
    }
  }
}

/** Solid box with flat sides (centre + half sizes). Slightly darker underneath. */
export function cube(gb, cx, cy, cz, hx, hy, hz, col) {
  const dark = [col[0] * 0.8, col[1] * 0.8, col[2] * 0.8];
  gb.box(cx - hx, cy - hy, cz - hz, cx + hx, cy + hy, cz + hz, dark, col, 0, 'nswetb');
}

/** Thin 4-sided rod between two points (stethoscope tube, chains, straps). */
export function rod(gb, a, b, radius, col) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(d[0], d[1], d[2]) || 1;
  const t = [d[0] / len, d[1] / len, d[2] / len];
  // Two directions at right angles to the rod.
  const h = Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let u = [t[1] * h[2] - t[2] * h[1], t[2] * h[0] - t[0] * h[2], t[0] * h[1] - t[1] * h[0]];
  const ul = Math.hypot(u[0], u[1], u[2]) || 1;
  u = [u[0] / ul, u[1] / ul, u[2] / ul];
  const w = [t[1] * u[2] - t[2] * u[1], t[2] * u[0] - t[0] * u[2], t[0] * u[1] - t[1] * u[0]];
  const ring = (p) => [0, 1, 2, 3].map((k) => {
    const ang = (k / 4) * Math.PI * 2;
    const nx = Math.cos(ang) * u[0] + Math.sin(ang) * w[0];
    const ny = Math.cos(ang) * u[1] + Math.sin(ang) * w[1];
    const nz = Math.cos(ang) * u[2] + Math.sin(ang) * w[2];
    return gb.vertex(p[0] + nx * radius, p[1] + ny * radius, p[2] + nz * radius, nx, ny, nz, col, 0, 0);
  });
  const r0 = ring(a), r1 = ring(b);
  for (let k = 0; k < 4; k++) {
    const k1 = (k + 1) % 4;
    tri(gb, r0[k], r0[k1], r1[k1]);
    tri(gb, r0[k], r1[k1], r1[k]);
  }
}
