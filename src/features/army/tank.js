// A tank (Roadmap 2 S8). The hull is an ordinary fleet vehicle of type 'tank' (physics, crashes,
// damage, burning wreck — src/entities/vehicles/); this class gives it a turning turret and drives
// it by writing vehicle.input, like the police pickups do. Numbers: data/army.json → tank.
//
// Modes   parked  waits in the vehicle yard (handbrake)
//         loop    drives round a route inside the base (routes.parade)
//         chase   army level: drives towards Shoumik (through the gate when one of them is inside
//                 the base and the other is not; along the road grid in the city when a wall is in
//                 the way), stops keepDistance away, turns the turret and fires shells
//         home    the chase is over: drive back through the gate to its loop
// Shells fly in a straight line with a little drop (./shells.js) and explode like a grenade.

import * as THREE from 'three';
import { buildTurretGeometry } from '../../entities/vehicles/modelsMilitary.js';
import { COLLIDE } from '../../world/collision.js';
import { ArmyDriver } from './drive.js';

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
let turretGeo = null;   // shared by every tank (built once)

export class TankUnit extends ArmyDriver {
  /**
   * @param {object} ctx  { game, cfg (army.json), fleet, rng, base (CantonmentBase), material, hooks: { fire(tank, from, aim) } }
   * @param {object} v    the fleet vehicle (type 'tank')
   */
  constructor(ctx, v, mode = 'parked', route = null) {
    super(ctx, v, ctx.cfg.tank, route);   // driver 'army', tags.army + noBoard (he cannot get in)
    this.mode = mode;
    this.yaw = 0;              // turret yaw relative to the hull
    this.fireIn = this.C.firstShotDelay;
    this.shots = 0;
    this.addTurret();
  }

  addTurret() {
    const T = this.v.T, C = this.C;
    if (!turretGeo) turretGeo = buildTurretGeometry(T, C);
    const mat = this.ctx.material;
    const tr = T.turret || {};
    this.turret = new THREE.Group();
    this.turret.name = 'tank-turret';
    this.turret.position.set(0, tr.y ?? T.size[2], tr.z ?? 0);
    this.turret.add(new THREE.Mesh(turretGeo.turret, mat));
    this.gun = new THREE.Mesh(turretGeo.barrel, mat);
    this.gun.position.set(0, turretGeo.height * 0.5, (tr.length || 3.4) - (tr.back ?? 1.5) - 0.5);
    this.turret.add(this.gun);
    this.v.mesh.add(this.turret);
  }

  /** World position of the muzzle (for the shell and the flash). */
  muzzle(out = {}) {
    const v = this.v, T = v.T, tr = T.turret || {};
    const a = v.heading + this.yaw;
    const ringZ = tr.z ?? 0;
    const cx = v.x + Math.sin(v.heading) * ringZ, cz = v.z + Math.cos(v.heading) * ringZ;
    const reach = this.gun.position.z + turretGeo.muzzle;
    out.x = cx + Math.sin(a) * reach;
    out.z = cz + Math.cos(a) * reach;
    out.y = (v.y || 0) + (tr.y ?? T.size[2]) + turretGeo.height * 0.5;
    return out;
  }

  setMode(mode) {
    if (this.mode === mode) return;
    this.mode = mode;
    this.wp = null;
    if (mode === 'chase') this.fireIn = Math.max(this.fireIn, this.C.firstShotDelay);
  }

  /** Turn the turret towards a world angle (or straight ahead when null). */
  turnTurret(worldAngle, dt) {
    const want = worldAngle === null ? 0 : wrapAngle(worldAngle - this.v.heading);
    const d = wrapAngle(want - this.yaw);
    this.yaw = wrapAngle(this.yaw + clamp(d, -this.C.turretTurn * dt, this.C.turretTurn * dt));
    this.turret.rotation.y = this.yaw;
    return Math.abs(d);
  }

  update(dt) {
    if (!this.alive) return;
    const { game } = this.ctx;
    const v = this.v, C = this.C;
    if (this.mode === 'parked') {
      v.input.throttle = 0; v.input.steer = 0; v.input.handbrake = true;
      this.turnTurret(null, dt);
      return;
    }
    if (this.mode === 'loop' || this.mode === 'home') {
      if (this.mode === 'home') {
        const t = this.route[this.leg];
        const a = this.aimPoint(t.x, t.z, dt);
        this.driveTo(a.x, a.z, C.chaseSpeed * 0.6, 1, dt);
        if (this.ctx.base?.inside(v.x, v.z, -4)) this.mode = 'loop';
      } else this.loop(dt, C.loopSpeed);
      this.turnTurret(null, dt);
      return;
    }
    // chase
    const p = game.player;
    const tgt = p.mode !== 'onFoot' && p.vehicle ? p.vehicle : p.position;
    const dx = tgt.x - v.x, dz = tgt.z - v.z;
    const dist = Math.hypot(dx, dz);
    this.dist = dist;
    const sight = dist < C.fireRange && game.world.collision.raycast(v.x, v.z, dx / (dist || 1), dz / (dist || 1), dist, COLLIDE.SOLID) >= dist - 1.5;
    this.sees = sight;
    const a = this.aimPoint(tgt.x, tgt.z, dt);
    const direct = a.x === tgt.x && a.z === tgt.z;
    this.driveTo(a.x, a.z, C.chaseSpeed, direct && sight ? C.keepDistance : 0, dt);
    const off = this.turnTurret(sight ? Math.atan2(dx, dz) : null, dt);
    this.fireIn -= dt;
    if (sight && off < C.aimTolerance && this.fireIn <= 0 && !p.dead && !p.frozen) {
      this.fireIn = this.ctx.rng.range(C.fireEvery[0], C.fireEvery[1]);
      this.shots++;
      this.ctx.hooks.fire(this, this.muzzle(), tgt);
    }
  }

  /** The hull is a wreck: the turret goes black too. */
  wreck(material) {
    this.turret?.traverse((o) => { if (o.isMesh) o.material = material; });
  }

  dispose() {
    this.turret?.removeFromParent();
    if (this.v.driver === 'army') this.v.driver = null;
  }
}
