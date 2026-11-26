// Animator: turns "how is this person moving" into a pose every frame.
//   Layer 1 (base): idle ↔ walk ↔ run by speed, signature arms-crossed idle after standing
//                   still for a while, jump/fall when in the air.
//   Layer 2 (action): one action from animActions.js blended on top (punch, dance, aim…).
// Used by Shoumik and by every pedestrian. No Three.js objects in here — just numbers.

import { newPose, blendPose, UPPER_FIRST, UPPER_LAST, POSE_SIZE } from './skeleton.js';
import { IDLES, gait, jump, fall, panicArms } from './animLocomotion.js';
import { ACTIONS } from './animActions.js';

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const ease = (x) => x * x * (3 - 2 * x);

export class Animator {
  /**
   * @param {object} dims  from makeDims()
   * @param {object} opts  { idle: 'idle'|'phone'|'guard', crossAfter: seconds or Infinity,
   *                         stride: 0..1, runAt: speed (m/s) of a full run }
   */
  constructor(dims, opts = {}) {
    this.dims = dims;
    this.pose = newPose();
    this.base = newPose();
    this.tmp = newPose();
    this.act = newPose();
    this.configure(opts);
    this.reset();
  }

  configure(opts) {
    this.idleName = opts.idle || 'idle';
    this.crossAfter = opts.crossAfter ?? Infinity;
    this.stride = opts.stride ?? 1;
    this.runAt = opts.runAt ?? 5;
  }

  reset() {
    this.time = Math.random() * 10; // so a crowd doesn't breathe in sync
    this.phase = Math.random() * 6.28;
    this.move = 0;       // 0 standing … 1 moving
    this.speed = 0;      // last speed given to update() (m/s) — real 3D people read it (Roadmap 2 S5)
    this.air = 0;        // 0 on the ground … 1 in the air
    this.crossed = 0;    // 0 normal idle … 1 arms crossed
    this.idleTime = 0;
    this.action = null;
    this.pose.fill(0);
  }

  /** Start an action (see ACTIONS). Returns false for an unknown name. */
  play(name, o = {}) {
    const def = ACTIONS[name];
    if (!def) return false;
    this.action = {
      name, def,
      t: 0,
      w: this.action ? Math.min(0.5, this.action.w) : 0, // quick hand-over between actions
      duration: o.duration ?? def.duration,
      hold: o.hold ?? def.hold ?? false,
      mask: o.mask || def.mask,
      fadeIn: o.fadeIn ?? def.fadeIn,
      fadeOut: o.fadeOut ?? def.fadeOut,
      ending: false,
      ctx: { side: o.side, beat: o.beat, variant: o.variant, hipY: this.dims.hipY },
    };
    this.idleTime = 0;
    return true;
  }

  /** Let the current action fade out (optionally only if it has this name). */
  stop(name) {
    if (this.action && (!name || this.action.name === name)) this.action.ending = true;
  }

  /** Name of the action that is running (not fading out), or null. */
  get current() {
    return this.action && !this.action.ending ? this.action.name : null;
  }

  /** True once a timed action has reached its last frame. */
  get finished() {
    const a = this.action;
    return !a || a.ending || (a.duration != null && a.t >= a.duration);
  }

  /** @param {{speed:number, grounded?:boolean, vy?:number, panic?:boolean}} s */
  update(dt, s) {
    const k = (rate) => Math.min(1, dt * rate);
    const moving = s.speed > 0.25;
    this.speed = s.speed;
    const grounded = s.grounded !== false;
    this.time += dt;
    this.move += ((moving ? 1 : 0) - this.move) * k(10);
    this.air += ((grounded ? 0 : 1) - this.air) * k(14);
    if (moving) this.phase += dt * (4.4 + 0.85 * s.speed) / Math.sqrt(this.stride);

    // Standing: normal idle, drifting into the arms-crossed pose after a while.
    this.idleTime = moving || !grounded || this.action ? 0 : this.idleTime + dt;
    this.crossed += ((this.idleTime > this.crossAfter ? 1 : 0) - this.crossed) * k(this.idleTime > 0 ? 3 : 9);
    const base = this.base;
    const tmp = this.tmp;
    (IDLES[this.idleName] || IDLES.idle)(base, this.time);
    if (this.crossed > 0.01) {
      IDLES.crossed(tmp, this.time);
      blendPose(base, base, tmp, ease(this.crossed));
    }
    if (this.move > 0.01) {
      gait(tmp, this.phase, clamp01((s.speed - 2.2) / (this.runAt - 2.2)), this.stride);
      if (s.panic) panicArms(tmp, this.time);
      blendPose(base, base, tmp, this.move);
    }
    if (this.air > 0.01) {
      const vy = s.vy ?? 0;
      jump(tmp);
      if (vy < -0.5) {
        fall(this.act, this.time);
        blendPose(tmp, tmp, this.act, clamp01((-vy - 0.5) / 4));
      }
      blendPose(base, base, tmp, this.air);
    }

    const a = this.action;
    if (!a) {
      this.pose.set(base);
      return this.pose;
    }
    a.t += dt;
    if (a.duration != null && a.t >= a.duration && !a.hold) a.ending = true;
    a.w = a.ending ? a.w - dt / Math.max(0.01, a.fadeOut) : Math.min(1, a.w + dt / Math.max(0.01, a.fadeIn));
    if (a.w <= 0) {
      this.action = null;
      this.pose.set(base);
      return this.pose;
    }
    a.def.fn(this.act, a.duration != null ? clamp01(a.t / a.duration) : 0, a.t, a.ctx);
    if (a.mask === 'upper') blendPose(this.pose, base, this.act, ease(a.w), UPPER_FIRST, UPPER_LAST);
    else blendPose(this.pose, base, this.act, ease(a.w), 0, POSE_SIZE - 1);
    return this.pose;
  }
}
