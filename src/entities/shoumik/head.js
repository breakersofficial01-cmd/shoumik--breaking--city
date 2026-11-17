// Shoumik's head (docs/CHARACTER.md): round full face, thick black quiff swept up and back,
// full beard, ears showing. Built in the HEAD bone's space: origin = top of the neck,
// facing +z, his left = +x.
//
// The front of the head gets a slightly bulged patch carrying the face photo texture
// (faceTexture.js). The skull under it is vertex-coloured skin / beard / hair, so the
// feathered photo blends into those colours.

import * as THREE from 'three';
import { hexToLinear, shade } from '../../world/geoBuilder.js';
import { loft, ellipsoid, cube, rod } from '../people/shapes.js';

// Skull ellipsoid (centre and radii, metres).
export const SKULL = { c: [0, 0.135, 0.008], r: [0.102, 0.138, 0.118] };
// Face patch: how far round the head it reaches (degrees from straight ahead / from the top).
const PATCH = { lon: 62, latBottom: 166, lift: 1.014, cols: 6, rows: 7 };
const DEG = Math.PI / 180;

/** Skin, beard and hair areas of the head as vertex-coloured geometry. */
export function buildHead(gb, body) {
  const skin = hexToLinear(body.skin);
  const skinShadow = hexToLinear(body.skinShadow);
  const hair = hexToLinear(body.hair);
  const hairHi = hexToLinear(body.hairHighlight);
  const beard = hexToLinear(body.beard);
  const { c, r } = SKULL;

  // Neck.
  loft(gb, [
    { c: [0, -0.075, -0.005], rx: 0.064, rz: 0.062, col: skinShadow },
    { c: [0, 0.05, 0], rx: 0.06, rz: 0.06, col: skinShadow },
  ], 8);

  // Skull: hair on top and at the back, beard round the jaw and up the cheeks to the
  // sideburns, skin elsewhere.
  ellipsoid(gb, c, r, 14, 10, (dx, dy, dz) => {
    if (dy > 0.66 || (dz < -0.3 && dy > -0.5) || (dy > 0.25 && dz < 0.35)) return hair;
    if (dz > -0.3 && (dy < -0.2 || (Math.abs(dx) > 0.87 && dy < 0.3))) return beard;
    return dz < -0.2 ? skinShadow : skin;
  });

  // Ears.
  for (const s of [1, -1]) cube(gb, s * (r[0] + 0.004), c[1] - 0.012, -0.012, 0.012, 0.03, 0.018, skinShadow);

  // Hair: thick and voluminous — wider than the head, down to just above the ears …
  const hc = [0, 0.168, -0.012];
  ellipsoid(gb, hc, [r[0] * 1.2, 0.132, r[2] * 1.16], 14, 9, (dx, dy) => (dy > 0.7 ? hairHi : hair), (dx, dy, dz) => (
    dy > 0.45 || (dz < -0.3 && dy > -0.62) || (dy > 0.02 && dz < 0.42)
  ));
  // … with the quiff swept up and back from the forehead, leaning to one side.
  loft(gb, [
    { c: [0.0, 0.25, -0.1], rx: 0.09, rz: 0.035, col: hair },
    { c: [0.004, 0.272, -0.02], rx: 0.112, rz: 0.052, col: hair },
    { c: [0.01, 0.288, 0.055], rx: 0.114, rz: 0.066, col: hairHi },
    { c: [0.018, 0.282, 0.108], rx: 0.1, rz: 0.062, col: hairHi },
    { c: [0.026, 0.262, 0.14], rx: 0.07, rz: 0.04, col: hair },
  ], 10, { axis: 'z', capStart: true, capEnd: true });
  // A few strands falling on the forehead.
  rod(gb, [0.045, 0.245, 0.135], [0.058, 0.212, 0.116], 0.009, hair);
  rod(gb, [0.016, 0.242, 0.142], [0.026, 0.215, 0.124], 0.007, shade(hair, 1.3));
  rod(gb, [-0.03, 0.245, 0.135], [-0.022, 0.222, 0.122], 0.007, hair);
}

/**
 * The curved patch on the front of the head that carries the face photo.
 * The photo is projected straight on at ONE scale in both directions (so the face is not
 * stretched): `cheekWidth` (share of the image width between the cheeks) is matched to the
 * width of the head, and the chin sits `chinY` of the way down the image.
 * @param {{cheekWidth:number, chinY:number}} face  data/player.json → model.face
 */
export function buildFacePatch(face) {
  const { c, r } = SKULL;
  const pos = [], nor = [], uv = [], idx = [];
  const metresPerImage = (2 * r[0] * 0.96) / face.cheekWidth;      // size of the whole photo on the head
  const topDy = -1 + (face.chinY * metresPerImage) / r[1];         // where the top edge of the photo lands
  const latTop = Math.acos(Math.min(0.95, topDy)) / DEG;
  for (let j = 0; j <= PATCH.rows; j++) {
    const v = (latTop + (PATCH.latBottom - latTop) * (j / PATCH.rows)) * DEG;
    for (let i = 0; i <= PATCH.cols; i++) {
      const u = (-PATCH.lon + 2 * PATCH.lon * (i / PATCH.cols)) * DEG;
      const dx = Math.sin(v) * Math.sin(u), dy = Math.cos(v), dz = Math.sin(v) * Math.cos(u);
      pos.push(c[0] + dx * r[0] * PATCH.lift, c[1] + dy * r[1] * PATCH.lift, c[2] + dz * r[2] * PATCH.lift);
      const n = new THREE.Vector3(dx / r[0], dy / r[1], dz / r[2]).normalize();
      nor.push(n.x, n.y, n.z);
      // His left (+x) is on the right-hand side of a photo taken from the front.
      uv.push(0.5 + (dx * r[0]) / metresPerImage, 1 - ((topDy - dy) * r[1]) / metresPerImage);
    }
  }
  const w = PATCH.cols + 1;
  for (let j = 0; j < PATCH.rows; j++) {
    for (let i = 0; i < PATCH.cols; i++) {
      const a = j * w + i, b = a + 1, d = a + w, e = d + 1;
      idx.push(a, d, e, a, e, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
