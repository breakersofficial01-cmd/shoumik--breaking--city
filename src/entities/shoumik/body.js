// Shoumik's body below the neck, built per outfit (data/outfits.json). Stocky build: broad
// shoulders, thick arms, full chest and a little belly (docs/CHARACTER.md).
//
// Every function adds geometry in the space of ONE bone (see skeleton.js → BONE):
//   torso → SPINE (origin = waist)      pelvis/skirt → HIPS (origin = hip joints)
//   upper arm → ARM_*  (origin = shoulder, arm hangs down -y)
//   forearm + hand → FORE_* (origin = elbow)    thigh → LEG_*    shin + shoe → SHIN_*
//
// Outfit styles: 'tee' (oversized T-shirt), 'polo', 'panjabi' (long kurta), 'doctor' (apron).

import { hexToLinear, shade } from '../../world/geoBuilder.js';
import { loft, ellipsoid, cube, rod } from '../people/shapes.js';

const SIDES = 16; // torso sides; index 4 is the centre of the chest (+z)
const FRONT = 4;

/** Torso rings: [y, half width, half depth, forward offset]. */
const TORSO = [
  [-0.25, 0.236, 0.19, 0.008],
  [-0.12, 0.232, 0.19, 0.016],
  [0.02, 0.232, 0.192, 0.026],
  [0.13, 0.236, 0.194, 0.03],
  [0.24, 0.232, 0.174, 0.016],
  [0.34, 0.23, 0.152, 0.0],
  [0.405, 0.206, 0.128, -0.004],
  [0.445, 0.13, 0.1, -0.004],
  [0.468, 0.076, 0.074, -0.004],
];
const CHEST = 4;   // index of the first chest ring (placket / shirt V start here)
const HEM_SHORT = -0.14; // fitted tops (polo, panjabi, apron) end higher; a skirt takes over

/** Colours for one outfit as linear floats, with sensible fallbacks. */
export function outfitColors(outfit, body) {
  const c = outfit.colors || {};
  const L = (hex, fallback) => hexToLinear(hex || fallback);
  const top = L(c.top, '#7E1C24');
  return {
    top,
    trim: c.trim ? L(c.trim) : shade(top, 0.75),
    cuff: c.cuff ? L(c.cuff) : top,
    stripe: L(c.stripe, '#E8DCC0'),
    buttons: L(c.buttons, '#e6e0d0'),
    pattern: c.pattern ? L(c.pattern) : null,
    shirt: L(c.shirt, '#D8E2EE'),
    stethoscope: L(c.stethoscope, '#111111'),
    metal: L(c.metal, '#b9bcc2'),
    pants: L(c.pants, '#C9B79C'),
    shoes: L(c.shoes, '#EDEDED'),
    sole: L(c.sole, '#8a8a8a'),
    skin: hexToLinear(body.skin),
    skinShadow: hexToLinear(body.skinShadow),
    watch: hexToLinear(body.watch),
    watchFace: hexToLinear(body.watchFace),
  };
}

/** Cheap "printed fabric" look: a fixed speckle between two colours. */
function speckle(a, b, i, s) {
  const h = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453;
  const w = (h - Math.floor(h)) > 0.55 ? 1 : 0;
  return [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w, a[2] + (b[2] - a[2]) * w];
}

export function buildTorso(gb, style, C, ws) {
  const loose = style === 'tee';
  const rings = TORSO.map(([y, rx, rz, cz], i) => ({
    c: [0, i === 0 && !loose ? HEM_SHORT : y, cz],
    rx: rx * ws * (!loose && i < 4 ? 0.96 : 1),
    rz: rz * (!loose && i < 4 ? 0.97 : 1),
    col: shade(C.top, i === 0 ? 0.8 : i === 1 ? 0.92 : 1),
  }));
  loft(gb, rings, SIDES, {
    capStart: true,
    capEnd: true,
    colorAt: (i, s) => {
      const base = rings[i].col;
      if (style === 'panjabi') {
        if (s === FRONT && i >= CHEST - 1) return C.trim;                      // button placket
        if (C.pattern) return speckle(base, C.pattern, i, s);
      }
      if (style === 'doctor' && i >= CHEST && (s === FRONT || (i >= CHEST + 2 && Math.abs(s - FRONT) === 1))) return C.shirt; // V of the shirt
      if (style === 'polo' && s === FRONT && i >= CHEST + 1) return shade(C.top, 1.6);
      return null;
    },
  });
  const frontZ = (y) => {
    for (let i = 0; i < TORSO.length - 1; i++) {
      const a = TORSO[i], b = TORSO[i + 1];
      if (y >= a[0] && y <= b[0]) {
        const t = (y - a[0]) / (b[0] - a[0]);
        return a[2] + a[3] + (b[2] + b[3] - a[2] - a[3]) * t;
      }
    }
    return 0.18;
  };

  if (style === 'panjabi') {
    // Mandarin collar; the grey one is embroidered black and white.
    loft(gb, [
      { c: [0, 0.452, -0.004], rx: 0.084, rz: 0.081, col: C.trim },
      { c: [0, 0.5, -0.004], rx: 0.073, rz: 0.071, col: C.trim },
    ], 8, { colorAt: (i, s) => (C.pattern && s % 2 ? C.buttons : null) });
    for (const y of [0.4, 0.32, 0.24]) cube(gb, 0, y, frontZ(y) + 0.004, 0.009, 0.009, 0.005, C.buttons);
  }
  if (style === 'polo') {
    // Soft collar with a cream stripe on its edge.
    loft(gb, [
      { c: [0, 0.448, -0.004], rx: 0.084, rz: 0.082, col: C.top },
      { c: [0, 0.474, 0.002], rx: 0.116, rz: 0.106, col: C.stripe },
      { c: [0, 0.462, 0.004], rx: 0.132, rz: 0.118, col: C.top },
    ], 8);
  }
  if (style === 'doctor') {
    // Coat opening, pocket and the stethoscope round the neck.
    const edge = shade(C.top, 0.72);
    rod(gb, [0, 0.22, frontZ(0.22) + 0.004], [0, -0.15, frontZ(-0.15) + 0.006], 0.006, edge);
    cube(gb, 0.12 * ws, 0.02, frontZ(0.02) - 0.012, 0.05, 0.045, 0.006, shade(C.top, 0.88));
    const st = C.stethoscope;
    const path = [[0.035, 0.16, 0.222], [0.085, 0.3, 0.178], [0.105, 0.43, 0.08], [0.075, 0.47, -0.075],
      [-0.075, 0.47, -0.075], [-0.105, 0.43, 0.08], [-0.085, 0.3, 0.178], [-0.03, 0.22, 0.208], [0.035, 0.16, 0.222]];
    for (let i = 0; i < path.length - 1; i++) rod(gb, path[i], path[i + 1], 0.011, st);
    cube(gb, 0.035, 0.135, 0.228, 0.024, 0.024, 0.01, C.metal);
  }
}

export function buildPelvis(gb, style, C, ws) {
  loft(gb, [
    { c: [0, 0.13, 0.008], rx: 0.2 * ws, rz: 0.15, col: C.pants },
    { c: [0, 0.0, 0.004], rx: 0.214 * ws, rz: 0.158, col: C.pants },
    { c: [0, -0.13, 0], rx: 0.2 * ws, rz: 0.146, col: shade(C.pants, 0.8) },
  ], 12, { capEnd: true });
  if (style !== 'panjabi' && style !== 'doctor') return;
  // The long kurta / apron hangs from the waist to just above the knee.
  const rings = [
    { c: [0, 0.14, 0.012], rx: 0.218 * ws, rz: 0.176, col: C.top },
    { c: [0, -0.12, 0.012], rx: 0.246 * ws, rz: 0.2, col: shade(C.top, 0.94) },
    { c: [0, -0.39, 0.012], rx: 0.262 * ws, rz: 0.212, col: shade(C.top, 0.82) },
  ];
  loft(gb, rings, SIDES, {
    capEnd: true,
    colorAt: (i, s) => {
      if (style === 'doctor' && s === FRONT) return shade(C.top, 0.6);   // coat opening
      if (style === 'panjabi' && C.pattern) return speckle(rings[i].col, C.pattern, i + 7, s);
      return null;
    },
  });
}

/** side: 1 = his left arm (+x), -1 = right. */
export function buildUpperArm(gb, style, C) {
  const long = style === 'panjabi' || style === 'doctor';
  const hem = style === 'polo' ? C.stripe : shade(C.top, 0.82);
  if (long) {
    loft(gb, [
      { c: [-0.0, 0.07, 0], rx: 0.03, rz: 0.04, col: C.top },
      { c: [0, 0.035, 0], rx: 0.066, rz: 0.074, col: C.top },
      { c: [0, -0.06, 0], rx: 0.076, rz: 0.082, col: C.top },
      { c: [0, -0.29, 0], rx: 0.064, rz: 0.066, col: shade(C.top, 0.9) },
    ], 10, { capStart: true, capEnd: true });
    return;
  }
  // Short loose sleeve, bare arm below it.
  loft(gb, [
    { c: [0, 0.07, 0], rx: 0.03, rz: 0.04, col: C.top },
    { c: [0, 0.035, 0], rx: 0.068, rz: 0.076, col: C.top },
    { c: [0, -0.06, 0], rx: 0.08, rz: 0.086, col: C.top },
    { c: [0, -0.19, 0], rx: 0.08, rz: 0.084, col: C.top },
    { c: [0, -0.22, 0], rx: 0.082, rz: 0.086, col: hem },
  ], 10, { capStart: true, capEnd: true });
  loft(gb, [
    { c: [0, -0.2, 0], rx: 0.062, rz: 0.064, col: C.skinShadow },
    { c: [0, -0.29, 0], rx: 0.056, rz: 0.058, col: C.skin },
  ], 8, { capEnd: true });
}

export function buildForearm(gb, style, C, side) {
  const long = style === 'panjabi' || style === 'doctor';
  if (long) {
    loft(gb, [
      { c: [0, 0.01, 0], rx: 0.064, rz: 0.066, col: C.top },
      { c: [0, -0.18, 0], rx: 0.054, rz: 0.056, col: C.top },
      { c: [0, -0.185, 0], rx: 0.056, rz: 0.058, col: C.cuff },
      { c: [0, -0.225, 0], rx: 0.054, rz: 0.056, col: C.cuff },
    ], 10, { capStart: true, capEnd: true });
  } else {
    loft(gb, [
      { c: [0, 0.01, 0], rx: 0.057, rz: 0.059, col: C.skin },
      { c: [0, -0.1, 0], rx: 0.055, rz: 0.057, col: C.skin },
      { c: [0, -0.24, 0], rx: 0.043, rz: 0.045, col: C.skin },
    ], 10, { capStart: true });
  }
  // Hand (a simple mitten shape).
  ellipsoid(gb, [0, -0.3, 0.006], [0.034, 0.064, 0.046], 8, 5, (dx, dy) => (dy < -0.3 ? C.skinShadow : C.skin));
  if (side === 1) {
    // The big black chronograph on the LEFT wrist — always there.
    loft(gb, [
      { c: [0, -0.222, 0], rx: 0.05, rz: 0.052, col: C.watch },
      { c: [0, -0.256, 0], rx: 0.049, rz: 0.051, col: C.watch },
    ], 8);
    cube(gb, 0.05, -0.239, 0, 0.011, 0.03, 0.03, C.watch);
    cube(gb, 0.062, -0.239, 0, 0.002, 0.021, 0.021, C.watchFace);
  }
}

export function buildThigh(gb, style, C) {
  loft(gb, [
    { c: [0, 0.04, 0], rx: 0.1, rz: 0.112, col: C.pants },
    { c: [0, -0.2, 0], rx: 0.104, rz: 0.108, col: C.pants },
    { c: [0, -0.44, 0], rx: 0.084, rz: 0.088, col: shade(C.pants, 0.92) },
  ], 10, { capStart: true, capEnd: true });
}

export function buildShin(gb, style, C) {
  loft(gb, [
    { c: [0, 0.01, 0], rx: 0.085, rz: 0.089, col: shade(C.pants, 0.94) },
    { c: [0, -0.2, 0], rx: 0.077, rz: 0.081, col: shade(C.pants, 0.9) },
    { c: [0, -0.405, 0], rx: 0.07, rz: 0.074, col: shade(C.pants, 0.78) },
  ], 10, { capStart: true, capEnd: true });
  // Shoe: runs heel → toe along +z, sole on the ground (y = -0.47).
  loft(gb, [
    { c: [0, -0.428, -0.085], rx: 0.05, rz: 0.04, col: C.shoes },
    { c: [0, -0.42, 0.0], rx: 0.064, rz: 0.05, col: C.shoes },
    { c: [0, -0.43, 0.1], rx: 0.065, rz: 0.042, col: C.shoes },
    { c: [0, -0.44, 0.175], rx: 0.05, rz: 0.03, col: shade(C.shoes, 0.9) },
  ], 8, { axis: 'z', capStart: true, capEnd: true });
  cube(gb, 0, -0.464, 0.04, 0.058, 0.007, 0.13, C.sole);
}
