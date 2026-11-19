// Builds what one pedestrian LOOKS like from an archetype in data/pedestrians.json:
// which shared shapes (partGeometry.js) hang on which bone, how big, and what colour.
// Clothing kinds understood here:
//   top:    tee | shirt_short | shirt_long | vest | panjabi | kameez | blouse |
//           oversized_tee | crop_jacket
//   bottom: pants | cargo | lungi | salwar | saree
//   head:   hairShort | hairLong | hairBun | hijab | cap | bucket
//   extras: backpack | basket | gamcha | chain | tie | bag | orna | gun | vest (police, Session 6)
// To add a new kind of person, add an archetype in the JSON; to add a new clothing kind,
// add a case here. Everyone is an adult (heights come from the JSON, all adult sizes).

import * as THREE from 'three';
import { hexToLinear } from '../../world/geoBuilder.js';
import { BONE, makeDims } from './skeleton.js';

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

/** Local matrix: position, size, optional rotation. */
function mat(tx, ty, tz, sx, sy, sz, rx = 0, ry = 0, rz = 0) {
  _q.setFromEuler(_e.set(rx, ry, rz));
  return new THREE.Matrix4().compose(new THREE.Vector3(tx, ty, tz), _q, new THREE.Vector3(sx, sy, sz));
}

const LONG_SLEEVE = new Set(['shirt_long', 'panjabi', 'kameez', 'crop_jacket']);
const NO_SLEEVE = new Set(['vest']);

/**
 * @param {object} arch      one archetype from data/pedestrians.json
 * @param {object} palettes  data/pedestrians.json → palettes
 * @param {import('../../core/rng.js').Rng} rng
 */
export function buildLook(arch, palettes, rng) {
  const pick = (name) => hexToLinear(rng.pick(palettes[name] || palettes.shirt));
  const female = arch.sex === 'f';
  const b = rng.range(arch.build?.[0] ?? 0.92, arch.build?.[1] ?? 1.1);
  const scale = rng.range(arch.height[0], arch.height[1]) / 1.76; // 1.76 m = the skeleton at scale 1
  const dims = makeDims({ shoulderX: (female ? 0.19 : 0.225) * b, hipX: female ? 0.09 : 0.095 });
  const parts = [];
  const add = (bone, kind, color, near, far = near) => parts.push({ bone, kind, color, near, far });

  const skin = pick('skin');
  const hair = pick('hair');
  const topC = pick(arch.topColors || 'shirt');
  const bottomC = pick(arch.bottomColors || 'pants');
  const top = arch.top;
  const bottom = arch.bottom;
  const oversized = top === 'oversized_tee';
  const longTop = top === 'panjabi' || top === 'kameez';

  // Hips and torso.
  const hipW = (female ? 0.178 : 0.18) * b;
  add(BONE.HIPS, 'tube', bottom === 'saree' || bottom === 'lungi' ? bottomC : longTop ? topC : bottomC, mat(0, 0.13, 0, hipW, 0.27, 0.14));
  const tw = (female ? 0.178 : 0.205) * b * (oversized ? 1.18 : 1);
  const td = (female ? 0.122 : 0.132) * (oversized ? 1.15 : 1);
  if (oversized) add(BONE.SPINE, 'torso', topC, mat(0, -0.2, 0, tw, 0.64, td));
  else add(BONE.SPINE, 'torso', top === 'crop_jacket' ? pick('tee') : topC, mat(0, -0.06, 0, tw, 0.5, td));
  if (top === 'crop_jacket') add(BONE.SPINE, 'torso', topC, mat(0, 0.14, 0, tw * 1.12, 0.31, td * 1.14));

  // Skirts: lungi, saree, or the long part of a panjabi / kameez.
  if (bottom === 'lungi') add(BONE.HIPS, 'skirt', bottomC, mat(0, 0.15, 0, 0.225 * b, 0.93, 0.19));
  if (bottom === 'saree') {
    add(BONE.HIPS, 'skirt', bottomC, mat(0, 0.15, 0, 0.235 * b, 1.02, 0.2));
    add(BONE.SPINE, 'box', bottomC, mat(0.01, 0.22, 0, 0.11, 0.66, td * 2.3, 0, 0, -0.6)); // anchal over the shoulder
  }
  if (longTop) add(BONE.HIPS, 'skirt', topC, mat(0, 0.15, 0, (female ? 0.245 : 0.24) * b, top === 'kameez' ? 0.66 : 0.58, 0.205));

  // Head, neck, hair or headwear.
  const headM = mat(0, 0.13, 0, 0.106, 0.128, 0.116);
  add(BONE.HEAD, 'tube', skin, mat(0, 0.03, 0, 0.05, 0.1, 0.05), null);
  add(BONE.HEAD, 'head', skin, headM);
  const headKind = rng.weighted(arch.head);
  if (headKind === 'cap' || headKind === 'bucket') {
    add(BONE.HEAD, female ? 'hairLong' : 'hairShort', hair, mat(0, 0.127, 0, 0.102, 0.122, 0.112), null);
    add(BONE.HEAD, headKind, pick(arch.headColors || 'hats'), headM);
  } else if (headKind === 'hijab') {
    add(BONE.HEAD, 'hijab', pick(arch.headColors || 'hijab'), headM);
  } else {
    add(BONE.HEAD, headKind, hair, headM);
  }

  // Arms: sleeve colour on the upper arm, skin or sleeve on the forearm.
  const upperC = NO_SLEEVE.has(top) ? skin : topC;
  const foreC = LONG_SLEEVE.has(top) ? topC : skin;
  const ar = (female ? 0.052 : 0.06) * (oversized ? 1.2 : 1);
  for (const [arm, fore] of [[BONE.ARM_L, BONE.FORE_L], [BONE.ARM_R, BONE.FORE_R]]) {
    add(arm, 'tube', upperC, mat(0, 0.03, 0, ar, 0.31, ar), mat(0, 0.03, 0, ar, 0.6, ar));
    add(fore, 'tube', foreC, mat(0, 0, 0, ar * 0.82, 0.26, ar * 0.82), null);
    add(fore, 'box', skin, mat(0, -0.3, 0.005, 0.05, 0.1, 0.07), null);
  }

  // Legs and shoes.
  const wide = bottom === 'cargo' || bottom === 'salwar' ? 1.25 : 1;
  const legC = bottom === 'lungi' || bottom === 'saree' ? skin : bottomC;
  const shoeC = pick(arch.shoeColors || 'shoes');
  const flat = arch.shoes === 'sandal';
  for (const [leg, shin] of [[BONE.LEG_L, BONE.SHIN_L], [BONE.LEG_R, BONE.SHIN_R]]) {
    add(leg, 'tube', legC, mat(0, 0.03, 0, 0.092 * wide, 0.48, 0.098 * wide), mat(0, 0.03, 0, 0.092 * wide, 0.94, 0.098 * wide));
    add(shin, 'tube', legC, mat(0, 0, 0, 0.07 * wide, 0.44, 0.074 * wide), null);
    add(shin, 'box', shoeC, mat(0, flat ? -0.465 : -0.45, 0.04, 0.1, flat ? 0.03 : 0.07, 0.25), null);
  }

  // Extras, each with its own chance.
  const has = (name) => rng.chance(arch.extras?.[name] ?? 0);
  if (top === 'kameez' || has('orna')) {
    add(BONE.SPINE, 'box', pick('orna'), mat(0, 0.36, 0.08, tw * 1.9, 0.08, 0.07), null);
    add(BONE.SPINE, 'box', parts[parts.length - 1].color, mat(-tw * 0.8, 0.2, -0.06, 0.07, 0.42, 0.04), null);
  }
  if (has('backpack')) add(BONE.SPINE, 'box', pick('bags'), mat(0, 0.2, -td - 0.06, 0.26, 0.34, 0.13));
  if (has('basket')) {
    add(BONE.HEAD, 'box', hexToLinear(palettes.basket[0]), mat(0, 0.29, 0, 0.44, 0.09, 0.44));
    add(BONE.HEAD, 'box', pick('wares'), mat(0, 0.36, 0, 0.32, 0.08, 0.32));
  }
  if (has('gamcha')) {
    const c = pick('gamcha');
    add(BONE.SPINE, 'box', c, mat(0.12, 0.43, 0, 0.1, 0.035, td * 2.2), null);
    add(BONE.SPINE, 'box', c, mat(0.12, 0.3, td + 0.01, 0.09, 0.24, 0.025), null);
  }
  if (has('chain')) {
    const gold = hexToLinear(palettes.chain[0]);
    add(BONE.SPINE, 'box', gold, mat(0, 0.36, td * 0.93, 0.13, 0.014, 0.014), null);
    add(BONE.SPINE, 'box', gold, mat(0, 0.325, td * 0.97, 0.028, 0.04, 0.014), null);
  }
  if (has('tie')) add(BONE.SPINE, 'box', pick('tie'), mat(0, 0.28, td * 0.98, 0.036, 0.26, 0.012), null);
  if (has('bag')) add(BONE.FORE_R, 'box', pick('bags'), mat(0, -0.46, 0, 0.07, 0.24, 0.3), null);
  if (has('gun')) {
    // A dark gun held in the right hand, barrel along the hand (points ahead when aiming).
    const black = hexToLinear('#151515');
    add(BONE.FORE_R, 'box', black, mat(0, -0.33, 0.07, 0.04, 0.05, 0.2), null);
    add(BONE.FORE_R, 'box', black, mat(0, -0.3, 0.02, 0.035, 0.1, 0.04), null);
  }
  if (has('vest')) add(BONE.SPINE, 'torso', hexToLinear('#0b0c0e'), mat(0, 0.0, 0, tw * 1.1, 0.42, td * 1.18));

  return { parts, dims, scale };
}
