// Driver: the AI that drives a vehicle along the road network (world/roads.js). It only
// writes vehicle.input — the same physics moves AI vehicles and the player's.
// Used by the traffic feature (wandering traffic) and by hired rides (a fixed route).
//
// What a driver does: keeps left in his lane, takes junctions in a smooth curve, waits when
// the junction is not his turn, keeps a gap to whatever is in front (vehicles, people,
// Shoumik), honks when stuck, pulls up at bus stops (buses, legunas), backs off a wall after
// a crash. Numbers: data/traffic.json → ai, signals.
//
//   driver.attach(vehicle, c, r, d, { u, route, stopU, cruise })   put a brain on a vehicle
//   driver.update(vehicle, dt) → 'ok' | 'arrived' | 'stuck'

import { DIRS, opposite } from '../../world/roads.js';

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function leg(ax, az, bx, bz, kind, extra) {
  const len = Math.hypot(bx - ax, bz - az) || 0.001;
  return { ax, az, bx, bz, len, fx: (bx - ax) / len, fz: (bz - az) / len, kind, curve: false, ...extra };
}

export class Driver {
  constructor(game, cfg, rng) {
    this.game = game;
    this.roads = game.world.roads;
    this.cfg = cfg;
    this.ai = cfg.ai;
    this.rng = rng;
  }

  /**
   * @param {object} o  u = metres already driven along the segment; route = directions to take
   *   at the next junctions (when it runs out the driver stops at stopU metres along the last
   *   segment); without a route he wanders for ever. cruise = his normal speed.
   */
  attach(v, c, r, d, o = {}) {
    const lane = this.cfg.lanes[v.T.lane] ?? this.cfg.lanes.inner;
    const s = this.roads.segment(c, r, d, lane);
    v.brain = {
      lane, legs: [leg(s.ax, s.az, s.bx, s.bz, 'seg', { c, r, d })],
      route: o.route ? [...o.route] : null, final: false, stopU: o.stopU ?? 0,
      cruise: o.cruise ?? v.T.cruise,
      blocked: 0, annoyed: 0, honkIn: 0, pushTimer: 0, stuck: 0, idle: 0, reverse: 0,
      busWait: 0, busDone: false,
    };
    v.driver = v.driver || 'ai';
    v.input.handbrake = false;
    return v.brain;
  }

  /** Where to go at the junction at the end of segment (c, r, d). */
  chooseDir(v, c, r, d) {
    const ai = this.ai;
    const exits = this.roads.exits(c, r);
    const options = exits.filter((e) => e !== opposite(d));
    if (!options.length) return exits.length ? exits[0] : null;
    const weight = (e) => (e === d ? ai.straightWeight * (v.T.busStops ? 3 : 1) : e === (d + 3) % 4 ? ai.leftWeight : ai.rightWeight);
    let pick = this.rng.next() * options.reduce((sum, e) => sum + weight(e), 0);
    for (const e of options) { pick -= weight(e); if (pick <= 0) return e; }
    return options[0];
  }

  /** Keep the path planned one junction ahead. */
  plan(v) {
    const b = v.brain;
    const R = this.roads;
    while (!b.final && b.legs.filter((l) => l.kind === 'seg').length < 2) {
      let last = null;
      for (const l of b.legs) if (l.kind === 'seg') last = l;
      const c = last.c + DIRS[last.d].dc, r = last.r + DIRS[last.d].dr;
      const next = b.route ? b.route.shift() : this.chooseDir(v, c, r, last.d);
      if (next == null || !R.hasRoad(c, r, next)) { b.final = true; break; }
      const s = R.segment(c, r, next, b.lane);
      const B = { x: last.bx, z: last.bz }, C = { x: s.ax, z: s.az };
      if (next === last.d) {
        b.legs.push(leg(B.x, B.z, C.x, C.z, 'turn'));
      } else if (next === opposite(last.d)) {
        const k = R.layout.W * 0.5;
        const m1 = { x: B.x + last.fx * k, z: B.z + last.fz * k }, m2 = { x: C.x + last.fx * k, z: C.z + last.fz * k };
        b.legs.push(leg(B.x, B.z, m1.x, m1.z, 'turn', { curve: true }), leg(m1.x, m1.z, m2.x, m2.z, 'turn', { curve: true }), leg(m2.x, m2.z, C.x, C.z, 'turn', { curve: true }));
      } else {
        // A smooth corner: curve from B to C around the point where the two lanes meet.
        const q = last.fx === 0 ? { x: B.x, z: C.z } : { x: C.x, z: B.z };
        let px = B.x, pz = B.z;
        for (const t of [1 / 3, 2 / 3, 1]) {
          const a = (1 - t) * (1 - t), m = 2 * t * (1 - t), e = t * t;
          const x = a * B.x + m * q.x + e * C.x, z = a * B.z + m * q.z + e * C.z;
          b.legs.push(leg(px, pz, x, z, 'turn', { curve: true }));
          px = x; pz = z;
        }
      }
      b.legs.push(leg(s.ax, s.az, s.bx, s.bz, 'seg', { c, r, d: next }));
    }
  }

  /** Free distance to the first thing in the vehicle's path. */
  sense(v, range, ignoreVehicles) {
    const ai = this.ai;
    const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
    const half = v.T.size[0] / 2, hw = v.T.size[1] / 2 + ai.sideMargin;
    let gap = Infinity, blocker = null;
    const test = (o, r) => {
      const dx = o.x - v.x, dz = o.z - v.z;
      const ahead = dx * fx + dz * fz;
      if (ahead < 0 || ahead > range + half + r) return;
      if (Math.abs(dx * fz - dz * fx) > hw + r) return;
      const g = ahead - half - r;
      if (g < gap) { gap = g; blocker = o; }
    };
    for (const o of this.game.world.collision.dynamic) {
      if (o.owner === v || o.r <= 0 || (ignoreVehicles && o.kind === 'vehicle')) continue;
      test(o, o.r);
    }
    const player = this.game.player;
    if (player && player.mode === 'onFoot') test(player.position, 0.4);
    return { gap, blocker };
  }

  update(v, dt) {
    const b = v.brain;
    const ai = this.ai;
    const inp = v.input;
    const L = v.T.size[0];

    // 1) Where am I on my path?
    let cur = b.legs[0];
    let u = (v.x - cur.ax) * cur.fx + (v.z - cur.az) * cur.fz;
    while (u > cur.len - 1 && b.legs.length > 1) {
      b.legs.shift();
      cur = b.legs[0];
      if (cur.kind === 'seg') b.busDone = false;
      u = (v.x - cur.ax) * cur.fx + (v.z - cur.az) * cur.fz;
    }
    this.plan(v);

    // 2) How fast may I go?
    const jam = this.roads.jamAt(v.x, v.z);
    const decel = v.T.brake * 0.45;
    let limit = b.cruise * (jam ? jam.speedFactor : 1);
    let stopDist = Infinity;
    let waiting = false; // standing still for a normal reason (signal, bus stop)
    if (cur.curve) limit = Math.min(limit, ai.turnSpeed);
    if (cur.kind === 'seg') {
      const toEnd = cur.len - u;
      if (b.legs[1]?.curve) limit = Math.min(limit, Math.sqrt(ai.turnSpeed ** 2 + 2 * decel * Math.max(0, toEnd)));
      const D = DIRS[cur.d];
      if (!this.roads.signalGreen(cur.c + D.dc, cur.r + D.dr, cur.d)) {
        const toLine = toEnd - this.cfg.signals.stopLineBack - L / 2;
        if (toLine > -1.5) { stopDist = Math.max(0, toLine); waiting = true; }
      }
      const stop = v.T.busStops && !b.busDone ? this.roads.busStopOn(cur.c, cur.r, cur.d) : null;
      if (stop) {
        const ds = stop.u - u;
        if (b.busWait > 0) {
          b.busWait -= dt;
          stopDist = 0; waiting = true;
          if (b.busWait <= 0) b.busDone = true;
        } else if (ds < -3) b.busDone = true;
        else if (ds < 1.5) {
          stopDist = 0; waiting = true;
          if (v.speed < 0.4) b.busWait = this.rng.range(ai.busStopSeconds[0], ai.busStopSeconds[1]);
        } else stopDist = Math.min(stopDist, ds);
      }
      if (b.final && b.legs.length === 1) {
        const ds = b.stopU - u;
        if (ds < 1.2 && v.speed < 0.6) { inp.throttle = 0; inp.steer = 0; inp.handbrake = true; return 'arrived'; }
        stopDist = Math.min(stopDist, Math.max(0, ds));
      }
    }

    // 3) Is something in the way?
    b.pushTimer = Math.max(0, b.pushTimer - dt);
    const { gap, blocker } = this.sense(v, Math.max(ai.senseMin, v.speed * ai.senseSeconds), b.pushTimer > 0);
    let want = Math.min(limit, Math.sqrt(2 * decel * Math.max(0, stopDist - 0.3)));
    if (blocker) {
      const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
      const lead = blocker.kind === 'vehicle' ? Math.max(0, blocker.vx * fx + blocker.vz * fz) * 0.9 : 0;
      want = Math.min(want, Math.max(0, gap - ai.minGap) * ai.gapGain + lead);
    }

    // 4) Steering: aim at a point a little further along the path.
    let tu = u + clamp(v.speed * ai.lookAheadSeconds, ai.lookAheadMin, ai.lookAheadMax), tl = cur, i = 0;
    while (tu > tl.len && b.legs[i + 1]) { tu -= tl.len; tl = b.legs[++i]; }
    tu = clamp(tu, 0, tl.len);
    const err = wrapAngle(Math.atan2(tl.ax + tl.fx * tu - v.x, tl.az + tl.fz * tu - v.z) - v.heading);
    const steer = clamp(err * ai.steerGain, -1, 1);

    // 5) Stuck handling.
    const vf = v.forwardSpeed;
    const slow = v.speed < 0.5;
    if (blocker && want < 0.5 && slow) {
      b.blocked += dt;
      // Queuing behind other AI traffic is normal; what really annoys a driver is anything else in his way.
      b.annoyed += dt * (blocker.kind === 'vehicle' && blocker.owner.driver === 'ai' ? ai.queuePatience : 1);
      if (b.annoyed > ai.honkAfter) {
        b.honkIn -= dt;
        if (b.honkIn <= 0) {
          b.honkIn = this.rng.range(ai.honkEvery[0], ai.honkEvery[1]);
          this.game.events.emit('vehicle:horn', { id: v.id, x: v.x, z: v.z, kind: v.T.horn, ai: true });
        }
      }
      if (b.blocked > ai.pushAfter && blocker.kind === 'vehicle') { b.pushTimer = ai.pushSeconds; b.blocked = ai.honkAfter; }
    } else {
      b.blocked = Math.max(0, b.blocked - dt * 2);
      b.annoyed = Math.max(0, b.annoyed - dt * 2);
    }
    // Close to the drop-off but queued behind traffic: near enough, let the passenger out.
    if (b.final && b.legs.length === 1 && blocker && slow && b.stopU - u < 16) { inp.throttle = 0; inp.handbrake = true; return 'arrived'; }
    b.stuck = want > 1 && v.speed < 0.3 ? b.stuck + dt : Math.max(0, b.stuck - dt);
    if (b.stuck > ai.reverseAfter && b.reverse <= 0) { b.reverse = ai.reverseSeconds; b.stuck = 0; }
    b.idle = slow && !waiting ? b.idle + dt : 0;

    // 6) Pedals.
    inp.handbrake = false;
    if (b.reverse > 0) {
      b.reverse -= dt;
      inp.throttle = -0.7;
      inp.steer = -steer;
    } else {
      inp.steer = steer;
      if (want < 0.15) {
        inp.throttle = vf > 0.5 ? -1 : 0;
        inp.handbrake = vf <= 0.5;
      } else if (vf < want - 0.4) inp.throttle = ai.throttle;
      else if (vf > want + 0.8) inp.throttle = -clamp((vf - want) / 3, 0.2, 1);
      else inp.throttle = 0.12;
    }
    return b.idle > ai.giveUpAfter ? 'stuck' : 'ok';
  }
}
