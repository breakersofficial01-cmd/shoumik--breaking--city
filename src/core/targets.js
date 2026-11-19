// Targets: everything that can be shot or hit — pedestrians, police officers, the police
// helicopter. A small shared list (like world.collision.dynamic for moving circles), owned by
// the Game as game.targets, so the weapons feature can find what a bullet hits without
// importing other features. Vehicles are NOT in here: weapons read game.fleet for those.
//
//   const t = game.targets.add({ kind: 'ped', x, y, z, r: 0.38, h: 1.75, owner, onHit(info) {} })
//   ... move it yourself: t.x = ...; t.y = ...; t.z = ...;   t.dead = true when it can no longer be hit
//   game.targets.remove(t)
//
//   info passed to onHit: { damage, weapon (id), kind ('bullet'|'melee'|'fire'|'explosion'),
//                           by ('player'|'police'), x, z (where it came from), dirX, dirZ }
//
// A target is a standing cylinder: centre (x, z), radius r, from y up to y + h.

export class Targets {
  constructor() {
    /** @type {Set<object>} */
    this.list = new Set();
  }

  add(t) {
    t.dead = !!t.dead;
    this.list.add(t);
    return t;
  }

  remove(t) {
    if (t) this.list.delete(t);
  }

  /**
   * First target hit by a ray from (ox, oy, oz) along the unit vector (dx, dy, dz).
   * @returns {{ target: object, dist: number } | null}
   */
  raycast(ox, oy, oz, dx, dy, dz, maxDist, filter = null) {
    let best = null;
    let bestD = maxDist;
    const flat = Math.hypot(dx, dz);
    if (flat < 1e-6) return null;
    for (const t of this.list) {
      if (t.dead || (filter && !filter(t))) continue;
      // Circle test on the ground plane, then check the height at that point.
      const fx = dx / flat, fz = dz / flat;
      const cx = t.x - ox, cz = t.z - oz;
      const along = cx * fx + cz * fz;                 // metres along the ground
      if (along < 0) continue;
      const side2 = cx * cx + cz * cz - along * along;
      if (side2 > t.r * t.r) continue;
      const enter = Math.max(0, along - Math.sqrt(t.r * t.r - side2));
      const dist = enter / flat;                       // distance along the 3D ray
      if (dist > bestD) continue;
      const y = oy + dy * dist;
      if (y < t.y - 0.1 || y > t.y + t.h + 0.1) continue;
      best = t;
      bestD = dist;
    }
    return best ? { target: best, dist: bestD } : null;
  }

  /**
   * The target nearest to the centre of a cone (for phone aim assist).
   * Score = angle off the aim line, plus a little for distance.
   */
  bestInCone(ox, oz, dirX, dirZ, halfAngle, range, filter = null) {
    let best = null;
    let bestScore = Infinity;
    for (const t of this.list) {
      if (t.dead || (filter && !filter(t))) continue;
      const dx = t.x - ox, dz = t.z - oz;
      const d = Math.hypot(dx, dz);
      if (d > range || d < 0.2) continue;
      const cos = (dx * dirX + dz * dirZ) / d;
      const angle = Math.acos(Math.max(-1, Math.min(1, cos)));
      if (angle > halfAngle) continue;
      const score = angle + d / range * 0.35 - (t.priority || 0);
      if (score < bestScore) { bestScore = score; best = t; }
    }
    return best;
  }

  /** Every live target within `radius` of (x, z). */
  within(x, z, radius, out = []) {
    out.length = 0;
    for (const t of this.list) {
      if (!t.dead && Math.hypot(t.x - x, t.z - z) <= radius + t.r) out.push(t);
    }
    return out;
  }

  clear() {
    this.list.clear();
  }
}
