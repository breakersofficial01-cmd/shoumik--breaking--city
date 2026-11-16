// Action animations: things a person DOES on top of standing/walking — punch, melee swing,
// aim/shoot, get in/out of a vehicle, dance, get knocked down, cower, shout…
// Each entry of ACTIONS is { fn, duration, mask, fadeIn, fadeOut, loop, hold }:
//   fn(o, u, t, ctx)  fills pose `o`. u = 0..1 progress (timed actions), t = seconds since
//                     the action started, ctx = { side, beat, hipY, variant }.
//   duration          seconds (null = runs until stopped)
//   mask              'full' or 'upper' (upper = legs keep walking)
//   hold              stay on the last frame until stopped (aim, sit, lying down)
// Durations can be overridden per call: animator.play('punch', { duration: 0.4 }).

import { P } from './skeleton.js';
import { idle } from './animLocomotion.js';

const { sin, cos, abs, max, min, PI } = Math;
const clamp01 = (v) => max(0, min(1, v));
const ease = (v) => { const x = clamp01(v); return x * x * (3 - 2 * x); };
const seg = (u, a, b) => ease((u - a) / (b - a));
const lerp = (a, b, w) => a + (b - a) * w;

/** Set one arm. side: 1 = right arm, -1 = left arm. */
function arm(o, side, x, y, z, e) {
  const i = side === 1 ? P.ARX : P.ALX;
  o[i] = x; o[i + 1] = y; o[i + 2] = z; o[i + 3] = e;
}
function leg(o, side, x, z, k) {
  const i = side === 1 ? P.LRX : P.LLX;
  o[i] = x; o[i + 1] = z; o[i + 2] = k;
}

function punch(o, u, t, ctx) {
  const s = ctx.side || 1;
  const k = seg(u, 0.18, 0.42) * (1 - seg(u, 0.55, 1)); // 0 guard … 1 arm fully out
  o.fill(0);
  o[P.Y] = -0.04; o[P.Z] = 0.1 * k;
  o[P.SX] = 0.1 + 0.12 * k;
  o[P.SY] = s * (-0.22 + 0.72 * k);
  o[P.HY] = -s * 0.3 * k;
  arm(o, s, lerp(-0.85, -1.5, k), lerp(0.4, 0.12, k), 0.1, lerp(2.0, 0.1, k));
  arm(o, -s, -0.9, 0.4, 0.05, 2.05);
  leg(o, -s, -0.32, 0.04, 0.3);
  leg(o, s, 0.26, 0.04, 0.28);
}

function melee(o, u, t, ctx) {
  const s = ctx.side || 1;
  const wind = seg(u, 0, 0.3);
  const k = seg(u, 0.3, 0.5);
  const back = seg(u, 0.7, 1);
  const a = wind * (1 - back);
  o.fill(0);
  o[P.Y] = -0.05 * a; o[P.Z] = 0.12 * k * (1 - back);
  o[P.SX] = lerp(-0.08, 0.26, k) * a;
  o[P.SY] = s * lerp(-0.5, 0.6, k) * a;
  arm(o, s, lerp(-2.35, -0.75, k) * a, lerp(-0.2, 0.9, k) * a, lerp(0.55, -0.05, k) * a, lerp(1.0, 0.22, k) * a);
  arm(o, -s, -0.5 * a, 0.3 * a, 0.25 * a, 1.2 * a);
  leg(o, -s, -0.3 * a, 0.05, 0.3 * a);
  leg(o, s, 0.24 * a, 0.05, 0.25 * a);
}

function aim(o) {
  o.fill(0);
  o[P.SY] = 0.14; o[P.SX] = 0.04; o[P.HY] = -0.12;
  arm(o, 1, -1.5, 0.12, 0.02, 0.06);
  arm(o, -1, -1.3, 0.78, 0.0, 0.6);
}

function shoot(o, u) {
  const kick = (1 - clamp01(u)) ** 2;
  aim(o);
  o[P.ARX] -= 0.24 * kick; o[P.ER] += 0.3 * kick;
  o[P.ALX] -= 0.16 * kick;
  o[P.SX] -= 0.06 * kick; o[P.HX] = -0.05 * kick;
}

/** Seated (driving). The vehicle code places the hips; arms rest on the wheel. */
function sit(o, u, t, ctx) {
  o.fill(0);
  o[P.Y] = 0.48 - (ctx.hipY || 0.92);
  o[P.SX] = -0.08;
  leg(o, 1, -1.42, 0.08, 1.45);
  leg(o, -1, -1.42, 0.08, 1.45);
  arm(o, 1, -1.05, 0.25, 0.05, 0.65);
  arm(o, -1, -1.05, 0.25, 0.05, 0.65);
}

const _sit = new Float32Array(25);
function enterVehicle(o, u, t, ctx) {
  const s = ctx.side || -1;                 // which arm opens the door
  const reach = seg(u, 0, 0.25) * (1 - seg(u, 0.35, 0.6));
  const inn = seg(u, 0.3, 1);
  idle(o, t);
  sit(_sit, 1, t, ctx);
  for (let i = 0; i < o.length; i++) o[i] = lerp(o[i], _sit[i], inn);
  o[P.SX] += 0.5 * sin(PI * inn);          // duck under the roof
  const i = s === 1 ? P.ARX : P.ALX;
  o[i] = lerp(o[i], -1.25, reach); o[i + 3] = lerp(o[i + 3], 0.35, reach);
}
const exitVehicle = (o, u, t, ctx) => enterVehicle(o, 1 - u, t, ctx);

// ---- dancing. `beat` counts beats of the music, so everybody moves in time.
function dance1(o, b) { // two-step bounce, fists pumping
  const s = sin(PI * b);
  const p = sin(2 * PI * b);
  o.fill(0);
  o[P.Y] = -abs(s) * 0.07 - 0.03;
  o[P.RZ] = s * 0.09; o[P.SZ] = -s * 0.12; o[P.HZ] = s * 0.1;
  o[P.SX] = 0.08;
  arm(o, 1, -0.7 + p * 0.35, 0.35, 0.15, 1.6);
  arm(o, -1, -0.7 - p * 0.35, 0.35, 0.15, 1.6);
  leg(o, 1, -0.1, 0.06 + max(0, s) * 0.28, 0.25 + max(0, s) * 0.3);
  leg(o, -1, -0.1, 0.06 + max(0, -s) * 0.28, 0.25 + max(0, -s) * 0.3);
}
function dance2(o, b) { // hands in the air, swaying
  const s = sin(PI * b);
  const c = cos(PI * b);
  o.fill(0);
  o[P.Y] = -abs(c) * 0.05 - 0.02;
  o[P.RZ] = -s * 0.12; o[P.SZ] = s * 0.2; o[P.HZ] = s * 0.08; o[P.HX] = -0.12;
  arm(o, 1, -2.7, 0.1, 0.35 - s * 0.35, 0.35 + abs(c) * 0.3);
  arm(o, -1, -2.7, 0.1, 0.35 + s * 0.35, 0.35 + abs(c) * 0.3);
  leg(o, 1, 0, 0.1, 0.18 + abs(c) * 0.2);
  leg(o, -1, 0, 0.1, 0.18 + abs(c) * 0.2);
}
function dance3(o, b) { // twist / shuffle
  const s = sin(PI * b);
  const q = sin(2 * PI * b);
  o.fill(0);
  o[P.Y] = -0.09 - abs(q) * 0.03;
  o[P.RY] = s * 0.45; o[P.SY] = -s * 0.75; o[P.HY] = s * 0.3;
  o[P.SX] = 0.12;
  arm(o, 1, s * 0.8 - 0.2, 0.3, 0.3, 1.3);
  arm(o, -1, -s * 0.8 - 0.2, 0.3, 0.3, 1.3);
  leg(o, 1, -0.25 + q * 0.15, 0.1, 0.5);
  leg(o, -1, -0.25 - q * 0.15, 0.1, 0.5);
}
const DANCES = [dance1, dance2, dance3];
/** ctx.variant picks one move; without it the moves change every 8 beats. */
function dance(o, u, t, ctx) {
  const b = ctx.beat ? ctx.beat() : t * 2;
  const v = ctx.variant ?? Math.floor(b / 8);
  DANCES[((v % 3) + 3) % 3](o, b);
}

function down(o, u, t, ctx) {
  const w = seg(u, 0, 1);
  o.fill(0);
  o[P.RX] = -1.5 * w;
  o[P.Y] = -((ctx.hipY || 0.92) - 0.15) * w;
  o[P.SX] = -0.3 * sin(PI * w);
  o[P.HX] = -0.15 * w;
  arm(o, 1, -0.25 * w, 0, 1.15 * w, 0.2);
  arm(o, -1, -0.15 * w, 0, 0.9 * w, 0.35);
  leg(o, 1, -0.1 * w, 0.2 * w, 0.2 * w);
  leg(o, -1, 0.05 * w, 0.14 * w, 0.05);
}

function cower(o, u, t) {
  const tr = sin(t * 23) * 0.02;
  o.fill(0);
  o[P.Y] = -0.43;
  o[P.SX] = 0.55 + tr; o[P.HX] = 0.4;
  leg(o, 1, -1.3, 0.1, 2.0);
  leg(o, -1, -1.3, 0.1, 2.0);
  arm(o, 1, -2.5 + tr, 0.6, 0.2, 2.0);
  arm(o, -1, -2.5 - tr, 0.6, 0.2, 2.0);
}

function shout(o, u, t) {
  const w = sin(t * 10);
  o.fill(0);
  o[P.SX] = -0.06; o[P.HX] = -0.12;
  arm(o, 1, -2.65, 0, 0.3 + w * 0.22, 0.4);
  arm(o, -1, -0.3, 0.2, 0.2, 0.9);
}

function hit(o, u) {
  const k = sin(PI * clamp01(u));
  o.fill(0);
  o[P.Z] = -0.07 * k;
  o[P.SX] = -0.32 * k; o[P.HX] = -0.28 * k; o[P.SY] = 0.22 * k;
  arm(o, 1, -0.35 * k, 0, 0.55 * k, 0.5 * k);
  arm(o, -1, -0.35 * k, 0, 0.55 * k, 0.5 * k);
  leg(o, 1, 0.2 * k, 0.05, 0.25 * k);
}

function clap(o, u, t, ctx) {
  const b = ctx.beat ? ctx.beat() : t * 2;
  const c = abs(sin(PI * b));
  o.fill(0);
  o[P.Y] = -c * 0.025; o[P.SZ] = sin(PI * b * 0.5) * 0.06;
  arm(o, 1, -0.95, 0.5 + c * 0.3, 0.05, 1.5);
  arm(o, -1, -0.95, 0.5 + c * 0.3, 0.05, 1.5);
}

export const ACTIONS = {
  punch:        { fn: punch, duration: 0.42, mask: 'full', fadeIn: 0.06, fadeOut: 0.16 },
  melee:        { fn: melee, duration: 0.62, mask: 'full', fadeIn: 0.06, fadeOut: 0.18 },
  aim:          { fn: aim, duration: null, mask: 'upper', fadeIn: 0.14, fadeOut: 0.2 },
  shoot:        { fn: shoot, duration: 0.22, mask: 'upper', fadeIn: 0.02, fadeOut: 0.1, hold: true },
  enterVehicle: { fn: enterVehicle, duration: 0.9, mask: 'full', fadeIn: 0.1, fadeOut: 0.2, hold: true },
  exitVehicle:  { fn: exitVehicle, duration: 0.8, mask: 'full', fadeIn: 0.05, fadeOut: 0.25 },
  sit:          { fn: sit, duration: null, mask: 'full', fadeIn: 0.15, fadeOut: 0.2 },
  dance:        { fn: dance, duration: null, mask: 'full', fadeIn: 0.25, fadeOut: 0.25 },
  down:         { fn: down, duration: 0.45, mask: 'full', fadeIn: 0.05, fadeOut: 0.7, hold: true },
  cower:        { fn: cower, duration: null, mask: 'full', fadeIn: 0.25, fadeOut: 0.35 },
  shout:        { fn: shout, duration: 1.4, mask: 'upper', fadeIn: 0.15, fadeOut: 0.3 },
  hit:          { fn: hit, duration: 0.4, mask: 'full', fadeIn: 0.04, fadeOut: 0.15 },
  clap:         { fn: clap, duration: null, mask: 'upper', fadeIn: 0.2, fadeOut: 0.25 },
};

export const ACTION_NAMES = Object.keys(ACTIONS);
