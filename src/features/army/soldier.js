// One soldier (Roadmap 2 S8). Plain olive uniform, cap, vest and rifle — no badges or insignia.
// The fighting brain is the police Officer (src/features/police/officers.js: chase, keep a
// distance and shoot, baton/arrest up close, down, dead, retreat); soldiers add two calm states:
//   guard   stand at a post facing out (gate guards, inside guards); turn towards a trespasser
//   patrol  walk a route back and forth (data/army.json → routes.patrols)
// The feature switches them to 'chase' (stars: arrest at 1 star, shoot at the army level) and
// back to their post with goHome() when the chase is over.
// Shootable through game.targets as kind 'soldier' (NOT police: hurting one is attackArmy).

import { Officer } from '../police/officers.js';

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class Soldier extends Officer {
  /**
   * @param {object} ctx   like the police ctx, with cfg = { officer: army soldier numbers, archetypes }
   * @param {object} job   { kind: 'guard', x, z, heading } | { kind: 'patrol', route: [{x, z}, …] } | { kind: 'hunt' }
   */
  constructor(ctx, job, x, z) {
    super(ctx, 'soldier', x, z, false);
    this.job = job;
    this.life = ctx.cfg.officer.life;
    this.target.kind = 'soldier';
    this.target.police = false;
    this.target.army = true;
    this.leg = 0;          // patrol: index of the point walked to
    this.dir = 1;
    this.home = job.kind === 'patrol' ? job.route[0] : job.kind === 'guard' ? { x: job.x, z: job.z } : null;
    if (job.kind === 'hunt') { this.state = 'chase'; this.armed = true; }
    else {
      this.state = job.kind;   // 'guard' | 'patrol'
      this.heading = job.heading ?? 0;
    }
  }

  get calm() { return this.state === 'guard' || this.state === 'patrol' || this.state === 'home'; }
  /** Bubbles stay up while he is on his feet (Officer: only while chasing). */
  get active() { return this.state !== 'dead' && this.state !== 'down'; }

  /** Start chasing him (armed = shoot, else come close and arrest). */
  engage(armed) {
    if (this.state === 'dead') return;
    if (this.state !== 'down') this.state = 'chase';
    this.armed = !!armed;
  }

  /** The chase is over: walk back to the post / route. Hunters (sent at the army level) leave. */
  goHome() {
    if (this.state === 'dead') return;
    if (!this.home) { this.retreat(); return; }
    this.animator.stop();
    this.state = 'home';
    this.armed = false;
  }

  onHit(info) {
    const r = super.onHit(info);
    if (r && info.by === 'player') this.ctx.hooks.attacked?.(this, r === 'killed');
    return r;
  }

  update(dt) {
    if (!this.calm) { super.update(dt); return; }
    const { game } = this.ctx;
    const O = this.ctx.cfg.officer;
    const p = game.player;
    const pos = p.vehicle && p.mode !== 'onFoot' ? p.vehicle : p.position;
    this.dist = Math.hypot(pos.x - this.x, pos.z - this.z);
    this.age += dt;
    if (this.state === 'guard') {
      this.speed = 0;
      // Face out (the post's heading), or the trespasser while he is close.
      const want = this.watching ? Math.atan2(pos.x - this.x, pos.z - this.z) : this.job.heading;
      this.heading = wrapAngle(this.heading + wrapAngle(want - this.heading) * Math.min(1, 4 * dt));
      if (Math.hypot(this.x - this.home.x, this.z - this.home.z) > 0.6) this.state = 'home';
    } else if (this.state === 'patrol') {
      const R = this.job.route;
      const t = R[this.leg];
      const dx = t.x - this.x, dz = t.z - this.z;
      if (Math.hypot(dx, dz) < 0.8) {
        if (this.leg + this.dir < 0 || this.leg + this.dir >= R.length) this.dir = -this.dir;
        this.leg += this.dir;
      } else this.step(dx, dz, O.walkSpeed, dt);
    } else if (this.state === 'home') {
      const t = this.home;
      const dx = t.x - this.x, dz = t.z - this.z;
      if (Math.hypot(dx, dz) < 0.7) { this.state = this.job.kind; this.leg = 0; this.dir = 1; this.speed = 0; }
      else this.step(dx, dz, O.walkSpeed * 1.6, dt);
    }
    this.draw(dt);
  }

  /** Same drawing as Officer.update's tail (ground height, circle, target, crowd person). */
  draw(dt) {
    const game = this.ctx.game;
    const ground = game.world.heightAt(this.x, this.z);
    this.y += (ground - this.y) * Math.min(1, 14 * dt);
    this.circle.x = this.x; this.circle.z = this.z;
    this.circle.r = 0.38;
    this.target.x = this.x; this.target.y = this.y; this.target.z = this.z;
    this.animator.update(dt, { speed: this.speed });
    const person = this.person;
    person.x = this.x; person.y = this.y; person.z = this.z;
    person.heading = this.heading;
    person.groundY = ground;
    person.far = this.dist > game.quality.pedLodDistance;
  }
}
