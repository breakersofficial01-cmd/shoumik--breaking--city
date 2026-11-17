// One vehicle: its state (position, speed, health, who drives it) and its body mesh.
// It is moved by VehiclePhysics and looked after by the Fleet (fleet.js), which also draws
// the wheels and the rider. Whoever drives it only writes  vehicle.input.
//
//   vehicle.input   { throttle -1..1, steer -1..1 (+ = left), handbrake }
//   vehicle.driver  null (parked) | 'player' | 'ai' | 'ride'
//   vehicle.state   'ok' | 'burning' (0 health, about to explode) | 'wreck'
//   vehicle.tags    free notes for features (owned, slot, stand, …); brain = AI data
// It can be given to the chase camera as a target (position / heading / speed).

import * as THREE from 'three';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Vehicle {
  constructor(id, typeId, T, lib, paint, second, variant) {
    this.id = id;
    this.type = typeId;
    this.T = T;
    this.paint = paint;
    this.x = 0; this.y = 0; this.z = 0;
    this.heading = 0;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.speed = 0;          // ground speed, always positive
    this.forwardSpeed = 0;   // negative when reversing
    this.yawRate = 0;
    this.steer = 0;
    this.slip = 0;           // sideways sliding speed (tyre smoke)
    this.airborne = false;
    this.baseY = 0; this.lastRamp = 0; this.rampRise = 0;
    this.pitch = 0; this.roll = 0;
    this.wheelSpin = 0;
    this.input = { throttle: 0, steer: 0, handbrake: false };
    this.driver = null;
    this.brain = null;
    this.state = 'ok';
    this.health = T.health;
    this.burnTimer = 0;
    this.wreckTimer = 0;
    this.smokeTimer = 0;
    this.rider = null;       // crowd person sitting on an open vehicle
    this.tags = {};
    this.removed = false;

    // Collision shape: 1–3 circles along the length.
    const [L, W] = T.size;
    const r = Math.max(0.3, W / 2);
    const n = L > 3.4 * W ? 3 : L > 1.5 * W ? 2 : 1;
    const span = Math.max(0, L / 2 - r);
    this.circles = [];
    for (let i = 0; i < n; i++) {
      const off = n === 1 ? 0 : -span + (2 * span * i) / (n - 1);
      this.circles.push({ off, r, dyn: { x: 0, z: 0, r, owner: this, kind: 'vehicle', vx: 0, vz: 0, speed: 0 } });
    }
    this.reach = L / 2 + 0.3;

    const model = lib.get(typeId, paint, second);
    this.wheels = model.wheels;
    this.mesh = new THREE.Mesh(model.geometry, lib.material);
    this.mesh.name = `vehicle-${typeId}`;
    this.mesh.rotation.order = 'YXZ';
    if (T.artPanel) this.mesh.add(lib.makeArtPanel(variant));
  }

  /** So the chase camera can follow it like it follows the player. */
  get position() { return this; }

  place(x, z, heading, y = 0) {
    this.x = x; this.z = z; this.heading = heading;
    this.y = this.baseY = y;
    this.vx = this.vy = this.vz = 0;
    this.speed = this.forwardSpeed = this.yawRate = 0;
    this.airborne = false;
    this.lastRamp = this.rampRise = 0;
    this.pitch = this.roll = 0;
  }

  /** Give it a starting speed along its heading (AI traffic appears already moving). */
  launch(speed) {
    this.vx = Math.sin(this.heading) * speed;
    this.vz = Math.cos(this.heading) * speed;
    this.speed = this.forwardSpeed = speed;
  }

  get healthShare() { return clamp(this.health / this.T.health, 0, 1); }

  /** Body lean / dive and mesh placement. `slope` = ground slope under it (ramps). */
  syncVisual(dt, P, slope) {
    const T = this.T;
    const two = T.wheel.layout === '2';
    const side = this.yawRate * this.forwardSpeed; // sideways push in a turn
    const rollWant = two ? clamp(-side * P.twoWheelLean, -P.maxLean, P.maxLean) : clamp(side * P.bodyRoll, -0.09, 0.09);
    let pitchWant = -Math.atan(slope);
    if (this.airborne) pitchWant = clamp(-Math.atan2(this.vy, Math.max(4, this.speed)) * 0.7, -0.5, 0.5);
    else pitchWant += clamp(-(this.forwardSpeed - (this.prevForward ?? 0)) / Math.max(dt, 1e-3) * P.bodyPitch, -0.06, 0.06);
    this.prevForward = this.forwardSpeed;
    const k = Math.min(1, 9 * dt);
    this.roll += (rollWant - this.roll) * k;
    this.pitch += (pitchWant - this.pitch) * k;
    this.wheelSpin += (this.forwardSpeed / T.wheel.radius) * dt;
    const m = this.mesh;
    m.position.set(this.x, this.y, this.z);
    m.rotation.set(this.pitch, this.heading, this.roll);
    m.updateMatrix();
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    for (const c of this.circles) {
      c.dyn.x = this.x + fx * c.off;
      c.dyn.z = this.z + fz * c.off;
      c.dyn.vx = this.vx; c.dyn.vz = this.vz; c.dyn.speed = this.speed;
    }
  }

  /** World position of a point given in vehicle space [left, up, forward]. Writes into out {x,y,z}. */
  localToWorld(p, out) {
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const sx = p[0] - Math.sin(this.roll) * p[1];
    out.x = this.x + fz * sx + fx * p[2];
    out.z = this.z - fx * sx + fz * p[2];
    out.y = this.y + p[1] * Math.cos(this.roll);
    return out;
  }

  /** Distance from a point to the vehicle's body (0 when touching). */
  distanceTo(x, z) {
    let best = Infinity;
    for (const c of this.circles) best = Math.min(best, Math.hypot(c.dyn.x - x, c.dyn.z - z) - c.r);
    return Math.max(0, best);
  }
}
