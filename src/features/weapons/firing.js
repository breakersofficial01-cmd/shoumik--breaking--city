// Gunfire: where a bullet goes and what it hits. Used only by ./index.js.
//
// A shot starts at Shoumik's gun (data/weapons.json → aim.muzzle) and flies along `dir`.
// It stops at the nearest of: a target (game.targets — people, police, the helicopter), a
// vehicle (game.fleet, its collision circles), a wall (world.collision) or the ground.
//   target  → target.onHit({ damage, weapon, kind: 'bullet', by: 'player', x, z, dirX, dirZ })
//   vehicle → fleet.damage(v, weapon.vehicleDamage), v.tags.lastHitBy = 'player'
// Events sent: combat:hit { kind, by, police, killed }   (crime + stats listen)
// Effects: tracer, muzzle flash, blood or sparks (src/entities/effects/combatFx.js).

import { COLLIDE } from '../../world/collision.js';

const DEG = Math.PI / 180;

/** Distance along a ray (flat direction fx, fz) to circle (cx, cz, r), or Infinity. */
function rayCircle(ox, oz, fx, fz, cx, cz, r) {
  const px = cx - ox, pz = cz - oz;
  const along = px * fx + pz * fz;
  if (along < 0) return Infinity;
  const side2 = px * px + pz * pz - along * along;
  if (side2 > r * r) return Infinity;
  return Math.max(0, along - Math.sqrt(r * r - side2));
}

export class Gunner {
  constructor(game, cfg, fx) {
    this.game = game;
    this.cfg = cfg;
    this.fx = fx;
  }

  /** Where bullets leave the gun. */
  muzzle(out = {}) {
    const p = this.game.player;
    const [up, ahead] = this.cfg.aim.muzzle;
    out.x = p.position.x + Math.sin(p.heading) * ahead;
    out.z = p.position.z + Math.cos(p.heading) * ahead;
    out.y = p.position.y + up;
    return out;
  }

  /**
   * Nearest thing along a ray. Returns { dist, kind: 'target'|'vehicle'|'wall'|'ground'|'none', target?, vehicle? }.
   * skipBefore: ignore hits closer than this (used for the camera ray: things behind Shoumik).
   */
  trace(ox, oy, oz, dx, dy, dz, range, skipBefore = 0) {
    const game = this.game;
    const flat = Math.hypot(dx, dz) || 1e-6;
    const fx = dx / flat, fz = dz / flat;
    let best = { dist: range, kind: 'none' };
    // Walls (the grid works on the ground plane).
    const wallFlat = game.world.collision.raycast(ox, oz, fx, fz, range * flat, COLLIDE.SOLID);
    const wall = wallFlat / flat;
    if (wall < best.dist && wall > skipBefore) best = { dist: wall, kind: 'wall' };
    // Ground.
    if (dy < -1e-3) {
      const g = (oy - game.world.heightAt(ox, oz)) / -dy;
      if (g < best.dist && g > skipBefore) best = { dist: g, kind: 'ground' };
    }
    // People, police, helicopter.
    const hit = game.targets.raycast(ox, oy, oz, dx, dy, dz, best.dist, (t) => !t.isPlayer);
    if (hit && hit.dist > skipBefore) best = { dist: hit.dist, kind: 'target', target: hit.target };
    // Vehicles: their collision circles, up to their roof.
    for (const v of game.fleet?.vehicles || []) {
      if (v.removed || v === game.player.vehicle) continue;
      if (Math.abs(v.x - ox) > range + 6 || Math.abs(v.z - oz) > range + 6) continue;
      for (const c of v.circles) {
        const d = rayCircle(ox, oz, fx, fz, c.dyn.x, c.dyn.z, c.dyn.r) / flat;
        if (d >= best.dist || d <= skipBefore) continue;
        const y = oy + dy * d;
        if (y < v.y - 0.2 || y > v.y + v.T.size[2] + 0.2) continue;
        best = { dist: d, kind: 'vehicle', vehicle: v };
      }
    }
    return best;
  }

  /**
   * Fire weapon w from the muzzle along (dx, dy, dz) (normalised). Shotguns fire several
   * pellets with spread. Returns true when anything living was hit.
   */
  fire(w, dx, dy, dz) {
    const o = this.muzzle();
    this.fx.flash(o.x + dx * 0.25, o.y + dy * 0.25, o.z + dz * 0.25);
    let hitSomeone = false;
    for (let i = 0; i < (w.pellets || 1); i++) {
      const s = (w.spreadDegrees || 0) * DEG;
      const yaw = Math.atan2(dx, dz) + (Math.random() - 0.5) * 2 * s;
      const pitch = Math.asin(Math.max(-1, Math.min(1, dy))) + (Math.random() - 0.5) * s;
      const ddx = Math.sin(yaw) * Math.cos(pitch), ddz = Math.cos(yaw) * Math.cos(pitch), ddy = Math.sin(pitch);
      if (this.shoot(w, o, ddx, ddy, ddz)) hitSomeone = true;
    }
    return hitSomeone;
  }

  shoot(w, o, dx, dy, dz) {
    const game = this.game;
    const hit = this.trace(o.x, o.y, o.z, dx, dy, dz, w.range);
    const ex = o.x + dx * hit.dist, ey = o.y + dy * hit.dist, ez = o.z + dz * hit.dist;
    this.fx.tracer(o.x, o.y, o.z, ex, ey, ez);
    const flat = Math.hypot(dx, dz) || 1;
    if (hit.kind === 'target') {
      const t = hit.target;
      const killed = t.onHit({ damage: w.damage, weapon: w.id, kind: 'bullet', by: 'player', x: o.x, z: o.z, dirX: dx / flat, dirZ: dz / flat }) === 'killed';
      if (t.bleeds !== false) this.fx.blood(ex, ey, ez, dx / flat, dz / flat);
      else this.fx.spark(ex, ey, ez);
      game.events.emit('combat:hit', { kind: t.kind, by: 'player', police: !!t.police, killed });
      return true;
    }
    if (hit.kind === 'vehicle') {
      const v = hit.vehicle;
      v.tags.lastHitBy = 'player';
      game.fleet.damage(v, w.vehicleDamage || 0);
      this.fx.spark(ex, ey, ez);
      game.events.emit('combat:hit', { kind: 'vehicle', by: 'player', police: !!v.tags.police, killed: false, id: v.id });
      return false;
    }
    if (hit.kind === 'wall' || hit.kind === 'ground') this.fx.spark(ex, ey, ez);
    return false;
  }
}
