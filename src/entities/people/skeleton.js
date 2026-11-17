// Shared humanoid skeleton for Shoumik AND every pedestrian.
//
// A POSE is a Float32Array of joint angles (radians) + a hip offset. Animations write poses
// (animLocomotion.js / animActions.js); computeBones() turns a pose into 11 bone matrices.
// Shoumik's meshes and the instanced crowd both just follow those matrices, so one set of
// animations drives everybody.
//
// The figure faces +z; his LEFT is +x. Sign rules (same for left and right limbs):
//   arm X  : - = swing forward / up     + = swing back
//   arm Y  : + = twist inward (a bent forearm then points across the body)
//   arm Z  : + = lift outward, away from the body
//   E      : elbow bend, 0 = straight
//   leg X  : - = forward    leg Z : + = outward    K : knee bend, 0 = straight
//   SX/HX/RX : + = lean / nod forward     SY/HY/RY : + = turn to his left
//   SZ/HZ/RZ : + = tilt to his right
//   Y, Z   : hips up/down and forward/back in metres (crouch, lying down, lunges)

import * as THREE from 'three';

export const P = {
  Y: 0, RX: 1, RY: 2, RZ: 3,          // hips (whole body)
  SX: 4, SY: 5, SZ: 6,                // spine (upper body)
  HX: 7, HY: 8, HZ: 9,                // head
  ALX: 10, ALY: 11, ALZ: 12, EL: 13,  // left arm + elbow
  ARX: 14, ARY: 15, ARZ: 16, ER: 17,  // right arm + elbow
  LLX: 18, LLZ: 19, KL: 20,           // left leg + knee
  LRX: 21, LRZ: 22, KR: 23,           // right leg + knee
  Z: 24,
};
export const POSE_SIZE = 25;

/** Channels an "upper body only" action is allowed to change (spine, head, arms). */
export const UPPER_FIRST = P.SX;
export const UPPER_LAST = P.ER;

export const BONE = {
  HIPS: 0, SPINE: 1, HEAD: 2, ARM_L: 3, FORE_L: 4, ARM_R: 5, FORE_R: 6,
  LEG_L: 7, SHIN_L: 8, LEG_R: 9, SHIN_R: 10,
};
export const BONE_COUNT = 11;

export const newPose = () => new Float32Array(POSE_SIZE);

/** Body measurements in metres for a 1.0-scale adult. Shoumik and peds override some. */
export function makeDims(over = {}) {
  return {
    hipY: 0.92,       // hip joint above the ground
    waist: 0.1,       // spine pivot above the hip joint
    neck: 0.5,        // head pivot above the spine pivot
    shoulderX: 0.2,   // shoulder joint left/right of the spine
    shoulderY: 0.4,   // shoulder joint above the spine pivot
    upperArm: 0.28,
    hipX: 0.09,
    thigh: 0.44,
    ...over,
  };
}

/** Blend two poses channel by channel: out = a + (b - a) * w, for channels first..last. */
export function blendPose(out, a, b, w, first = 0, last = POSE_SIZE - 1) {
  for (let i = 0; i < POSE_SIZE; i++) {
    out[i] = i >= first && i <= last ? a[i] + (b[i] - a[i]) * w : a[i];
  }
}

const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _m = new THREE.Matrix4();

function joint(out, parent, px, py, pz, rx, ry, rz) {
  _q.setFromEuler(_e.set(rx, ry, rz));
  _m.compose(_p.set(px, py, pz), _q, _s);
  out.multiplyMatrices(parent, _m);
}

export const makeBones = () => Array.from({ length: BONE_COUNT }, () => new THREE.Matrix4());

/**
 * Pose -> bone matrices (world space).
 * @param {Float32Array} pose
 * @param {object} d      dims from makeDims()
 * @param {THREE.Matrix4} root  where the person stands (position, heading, body scale)
 * @param {THREE.Matrix4[]} out  11 matrices, see BONE
 */
export function computeBones(pose, d, root, out) {
  const B = BONE;
  joint(out[B.HIPS], root, 0, d.hipY + pose[P.Y], pose[P.Z], pose[P.RX], pose[P.RY], pose[P.RZ]);
  joint(out[B.SPINE], out[B.HIPS], 0, d.waist, 0, pose[P.SX], pose[P.SY], pose[P.SZ]);
  joint(out[B.HEAD], out[B.SPINE], 0, d.neck, 0, pose[P.HX], pose[P.HY], pose[P.HZ]);
  joint(out[B.ARM_L], out[B.SPINE], d.shoulderX, d.shoulderY, 0, pose[P.ALX], -pose[P.ALY], pose[P.ALZ]);
  joint(out[B.FORE_L], out[B.ARM_L], 0, -d.upperArm, 0, -pose[P.EL], 0, 0);
  joint(out[B.ARM_R], out[B.SPINE], -d.shoulderX, d.shoulderY, 0, pose[P.ARX], pose[P.ARY], -pose[P.ARZ]);
  joint(out[B.FORE_R], out[B.ARM_R], 0, -d.upperArm, 0, -pose[P.ER], 0, 0);
  joint(out[B.LEG_L], out[B.HIPS], d.hipX, 0, 0, pose[P.LLX], 0, pose[P.LLZ]);
  joint(out[B.SHIN_L], out[B.LEG_L], 0, -d.thigh, 0, pose[P.KL], 0, 0);
  joint(out[B.LEG_R], out[B.HIPS], -d.hipX, 0, 0, pose[P.LRX], 0, -pose[P.LRZ]);
  joint(out[B.SHIN_R], out[B.LEG_R], 0, -d.thigh, 0, pose[P.KR], 0, 0);
}

const _rq = new THREE.Quaternion();
const _rp = new THREE.Vector3();
const _rs = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/** Root matrix for a person standing at (x, y, z) facing `heading`, with a body scale. */
export function setRoot(out, x, y, z, heading, scale = 1) {
  _rq.setFromAxisAngle(UP, heading);
  return out.compose(_rp.set(x, y, z), _rq, _rs.set(scale, scale, scale));
}
