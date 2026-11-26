// Boat (Roadmap 2 S7): one boat on the water — a light arcade model, no physics engine.
// Used only by the boats feature. Numbers: data/boats.json → types.<id>, physics.
//
//   boat.input = { throttle -1..1, steer -1..1 (+ = left), brake bool }
//   boat.update(dt, waterAt, blocked, physics) → crash speed (0 = none)
// The hull is tested at the bow, the stern and both sides (physics.margin from the bank):
// when the next step would leave the water the boat stops and bounces back a little.
// Same frame as vehicles: x = LEFT, z = forward; heading 0 = facing +z.
//
// It looks like a Vehicle to the rest of the game (x, z, y, heading, speed, vx, vz,
// position, distanceTo) so the chase camera and the police can follow it.

import * as THREE from 'three';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class Boat {
  /**
   * @param {string} type  key of data/boats.json → types
   * @param {object} T     that type's settings
   * @param {THREE.Object3D} model  the boat's mesh (bow along +z, keel at y = 0)
   */
  constructor(id, type, T, model, waterY) {
    this.id = id;
    this.type = type;
    this.T = T;
    this.waterY = waterY;
    this.x = 0; this.z = 0; this.y = waterY; this.heading = 0;
    this.speed = 0;        // forward speed (m/s, negative = backwards)
    this.side = 0;         // sideways slide (m/s, + = left)
    this.yawRate = 0;
    this.vx = 0; this.vz = 0;
    this.input = { throttle: 0, steer: 0, brake: false };
    this.driver = null;    // 'player' while Shoumik drives it
    this.tags = {};        // dock, slot, owned, free …
    this.time = Math.random() * 10;
    this.pitch = 0; this.roll = 0;
    this.removed = false;
    this.mesh = new THREE.Group();
    this.mesh.name = `boat-${type}`;
    this.mesh.rotation.order = 'YXZ';
    this.setModel(model);
  }

  /** So the chase camera can follow it like the player (position.x/y/z). */
  get position() { return this; }

  setModel(model) {
    if (this.model) this.mesh.remove(this.model);
    this.model = model;
    this.mesh.add(model);
  }

  place(x, z, heading) {
    this.x = x; this.z = z; this.heading = heading;
    this.speed = this.side = this.yawRate = 0;
    this.sync(0);
  }

  /** Distance from a point to the hull (a rectangle), 0 inside. */
  distanceTo(x, z) {
    const dx = x - this.x, dz = z - this.z;
    const c = Math.cos(this.heading), s = Math.sin(this.heading);
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    return Math.hypot(Math.max(0, Math.abs(lx) - this.T.width / 2), Math.max(0, Math.abs(lz) - this.T.length / 2));
  }

  /** Local [left, up, forward] → world point. */
  localToWorld(p, out = {}) {
    const c = Math.cos(this.heading), s = Math.sin(this.heading);
    out.x = this.x + p[0] * c + p[2] * s;
    out.y = this.y + p[1];
    out.z = this.z - p[0] * s + p[2] * c;
    return out;
  }

  /** Is the whole hull on open water at (x, z, heading)? */
  fits(x, z, heading, waterAt, blocked, margin) {
    const T = this.T;
    const c = Math.cos(heading), s = Math.sin(heading);
    const hl = T.length / 2, hw = T.width / 2;
    for (const [lx, lz] of [[0, hl], [0, -hl], [hw, 0], [-hw, 0], [hw * 0.7, hl * 0.6], [-hw * 0.7, hl * 0.6]]) {
      const px = x + lx * c + lz * s, pz = z - lx * s + lz * c;
      if (!waterAt(px, pz, margin)) return false;
      if (blocked) for (const b of blocked) if (px > b[0] && px < b[2] && pz > b[1] && pz < b[3]) return false;
    }
    return true;
  }

  update(dt, waterAt, blocked, P) {
    const T = this.T, inp = this.input;
    this.time += dt;
    // Engine / oars.
    const thr = clamp(inp.throttle, -1, 1);
    if (thr > 0.05) this.speed += T.acceleration * thr * dt * (this.speed < 0 ? 2 : 1);
    else if (thr < -0.05) {
      if (this.speed > 0.3) this.speed -= T.brake * -thr * dt;
      else this.speed += T.acceleration * 0.6 * thr * dt;
    }
    if (inp.brake) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), T.brake * dt);
    this.speed -= this.speed * T.drag * dt;
    this.speed = clamp(this.speed, -T.reverseSpeed, T.maxSpeed);
    if (Math.abs(this.speed) < 0.02 && Math.abs(thr) < 0.05) this.speed = 0;
    // Rudder: turns faster the faster it goes (up to turnFullSpeed); backwards = the other way.
    const k = clamp(Math.abs(this.speed) / T.turnFullSpeed, 0.18, 1);
    const want = clamp(inp.steer, -1, 1) * T.turnRate * k * (this.speed < -0.2 ? -1 : 1);
    this.yawRate += (want - this.yawRate) * Math.min(1, 3 * dt);
    // A fast turn slides the hull outwards a little; the water stops the slide.
    this.side += -this.yawRate * this.speed * 0.06 * dt;
    this.side -= this.side * Math.min(1, T.grip * dt);
    const heading = wrap(this.heading + this.yawRate * dt);
    const fx = Math.sin(heading), fz = Math.cos(heading), lx = Math.cos(heading), lz = -Math.sin(heading);
    const vx = fx * this.speed + lx * this.side, vz = fz * this.speed + lz * this.side;
    const nx = this.x + vx * dt, nz = this.z + vz * dt;
    let crash = 0;
    if (this.fits(nx, nz, heading, waterAt, blocked, P.margin)) {
      this.x = nx; this.z = nz; this.heading = heading;
      this.vx = vx; this.vz = vz;
    } else {
      // The bank: stop and bounce back a little (turning on the spot stays possible).
      if (this.fits(this.x, this.z, heading, waterAt, blocked, P.margin)) this.heading = heading;
      else this.yawRate *= -0.3;
      crash = Math.abs(this.speed);
      this.speed = -this.speed * P.bounce;
      this.side = 0; this.vx = this.vz = 0;
    }
    this.sync(dt);
    return crash;
  }

  /** Waves: bob up and down, bow up when fast, lean into turns. */
  sync(dt) {
    const T = this.T;
    const sp = Math.abs(this.speed) / Math.max(1, T.maxSpeed);
    const wantPitch = -T.pitch * sp * (this.speed >= 0 ? 1 : -1) + Math.sin(this.time * 1.3) * T.bob * 0.15;
    const wantRoll = clamp(-this.yawRate * T.roll * 2, -T.roll * 1.5, T.roll * 1.5) + Math.sin(this.time * 0.9 + 1) * T.bob * 0.2;
    const a = Math.min(1, 4 * dt);
    this.pitch += (wantPitch - this.pitch) * a;
    this.roll += (wantRoll - this.roll) * a;
    this.y = this.waterY + Math.sin(this.time * 1.7) * T.bob;
    this.mesh.position.set(this.x, this.y, this.z);
    this.mesh.rotation.set(this.pitch, this.heading, this.roll);
  }
}
