// Tank shells (Roadmap 2 S8). A shell flies from the muzzle towards where Shoumik will be (a little
// off — data/army.json → tank.spread, more when he moves fast), drops a little (shellGravity) and
// explodes on the ground, a wall, a vehicle or next to him: the same blast as a grenade
// (fleet.blast flames + vehicles hurt, `explosion` → people fall, Shoumik is hurt, sound).
// Used only by ./index.js.

import * as THREE from 'three';

export class Shells {
  /** @param {object} ctx { game, cfg (army.json), rng, fleet, fx (combatFx) } */
  constructor(ctx) {
    this.ctx = ctx;
    this.C = ctx.cfg.tank;
    this.list = [];
    this.geo = new THREE.SphereGeometry(0.16, 6, 4);
    this.geo.scale(1, 1, 3);
    this.mat = new THREE.MeshBasicMaterial({ color: '#ffd08a' });
    this.fired = 0;
    this.exploded = 0;
  }

  /** Fire from `from` (muzzle, world) at the target object (x, z, + vx/vz or velocity). */
  fire(tank, from, tgt) {
    const { game, rng, fleet } = this.ctx;
    const C = this.C;
    const p = game.player;
    const vx = tgt.vx ?? p.velocity?.x ?? 0, vz = tgt.vz ?? p.velocity?.z ?? 0;
    const dist0 = Math.hypot(tgt.x - from.x, tgt.z - from.z);
    const flight = dist0 / C.shellSpeed;
    const speed = Math.hypot(vx, vz);
    const spread = C.spread[0] + (C.spread[1] - C.spread[0]) * Math.min(1, speed / 12);
    const a = rng.range(0, Math.PI * 2), r = rng.range(0, spread);
    const ax = tgt.x + vx * flight + Math.sin(a) * r, az = tgt.z + vz * flight + Math.cos(a) * r;
    const ay = game.world.heightAt(ax, az) + 0.6;
    const dx = ax - from.x, dz = az - from.z;
    const d = Math.hypot(dx, dz) || 1;
    const t = d / C.shellSpeed;
    const shell = {
      x: from.x, y: from.y, z: from.z,
      vx: (dx / d) * C.shellSpeed, vz: (dz / d) * C.shellSpeed,
      vy: (ay - from.y) / t + 0.5 * C.shellGravity * t,
      life: t + 1.5, tank: tank.v,
      mesh: new THREE.Mesh(this.geo, this.mat),
    };
    shell.mesh.position.set(shell.x, shell.y, shell.z);
    game.scene.add(shell.mesh);
    this.list.push(shell);
    this.fired++;
    // Muzzle flash + smoke + the bang.
    this.ctx.fx.flash(from.x, from.y, from.z);
    for (let i = 0; i < 6; i++) fleet.fx.emit('smoke', { x: from.x, y: from.y, z: from.z, vx: (dx / d) * 3 + rng.range(-1, 1), vy: rng.range(0.4, 1.4), vz: (dz / d) * 3 + rng.range(-1, 1), life: 1.6, size: [0.8, 3], color: '#9a958c' });
    game.events.emit('police:fired', { x: from.x, z: from.z, rifle: true });
    game.events.emit('danger:raised', { x: from.x, z: from.z, radius: 50, source: 'army' });
  }

  /** Has the shell reached something it explodes on? */
  hits(s) {
    const { game, fleet } = this.ctx;
    if (s.y <= game.world.heightAt(s.x, s.z) + 0.15) return true;
    if (s.y < 4 && game.world.collision.isBlocked(s.x, s.z, 0.25)) return true;
    const v = fleet.nearest(s.x, s.z, 0.8, (x) => x !== s.tank && x.state !== 'wreck');
    if (v && s.y < (v.y || 0) + v.T.size[2] + 0.4) return true;
    const p = game.player;
    const pos = p.mode !== 'onFoot' && p.vehicle ? p.vehicle : p.position;
    return Math.hypot(pos.x - s.x, pos.z - s.z) < 1.1 && s.y < (pos.y || 0) + 2.2;
  }

  explode(s) {
    const { game, fleet } = this.ctx;
    const C = this.C;
    const y = Math.max(s.y, game.world.heightAt(s.x, s.z));
    fleet.blast(s.x, y, s.z, C.blastRadius, C.blastVehicleDamage, 'army');
    game.events.emit('explosion', { x: s.x, z: s.z, radius: C.blastRadius, power: 1, by: 'army' });
    game.events.emit('danger:raised', { x: s.x, z: s.z, radius: C.blastRadius * 5, source: 'explosion' });
    this.exploded++;
  }

  update(dt) {
    const g = this.C.shellGravity;
    for (const s of this.list) {
      // Small sub-steps so a fast shell does not jump through a wall or the ground.
      const steps = Math.max(1, Math.ceil((Math.hypot(s.vx, s.vz) * dt) / 2));
      const h = dt / steps;
      for (let i = 0; i < steps && !s.done; i++) {
        s.x += s.vx * h; s.y += s.vy * h; s.z += s.vz * h;
        s.vy -= g * h;
        s.life -= h;
        if (this.hits(s) || s.life <= 0) { s.done = true; this.explode(s); }
      }
      s.mesh.position.set(s.x, s.y, s.z);
      s.mesh.rotation.y = Math.atan2(s.vx, s.vz);
    }
    for (const s of this.list) if (s.done) s.mesh.removeFromParent();
    this.list = this.list.filter((s) => !s.done);
  }

  dispose() {
    for (const s of this.list) s.mesh.removeFromParent();
    this.list = [];
    this.geo.dispose();
    this.mat.dispose();
  }
}
