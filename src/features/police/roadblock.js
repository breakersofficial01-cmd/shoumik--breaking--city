// Road blocks (4+ stars). Used only by ./index.js. Numbers: data/police.json → roadblock.
// Two police pickups parked across the road some distance ahead of Shoumik's vehicle, with
// black-uniform officers standing beside them. Removed after lifeSeconds or once far behind.

import { DIRS } from '../../world/roads.js';

export class Roadblocks {
  /** @param {object} ctx { game, cfg (police.json), fleet, hooks: { spawnOfficer(kind, x, z, armed) } } */
  constructor(ctx) {
    this.ctx = ctx;
    this.list = [];       // { cars: [vehicle], x, z, t }
    this.timer = ctx.cfg.roadblock.every * 0.5;
  }

  /** Try to build one ahead of the moving vehicle v. */
  place(v, color) {
    const { game, cfg, fleet, hooks } = this.ctx;
    const R = cfg.roadblock;
    const roads = game.world.roads;
    const fx = v.vx / (v.speed || 1), fz = v.vz / (v.speed || 1);
    const ax = v.x + fx * R.distance, az = v.z + fz * R.distance;
    const near = roads.nearestSegment(ax, az);
    if (!near) return false;
    const seg = roads.segment(near.c, near.r, near.d, 0);
    const u = seg.len * 0.5;
    const cx = seg.ax + seg.fx * u, cz = seg.az + seg.fz * u;
    if (Math.hypot(cx - v.x, cz - v.z) < R.distance * 0.5) return false;
    // Across the road: the pickups face sideways, one on each side of the centre line.
    const across = seg.heading + Math.PI / 2;
    const cars = [];
    for (const side of [-1, 1]) {
      const car = fleet.create(cfg.car.type, { x: cx + seg.lx * side * 2.6, z: cz + seg.lz * side * 2.6, heading: across, color });
      if (!car) continue;
      car.tags.police = true;
      car.tags.roadblock = true;
      car.input.handbrake = true;
      cars.push(car);
    }
    if (!cars.length) return false;
    // Officers stand on the far side of the block (away from him), at the kerbs.
    const D = DIRS[near.d];
    const toward = (cx - v.x) * D.fx + (cz - v.z) * D.fz > 0 ? 1 : -1;
    for (let i = 0; i < R.officers; i++) {
      const side = i % 2 ? 1 : -1;
      hooks.spawnOfficer('swat', cx + D.fx * toward * 4 + seg.lx * side * 5, cz + D.fz * toward * 4 + seg.lz * side * 5, true);
    }
    this.list.push({ cars, x: cx, z: cz, t: 0 });
    return true;
  }

  update(dt, enabled, color) {
    const { game, cfg } = this.ctx;
    const R = cfg.roadblock;
    const p = game.player;
    for (const b of [...this.list]) {
      b.t += dt;
      const far = Math.hypot(b.x - p.position.x, b.z - p.position.z) > cfg.spawn.despawnDistance;
      if (b.t > R.lifeSeconds || far || !enabled) this.remove(b, far || !enabled);
    }
    if (!enabled) return;
    this.timer -= dt;
    const v = p.mode !== 'onFoot' ? p.vehicle : null;
    if (this.timer > 0 || !v || v.speed < R.minPlayerSpeed) return;
    this.timer = R.every;
    this.place(v, color);
  }

  remove(b, now = true) {
    for (const car of b.cars) {
      // Cars the player took, or that are burning, are left alone.
      if (!car.removed && car.driver !== 'player' && car.state === 'ok' && now) this.ctx.fleet.remove(car);
      else if (!car.removed) car.tags.roadblock = false;
    }
    this.list.splice(this.list.indexOf(b), 1);
  }

  clear() {
    for (const b of [...this.list]) this.remove(b, true);
  }
}
