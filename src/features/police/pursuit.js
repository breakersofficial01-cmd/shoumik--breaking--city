// A police pickup chasing Shoumik (3+ stars). Used only by ./index.js. Numbers: data/police.json → car.
//
// It drives itself by writing vehicle.input (the same physics as everyone else):
//   - Shoumik in sight and close: aim straight at where he will be (leadSeconds ahead) and ram.
//   - Otherwise follow the road grid: junction to junction along world.roads.route().
//   - Stuck against something: back off with the wheel turned the other way.
// When he is on foot close by and the pickup has stopped, its crew jumps out (officers).
// The vehicle has driver = 'police' and tags.police; if Shoumik steals it, it is no longer ours.

import { COLLIDE } from '../../world/collision.js';
import { DIRS } from '../../world/roads.js';

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class PoliceCar {
  /** @param {object} ctx { game, cfg (police.json), rng, hooks: { crewOut(car) } } */
  constructor(ctx, v) {
    this.ctx = ctx;
    this.v = v;
    v.driver = 'police';
    v.brain = null;
    v.tags.police = true;
    v.input.handbrake = false;
    this.crew = ctx.cfg.car.crew;
    this.state = 'chase';   // chase | parked | retreat | lost
    this.wp = null;         // junction { c, r } we are driving to
    this.routeTimer = 0;
    this.stuck = 0;
    this.reverse = 0;
    this.sirenIn = ctx.rng.range(0.5, 2);
    this.timer = 0;
  }

  get alive() { return !this.v.removed && this.v.state === 'ok' && this.v.driver === 'police'; }

  /** Pick the next junction on the way to (tx, tz). */
  plan(tx, tz) {
    const roads = this.ctx.game.world.roads;
    const v = this.v;
    const here = this.wp || roads.nearestJunction(v.x, v.z);
    const goal = roads.nearestJunction(tx, tz);
    if (!here || !goal) return;
    if (!this.wp) { this.wp = here; return; }
    const c = roads.centre(here.c, here.r);
    if (Math.hypot(c.x - v.x, c.z - v.z) > this.ctx.cfg.car.waypointReach && this.routeTimer > 0) return;
    const route = roads.route(here.c, here.r, goal.c, goal.r);
    if (route && route.length) this.wp = { c: here.c + DIRS[route[0]].dc, r: here.r + DIRS[route[0]].dr };
    else this.wp = goal;
    this.routeTimer = 2;
  }

  update(dt) {
    const { game, cfg, rng } = this.ctx;
    const C = cfg.car;
    const v = this.v;
    const inp = v.input;
    const p = game.player;
    this.timer += dt;
    if (this.state === 'parked') { inp.throttle = 0; inp.steer = 0; inp.handbrake = true; return; }

    // Where is he (and where will he be)?
    const tgt = p.mode !== 'onFoot' && p.vehicle ? p.vehicle : null;
    const px = tgt ? tgt.x : p.position.x, pz = tgt ? tgt.z : p.position.z;
    const lead = tgt ? C.leadSeconds : 0.2;
    const tx = px + (tgt ? tgt.vx : p.velocity.x) * lead, tz = pz + (tgt ? tgt.vz : p.velocity.z) * lead;
    let aimX = tx, aimZ = tz;
    const dist = Math.hypot(px - v.x, pz - v.z);
    this.dist = dist;
    if (this.state === 'retreat') { aimX = v.x + Math.sin(v.heading) * 50; aimZ = v.z + Math.cos(v.heading) * 50; }

    let direct = false;
    if (this.state === 'chase') {
      if (dist < C.directRange) {
        const dx = px - v.x, dz = pz - v.z;
        const free = game.world.collision.raycast(v.x, v.z, dx / (dist || 1), dz / (dist || 1), dist, COLLIDE.SOLID);
        direct = free >= dist - 1;
      }
      this.sees = direct;
      if (!direct) {
        this.routeTimer -= dt;
        this.plan(tx, tz);
        if (this.wp) { const c = game.world.roads.centre(this.wp.c, this.wp.r); aimX = c.x; aimZ = c.z; }
      } else this.wp = null;
    }

    // Steering and speed towards the aim point.
    const want = Math.atan2(aimX - v.x, aimZ - v.z);
    const diff = wrapAngle(want - v.heading);
    let steer = clamp(diff * 2.2, -1, 1);
    let thr;
    const top = direct ? C.ramSpeed : C.cruise;
    const slow = Math.abs(diff) > 0.9 ? 0.45 : 1;
    thr = v.forwardSpeed < top * slow ? 1 : 0.15;
    if (Math.abs(diff) > 2.3 && v.forwardSpeed < 6) { thr = -0.8; steer = -Math.sign(diff); } // three-point turn

    // On foot and close: stop and send the crew out.
    if (this.state === 'chase' && p.mode === 'onFoot' && dist < C.exitDistance) {
      thr = v.forwardSpeed > 1 ? -0.6 : 0;
      if (Math.abs(v.forwardSpeed) < 1.5 && this.crew > 0) {
        this.ctx.hooks.crewOut(this, this.crew);
        this.crew = 0;
        this.state = 'parked';
      }
    }

    // Stuck: reverse for a moment.
    if (this.reverse > 0) {
      this.reverse -= dt;
      thr = -1;
      steer = -steer;
    } else if (thr > 0.5 && Math.abs(v.forwardSpeed) < 1.2) {
      this.stuck += dt;
      if (this.stuck > C.stuckSeconds) { this.stuck = 0; this.reverse = C.reverseSeconds; }
    } else this.stuck = 0;

    inp.throttle = thr;
    inp.steer = steer;
    inp.handbrake = false;

    this.sirenIn -= dt;
    if (this.sirenIn <= 0 && this.state === 'chase') {
      this.sirenIn = C.sirenEvery * rng.range(0.8, 1.3);
      game.events.emit('vehicle:horn', { id: v.id, x: v.x, z: v.z, kind: v.T.horn, ai: true });
    }
  }

  retreat() {
    if (this.state === 'chase') { this.state = 'retreat'; this.timer = 0; }
  }
}
