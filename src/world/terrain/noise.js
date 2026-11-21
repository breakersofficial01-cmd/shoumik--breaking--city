// Small deterministic noise helpers for the countryside (Roadmap 2 S3). Pure maths, no Three.js.
// Same seed + same position = same value, on every device, every time.

/** Hash of two integers + a seed → 0..1. */
export function hash2(ix, iz, seed) {
  let h = (Math.imul(ix | 0, 374761393) + Math.imul(iz | 0, 668265263) + Math.imul(seed | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const smooth = (t) => t * t * (3 - 2 * t);

/** Value noise 0..1, smooth, one unit = one cell. */
export function noise2(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = smooth(x - ix), fz = smooth(z - iz);
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

/** Fractal noise 0..1 (octaves halve in size, half the strength each). */
export function fbm(x, z, seed, octaves = 3) {
  let sum = 0, amp = 0.5, norm = 0, f = 1;
  for (let o = 0; o < octaves; o++) {
    sum += noise2(x * f, z * f, seed + o * 101) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}

/** 0 below e0, 1 above e1, smooth in between. */
export function smoothstep(e0, e1, v) {
  const t = Math.min(1, Math.max(0, (v - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** Distance from point to segment + the segment parameter t (0..1). */
export function segDistance(px, pz, ax, az, bx, bz, out) {
  const dx = bx - ax, dz = bz - az;
  const len2 = dx * dx + dz * dz || 1;
  const t = Math.min(1, Math.max(0, ((px - ax) * dx + (pz - az) * dz) / len2));
  const qx = ax + dx * t, qz = az + dz * t;
  if (out) out.t = t;
  return Math.hypot(px - qx, pz - qz);
}
