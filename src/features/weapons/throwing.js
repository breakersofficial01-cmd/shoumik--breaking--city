// Things that fly: molotovs, grenades (Roadmap 2 S2) and grenade-launcher shells.
// Used only by ./index.js. Numbers: data/weapons.json (molotov, grenade, launcher entries).
//
//   molotov  → breaks where it lands and leaves a fire that burns for a few seconds
//              (hurts targets inside: onHit kind 'fire', Shoumik: player:damage, vehicles burn)
//   grenade  → bounces to a stop and explodes `fuse` seconds after the throw
//   launcher → a flatter, faster shell that explodes as soon as it hits anything (fuse 0)
// An explosion sends `explosion { x, z, radius, power, by: 'player' }` (people, police and
// Shoumik react to it), hurts and throws vehicles (fleet.blast) and is a crime ('explosion').
// Other events: danger:raised, crime:committed { type: 'molotov' | 'explosion' }, combat:hit.

const GRAVITY = 16;
const TICK = 0.25;          // fire damage is dealt this often (seconds)

export class Molotovs {
  constructor(game, fx, models) {
    this.game = game;
    this.fx = fx;
    this.models = models;
    this.bottles = [];       // { mesh, x, y, z, vx, vy, vz, w, fuse, resting }
    this.fires = [];         // { x, z, r, t, life, tick, w }
    this.near = [];
  }

  /** Throw from (x, y, z) so that it lands near (tx, tz). */
  throw(w, x, y, z, tx, tz) {
    const dist = Math.min(w.range, Math.hypot(tx - x, tz - z));
    const time = Math.max(0.45, dist / w.throwSpeed);
    const dir = Math.atan2(tx - x, tz - z);
    const flat = dist / time;
    // Fly up and come down at the ground after `time` seconds.
    const ground = this.game.world.heightAt(x + Math.sin(dir) * dist, z + Math.cos(dir) * dist);
    const vy = ((ground - y) + 0.5 * GRAVITY * time * time) / time;
    this.add(w, x, y, z, Math.sin(dir) * flat, vy, Math.cos(dir) * flat);
  }

  /** Grenade launcher: fire a shell along (dx, dy, dz) at w.throwSpeed (it drops a little). */
  launch(w, x, y, z, dx, dy, dz) {
    const s = w.throwSpeed;
    this.add(w, x, y, z, dx * s, dy * s + 1.5, dz * s);
  }

  async add(w, x, y, z, vx, vy, vz) {
    const b = { mesh: null, x, y, z, vx, vy, vz, w, spin: 0, fuse: w.fuse ?? 0, resting: false };
    this.bottles.push(b);
    const mesh = await this.models.bottle(w.build === 'molotov' ? 'molotov' : 'grenade');
    if (mesh && this.bottles.includes(b)) {
      b.mesh = mesh;
      this.game.scene.add(mesh);
    }
  }

  /** Molotov: a pool of fire. */
  burst(b) {
    const game = this.game;
    const w = b.w;
    this.fires.push({ x: b.x, z: b.z, r: w.fireRadius, t: 0, life: w.fireSeconds, tick: 0, w });
    for (let i = 0; i < 14; i++) this.fx.fire(b.x, game.world.heightAt(b.x, b.z) + 0.2, b.z, w.fireRadius * 0.8);
    game.events.emit('danger:raised', { x: b.x, z: b.z, radius: w.noise, source: 'player' });
    game.events.emit('crime:committed', { type: 'molotov', x: b.x, z: b.z });
  }

  /** Grenade / shell: one big explosion. */
  explode(b) {
    const game = this.game;
    const w = b.w;
    const y = Math.max(b.y, game.world.heightAt(b.x, b.z));
    game.fleet?.blast(b.x, y, b.z, w.blastRadius, w.blastVehicleDamage, 'player');
    if (!game.fleet) for (let i = 0; i < 10; i++) this.fx.fire(b.x, y + 0.3, b.z, w.blastRadius * 0.5);
    game.events.emit('explosion', { x: b.x, z: b.z, radius: w.blastRadius, power: 1, by: 'player' });
    game.events.emit('danger:raised', { x: b.x, z: b.z, radius: w.noise, source: 'explosion' });
    game.events.emit('crime:committed', { type: 'explosion', x: b.x, z: b.z });
  }

  /** Has a flying shell touched a vehicle or a person? (launcher shells explode on contact) */
  touching(b) {
    const game = this.game;
    const v = game.fleet?.nearest(b.x, b.z, 0.6, (x) => x.state !== 'wreck' && x !== game.player.vehicle);
    if (v && b.y < v.y + v.T.size[2] + 0.3) return true;
    return game.targets.within(b.x, b.z, 0.7, this.near).some((t) => !t.isPlayer && b.y < t.y + (t.h || 1.8));
  }

  done(b) {
    this.bottles.splice(this.bottles.indexOf(b), 1);
    b.mesh?.removeFromParent();
    if (b.w.blastRadius) this.explode(b);
    else this.burst(b);
  }

  update(dt) {
    const game = this.game;
    const col = game.world.collision;
    for (const b of [...this.bottles]) {
      const timed = b.w.blastRadius && b.w.fuse > 0;
      if (timed) {
        b.fuse -= dt;
        if (b.fuse <= 0) { this.done(b); continue; }
      }
      if (b.resting) continue; // a grenade on the ground, waiting for its fuse
      b.vy -= GRAVITY * dt;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      b.spin += dt * 12;
      if (b.mesh) { b.mesh.position.set(b.x, b.y, b.z); b.mesh.rotation.set(0, Math.atan2(b.vx, b.vz) - Math.PI / 2, b.spin); }
      const ground = game.world.heightAt(b.x, b.z);
      const hitWall = col.isBlocked(b.x, b.z, 0.15) && b.y < ground + 6;
      const landed = b.y <= ground + 0.05;
      if (!timed && b.w.blastRadius && this.touching(b)) { this.done(b); continue; }
      if (!landed && !hitWall) continue;
      if (hitWall) { b.x -= b.vx * dt * 2; b.z -= b.vz * dt * 2; }
      if (timed) {
        // Bounce once or twice, then lie still until the fuse runs out.
        b.y = ground + 0.08;
        b.vx *= hitWall ? -0.3 : 0.4; b.vz *= hitWall ? -0.3 : 0.4; b.vy = Math.abs(b.vy) * 0.3;
        if (Math.hypot(b.vx, b.vz) < 1.2) { b.resting = true; b.mesh?.position.set(b.x, b.y, b.z); }
        continue;
      }
      this.done(b);
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
