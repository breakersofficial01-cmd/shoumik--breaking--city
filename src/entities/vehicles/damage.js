// Vehicle damage: dents → smoke → fire → explosion → burnt wreck. Also knocks Shoumik over
// when a moving vehicle runs into him. Used only by fleet.js.
// Numbers: data/vehicles.json → damage and effects.

export class DamageModel {
  constructor(fleet, cfg) {
    this.fleet = fleet;
    this.game = fleet.game;
    this.D = cfg.damage;
    this.E = cfg.effects;
    this.playerHitCooldown = 0;
  }

  /** A bump of `speed` m/s. kind: 'wall' | 'vehicle' | 'land'. */
  impact(v, speed, kind) {
    const D = this.D;
    const over = kind === 'land' ? speed : speed - D.minImpactSpeed;
    if (over <= 0 || v.state === 'wreck') return;
    this.damage(v, over * (kind === 'land' ? D.landPerSpeed : D.perSpeed));
    const now = performance.now();
    if (now - (v.lastCrashAt || 0) < 250) return; // one crash, several circles
    v.lastCrashAt = now;
    this.game.events.emit('vehicle:crashed', { id: v.id, x: v.x, z: v.z, speed });
    if (speed > D.crashDangerSpeed) {
      this.game.events.emit('danger:raised', { x: v.x, z: v.z, radius: D.crashDangerRadius, source: v.driver === 'player' ? 'player' : 'traffic' });
    }
  }

  damage(v, amount) {
    if (v.state === 'wreck' || !(amount > 0)) return;
    v.health = Math.max(0, v.health - amount);
    if (v.health <= 0 && v.state === 'ok') {
      v.state = 'burning';
      v.burnTimer = this.D.burnSeconds;
      this.game.events.emit('vehicle:burning', { id: v.id, x: v.x, z: v.z });
    }
  }

  explode(v) {
    const D = this.D, E = this.E;
    const fx = this.fleet.fx;
    v.state = 'wreck';
    v.health = 0;
    v.wreckTimer = D.wreckSeconds;
    v.mesh.material = this.fleet.lib.wreckMaterial;
    for (const child of v.mesh.children) child.visible = false; // art panel burns away
    // The blast lifts the wreck off the ground.
    v.airborne = true;
    v.vy = D.explosionPush * 0.6;
    const rnd = () => Math.random() * 2 - 1;
    for (let i = 0; i < 18; i++) {
      fx.emit('fire', { x: v.x + rnd(), y: v.y + 0.8 + Math.random(), z: v.z + rnd(), vx: rnd() * 5, vy: 2 + Math.random() * 5, vz: rnd() * 5, life: 0.5 + Math.random() * 0.5, size: [1.2, 4.2], color: E.fireColors[i % E.fireColors.length] });
    }
    for (let i = 0; i < 10; i++) {
      fx.emit('smoke', { x: v.x + rnd(), y: v.y + 1.2, z: v.z + rnd(), vx: rnd() * 2, vy: 2.5 + Math.random() * 2, vz: rnd() * 2, life: 1.6 + Math.random(), size: [1.5, 5], color: E.darkSmokeColor });
    }
    // Everything close gets hurt and thrown.
    for (const o of this.fleet.vehicles) {
      if (o === v) continue;
      const dx = o.x - v.x, dz = o.z - v.z;
      const d = Math.hypot(dx, dz);
      if (d > D.explosionRadius) continue;
      const f = 1 - d / D.explosionRadius;
      const push = (D.explosionPush * f * 1200) / Math.max(400, o.T.mass);
      o.vx += (dx / (d || 1)) * push;
      o.vz += (dz / (d || 1)) * push;
      o.speed = Math.hypot(o.vx, o.vz);
      this.damage(o, D.explosionDamage * f);
    }
    const ev = this.game.events;
    ev.emit('vehicle:exploded', { id: v.id, type: v.type, x: v.x, z: v.z, radius: D.explosionRadius });
    ev.emit('explosion', { x: v.x, z: v.z, radius: D.explosionRadius, power: 1 });
    ev.emit('danger:raised', { x: v.x, z: v.z, radius: D.explosionDangerRadius, source: 'explosion' });
  }

  /** Smoke from a hurt engine, flames when nearly dead, tyre smoke while drifting. */
  puff(v, dt) {
    const E = this.E, D = this.D;
    const share = v.healthShare;
    const drifting = v.slip > E.skidAtSlip && !v.airborne;
    if (share >= D.smokeAt && !drifting && v.state === 'ok') return;
    v.smokeTimer -= dt;
    if (v.smokeTimer > 0) return;
    v.smokeTimer = E.smokeEvery;
    const fx = this.fleet.fx;
    const fwd = Math.sin(v.heading), fwz = Math.cos(v.heading);
    if (drifting) {
      const back = -v.T.size[0] * 0.35;
      fx.emit('smoke', { x: v.x + fwd * back, y: v.y + 0.15, z: v.z + fwz * back, vy: 0.5, life: 0.7, size: [0.5, 1.7], color: E.skidSmokeColor });
    }
    if (share >= D.smokeAt && v.state === 'ok') return;
    // The engine is at the front (in the middle for a wreck).
    const off = v.state === 'wreck' ? 0 : v.T.size[0] * 0.3;
    const x = v.x + fwd * off, z = v.z + fwz * off, y = v.y + v.T.size[2] * 0.6;
    const burning = v.state !== 'ok' || share < D.fireAt;
    fx.emit('smoke', { x, y, z, vx: v.vx * 0.3, vy: 1.6, vz: v.vz * 0.3, life: burning ? 1.5 : 1, size: [0.4, burning ? 2.4 : 1.5], color: burning ? E.darkSmokeColor : E.smokeColor, lift: 0.6 });
    if (burning && v.state !== 'wreck') {
      fx.emit('fire', { x: x + (Math.random() - 0.5) * 0.5, y: y - 0.15, z: z + (Math.random() - 0.5) * 0.5, vy: 1.8, life: 0.45, size: [0.9, 0.3], color: E.fireColors[Math.floor(Math.random() * E.fireColors.length)] });
    }
  }

  update(dt) {
    const D = this.D;
    const fleet = this.fleet;
    for (const v of [...fleet.vehicles]) {
      if (v.state === 'burning') {
        v.burnTimer -= dt;
        if (v.burnTimer <= 0) this.explode(v);
      } else if (v.state === 'wreck') {
        v.wreckTimer -= dt;
        if (v.wreckTimer <= 0 && !v.tags.keep) { fleet.remove(v); continue; }
      }
      if (v.mesh.visible) this.puff(v, dt);
    }
    // A vehicle driving into Shoumik on foot knocks him away.
    this.playerHitCooldown -= dt;
    const player = this.game.player;
    if (!player || player.mode !== 'onFoot' || this.playerHitCooldown > 0) return;
    const p = player.position;
    for (const v of fleet.vehicles) {
      if (v.speed < D.playerHitSpeed || Math.abs(v.x - p.x) > v.reach + 1 || Math.abs(v.z - p.z) > v.reach + 1) continue;
      if (v.distanceTo(p.x, p.z) > 0.45) continue;
      // Only when it is moving towards him.
      if ((p.x - v.x) * v.vx + (p.z - v.z) * v.vz <= 0) continue;
      this.playerHitCooldown = 0.7;
      this.game.events.emit('player:hit', { x: v.x, z: v.z, power: Math.min(3, v.speed * D.playerHitPower) });
      break;
    }
  }
}
