// Everybody the army has in the world (Roadmap 2 S8). Used only by ./index.js.
//
//   wake()        the residents appear (counts per quality, data/army.json → quality): gate and
//                 inside guards, patrols, parked trucks and tanks in the yard, one truck driving
//                 round the ring road and one tank round the parade ground
//   sleep(force)  everything goes (Shoumik is far away)
//   alertAll()    the army level: every soldier shoots, the base tanks chase, the driving truck
//                 becomes a chaser; update() then sends extra soldiers, trucks and tanks
//   standDown()   the chase is over: soldiers walk back to their posts (extras leave), tanks
//                 drive home, chasing trucks drive away
// Soldiers: ./soldier.js. Trucks round the base: ArmyDriver (./drive.js). Chasing trucks: the
// police pickup driver (src/features/police/pursuit.js) with army numbers. Tanks: ./tank.js.

import { Soldier } from './soldier.js';
import { ArmyDriver } from './drive.js';
import { TankUnit } from './tank.js';
import { PoliceCar } from '../police/pursuit.js';

const rad = (deg) => (deg * Math.PI) / 180;

export class Units {
  constructor(ctx, shells) {
    this.ctx = ctx;
    this.shells = shells;
    this.cfg = ctx.cfg;
    this.soldiers = [];
    this.tanks = [];
    this.drivers = [];      // trucks driving round the base
    this.chasers = [];      // trucks chasing him (PoliceCar)
    this.vehicles = new Set(); // every fleet vehicle the army made (for clean-up)
    this.ids = new Set();
    this.spawnIn = 0;
    this.blipsShown = false;
    const game = ctx.game;
    this.soldierCtx = {
      game, cfg: ctx.soldierCfg, combat: ctx.combat, rng: ctx.rng, crowd: ctx.crowd, palettes: ctx.palettes, fx: ctx.fx,
      hooks: {
        shoot: (o) => this.shootFrom(o.x, o.y + 1.35, o.z, this.cfg.soldier.accuracy, this.cfg.soldier.damage),
        hitPlayer: (o) => game.events.emit('player:hit', { x: o.x, z: o.z, power: this.cfg.soldier.meleePower, by: 'army' }),
        killed: (o, by) => game.events.emit('army:killed', { x: o.x, z: o.z, by }),
        say: (o, kind) => ctx.say(o, kind),
        attacked: () => ctx.onAttack(),
      },
    };
    this.tankCtx = { game, cfg: this.cfg, rng: ctx.rng, base: ctx.base, material: ctx.material, hooks: { fire: (t, from, tgt) => shells.fire(t, from, tgt) } };
    this.truckCtx = { game, cfg: { car: this.cfg.truck }, rng: ctx.rng, hooks: { crewOut: (car, n) => this.crewOut(car, n) } };
  }

  get Q() { const q = this.cfg.quality; return q[this.ctx.game.qualityName] || q.medium; }
  get base() { return this.ctx.base; }

  /** World route from local points. */
  route(points) { return points.map(([x, z]) => this.base.toWorld(x, z)); }

  newVehicle(type, x, z, heading) {
    const v = this.ctx.fleet.create(type, { x, z, heading });
    if (!v) return null;
    v.tags.army = true;
    this.vehicles.add(v);
    this.ids.add(v.id);
    return v;
  }

  isArmyVehicle(id) { return this.ids.has(id); }

  addSoldier(job, x, z) {
    const s = new Soldier(this.soldierCtx, job, x, z);
    this.soldiers.push(s);
    return s;
  }

  wake() {
    const Q = this.Q, A = this.cfg;
    const posts = [...A.posts.gate.slice(0, Q.gateGuards), ...A.posts.inside.slice(0, Q.insideGuards)];
    for (const p of posts) { const w = this.base.toWorld(p.x, p.z); this.addSoldier({ kind: 'guard', x: w.x, z: w.z, heading: this.base.heading(rad(p.heading)) }, w.x, w.z); }
    for (const r of A.routes.patrols.slice(0, Q.patrols)) { const pts = this.route(r); this.addSoldier({ kind: 'patrol', route: pts }, pts[0].x, pts[0].z); }
    for (const p of A.parked.trucks.slice(0, Q.parkedTrucks)) { const w = this.base.toWorld(p.x, p.z); this.newVehicle(A.truck.type, w.x, w.z, this.base.heading(rad(p.heading))); }
    for (const p of A.parked.tanks.slice(0, Q.parkedTanks)) {
      const w = this.base.toWorld(p.x, p.z);
      const v = this.newVehicle(A.tank.type, w.x, w.z, this.base.heading(rad(p.heading)));
      if (v) this.tanks.push(Object.assign(new TankUnit(this.tankCtx, v, 'parked', this.route(A.routes.parade)), { resident: true }));
    }
    const ring = this.route(A.routes.ring);
    for (let i = 0; i < Q.movingTrucks; i++) {
      const v = this.newVehicle(A.truck.type, ring[i % ring.length].x, ring[i % ring.length].z, this.base.heading(Math.PI / 2));
      if (v) this.drivers.push(new ArmyDriver(this.tankCtx, v, A.truck, ring));
    }
    const parade = this.route(A.routes.parade);
    for (let i = 0; i < Q.movingTanks; i++) {
      const v = this.newVehicle(A.tank.type, parade[i % parade.length].x, parade[i % parade.length].z, this.base.heading(Math.PI / 2));
      if (v) this.tanks.push(Object.assign(new TankUnit(this.tankCtx, v, 'loop', parade), { resident: true, leg: 1 }));
    }
  }

  sleep(force = false) {
    const player = this.ctx.game.player;
    for (const s of this.soldiers) s.remove();
    this.soldiers = [];
    for (const t of this.tanks) t.dispose();
    this.tanks = [];
    this.drivers = [];
    this.chasers = [];
    for (const v of this.vehicles) {
      if (v === player?.vehicle && !force) { v.tags.army = false; v.tags.noBoard = false; if (v.driver === 'army') v.driver = null; continue; }
      if (!v.removed) this.ctx.fleet.remove(v);
    }
    this.vehicles.clear();
  }

  // ---------------------------------------------------------------- the army level
  alertAll() {
    for (const s of this.soldiers) s.engage(true);
    let chasing = this.tanks.filter((t) => t.mode === 'chase').length;
    for (const t of this.tanks) if (t.alive && t.mode !== 'chase' && chasing < this.Q.alertTanks) { t.setMode('chase'); chasing++; }
    for (const d of this.drivers) {
      if (!d.alive) continue;
      d.release();
      this.addChaser(d.v);
    }
    this.drivers = [];
    this.spawnIn = 0;
  }

  /** Trespassing (1 star): the nearest calm soldiers come to arrest him. */
  sendGuards(pos, armed) {
    const near = this.soldiers.filter((s) => s.calm && Math.hypot(s.x - pos.x, s.z - pos.z) < 160)
      .sort((a, b) => Math.hypot(a.x - pos.x, a.z - pos.z) - Math.hypot(b.x - pos.x, b.z - pos.z));
    for (const s of near.slice(0, 3)) s.engage(armed);
  }

  standDown() {
    for (const s of this.soldiers) { s.watching = false; s.goHome(); }
    for (const t of this.tanks) if (t.alive && t.mode === 'chase') t.setMode('home');
    for (const c of this.chasers) c.retreat();
  }

  addChaser(v) {
    const c = new PoliceCar(this.truckCtx, v);
    delete v.tags.police;  // an army truck, not the police (attacking it is attackArmy)
    v.tags.army = true;
    v.tags.noBoard = true;
    this.chasers.push(c);
    return c;
  }

  crewOut(car, n) {
    const v = car.v, game = this.ctx.game;
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? 1 : -1;
      const out = v.T.size[1] / 2 + 0.7;
      const x = v.x + Math.cos(v.heading) * out * side, z = v.z - Math.sin(v.heading) * out * side - (i >> 1) * 1.2;
      if (!game.world.collision.isBlocked(x, z, 0.4)) this.addSoldier({ kind: 'hunt' }, x, z);
    }
    v.driver = null;
    v.tags.noBoard = false;  // an empty army truck: he can take it
  }

  /** A free spot min..max metres from him, preferably out of view; on a road in the city. */
  findSpot(min, max, vehicle = false) {
    const { game, rng } = this.ctx;
    const p = this.playerPos();
    const f = game.cameraRig.forward();
    const W = game.world;
    for (let i = 0; i < 14; i++) {
      const a = rng.range(0, Math.PI * 2), d = rng.range(min, max);
      const x = p.x + Math.sin(a) * d, z = p.z + Math.cos(a) * d;
      if (i < 7 && Math.sin(a) * f.x + Math.cos(a) * f.z > 0.3) continue; // in view
      if (W.layout.pieceAt(x, z)) {
        if (!vehicle) { if (!W.collision.isBlocked(x, z, 0.5)) return { x, z, heading: Math.atan2(p.x - x, p.z - z) }; continue; }
        const near = W.roads.nearestSegment(x, z);
        if (!near) continue;
        const seg = W.roads.segment(near.c, near.r, near.d, 1.7);
        const u = seg.len * near.t, sx = seg.ax + seg.fx * u, sz = seg.az + seg.fz * u;
        if (W.collision.isBlocked(sx, sz, 2)) continue;
        const toward = (p.x - sx) * seg.fx + (p.z - sz) * seg.fz > 0;
        return { x: sx, z: sz, heading: toward ? seg.heading : seg.heading + Math.PI };
      }
      if (!W.terrain?.field.inBounds(x, z) || W.waterAt?.(x, z) || W.collision.isBlocked(x, z, vehicle ? 3 : 0.5)) continue;
      return { x, z, heading: Math.atan2(p.x - x, p.z - z) };
    }
    return null;
  }

  playerPos() {
    const p = this.ctx.game.player;
    return p.mode !== 'onFoot' && p.vehicle ? p.vehicle : p.position;
  }

  /** At the army level keep the right number of extra units coming. */
  staff(dt) {
    this.spawnIn -= dt;
    if (this.spawnIn > 0) return;
    const S = this.cfg.soldier, Q = this.Q;
    this.spawnIn = S.spawnEvery;
    const hunters = this.soldiers.filter((s) => s.job.kind === 'hunt' && s.state !== 'dead' && s.state !== 'retreat').length;
    const trucks = this.chasers.filter((c) => c.alive && c.state === 'chase').length;
    const tanks = this.tanks.filter((t) => t.alive && t.mode === 'chase').length;
    if (hunters < Q.alertSoldiers) {
      const s = this.findSpot(S.spawnMinDistance, S.spawnMaxDistance);
      if (s) this.addSoldier({ kind: 'hunt' }, s.x, s.z);
    } else if (trucks < Q.alertTrucks) {
      const T = this.cfg.truck;
      const s = this.findSpot(T.spawnMinDistance, T.spawnMaxDistance, true);
      const v = s && this.newVehicle(T.type, s.x, s.z, s.heading);
      if (v) this.addChaser(v);
    } else if (tanks < Q.alertTanks) {
      const idle = this.tanks.find((t) => t.alive && t.mode !== 'chase');
      if (idle) { idle.setMode('chase'); return; }
      const T = this.cfg.tank;
      const s = this.findSpot(T.spawnMinDistance, T.spawnMaxDistance, true);
      const v = s && this.newVehicle(T.type, s.x, s.z, s.heading);
      if (v) this.tanks.push(new TankUnit(this.tankCtx, v, 'chase', this.route(this.cfg.routes.parade)));
    }
  }

  /** Police-style shot from (x, y, z) at him: tracer, hit or miss, damage. */
  shootFrom(x, y, z, accuracy, damage) {
    const { game, rng, fx, fleet } = this.ctx;
    const p = game.player;
    if (!p || p.dead) return;
    game.events.emit('police:fired', { x, z, rifle: true });
    const t = this.playerPos();
    const ty = (p.mode === 'onFoot' ? p.position.y : t.y || p.position.y) + 1.2;
    const dx = t.x - x, dz = t.z - z;
    const dist = Math.hypot(dx, dz) || 1;
    const sprinting = p.mode === 'onFoot' && p.speed > 6;
    const hit = rng.chance(Math.min(0.9, accuracy * Math.min(1.3, 10 / dist) * (sprinting ? 0.6 : 1)));
    const miss = hit ? 0 : 1.2 + rng.range(0, 1.5);
    const side = rng.chance(0.5) ? 1 : -1;
    fx.flash(x, y, z);
    fx.tracer(x, y, z, t.x + (-dz / dist) * miss * side, ty + (hit ? 0 : rng.range(-0.6, 0.6)), t.z + (dx / dist) * miss * side);
    game.events.emit('danger:raised', { x, z, radius: 22, source: 'army' });
    if (!hit) return;
    if (p.mode === 'onFoot') {
      fx.blood(t.x, ty, t.z, dx / dist, dz / dist);
      game.events.emit('player:damage', { amount: damage, by: 'army', x, z });
    } else if (p.vehicle) {
      fx.spark(t.x, ty, t.z);
      if (p.vehicle.distanceTo) fleet.damage(p.vehicle, damage * 2);
      game.events.emit('player:damage', { amount: damage * this.ctx.combat.player.vehicleBulletShare, by: 'army', x, z });
    }
  }

  update(dt, { stars, alert }) {
    const game = this.ctx.game;
    if (alert && stars > 0) this.staff(dt);
    for (const s of this.soldiers) s.update(dt);
    for (const d of this.drivers) if (d.alive) d.loop(dt, this.cfg.truck.loopSpeed);
    for (const c of this.chasers) if (c.alive) c.update(dt);
    for (const t of this.tanks) {
      t.update(dt);
      if (!t.alive && !t.wrecked) { t.wrecked = true; t.wreck(this.ctx.wreckMaterial); }
    }
    // Clean up: the dead, extras that walked off, units far away, vehicles nobody needs.
    const p = this.playerPos();
    const far = this.cfg.soldier.despawnDistance;
    this.soldiers = this.soldiers.filter((s) => {
      const d = Math.hypot(s.x - p.x, s.z - p.z);
      const gone = (s.state === 'dead' && s.timer <= 0) || (s.state === 'retreat' && (s.timer <= 0 || d > 60)) || (s.job.kind === 'hunt' && d > far);
      if (gone) s.remove();
      return !gone;
    });
    this.drivers = this.drivers.filter((d) => d.alive && d.v.driver === 'army');
    this.chasers = this.chasers.filter((c) => {
      if (!c.alive) return false;
      const d = Math.hypot(c.v.x - p.x, c.v.z - p.z);
      if (c.state === 'retreat' && (c.timer > 12 || d > 80)) { this.drop(c.v); return false; }
      return true;
    });
    for (const v of this.vehicles) {
      if (v.removed || v === game.player.vehicle) continue;
      const home = this.base.inside(v.x, v.z, 20);
      if (!home && !alert && Math.hypot(v.x - p.x, v.z - p.z) > far) this.drop(v);
    }
    this.tanks = this.tanks.filter((t) => !t.v.removed);
  }

  drop(v) {
    if (v === this.ctx.game.player.vehicle) return;
    const t = this.tanks.find((x) => x.v === v);
    t?.dispose();
    if (!v.removed) this.ctx.fleet.remove(v);
    this.vehicles.delete(v);
  }

  /** Any vehicle at the gate (the barrier lifts). */
  vehicleNearGate(pt, r) {
    return !!this.ctx.fleet.nearest(pt.x, pt.z, r, (v) => v.state !== 'wreck');
  }

  nearestSoldier(pos, range, filter = () => true) {
    let best = null, bd = range;
    for (const s of this.soldiers) {
      if (s.state === 'dead' || !filter(s)) continue;
      const d = Math.hypot(s.x - pos.x, s.z - pos.z);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  blips() {
    const c = this.ctx.game.config.get('mapView')?.colors || {};
    const pts = [];
    for (const s of this.soldiers) if (s.state !== 'dead' && !s.calm) pts.push({ x: s.x, z: s.z, color: c.army || '#6f8f3a', group: 'police', pin: true, small: true, blink: true });
    for (const k of this.chasers) if (k.alive) pts.push({ x: k.v.x, z: k.v.z, color: c.army || '#6f8f3a', icon: '🚚', group: 'police', pin: true, blink: true });
    for (const t of this.tanks) if (t.alive && t.mode === 'chase') pts.push({ x: t.v.x, z: t.v.z, color: c.army || '#6f8f3a', icon: '🪖', group: 'police', pin: true, blink: true });
    return pts;
  }

  report() {
    const by = (f) => this.soldiers.filter(f).length;
    return {
      soldiers: this.soldiers.length, guards: by((s) => s.job.kind === 'guard'), patrols: by((s) => s.job.kind === 'patrol'),
      hunters: by((s) => s.job.kind === 'hunt'), chasing: by((s) => s.state === 'chase'), dead: by((s) => s.state === 'dead'),
      tanks: this.tanks.length, tanksChasing: this.tanks.filter((t) => t.alive && t.mode === 'chase').length,
      tanksMoving: this.tanks.filter((t) => t.alive && t.mode === 'loop').length,
      trucks: [...this.vehicles].filter((v) => !v.removed && v.type === this.cfg.truck.type).length,
      trucksChasing: this.chasers.filter((c) => c.alive && c.state === 'chase').length,
      trucksMoving: this.drivers.length, vehicles: this.vehicles.size,
    };
  }

  summary() {
    const r = this.report();
    return `soldiers ${r.soldiers} (${r.chasing} chasing) tanks ${r.tanks} (${r.tanksChasing} chasing) trucks ${r.trucks} (${r.trucksChasing} chasing)`;
  }
}
