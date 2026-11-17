// Fleet: every vehicle in the world lives here (shared by the `vehicles` and `traffic`
// features, like the Crowd is shared for people). Get it with  await acquireFleet(game).
//
//   fleet.create('sedan', { x, z, heading, color? })  → Vehicle      fleet.remove(vehicle)
//   fleet.setRider(vehicle, look | null)   a crowd person seated on an open vehicle
//   fleet.update(dt)                       physics, crashes, wheels, riders, smoke — once a frame
//   fleet.damage(vehicle, amount)          fleet.nearest(x, z, range, filter)
//
// Events sent
//   vehicle:crashed  { id, x, z, speed }            vehicle:burning { id, x, z }
//   vehicle:exploded { id, type, x, z, radius }     explosion { x, z, radius, power }
//   danger:raised    { x, z, radius, source }       player:hit { x, z, power } (run over)

import * as THREE from 'three';
import { Rng } from '../../core/rng.js';
import { newPose } from '../people/skeleton.js';
import { ACTIONS } from '../people/animActions.js';
import { acquireCrowd } from '../people/crowd.js';
import { Particles } from '../effects/particles.js';
import { Vehicle } from './vehicle.js';
import { VehicleLibrary } from './models.js';
import { VehiclePhysics } from './physics.js';
import { DamageModel } from './damage.js';

const _m = new THREE.Matrix4();
const _w = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _pos = new THREE.Vector3();
const _scl = new THREE.Vector3();
const _seat = { x: 0, y: 0, z: 0 };

export class Fleet {
  constructor(game, cfg) {
    this.game = game;
    this.cfg = cfg;
    this.vehicles = [];
    this.nextId = 1;
    this.rng = new Rng(game.config.get('world').seed ^ 0xca75);
    this.lib = new VehicleLibrary(cfg);
    this.group = new THREE.Group();
    this.group.name = 'vehicles';
    game.scene.add(this.group);
    this.physics = new VehiclePhysics(cfg, game.world, (v, speed, kind) => this.damageModel.impact(v, speed, kind));

    const maxWheels = cfg.maxVehicles * 4;
    this.wheelMesh = new THREE.InstancedMesh(this.lib.wheelGeometry, this.lib.material, maxWheels);
    this.wheelMesh.name = 'vehicle-wheels';
    this.wheelMesh.frustumCulled = false;
    this.wheelMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.wheelMesh.count = 0;
    this.group.add(this.wheelMesh);

    this.ready = Promise.all([acquireCrowd(game), game.assets.load('texture.glow')]).then(([crowd, glow]) => {
      this.crowd = crowd;
      this.fx = new Particles(game.scene, glow, cfg.effects.maxParticles);
      this.damageModel = new DamageModel(this, cfg);
    });
  }

  /** @param {{x:number, z:number, heading:number, color?:string}} o */
  create(typeId, o) {
    const T = this.cfg.types[typeId];
    if (!T || this.vehicles.length >= this.cfg.maxVehicles) return null;
    const paint = o.color && /^#[0-9a-f]{6}$/i.test(o.color) ? o.color : this.rng.pick(T.colors);
    const second = T.secondColors ? this.rng.pick(T.secondColors) : null;
    const v = new Vehicle(this.nextId++, typeId, T, this.lib, paint, second, this.rng.int(0, 2));
    v.place(o.x, o.z, o.heading || 0, this.game.world.heightAt(o.x, o.z));
    v.syncVisual(0, this.cfg.physics, 0);
    this.vehicles.push(v);
    this.group.add(v.mesh);
    for (const c of v.circles) this.game.world.collision.dynamic.add(c.dyn);
    return v;
  }

  remove(v) {
    if (!v || v.removed) return;
    v.removed = true;
    this.setRider(v, null);
    this.group.remove(v.mesh);
    for (const c of v.circles) this.game.world.collision.dynamic.delete(c.dyn);
    const i = this.vehicles.indexOf(v);
    if (i >= 0) this.vehicles.splice(i, 1);
  }

  byId(id) {
    return this.vehicles.find((v) => v.id === id) || null;
  }

  /** Seat a crowd person (a `look` from looks.js) on the driver's seat, or remove him (null). */
  setRider(v, look) {
    if (v.rider) { this.crowd.remove(v.rider); v.rider = null; }
    if (!look || v.T.closed) return;
    const pose = newPose();
    ACTIONS.sit.fn(pose, 1, 0, { hipY: look.dims.hipY });
    v.rider = this.crowd.add(look, pose);
    this.placeRider(v);
  }

  placeRider(v) {
    const r = v.rider;
    v.localToWorld(v.T.seat, _seat);
    r.x = _seat.x; r.z = _seat.z;
    r.y = _seat.y - this.cfg.enterExit.sitHipHeight * r.look.scale;
    r.heading = v.heading;
    r.groundY = v.y;
  }

  /** Closest vehicle whose body is within `range` of (x, z). */
  nearest(x, z, range, filter) {
    let best = null, bestD = range;
    for (const v of this.vehicles) {
      if (filter && !filter(v)) continue;
      if (Math.abs(v.x - x) > range + v.reach || Math.abs(v.z - z) > range + v.reach) continue;
      const d = v.distanceTo(x, z);
      if (d < bestD) { bestD = d; best = v; }
    }
    return best;
  }

  damage(v, amount) {
    this.damageModel.damage(v, amount);
  }

  /** Vehicle against vehicle: push apart by weight, bounce, spin and dent both. */
  collidePairs() {
    const P = this.cfg.physics;
    const list = this.vehicles;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        const reach = a.reach + b.reach;
        if (Math.abs(a.x - b.x) > reach || Math.abs(a.z - b.z) > reach) continue;
        if (a.speed < P.sleepSpeed && b.speed < P.sleepSpeed) continue;
        if (Math.abs(a.y - b.y) > 1.6) continue; // one is flying over the other
        const afx = Math.sin(a.heading), afz = Math.cos(a.heading);
        const bfx = Math.sin(b.heading), bfz = Math.cos(b.heading);
        const wa = b.T.mass / (a.T.mass + b.T.mass), wb = 1 - wa;
        for (const ca of a.circles) {
          for (const cb of b.circles) {
            const ax = a.x + afx * ca.off, az = a.z + afz * ca.off;
            const bx = b.x + bfx * cb.off, bz = b.z + bfz * cb.off;
            const dx = ax - bx, dz = az - bz;
            const min = ca.r + cb.r;
            const d2 = dx * dx + dz * dz;
            if (d2 >= min * min || d2 < 1e-8) continue;
            const d = Math.sqrt(d2);
            const nx = dx / d, nz = dz / d, over = min - d;
            a.x += nx * over * wa; a.z += nz * over * wa;
            b.x -= nx * over * wb; b.z -= nz * over * wb;
            const rel = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
            if (rel >= 0) continue;
            const jmp = -(1 + P.carBounce) * rel;
            a.vx += nx * jmp * wa; a.vz += nz * jmp * wa;
            b.vx -= nx * jmp * wb; b.vz -= nz * jmp * wb;
            a.heading += Math.max(-0.2, Math.min(0.2, (afz * ca.off * nx - afx * ca.off * nz) * -rel * P.hitYaw * wa));
            b.heading -= Math.max(-0.2, Math.min(0.2, (bfz * cb.off * nx - bfx * cb.off * nz) * -rel * P.hitYaw * wb));
            this.damageModel.impact(a, -rel * wa * 2, 'vehicle', b);
            this.damageModel.impact(b, -rel * wb * 2, 'vehicle', a);
          }
        }
      }
    }
  }

  update(dt) {
    if (!this.fx || dt <= 0) return;
    const { game, cfg } = this;
    const P = cfg.physics;
    const world = game.world;
    for (const v of this.vehicles) {
      // Parked, untouched vehicles sleep (no physics at all).
      if (!v.driver && !v.airborne && v.speed < P.sleepSpeed) { v.vx = v.vz = 0; v.speed = v.forwardSpeed = v.yawRate = 0; continue; }
      this.physics.step(v, dt);
    }
    this.collidePairs();
    this.damageModel.update(dt);

    // Visuals: bodies, wheels, riders.
    const focus = game.player?.position || game.camera.position;
    const view = game.quality.viewDistance;
    const lod = game.quality.pedLodDistance;
    const arr = this.wheelMesh.instanceMatrix.array;
    const maxWheels = this.wheelMesh.instanceMatrix.count;
    let n = 0;
    for (const v of this.vehicles) {
      const dist = Math.hypot(v.x - focus.x, v.z - focus.z);
      const near = dist < view;
      v.mesh.visible = near;
      let slope = 0;
      if (world.ramps && (v.lastRamp > 0 || v.airborne)) {
        const fx = Math.sin(v.heading), fz = Math.cos(v.heading), hb = v.T.wheel.base / 2;
        slope = (world.ramps.heightAt(v.x + fx * hb, v.z + fz * hb) - world.ramps.heightAt(v.x - fx * hb, v.z - fz * hb)) / (hb * 2);
      }
      v.syncVisual(dt, P, slope);
      if (v.rider) { this.placeRider(v); v.rider.visible = near; v.rider.far = dist > lod; }
      if (!near) continue;
      for (const wh of v.wheels) {
        if (n >= maxWheels) break;
        _e.set(v.wheelSpin, wh.front ? v.steer * P.wheelSteerVisual : 0, 0);
        _w.compose(_pos.set(wh.x, wh.y, wh.z), _q.setFromEuler(_e), _scl.set(wh.w, wh.r * 2, wh.r * 2));
        _m.multiplyMatrices(v.mesh.matrix, _w);
        _m.toArray(arr, n * 16);
        n++;
      }
    }
    this.wheelMesh.count = n;
    this.wheelMesh.instanceMatrix.needsUpdate = true;
    this.fx.update(dt, game.camera);
  }

  dispose() {
    for (const v of [...this.vehicles]) this.remove(v);
    this.fx?.dispose();
    this.lib.dispose();
    this.wheelMesh.dispose();
    this.group.removeFromParent();
  }
}

/** The one shared fleet (made on first use). Numbers: data/vehicles.json. */
export async function acquireFleet(game) {
  if (!game.fleet) game.fleet = new Fleet(game, game.config.get('vehicles'));
  await game.fleet.ready;
  return game.fleet;
}
