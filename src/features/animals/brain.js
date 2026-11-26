// How one animal behaves (Roadmap 2 S5). States:
//   idle  – stands, lies down (dogs, cats, cows), grazes with the head down (cows, goats),
//           sits on its wire / roof looking around (crows), floats and bobs (ducks)
//   walk  – strolls to a nearby point (sidewalk, lane, field, inside its pond)
//   flee  – runs away from a gunshot, an explosion, a car or Shoumik (no injuries, ever)
//   fly   – birds take off, climb and fly away; they are removed once far away
// Numbers: data/animals.json → behaviour and kinds.<kind>.

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const approach = (v, to, k) => v + (to - v) * Math.min(1, k);

export class AnimalBrain {
  /** @param {{game:object, cfg:object, spots:import('./spots.js').AnimalSpots, rng:object}} ctx */
  constructor(ctx) {
    Object.assign(this, ctx);
    this.B = ctx.cfg.behaviour;
  }

  /** Choose what to do next after idling or arriving. */
  next(a) {
    const r = this.rng;
    const k = a.k;
    if (a.perched) { this.idle(a); return; }
    if (r.chance(k.idle)) { this.idle(a); return; }
    const t = this.target(a);
    if (!t) { this.idle(a); return; }
    a.state = 'walk';
    a.tx = t.x; a.tz = t.z;
    a.speed = r.range(k.speed[0], k.speed[1]);
    a.timer = r.range(this.B.wanderSeconds[0], this.B.wanderSeconds[1]) * 2;
  }

  idle(a) {
    const r = this.rng;
    a.state = 'idle';
    a.timer = r.range(this.B.idleSeconds[0], this.B.idleSeconds[1]);
    a.speed = 0;
    const m = a.model;
    a.pose = m.graze && r.chance(0.6) ? 'graze' : m.lieDrop > 0 && r.chance(0.45) ? 'lie' : 'stand';
  }

  /** A point to stroll to. */
  target(a) {
    const r = this.rng, S = this.spots;
    if (a.water) return S.inWater(a.water, r);
    const d = a.k.size * 6 + 3;
    for (let i = 0; i < 3; i++) {
      const x = a.x + r.range(-d, d), z = a.z + r.range(-d, d);
      const p = a.k.where === 'herd' ? S.herd(x, z, r, a.k) : S.street(x, z, r);
      if (p) return p;
    }
    return null;
  }

  /** Something scary at (x, z): run (land) or fly off (birds). */
  scare(a, x, z, strong = true) {
    const r = this.rng;
    if (a.model.bird) {
      if (a.state === 'fly') return;
      a.state = 'fly';
      a.perched = false;
      a.vy = a.k.fly.climb * r.range(0.8, 1.2);
      a.heading = Math.atan2(a.x - x, a.z - z) + r.range(-0.6, 0.6);
      a.speed = a.k.fly.speed * r.range(0.85, 1.15);
      a.timer = 12;
      return;
    }
    a.state = 'flee';
    a.heading = Math.atan2(a.x - x, a.z - z) + r.range(-0.5, 0.5);
    a.speed = strong ? a.k.run : a.k.speed[1] * 1.6;
    a.timer = r.range(this.B.fleeSeconds[0], this.B.fleeSeconds[1]) * (strong ? 1 : 0.4);
    a.pose = 'stand';
  }

  /** A car passed through it: a little jump, then it runs off (no injuries for animals). */
  bump(a, vx, vz) {
    if (a.model.bird) { this.scare(a, a.x - vx, a.z - vz); return; }
    a.hop = 0.35;
    this.scare(a, a.x - vx, a.z - vz);
  }

  update(a, dt) {
    const k = a.k, m = a.model;
    const S = this.spots;
    a.timer -= dt;
    let moving = 0;

    if (a.state === 'fly') {
      a.y += a.vy * dt;
      a.vy = Math.max(0.4, a.vy - dt * 0.6);
      a.x += Math.sin(a.heading) * a.speed * dt;
      a.z += Math.cos(a.heading) * a.speed * dt;
      a.wings = approach(a.wings, 1, dt * 8);
      a.flap += dt * 22;
      a.pitch = -0.25;
      a.noLegs = true;
      a.bob = 0;
      return;
    }
    a.flap = 0;
    a.wings = approach(a.wings, 0, dt * 6);

    if (a.state === 'walk' || a.state === 'flee') {
      const fleeing = a.state === 'flee';
      if (!fleeing) a.heading = wrap(a.heading + wrap(Math.atan2(a.tx - a.x, a.tz - a.z) - a.heading) * Math.min(1, dt * this.B.turnSpeed));
      const step = a.speed * dt;
      const nx = a.x + Math.sin(a.heading) * step, nz = a.z + Math.cos(a.heading) * step;
      const ok = a.water ? S.inside(a.water, nx, nz) : S.free(nx, nz, Math.min(0.5, k.size * 0.3));
      if (ok) { a.x = nx; a.z = nz; moving = a.speed; } else if (fleeing) a.heading += (this.rng.chance(0.5) ? 1 : -1) * Math.PI / 2;
      else a.timer = 0;
      if (!fleeing && Math.hypot(a.tx - a.x, a.tz - a.z) < 0.4) a.timer = 0;
      if (a.timer <= 0) this.idle(a);
    } else if (a.timer <= 0) {
      this.next(a);
    }

    // Pose.
    a.legAmp = approach(a.legAmp, moving > 0.05 ? 1 : 0, dt * 8);
    a.legPhase += dt * this.B.stepRate * (0.6 + moving / Math.max(0.2, k.size));
    a.lie = approach(a.lie, a.state === 'idle' && a.pose === 'lie' ? 1 : 0, dt * 2.5);
    const grazing = a.state === 'idle' && a.pose === 'graze';
    a.headPitch = approach(a.headPitch, grazing ? m.graze : 0, dt * 2);
    a.look = (a.look || 0) + dt;
    a.headYaw = a.state === 'idle' && !grazing ? Math.sin(a.look * 0.7 + a.seed) * 0.5 : approach(a.headYaw, 0, dt * 4);
    a.pitch = 0;
    a.noLegs = !!m.swims;
    if (a.water) {
      a.y = S.waterY;
      a.bob = Math.sin(a.look * 2.1 + a.seed) * 0.015 - 0.07;
    } else if (!a.perched) {
      const g = S.ground(a.x, a.z);
      a.hop = Math.max(0, (a.hop || 0) - dt);
      a.y = g;
      a.bob = a.hop > 0 ? Math.sin((a.hop / 0.35) * Math.PI) * 0.35 : 0;
    }
  }
}
