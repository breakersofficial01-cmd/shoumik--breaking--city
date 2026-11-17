// Base body motion: standing, the signature arms-crossed idle, walking/running and being in
// the air. Pure maths — each function fills a pose (see skeleton.js for the channels).
// The angles here are the "art" of the animation; speeds and timings that the owner may
// want to tune live in data/player.json and data/pedestrians.json.

import { P } from './skeleton.js';

const { sin, cos, abs, max } = Math;

/** Relaxed standing with breathing and a slow weight shift. */
export function idle(o, t) {
  const b = sin(t * 1.7);
  const w = sin(t * 0.45);
  o.fill(0);
  o[P.SX] = 0.02 + b * 0.012;
  o[P.RZ] = w * 0.025;
  o[P.SZ] = -w * 0.02;
  o[P.HY] = sin(t * 0.23) * 0.12;
  o[P.ALZ] = 0.07 + b * 0.012; o[P.ARZ] = 0.07 + b * 0.012;
  o[P.ALX] = 0.03; o[P.ARX] = 0.03;
  o[P.EL] = 0.16; o[P.ER] = 0.16;
  o[P.LLZ] = 0.035; o[P.LRZ] = 0.035;
}

/** Shoumik's signature pose: arms crossed, slight head tilt, weight on one leg. */
export function idleCrossed(o, t) {
  const b = sin(t * 1.5);
  o.fill(0);
  o[P.SX] = -0.03 + b * 0.01;
  o[P.RZ] = 0.035; o[P.SZ] = -0.03;
  o[P.HZ] = 0.11; o[P.HY] = 0.07 + sin(t * 0.3) * 0.05; o[P.HX] = -0.03;
  // Left forearm on top, right tucked under it.
  o[P.ALX] = -0.5; o[P.ALY] = 1.22; o[P.ALZ] = 0.2; o[P.EL] = 1.78 + b * 0.02;
  o[P.ARX] = -0.38; o[P.ARY] = 1.25; o[P.ARZ] = 0.2; o[P.ER] = 1.62 + b * 0.02;
  o[P.LLZ] = 0.07; o[P.LRZ] = 0.06;
  o[P.LLX] = -0.04; o[P.KL] = 0.05;
}

/** Standing and looking at a phone (Gen-Z idle). */
export function idlePhone(o, t) {
  idle(o, t);
  o[P.HX] = 0.38; o[P.HY] = -0.1;
  o[P.ARX] = -0.55; o[P.ARY] = 0.5; o[P.ER] = 1.75 + sin(t * 3.1) * 0.03;
  o[P.SX] = 0.06;
}

/** Fists up, bouncing on the toes (a pedestrian who fights back). */
export function idleGuard(o, t) {
  const b = sin(t * 7);
  o.fill(0);
  o[P.Y] = -0.05 + abs(b) * 0.02;
  o[P.SX] = 0.14; o[P.SY] = 0.3;
  o[P.ALX] = -0.95; o[P.ALY] = 0.35; o[P.EL] = 2.0;
  o[P.ARX] = -0.75; o[P.ARY] = 0.45; o[P.ER] = 2.1;
  o[P.LLX] = -0.3; o[P.KL] = 0.35; o[P.LRX] = 0.22; o[P.KR] = 0.3;
}

/**
 * Walk → run cycle. `ph` = phase in radians (one full turn = two steps), `r` = 0 walk … 1 run,
 * `stride` shortens the steps for people in a lungi or saree.
 */
export function gait(o, ph, r, stride = 1) {
  const s = sin(ph);
  const c = cos(ph);
  const leg = (0.48 + 0.42 * r) * stride;
  const knee = 0.75 + 0.85 * r;
  const arm = 0.42 + 0.5 * r;
  const elbow = 0.22 + 1.2 * r;
  o.fill(0);
  o[P.Y] = (abs(c) - 1) * (0.03 + 0.035 * r) * stride;
  o[P.SX] = 0.03 + 0.2 * r;
  o[P.SY] = s * (0.09 + 0.1 * r);
  o[P.RY] = -s * 0.06;
  o[P.RZ] = c * 0.025;
  o[P.HX] = -0.05 * r;
  o[P.LLX] = -s * leg - 0.08 * r;
  o[P.LRX] = s * leg - 0.08 * r;
  o[P.KL] = max(0, c) * knee * stride + 0.06;
  o[P.KR] = max(0, -c) * knee * stride + 0.06;
  o[P.ALX] = s * arm; o[P.ARX] = -s * arm;
  o[P.EL] = elbow + max(0, -s) * 0.3; o[P.ER] = elbow + max(0, s) * 0.3;
  o[P.ALZ] = 0.08 + 0.05 * r; o[P.ARZ] = 0.08 + 0.05 * r;
}

/** Running away in panic: the run cycle with both arms thrown up. */
export function panicArms(o, t) {
  const w = sin(t * 11);
  o[P.ALX] = -2.5 + w * 0.2; o[P.ARX] = -2.5 - w * 0.2;
  o[P.ALZ] = 0.45; o[P.ARZ] = 0.45;
  o[P.EL] = 0.5; o[P.ER] = 0.5;
}

/** Going up in a jump: knees tucked, arms out. */
export function jump(o) {
  o.fill(0);
  o[P.SX] = 0.1;
  o[P.LLX] = -0.75; o[P.KL] = 1.15;
  o[P.LRX] = -0.25; o[P.KR] = 0.75;
  o[P.ALX] = -0.7; o[P.ALZ] = 0.5; o[P.EL] = 0.6;
  o[P.ARX] = 0.35; o[P.ARZ] = 0.45; o[P.ER] = 0.5;
}

/** Coming down / falling: arms up and flailing, legs reaching for the ground. */
export function fall(o, t) {
  const w = sin(t * 13);
  o.fill(0);
  o[P.SX] = -0.08;
  o[P.LLX] = -0.3 + w * 0.12; o[P.KL] = 0.45;
  o[P.LRX] = 0.1 - w * 0.12; o[P.KR] = 0.55;
  o[P.ALX] = -1.9 + w * 0.3; o[P.ALZ] = 0.75; o[P.EL] = 0.35;
  o[P.ARX] = -1.9 - w * 0.3; o[P.ARZ] = 0.75; o[P.ER] = 0.35;
  o[P.HX] = 0.15;
}

export const IDLES = { idle, crossed: idleCrossed, phone: idlePhone, guard: idleGuard };
