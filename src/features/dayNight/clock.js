// Day/night maths (no side effects): blending the look keys of data/dayNight.json and the
// path of the sun across the sky.

import * as THREE from 'three';

const parsed = new WeakMap();
const out = {
  sky: [0, 0, 0],
  sun: { color: new THREE.Color(), value: 0 },
  hemiSky: new THREE.Color(), hemiGround: new THREE.Color(), hemi: 0,
  ambient: { color: new THREE.Color(), value: 0 },
  fog: new THREE.Color(),
  exposure: 1, neon: 1, windows: 0, signs: 0, bloom: 0.5, env: 1,
};

/** Parse colour strings once per keys array. */
function prepare(keys) {
  let p = parsed.get(keys);
  if (p) return p;
  p = keys.map((k) => ({
    hour: k.hour, sky: k.sky,
    sunC: new THREE.Color(k.sun[0]), sunV: k.sun[1],
    hemiS: new THREE.Color(k.hemi[0]), hemiG: new THREE.Color(k.hemi[1]), hemiV: k.hemi[2],
    ambC: new THREE.Color(k.ambient[0]), ambV: k.ambient[1],
    fog: new THREE.Color(k.fog),
    exposure: k.exposure, neon: k.neon, windows: k.windows, signs: k.signs, bloom: k.bloom, env: k.env,
  })).sort((a, b) => a.hour - b.hour);
  parsed.set(keys, p);
  return p;
}

const lerp = (a, b, t) => a + (b - a) * t;

/**
 * The look at `hour`, blended between the two keys around it (smoothstep, so changes ease in).
 * Returns a shared object — copy what you keep.
 */
export function sampleKeys(keys, hour) {
  const p = prepare(keys);
  let i = 0;
  while (i < p.length - 2 && hour >= p[i + 1].hour) i++;
  const a = p[i], b = p[i + 1] || a;
  let t = b.hour > a.hour ? (hour - a.hour) / (b.hour - a.hour) : 0;
  t = Math.min(1, Math.max(0, t));
  t = t * t * (3 - 2 * t);
  for (let j = 0; j < 3; j++) out.sky[j] = lerp(a.sky[j], b.sky[j], t);
  out.sun.color.copy(a.sunC).lerp(b.sunC, t);
  out.sun.value = lerp(a.sunV, b.sunV, t);
  out.hemiSky.copy(a.hemiS).lerp(b.hemiS, t);
  out.hemiGround.copy(a.hemiG).lerp(b.hemiG, t);
  out.hemi = lerp(a.hemiV, b.hemiV, t);
  out.ambient.color.copy(a.ambC).lerp(b.ambC, t);
  out.ambient.value = lerp(a.ambV, b.ambV, t);
  out.fog.copy(a.fog).lerp(b.fog, t);
  for (const k of ['exposure', 'neon', 'windows', 'signs', 'bloom', 'env']) out[k] = lerp(a[k], b[k], t);
  return out;
}

/**
 * Direction from the ground to the sun at `hour`. It rises opposite the sunset side at
 * riseHour, is highest at noon and sets towards data/world.json → sky.sunDirection (where the
 * painted sunset glow is) at setHour. Below the horizon at night (y < 0).
 * @param {{riseHour:number,setHour:number,elevation:number}} path  data/dayNight.json → sunPath
 * @param {number[]} sunsetDir  data/world.json → sky.sunDirection
 * @param {THREE.Vector3} target
 */
export function sunDirection(path, hour, sunsetDir, target) {
  const wx = sunsetDir[0], wz = sunsetDir[2];
  const wl = Math.hypot(wx, wz) || 1;
  const day = path.setHour - path.riseHour;
  const a = ((hour - path.riseHour) / day) * Math.PI; // 0 at sunrise, PI at sunset
  const across = -Math.cos(a);                          // -1 = east side, +1 = sunset side
  return target.set((wx / wl) * across, Math.sin(a) * path.elevation, (wz / wl) * across).normalize();
}
