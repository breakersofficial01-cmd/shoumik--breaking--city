// One police officer on foot (blue uniform) or of the black-uniform unit ("swat"). Used only by
// ./index.js, which spawns, removes and counts them. Numbers: data/police.json → officer.
//
// States: chase   run after Shoumik; armed officers stop at a distance and shoot when they see
//                 him, unarmed ones (1 star) come close, hit with the baton and arrest
//         down    knocked over (punch, bat, car), gets up after a while
//         dead    killed — lies in a blood pool until the feature clears him
//         retreat the chase is over: walk away and disappear
// Drawn by the shared crowd (entities/people/crowd.js); shootable through game.targets.

import { Animator } from '../../entities/people/animator.js';
import { buildLook } from '../../entities/people/looks.js';

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class Officer {
  /**
   * @param {object} ctx  { game, cfg (police.json), combat (combat.json), rng, crowd, palettes, fx, hooks }
   *   hooks: { shoot(officer), hitPlayer(officer), killed(officer, by), say(officer, kind) }
   * @param {'police'|'swat'} kind
   */
  constructor(ctx, kind, x, z, armed) {
    const { game, cfg, combat, rng, crowd, palettes } = ctx;
    this.ctx = ctx;
    this.kind = kind;
    this.armed = armed || kind === 'swat';
    this.x = x; this.z = z;
    this.y = game.world.heightAt(x, z);
    this.heading = 0;
    this.speed = 0;
    this.state = 'chase';
    this.timer = 0;
    this.life = kind === 'swat' ? combat.people.swatLife : combat.people.policeLife;
    this.hp = 2;                  // punches before he goes down
    this.fireIn = rng.range(0.6, 1.4);
    this.meleeIn = 0.5;
    this.hitIn = -1;
    this.sees = false;            // set by the feature (line of sight check, a few times a second)
    this.stuck = 0; this.markX = x; this.markZ = z; this.detour = 0; this.detourTime = 0;
    this.age = 0;
    const arch = cfg.archetypes[kind];
    const look = buildLook(arch, palettes, rng);
    this.animator = new Animator(look.dims);
    this.animator.configure({ idle: 'guard', stride: 1, runAt: 5 });
    this.person = crowd.add(look, this.animator.pose);
    this.circle = { x, z, r: combat.people.bodyRadius, owner: this };
    game.world.collision.dynamic.add(this.circle);
    this.target = game.targets.add({
      kind: 'police', police: true, x, y: this.y, z, r: combat.people.bodyRadius, h: combat.people.bodyHeight,
      owner: this, priority: 0.1, onHit: (info) => this.onHit(info),
    });
  }

  get alive() { return this.state !== 'dead'; }
  get active() { return this.state === 'chase'; }

  remove() {
    const g = this.ctx.game;
    this.ctx.crowd.remove(this.person);
    g.world.collision.dynamic.delete(this.circle);
    g.targets.remove(this.target);
    this.removed = true;
  }

  /** Hurt by a bullet / fire / blast / swing. Returns 'killed' or 'hit'. */
  onHit(info) {
    if (this.state === 'dead') return null;
    const fx = this.ctx.fx;
    this.life -= info.damage || 0;
    if (info.kind === 'melee' && info.damage) fx.blood(this.x, this.y + 1.2, this.z, info.dirX || 0, info.dirZ || 0);
    if (this.life <= 0) { this.die(info.by, info.dirX, info.dirZ); return 'killed'; }
    if (info.knockDown) this.knockDown();
    else if (this.state === 'chase') this.animator.play('hit');
    this.ctx.hooks.say(this, 'pain');
    return 'hit';
  }

  knockDown() {
    if (this.state === 'dead') return;
    this.state = 'down';
    this.timer = this.ctx.rng.range(...this.ctx.cfg.officer.downSeconds);
    this.speed = 0;
    this.animator.play('down');
  }

  die(by, dirX = 0, dirZ = 0) {
    this.state = 'dead';
    this.timer = this.ctx.combat.people.deadSeconds;
    this.target.dead = true;
    this.circle.r = 0;
    this.speed = 0;
    this.animator.play('down');
    this.ctx.fx.pool(this.x + dirX * 0.5, this.z + dirZ * 0.5);
    this.ctx.hooks.killed(this, by);
  }

  retreat() {
    if (this.state === 'chase' || this.state === 'down') {
      this.state = 'retreat';
      this.timer = 12;
      this.animator.stop();
    }
  }

  /** Turn towards (dx, dz) and move at speed; slides along walls and goes round people. */
  step(dx, dz, speed, dt) {
    const g = this.ctx.game;
    const len = Math.hypot(dx, dz);
    if (len < 1e-3 || speed <= 0) { this.speed = 0; return; }
    let want = Math.atan2(dx, dz);
    if (this.detourTime > 0) { this.detourTime -= dt; want += this.detour; }
    this.heading = wrapAngle(this.heading + wrapAngle(want - this.heading) * Math.min(1, 10 * dt));
    const bx = this.x, bz = this.z;
    const d = Math.min(len, speed * dt);
    this.x += Math.sin(want) * d;
    this.z += Math.cos(want) * d;
    g.world.collision.resolveCircle(this, this.circle.r || 0.38);
    g.world.collision.resolveDynamic(this, 0.38, this);
    g.world.collision.resolveCircle(this, 0.38);
    this.speed = dt > 0 ? Math.hypot(this.x - bx, this.z - bz) / dt : 0;
    // Stuck behind a wall or a car: walk off at an angle for a moment.
    this.stuck += dt;
    if (this.stuck > this.ctx.cfg.officer.stuckSeconds) {
      if (Math.hypot(this.x - this.markX, this.z - this.markZ) < 0.6) {
        this.detour = (this.ctx.rng.chance(0.5) ? 1 : -1) * this.ctx.rng.range(1.1, 1.7);
        this.detourTime = 1.1;
      }
      this.stuck = 0; this.markX = this.x; this.markZ = this.z;
    }
  }

  face(dx, dz, dt) {
    this.heading = wrapAngle(this.heading + wrapAngle(Math.atan2(dx, dz) - this.heading) * Math.min(1, 12 * dt));
  }

  update(dt) {
    const { game, cfg, rng } = this.ctx;
    const O = cfg.officer;
    const p = game.player;
    this.age += dt;
    this.timer -= dt;
    const pos = p.vehicle && p.mode !== 'onFoot' ? p.vehicle : p.position;
    const dx = pos.x - this.x, dz = pos.z - this.z;
    const dist = Math.hypot(dx, dz);
    this.dist = dist;

    switch (this.state) {
      case 'dead':
      case 'down':
        this.speed = 0;
        if (this.state === 'down' && this.timer <= 0) { this.animator.stop('down'); this.state = 'chase'; this.hp = 2; }
        break;
      case 'retreat':
        this.step(-dx, -dz, O.walkSpeed * 2, dt);
        break;
      default: {
        if (p.dead || p.frozen) { this.speed = 0; this.face(dx, dz, dt); break; }
        const canShoot = this.armed && this.sees && dist < O.shootRange;
        if (canShoot) {
          // Keep a distance and shoot.
          if (dist > O.keepDistance + 3) this.step(dx, dz, O.runSpeed * 0.55, dt);
          else this.speed = 0;
          this.face(dx, dz, dt);
          if (this.animator.current !== 'aim' && this.animator.current !== 'shoot' && this.animator.current !== 'hit') this.animator.play('aim');
          this.fireIn -= dt;
          if (this.fireIn <= 0) {
            this.fireIn = rng.range(...(this.kind === 'swat' ? O.swatFireEvery : O.fireEvery));
            this.animator.play('shoot');
            this.ctx.hooks.shoot(this);
          }
        } else if (dist > O.arrestReach) {
          if (this.animator.current === 'aim' || this.animator.current === 'shoot') this.animator.stop();
          this.step(dx, dz, O.runSpeed, dt);
          if (dist < 14 && rng.chance(dt * 0.15)) this.ctx.hooks.say(this, 'chase');
        } else {
          // Close: baton hits while the arrest happens (the feature counts the arrest time).
          this.speed = 0;
          this.face(dx, dz, dt);
          this.meleeIn -= dt;
          if (this.meleeIn <= 0 && p.mode === 'onFoot') {
            this.meleeIn = rng.range(...O.meleeEvery);
            this.animator.play('punch', { side: rng.chance(0.5) ? 1 : -1 });
            this.hitIn = 0.15;
          }
        }
        if (this.hitIn >= 0) {
          this.hitIn -= dt;
          if (this.hitIn < 0 && dist < O.arrestReach + 0.4) this.ctx.hooks.hitPlayer(this);
        }
      }
    }

    // Draw.
    const ground = game.world.heightAt(this.x, this.z);
    this.y += (ground - this.y) * Math.min(1, 14 * dt);
    this.circle.x = this.x; this.circle.z = this.z;
    this.circle.r = this.state === 'chase' || this.state === 'retreat' ? 0.38 : 0;
    this.target.x = this.x; this.target.y = this.y; this.target.z = this.z;
    this.animator.update(dt, { speed: this.speed });
    const person = this.person;
    person.x = this.x; person.y = this.y; person.z = this.z;
    person.heading = this.heading;
    person.groundY = ground;
    person.far = dist > game.quality.pedLodDistance;
  }
}
