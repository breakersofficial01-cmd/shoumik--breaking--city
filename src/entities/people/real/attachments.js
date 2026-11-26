// Clothes and items that the Kenney body does not have, for real 3D people (Roadmap 2 S5):
// long hair / bun, headscarf (hijab), cap, bucket hat, lungi, saree (+ the anchal over the
// shoulder), the long panjabi / kameez shirt, orna, tie, chain, gamcha, backpack, hand bag,
// a hawker's basket and a police gun.
//
// All of a person's attachments are ONE extra SkinnedMesh (one draw call) on the same skeleton:
// each piece is a shared low-poly shape (src/entities/people/partGeometry.js) placed in model
// space at the T-pose and skinned RIGIDLY to one bone (hair → Head, bag → RightHand...). Skirts
// are blended from the hips to the thighs towards the hem, so lungis and sarees swing with the
// legs. Sizes: data/people.json → attach. Colours: the look's desc (looks.js), linear vertex
// colours like the code-built crowd.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makePartGeometry } from '../partGeometry.js';
import { hexToLinear, GeoBuilder } from '../../../world/geoBuilder.js';
import { ellipsoid, loft } from '../shapes.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const clamp01 = (v) => Math.max(0, Math.min(1, v));

/**
 * Measures the template body once (bind pose): bone positions, head / chest / hip boxes, all in
 * the body GEOMETRY's units. The compressed GLB stores the body squeezed into a -1…1 box (meshopt
 * quantisation; the skeleton's bind matrices undo it), so `k` = geometry units per metre and
 * `floor` = the soles, and every size given in metres is multiplied by k.
 * @param {THREE.SkinnedMesh} body
 * @param {number} height  the model's real height in metres (tools/people-kit/people.json)
 */
export function measureBody(body, height) {
  const sk = body.skeleton;
  const bone = {}, pos = {};
  sk.bones.forEach((b, i) => {
    bone[b.name] = i;
    pos[b.name] = new THREE.Vector3().setFromMatrixPosition(sk.boneInverses[i].clone().invert());
  });
  const g = body.geometry, p = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  const boxes = { head: new THREE.Box3(), chest: new THREE.Box3(), hips: new THREE.Box3() };
  const which = { [bone.Head]: 'head', [bone.Neck]: null, [bone.Chest]: 'chest', [bone.UpperChest]: 'chest', [bone.Hips]: 'hips' };
  for (let i = 0; i < p.count; i++) {
    let b = 0, w = -1;
    for (let k = 0; k < 4; k++) { const x = sw.getComponent(i, k); if (x > w) { w = x; b = si.getComponent(i, k); } }
    const box = boxes[which[b]];
    if (box && w > 0.55) box.expandByPoint(_v.fromBufferAttribute(p, i));
  }
  const half = (box) => box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  g.computeBoundingBox();
  const k = (g.boundingBox.max.y - g.boundingBox.min.y) / height;
  const handDir = (side) => pos[side + 'HandIndex1'].clone().sub(pos[side + 'Hand']).normalize();
  return {
    bone, pos, k, floor: g.boundingBox.min.y,
    head: { c: boxes.head.getCenter(new THREE.Vector3()), r: half(boxes.head), top: boxes.head.max.y },
    chest: { c: boxes.chest.getCenter(new THREE.Vector3()), r: half(boxes.chest) },
    hips: { c: boxes.hips.getCenter(new THREE.Vector3()), r: half(boxes.hips) },
    handR: pos.RightHand, handDirR: handDir('Right'),
  };
}

/**
 * Headscarf made for the Kenney head: a hood open at the face (unit ball, like partGeometry's
 * hijab) and a short cape over the neck and shoulders. y = 0 is the head centre; `cape` = how
 * far below the centre the cape ends and `wide` = its width, both in head radii.
 */
function hijabShape(cape, wide) {
  const gb = new GeoBuilder();
  const W = [1, 1, 1], g = (v) => [v, v, v];
  ellipsoid(gb, [0, 0.04, -0.03], [1.08, 1.08, 1.1], 10, 7, (dx, dy) => (dy > 0.6 ? g(1.1) : W), (dx, dy, dz) => !(dz > 0.42 && dy < 0.55 && dy > -0.72));
  loft(gb, [
    { c: [0, -0.62, -0.02], rx: 0.92, rz: 0.92, col: W },
    { c: [0, -0.95, 0.0], rx: wide * 0.8, rz: wide * 0.62, col: g(0.92) },
    { c: [0, -cape, 0.02], rx: wide, rz: wide * 0.72, col: g(0.8) },
  ], 10, { capEnd: true });
  return gb.build();
}

/**
 * One piece: shape `kind` (a partGeometry name or a ready geometry) with matrix m, colour hex,
 * weights(x, y, z) → [[bone, w], ...].
 */
function piece(kind, m, hex, weights) {
  const g = typeof kind === 'string' ? makePartGeometry(kind) : kind;
  g.deleteAttribute('uv');
  g.applyMatrix4(m);
  const c = hexToLinear(hex);
  const col = g.attributes.color;
  for (let i = 0; i < col.count; i++) col.setXYZ(i, col.getX(i) * c[0], col.getY(i) * c[1], col.getZ(i) * c[2]);
  const n = g.attributes.position.count;
  const idx = new Uint16Array(n * 4), wts = new Float32Array(n * 4);
  const p = g.attributes.position;
  for (let i = 0; i < n; i++) {
    const list = weights(p.getX(i), p.getY(i), p.getZ(i));
    let sum = 0;
    for (const [, w] of list) sum += w;
    list.slice(0, 4).forEach(([b, w], k) => { idx[i * 4 + k] = b; wts[i * 4 + k] = w / (sum || 1); });
  }
  g.setAttribute('skinIndex', new THREE.BufferAttribute(idx, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(wts, 4));
  return g;
}

const mat = (x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) =>
  new THREE.Matrix4().compose(_v.set(x, y, z).clone(), _q.setFromEuler(_e.set(rx, ry, rz)).clone(), new THREE.Vector3(sx, sy, sz));

/**
 * Build the attachment geometry for a look, or null if it needs none.
 * @param {object} d    look.desc (looks.js)
 * @param {object} M    measureBody() of the template
 * @param {object} cfg  data/people.json
 */
export function buildAttachments(d, M, cfg) {
  const A = cfg.attach;
  const B = M.bone;
  const k = M.k;                          // metres → geometry units
  const Y = (m) => M.floor + m * k;       // height above the soles (metres) → geometry y
  const parts = [];
  const rigid = (b) => () => [[b, 1]];
  const H = M.head, C = M.chest, P = M.hips;
  const neckY = M.pos.Head.y;
  // Below the neck, hair and scarves follow the chest instead of the head.
  const headOrChest = (x, y) => { const t = clamp01((neckY - y) / (0.06 * k)); return [[B.Head, 1 - t], [B.UpperChest, t]]; };
  const headM = (fit = A.headFit, dy = 0) => mat(H.c.x, H.c.y + dy, H.c.z, H.r.x * fit, H.r.y * fit, H.r.z * fit);

  // Head: hair for women (men's hair is painted on the body texture), scarves and hats.
  if (d.head === 'hijab') parts.push(piece(hijabShape(A.hijabCape, A.hijabWide), headM(A.headFit * 1.02), d.headC, headOrChest));
  else if (d.head === 'hairLong') parts.push(piece('hairLong', headM(), d.hair, headOrChest));
  else if (d.head === 'hairBun') parts.push(piece('hairBun', headM(), d.hair, rigid(B.Head)));
  else if (d.head === 'cap' || d.head === 'bucket') {
    if (d.sex === 'f') parts.push(piece('hairLong', headM(), d.hair, headOrChest));
    parts.push(piece(d.head, headM(A.headFit * 1.04, H.r.y * 0.06), d.headC, rigid(B.Head)));
  }

  // Skirts: lungi, saree, and the long part of a panjabi / kameez.
  const waistY = P.c.y + A.skirtWaist * k;
  const skirt = (hemM, hex, widen = 1) => {
    const sy = Math.max(0.1 * k, waistY - Y(hemM));
    const sx = (P.r.x * A.skirtWaistWidth * widen) / 0.78, sz = (P.r.z * A.skirtWaistWidth * widen * 1.15) / 0.78;
    parts.push(piece('skirt', mat(P.c.x, waistY, P.c.z, sx, sy, sz), hex, (x, y) => {
      const t = clamp01((waistY - y) / sy) * A.legPull;
      const l = clamp01(0.5 + x / (2 * P.r.x)); // +x = his left
      return [[B.Hips, 1 - t], [B.LeftUpLeg, t * l], [B.RightUpLeg, t * (1 - l)]];
    }));
  };
  if (d.bottom === 'lungi') skirt(A.lungiHem, d.bottomC);
  if (d.bottom === 'saree') {
    skirt(A.sareeHem, d.bottomC, 1.04);
    // Anchal: the end of the saree over the left shoulder, across the chest.
    parts.push(piece('box', mat(C.c.x + C.r.x * 0.15, C.c.y + C.r.y * 0.2, C.c.z + C.r.z * 0.95, C.r.x * 0.55, C.r.y * 2.6, 0.03 * k, 0, 0, -0.55), d.bottomC, rigid(B.UpperChest)));
    parts.push(piece('box', mat(C.c.x + C.r.x * 0.55, C.c.y + C.r.y * 0.1, C.c.z - C.r.z * 0.95, C.r.x * 0.7, C.r.y * 2.4, 0.03 * k), d.bottomC, rigid(B.UpperChest)));
  }
  if (d.top === 'kameez') skirt(A.kameezHem, d.topC, 1.06);
  if (d.top === 'panjabi') skirt(A.panjabiHem, d.topC, 1.02);

  // Small items.
  const ex = d.extras || {};
  if (ex.orna) {
    const hex = d.ornaC || '#f2f2f2';
    parts.push(piece('box', mat(C.c.x, C.c.y + C.r.y * 0.85, C.c.z + C.r.z * 0.9, C.r.x * 2.1, 0.07 * k, 0.05 * k), hex, rigid(B.UpperChest)));
    parts.push(piece('box', mat(C.c.x - C.r.x * 0.7, C.c.y + C.r.y * 0.2, C.c.z - C.r.z * 1.05, 0.12 * k, C.r.y * 2.2, 0.03 * k), hex, rigid(B.UpperChest)));
  }
  if (ex.backpack) parts.push(piece('box', mat(C.c.x, C.c.y, C.c.z - C.r.z - 0.07 * k, 0.3 * k, 0.38 * k, 0.15 * k), d.backpackC || '#2b2f3a', rigid(B.UpperChest)));
  if (ex.tie) parts.push(piece('box', mat(C.c.x, C.c.y + C.r.y * 0.2, C.c.z + C.r.z * 1.0, 0.045 * k, C.r.y * 1.4, 0.015 * k), d.tieC || '#7a1f2b', rigid(B.UpperChest)));
  if (ex.chain) parts.push(piece('box', mat(C.c.x, C.c.y + C.r.y * 0.55, C.c.z + C.r.z * 0.98, C.r.x * 0.8, 0.018 * k, 0.018 * k), cfg.colours.chain, rigid(B.UpperChest)));
  if (ex.gamcha) parts.push(piece('box', mat(C.c.x - C.r.x * 0.6, C.c.y + C.r.y * 0.9, C.c.z, 0.12 * k, 0.05 * k, C.r.z * 2.3), d.gamchaC || '#c1272d', rigid(B.UpperChest)));
  if (ex.basket) {
    parts.push(piece('box', mat(H.c.x, H.top + 0.04 * k, H.c.z, 0.46 * k, 0.09 * k, 0.46 * k), cfg.colours.basket, rigid(B.Head)));
    parts.push(piece('box', mat(H.c.x, H.top + 0.11 * k, H.c.z, 0.34 * k, 0.08 * k, 0.34 * k), d.waresC || '#e63946', rigid(B.Head)));
  }
  // Things in the right hand lie along the hand (fingers' direction) at the T-pose, so they
  // hang down when the arm hangs and point ahead when he aims.
  const hand = (len, w, h, along, hex, side = 0) => {
    const dir = M.handDirR;
    const yaw = Math.atan2(dir.z, dir.x);
    const at = M.handR.clone().addScaledVector(dir, along * k);
    parts.push(piece('box', mat(at.x, at.y, at.z + side * k, len * k, h * k, w * k, 0, -yaw, 0), hex, rigid(B.RightHand)));
  };
  if (ex.bag) hand(0.3, 0.08, 0.26, 0.2, d.bagC || '#2b2f3a');
  if (ex.gun) { hand(0.2, 0.04, 0.05, 0.12, cfg.colours.gun, 0.02); hand(0.04, 0.035, 0.11, 0.05, cfg.colours.gun, 0.02); }

  if (!parts.length) return null;
  const g = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  return g;
}
