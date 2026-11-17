// Arcade vehicle physics (no physics engine). One function moves one vehicle for one frame:
//   engine / brakes → steering → tyre grip (this is where drifting comes from) → move →
//   bump into buildings → follow the ground, kerbs and ramps (jumps).
// Numbers: data/vehicles.json → physics, plus each type's maxSpeed / acceleration / brake /
// handling / mass. Vehicle-against-vehicle crashes are in fleet.js.
//
// Conventions (same as the rest of the game): heading 0 faces +z, forward = (sin h, cos h),
// the vehicle's LEFT is (cos h, -sin h); a positive steer / yaw turns LEFT.

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp2 = ([a, b], t) => a + (b - a) * t;
const _p = { x: 0, z: 0 };

export class VehiclePhysics {
  /**
   * @param {object} cfg    data/vehicles.json
   * @param {object} world  game.world (collision, layout, ramps)
   * @param {(v:object, speed:number, kind:string)=>void} onImpact  called for every bump
   */
  constructor(cfg, world, onImpact) {
    this.P = cfg.physics;
    this.world = world;
    this.onImpact = onImpact;
    // Per-type numbers worked out once from "handling".
    for (const T of Object.values(cfg.types)) {
      const h = clamp(T.handling ?? 0.5, 0, 1);
      T.derived = {
        grip: lerp2(this.P.grip, h),
        slideGrip: lerp2(this.P.slideGrip, h),
        steerFast: lerp2(this.P.steerFast, h),
        lateralAccel: lerp2(this.P.lateralAccel, h),
      };
    }
  }

  /** Move a vehicle by dt seconds. Fast vehicles are moved in smaller steps so they cannot skip through a pole. */
  step(v, dt) {
    const P = this.P;
    const speed = Math.hypot(v.vx, v.vz);
    const n = clamp(Math.ceil((speed * dt) / P.maxStepMetres), 1, P.maxSubSteps);
    const h = dt / n;
    for (let i = 0; i < n; i++) this.subStep(v, h);
    v.speed = Math.hypot(v.vx, v.vz);
  }

  subStep(v, h) {
    const P = this.P;
    const T = v.T;
    const d = T.derived;
    const inp = v.input;
    let fx = Math.sin(v.heading), fz = Math.cos(v.heading);

    if (!v.airborne) {
      // 1) Engine, brakes, rolling resistance — all along the direction the vehicle faces.
      const vf = v.vx * fx + v.vz * fz;
      const thr = v.state === 'ok' ? inp.throttle : 0;
      let nf = vf;
      if (thr > 0) nf += (vf < -0.3 ? T.brake : T.acceleration * Math.max(0, 1 - vf / T.maxSpeed)) * thr * h;
      else if (thr < 0) nf += (vf > 0.3 ? T.brake : T.acceleration * Math.max(0, 1 + vf / (T.maxSpeed * P.reverseFactor))) * thr * h;
      nf -= nf * P.drag * h;
      const resist = ((thr === 0 ? P.rolling : 0) + (inp.handbrake ? P.handbrakeDecel : 0) + (v.driver ? 0 : P.parkedDecel)) * h;
      nf = Math.abs(nf) <= resist ? 0 : nf - Math.sign(nf) * resist;
      v.vx += fx * (nf - vf);
      v.vz += fz * (nf - vf);

      // 2) Steering: the front wheels turn less the faster you go; sideways force is limited.
      v.steer += (inp.steer - v.steer) * Math.min(1, P.steerResponse * h);
      const k = Math.min(1, Math.abs(nf) / T.maxSpeed);
      const angle = v.steer * (P.steerSlow + (d.steerFast - P.steerSlow) * k);
      let yaw = (nf / T.wheel.base) * Math.tan(angle);
      let cap = Math.min(P.maxYawRate, d.lateralAccel / Math.max(1, Math.abs(nf)));
      if (inp.handbrake && Math.abs(nf) > 3) { yaw *= P.handbrakeYawBoost; cap *= P.handbrakeYawBoost; }
      yaw = clamp(yaw, -cap, cap);
      v.heading = wrapAngle(v.heading + yaw * h);
      v.yawRate = yaw;

      // 3) Grip: the car now points somewhere new but still MOVES the old way. Tyres pull
      //    the sideways part to zero — slowly with the handbrake on (that is the drift).
      fx = Math.sin(v.heading); fz = Math.cos(v.heading);
      const lx = fz, lz = -fx;
      const f2 = v.vx * fx + v.vz * fz;
      let l2 = v.vx * lx + v.vz * lz;
      const grip = inp.handbrake ? P.handbrakeGrip : Math.abs(l2) > P.slideSpeed ? d.slideGrip : d.grip;
      l2 *= Math.exp(-grip * h);
      v.vx = fx * f2 + lx * l2;
      v.vz = fz * f2 + lz * l2;
      v.slip = Math.abs(l2);
      v.forwardSpeed = f2;
    } else {
      v.vx -= v.vx * P.airDrag * h;
      v.vz -= v.vz * P.airDrag * h;
      v.vy -= P.gravity * h;
      v.yawRate = 0;
    }

    const px = v.x, pz = v.z;
    v.x += v.vx * h;
    v.z += v.vz * h;
    this.collideStatic(v);
    this.followGround(v, h, px, pz);
  }

  /** Push the vehicle's circles out of buildings, poles, trees and the lake edge. */
  collideStatic(v) {
    const P = this.P;
    const col = this.world.collision;
    const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
    for (const c of v.circles) {
      const bx = v.x + fx * c.off, bz = v.z + fz * c.off;
      _p.x = bx; _p.z = bz;
      if (!col.resolveCircle(_p, c.r)) continue;
      const dx = _p.x - bx, dz = _p.z - bz;
      const dl = Math.hypot(dx, dz);
      if (dl < 1e-5) continue;
      v.x += dx;
      v.z += dz;
      const nx = dx / dl, nz = dz / dl;
      const vn = v.vx * nx + v.vz * nz;
      if (vn >= 0) continue;
      v.vx -= (1 + P.wallBounce) * vn * nx;
      v.vz -= (1 + P.wallBounce) * vn * nz;
      if (-vn > 1) { v.vx *= 1 - P.wallFriction; v.vz *= 1 - P.wallFriction; }
      // A hit on the nose or tail swings the vehicle round.
      const torque = fz * c.off * nx - fx * c.off * nz;
      v.heading = wrapAngle(v.heading + clamp(torque * -vn * P.hitYaw, -0.3, 0.3));
      this.onImpact(v, -vn, 'wall');
    }
  }

  /** Kerbs are smoothed, ramps are followed exactly, and a ramp that ends under a fast car launches it. */
  followGround(v, h, px, pz) {
    const P = this.P;
    const base = this.world.layout.heightAt(v.x, v.z);
    const ramp = this.world.ramps ? this.world.ramps.heightAt(v.x, v.z) : 0;
    if (v.airborne) {
      v.y += v.vy * h;
      if (v.y <= base + ramp && v.vy <= 0) {
        const impact = -v.vy;
        v.y = base + ramp;
        v.baseY = base;
        v.lastRamp = ramp;
        v.rampRise = 0;
        v.vy = 0;
        v.airborne = false;
        if (impact > P.landDamageSpeed) this.onImpact(v, impact - P.landDamageSpeed, 'land');
      }
      return;
    }
    // Much taller than a kerb = a wall (the side of a ramp): stay where we were.
    if (base + ramp > v.y + P.stepMax) {
      const speed = Math.hypot(v.vx, v.vz);
      v.x = px; v.z = pz;
      v.vx *= -P.wallBounce; v.vz *= -P.wallBounce;
      this.onImpact(v, speed, 'wall');
      return;
    }
    v.baseY += (base - v.baseY) * Math.min(1, P.kerbSmooth * h);
    const rise = (ramp - v.lastRamp) / h;
    const launched = v.rampRise > P.launchMinRise && rise < v.rampRise * 0.3;
    const dropped = ramp < v.lastRamp - 0.25;
    if (launched || dropped) {
      v.airborne = true;
      v.vy = launched ? v.rampRise : 0;
      v.y += v.vy * h;
    } else {
      v.y = v.baseY + ramp;
    }
    v.rampRise = rise;
    v.lastRamp = ramp;
  }
}
