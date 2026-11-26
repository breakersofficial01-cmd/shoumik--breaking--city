// ArmyDriver (Roadmap 2 S8): drives one army fleet vehicle by writing vehicle.input — the base of
// TankUnit (./tank.js) and the truck that drives round the base. Used only by the army feature.
//
//   driveTo(x, z, top, stopAt, dt)   steer + throttle towards a point; backs off when stuck
//   aimPoint(tx, tz, dt)             where to drive to reach (tx, tz): through the cantonment gate
//                                    when only one of the two is inside the base, along the road
//                                    grid in the city when a wall is in the way, else straight
//   loop(dt, speed)                  follow this.route (world points) round and round
// Numbers: ctx.C = data/army.json → tank or truck (stuckSeconds, reverseSeconds, waypointReach).

import { COLLIDE } from '../../world/collision.js';
import { DIRS } from '../../world/roads.js';

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class ArmyDriver {
  /**
   * @param {object} ctx  { game, base (CantonmentBase) }
   * @param {object} v    fleet vehicle
   * @param {object} C    numbers (data/army.json → tank / truck)
   * @param {Array<{x:number, z:number}>|null} route  loop inside the base
   */
  constructor(ctx, v, C, route = null) {
    this.ctx = ctx;
    this.v = v;
    this.C = C;
    this.route = route;
    this.leg = 0;
    this.stuck = 0;
    this.reverse = 0;
    this.wp = null;
    this.routeTimer = 0;
    v.driver = 'army';   // traffic ignores it; parked physics off
    v.brain = null;
    v.tags.army = true;
    v.tags.noBoard = true;
  }

  get alive() { return !this.v.removed && this.v.state === 'ok'; }

  /** Follow the loop route; returns the distance to the next point. */
  loop(dt, speed) {
    const t = this.route[this.leg];
    const d = this.driveTo(t.x, t.z, speed, 0, dt);
    if (d < (this.C.waypointReach || 9)) this.leg = (this.leg + 1) % this.route.length;
    return d;
  }

  /** Where to drive to reach (tx, tz): through the gate when only one of us is in the base. */
  aimPoint(tx, tz, dt) {
    const v = this.v, base = this.ctx.base;
    if (base) {
      const meIn = base.inside(v.x, v.z, 2), heIn = base.inside(tx, tz, 2);
      if (meIn !== heIn) {
        const g = base.gatePoints();
        const first = meIn ? g.inner : g.outer;
        const second = meIn ? g.outer : g.inner;
        // Line up on the gate from far, then drive straight through it (base frame: gate on −x).
        const l = base.toLocal(v.x, v.z), f = base.toLocal(first.x, first.z);
        const onLine = Math.abs(l.z) < 5 && (meIn ? l.x < f.x + 4 : l.x > f.x - 4);
        return onLine ? second : first;
      }
    }
    // In the city with a wall in the way: follow the road grid (like the police pickups).
    const game = this.ctx.game;
    if (game.world.layout.pieceAt(v.x, v.z)) {
      const d = Math.hypot(tx - v.x, tz - v.z);
      const free = game.world.collision.raycast(v.x, v.z, (tx - v.x) / (d || 1), (tz - v.z) / (d || 1), d, COLLIDE.SOLID);
      if (free < d - 1) {
        this.routeTimer -= dt;
        this.plan(tx, tz);
        if (this.wp) return game.world.roads.centre(this.wp.c, this.wp.r);
      } else this.wp = null;
    }
    return { x: tx, z: tz };
  }

  /** Next junction on the road grid towards (tx, tz). */
  plan(tx, tz) {
    const roads = this.ctx.game.world.roads;
    const v = this.v;
    const here = this.wp || roads.nearestJunction(v.x, v.z);
    const goal = roads.nearestJunction(tx, tz);
    if (!here || !goal) return;
    if (!this.wp) { this.wp = here; return; }
    const c = roads.centre(here.c, here.r);
    if (Math.hypot(c.x - v.x, c.z - v.z) > this.C.waypointReach && this.routeTimer > 0) return;
    const route = roads.route(here.c, here.r, goal.c, goal.r);
    this.wp = route?.length ? { c: here.c + DIRS[route[0]].dc, r: here.r + DIRS[route[0]].dr } : goal;
    this.routeTimer = 2;
  }

  /** Drive towards (x, z) at up to `top` m/s; stop when closer than `stopAt`. */
  driveTo(x, z, top, stopAt, dt) {
    const v = this.v, inp = v.input;
    const dist = Math.hypot(x - v.x, z - v.z);
    const diff = wrapAngle(Math.atan2(x - v.x, z - v.z) - v.heading);
    let steer = clamp(diff * 2.4, -1, 1);
    let thr = 0;
    if (dist > stopAt) {
      const slow = Math.abs(diff) > 0.8 ? 0.35 : 1;
      thr = v.forwardSpeed < top * slow ? 1 : 0.1;
      if (Math.abs(diff) > 2.2 && v.forwardSpeed < 3) { thr = -0.7; steer = -Math.sign(diff); } // back round
    } else thr = v.forwardSpeed > 0.5 ? -0.6 : 0;
    // Stuck against something: back off with the tracks turned the other way.
    if (this.reverse > 0) {
      this.reverse -= dt;
      thr = -1;
      steer = -steer;
    } else if (thr > 0.5 && Math.abs(v.forwardSpeed) < 0.8) {
      this.stuck += dt;
      if (this.stuck > this.C.stuckSeconds) { this.stuck = 0; this.reverse = this.C.reverseSeconds; }
    } else this.stuck = 0;
    inp.throttle = thr;
    inp.steer = steer;
    inp.handbrake = thr === 0 && dist <= stopAt;
    return dist;
  }

  /** Let go of the vehicle (it becomes an ordinary parked vehicle Shoumik can take). */
  release() {
    const v = this.v;
    if (v.driver === 'army') v.driver = null;
    v.tags.noBoard = false;
    v.input.throttle = 0; v.input.steer = 0; v.input.handbrake = true;
  }
}
