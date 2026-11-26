// Passengers: the other people riding a bus / train car (Roadmap 2 S6). Drawn by the shared
// crowd like pedestrians — crowd.add(look, pose, animator) — so the nearest ones become real
// 3D people on Medium/High (Session 5) and stay code-built on Low.
//
// Only a few vehicles get passengers: the one Shoumik rides plus the nearest ones
// (data/transit.json → passengers.units / nearDistance). At every stop some walk out of the
// door and away, and others walk up from outside and take a free seat (or stand).
//
// A UNIT is one bus or one train car:
//   { id, kind: 'bus'|'metro'|'train', cabin (cabin.js), pose(out) → {x,y,z,heading},
//     outsideY() → ground/platform height outside its doors }
//
//   passengers.setUnits([unit, …])    who should have passengers now (most important first)
//   passengers.stop(unit, side)       a stop: people get off / on through the doors on `side`
//   passengers.reserve(unit, seat)    Shoumik takes this seat (whoever sat there stands up)
//   passengers.count(unit)            people inside (for tests)

import { Animator } from '../people/animator.js';
import { buildLook } from '../people/looks.js';
import { toWorld } from './cabin.js';

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const _p = {};
const _w = {};

export class Passengers {
  constructor(game, crowd, rng) {
    this.game = game;
    this.crowd = crowd;
    this.rng = rng;
    this.cfg = game.config.get('transit').passengers;
    this.ped = game.config.get('pedestrians');
    this.units = new Map();   // unit → { unit, riders: [] }
    this.walkers = [];        // people walking to / from a door (outside the vehicle)
  }

  look() {
    const name = this.rng.weighted(this.cfg.archetypes);
    const arch = this.ped.archetypes[name] || Object.values(this.ped.archetypes)[0];
    return buildLook(arch, this.ped.palettes, this.rng);
  }

  makePerson() {
    const look = this.look();
    const animator = new Animator(look.dims, {});
    const person = this.crowd.add(look, animator.pose, animator);
    return { look, animator, person, spot: null, seated: false };
  }

  wanted(unit) {
    const q = this.cfg.count[this.game.qualityName] || this.cfg.count.medium;
    return unit.kind === 'bus' ? q.bus : q.car;
  }

  /** Free seat (or standing spot when the seats are full / for a share of people). */
  freeSpot(entry, preferStand = false) {
    const used = new Set(entry.riders.map((r) => r.spot));
    if (entry.playerSeat) used.add(entry.playerSeat);
    for (const w of this.walkers) if (w.entry === entry && w.spot) used.add(w.spot);
    const seats = entry.unit.cabin.seats.filter((s) => !used.has(s) && !s.nearEye);
    const stands = entry.unit.cabin.standing.filter((s) => !used.has(s));
    const pick = (list) => list[Math.floor(this.rng.next() * list.length)];
    if ((preferStand || !seats.length) && stands.length) return { spot: pick(stands), seated: false };
    if (seats.length) return { spot: pick(seats), seated: true };
    return null;
  }

  seat(entry, r, spot, seated) {
    r.spot = spot;
    r.seated = seated;
    if (seated) r.animator.play('sit');
    else r.animator.stop('sit');
    entry.riders.push(r);
  }

  attach(unit) {
    const entry = { unit, riders: [], playerSeat: null };
    this.units.set(unit, entry);
    const n = this.wanted(unit);
    for (let i = 0; i < n; i++) {
      const f = this.freeSpot(entry, this.rng.chance(this.cfg.standShare));
      if (!f) break;
      this.seat(entry, this.makePerson(), f.spot, f.seated);
    }
    this.place(entry);
  }

  detach(unit) {
    const entry = this.units.get(unit);
    if (!entry) return;
    for (const r of entry.riders) this.crowd.remove(r.person);
    this.units.delete(unit);
    // People walking towards this vehicle simply go away too.
    this.walkers = this.walkers.filter((w) => {
      if (w.entry !== entry || w.dir !== 'in') return true;
      this.crowd.remove(w.r.person);
      return false;
    });
  }

  setUnits(list) {
    const keep = new Set(list);
    for (const u of [...this.units.keys()]) if (!keep.has(u)) this.detach(u);
    for (const u of list) if (!this.units.has(u)) this.attach(u);
  }

  count(unit) {
    const e = this.units.get(unit);
    return e ? e.riders.length : 0;
  }

  /** Shoumik sits on `seat`: the person there (if any) gets up and stands. */
  reserve(unit, seat) {
    const entry = this.units.get(unit);
    if (!entry) return;
    entry.playerSeat = seat;
    const r = entry.riders.find((x) => x.spot === seat);
    if (!r) return;
    entry.riders.splice(entry.riders.indexOf(r), 1);
    const f = this.freeSpot(entry, true);
    if (f) this.seat(entry, r, f.spot, f.seated);
    else this.crowd.remove(r.person);
  }

  release(unit) {
    const entry = this.units.get(unit);
    if (entry) entry.playerSeat = null;
  }

  /** The nearest door on `side` (+1 left, -1 right; 0 = any) in world space. */
  doorOut(unit, side, out, step = 0.7) {
    const pose = unit.pose(_p);
    const doors = unit.cabin.doors.filter((d) => !side || d.side === side);
    const d = doors[Math.floor(this.rng.next() * doors.length)] || unit.cabin.doors[0];
    toWorld(pose, d.x + d.side * step, 0, d.z, out);
    out.y = unit.outsideY();
    out.nx = Math.cos(pose.heading) * d.side;   // outward normal of that wall
    out.nz = -Math.sin(pose.heading) * d.side;
    return out;
  }

  /** A stop: some get off, some get on (through the doors on `side`). */
  stop(unit, side = 0) {
    const entry = this.units.get(unit);
    if (!entry) return;
    const c = this.cfg;
    const off = Math.min(entry.riders.length, this.rng.int(c.offPerStop[0], c.offPerStop[1]));
    for (let i = 0; i < off; i++) {
      const r = entry.riders.splice(Math.floor(this.rng.next() * entry.riders.length), 1)[0];
      r.animator.stop('sit');
      const door = this.doorOut(unit, side, {});
      const side2 = this.rng.chance(0.5) ? 1 : -1;
      const out = { x: door.x + door.nx * c.walkOut - door.nz * side2 * 2, z: door.z + door.nz * c.walkOut + door.nx * side2 * 2 };
      this.walkers.push({ r, entry, dir: 'out', x: door.x, z: door.z, y: door.y, path: [out], heading: Math.atan2(door.nx, door.nz) });
    }
    const room = this.wanted(unit) + 1 - entry.riders.length;
    const on = Math.max(0, Math.min(room, this.rng.int(c.onPerStop[0], c.onPerStop[1])));
    for (let i = 0; i < on; i++) {
      const f = this.freeSpot(entry, this.rng.chance(c.standShare));
      if (!f) break;
      const door = this.doorOut(unit, side, {});
      const along = (this.rng.next() - 0.5) * 6;
      const sx = door.x + door.nx * (2 + this.rng.next() * 2.5) - door.nz * along;
      const sz = door.z + door.nz * (2 + this.rng.next() * 2.5) + door.nx * along;
      const r = this.makePerson();
      this.walkers.push({ r, entry, dir: 'in', spot: f.spot, seated: f.seated, x: sx, z: sz, y: door.y, path: [{ x: door.x, z: door.z }], heading: 0 });
    }
  }

  /** Put every rider where his seat / spot is now. */
  place(entry) {
    const u = entry.unit;
    const pose = u.pose(_p);
    const cab = u.cabin;
    for (const r of entry.riders) {
      toWorld(pose, r.spot.x, cab.floor, r.spot.z, _w);
      const p = r.person;
      p.x = _w.x; p.y = _w.y; p.z = _w.z; p.groundY = _w.y;
      p.heading = wrap(pose.heading + r.spot.heading);
    }
  }

  update(dt) {
    const speed = this.cfg.walkSpeed;
    for (const entry of this.units.values()) {
      for (const r of entry.riders) r.animator.update(dt, { speed: 0 });
      this.place(entry);
    }
    for (let i = this.walkers.length - 1; i >= 0; i--) {
      const w = this.walkers[i];
      const t = w.path[0];
      let moving = 0;
      if (t) {
        const dx = t.x - w.x, dz = t.z - w.z, d = Math.hypot(dx, dz);
        const step = speed * dt;
        if (d <= step) { w.x = t.x; w.z = t.z; w.path.shift(); } else { w.x += (dx / d) * step; w.z += (dz / d) * step; moving = speed; }
        w.heading = wrap(w.heading + wrap(Math.atan2(dx, dz) - w.heading) * Math.min(1, 8 * dt));
      }
      w.r.animator.update(dt, { speed: moving });
      Object.assign(w.r.person, { x: w.x, y: w.y, z: w.z, groundY: w.y, heading: w.heading });
      if (w.path.length) continue;
      this.walkers.splice(i, 1);
      if (w.dir === 'out' || !this.units.has(w.entry.unit)) this.crowd.remove(w.r.person);
      else this.seat(w.entry, w.r, w.spot, w.seated);
    }
  }

  /** How many people are walking to / from doors (tests). */
  get walking() { return this.walkers.length; }

  dispose() {
    for (const u of [...this.units.keys()]) this.detach(u);
    for (const w of this.walkers) this.crowd.remove(w.r.person);
    this.walkers = [];
  }
}
