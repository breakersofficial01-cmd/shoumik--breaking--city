// Molotovs: a bottle flies in an arc, breaks where it lands and leaves a fire that burns for
// a few seconds. Used only by ./index.js. Numbers: data/weapons.json → the molotov entry.
//
// The fire hurts every target inside it (onHit kind 'fire'), Shoumik himself (player:damage),
// and sets vehicles alight (fleet.damage). Events sent: danger:raised, crime:committed
// { type: 'molotov' }, combat:hit.

const GRAVITY = 16;
const TICK = 0.25;          // fire damage is dealt this often (seconds)

export class Molotovs {
  constructor(game, fx, models) {
    this.game = game;
    this.fx = fx;
    this.models = models;
    this.bottles = [];       // { mesh, x, y, z, vx, vy, vz, w }
    this.fires = [];         // { x, z, r, t, life, tick, w }
    this.near = [];
  }

  /** Throw from (x, y, z) so that it lands near (tx, tz). */
  async throw(w, x, y, z, tx, tz) {
    const dist = Math.min(w.range, Math.hypot(tx - x, tz - z));
    const time = Math.max(0.45, dist / w.throwSpeed);
    const dir = Math.atan2(tx - x, tz - z);
    const flat = dist / time;
    // Fly up and come down at the ground after `time` seconds.
    const ground = this.game.world.heightAt(x + Math.sin(dir) * dist, z + Math.cos(dir) * dist);
    const vy = ((ground - y) + 0.5 * GRAVITY * time * time) / time;
    const b = { mesh: null, x, y, z, vx: Math.sin(dir) * flat, vy, vz: Math.cos(dir) * flat, w, spin: 0 };
    this.bottles.push(b);
    const mesh = await this.models.bottle();
    if (mesh && this.bottles.includes(b)) {
      b.mesh = mesh;
      this.game.scene.add(mesh);
    }
  }

  burst(b) {
    const game = this.game;
    const w = b.w;
    this.fires.push({ x: b.x, z: b.z, r: w.fireRadius, t: 0, life: w.fireSeconds, tick: 0, w });
    for (let i = 0; i < 14; i++) this.fx.fire(b.x, game.world.heightAt(b.x, b.z) + 0.2, b.z, w.fireRadius * 0.8);
    game.events.emit('danger:raised', { x: b.x, z: b.z, radius: w.noise, source: 'player' });
    game.events.emit('crime:committed', { type: 'molotov', x: b.x, z: b.z });
  }

  update(dt) {
    const game = this.game;
    const col = game.world.collision;
    for (const b of [...this.bottles]) {
      b.vy -= GRAVITY * dt;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      b.spin += dt * 12;
      if (b.mesh) { b.mesh.position.set(b.x, b.y, b.z); b.mesh.rotation.set(0, Math.atan2(b.vx, b.vz) - Math.PI / 2, b.spin); }
      const hitWall = col.isBlocked(b.x, b.z, 0.15) && b.y < game.world.heightAt(b.x, b.z) + 6;
      if (b.y <= game.world.heightAt(b.x, b.z) + 0.05 || hitWall) {
        if (hitWall) { b.x -= b.vx * dt * 2; b.z -= b.vz * dt * 2; }
        this.bottles.splice(this.bottles.indexOf(b), 1);
        b.mesh?.removeFromParent();
        this.burst(b);
      }
    }

    for (const f of [...this.fires]) {
      f.t += dt;
      if (f.t >= f.life) { this.fires.splice(this.fires.indexOf(f), 1); continue; }
      const y = game.world.heightAt(f.x, f.z) + 0.1;
      if (Math.random() < dt * 30) this.fx.fire(f.x, y, f.z, f.r * 1.2);
      f.tick -= dt;
      if (f.tick > 0) continue;
      f.tick = TICK;
      const w = f.w;
      for (const t of game.targets.within(f.x, f.z, f.r, this.near)) {
        const killed = t.onHit({ damage: w.fireDamagePerSecond * TICK, weapon: w.id, kind: 'fire', by: 'player', x: f.x, z: f.z, dirX: 0, dirZ: 0 }) === 'killed';
        game.events.emit('combat:hit', { kind: t.kind, by: 'player', police: !!t.police, killed });
      }
      const p = game.player;
      if (p && p.mode === 'onFoot' && Math.hypot(p.position.x - f.x, p.position.z - f.z) < f.r) {
        game.events.emit('player:damage', { amount: game.config.get('combat').player.fireDamagePerSecond * TICK, by: 'fire' });
      }
      for (const v of game.fleet?.vehicles || []) {
        if (v.state === 'wreck' || Math.hypot(v.x - f.x, v.z - f.z) > f.r + v.reach * 0.5) continue;
        v.tags.lastHitBy = 'player';
        game.fleet.damage(v, w.vehicleDamagePerSecond * TICK);
      }
    }
  }

  dispose() {
    for (const b of this.bottles) b.mesh?.removeFromParent();
    this.bottles = [];
    this.fires = [];
  }
}
