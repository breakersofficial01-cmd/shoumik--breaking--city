// Gate rules of the cantonment (Roadmap 2 S8). Used only by ./index.js. Numbers: data/army.json → rules.
//
//   - Shoumik comes within warnMargin metres of the wall (or the gate) without a pass: the guards
//     shout a warning (speech bubble + toast). Once per visit.
//   - He is INSIDE the wall without a pass for graceSeconds: trespassArmy (1 star, economy.json);
//     the nearest guards come to arrest him. Staying inside with no stars: again after repeatSeconds.
//   - Visitor pass: on foot next to the guard post window, E buys one (৳ price) → he may walk and
//     drive inside for `seconds`. Not enough cash → the earn offer. Attacking the army cancels it.
// Riding / driving changes nothing (the Session 6 rule: vehicles never clear stars).

import { formatMoney } from '../../ui/i18n.js';

export class GateRules {
  /** @param {object} ctx { game, cfg (army.json), base, hooks: { warn(), trespass() } } */
  constructor(ctx) {
    this.ctx = ctx;
    this.R = ctx.cfg.rules;
    this.pass = 0;          // seconds of visitor pass left
    this.warned = false;
    this.inside = false;
    this.insideTime = 0;
    this.trespassed = false;
    this.promptOn = false;
    this.warnings = 0;      // for tools
    this.trespasses = 0;
  }

  get hasPass() { return this.pass > 0; }

  cancelPass() { this.pass = 0; }

  /** E pressed (the feature calls this only while our prompt shows). */
  buyPass() {
    const { game } = this.ctx;
    const P = this.R.pass;
    if (!game.economy.spend(P.price, 'army:pass')) {
      game.events.emit('toast:show', { key: 'army.pass.noCash', vars: { price: formatMoney(P.price) } });
      game.events.emit('earn:offer', { reason: 'money', need: P.price - game.save.data.cash, price: P.price });
      return false;
    }
    this.pass = P.seconds;
    this.warned = true;
    game.events.emit('toast:show', { key: 'army.pass.ok', vars: { minutes: Math.round(P.seconds / 60) } });
    return true;
  }

  prompt(on) {
    const { game } = this.ctx;
    if (on === this.promptOn) return;
    this.promptOn = on;
    if (on) {
      game.events.emit('prompt:show', { id: 'army', key: 'army.pass.buy', vars: { price: formatMoney(this.R.pass.price) } });
      game.transitPrompt = 'army';   // E belongs to us (the vehicles feature ignores it)
    } else {
      game.events.emit('prompt:hide', { id: 'army' });
      if (game.transitPrompt === 'army') game.transitPrompt = null;
    }
  }

  /** @param {{x:number, z:number}} pos  Shoumik (or his vehicle)  @param {number} stars */
  update(dt, pos, stars, alert) {
    const { game, base, hooks } = this.ctx;
    const R = this.R;
    const p = game.player;
    const inside = base.inside(pos.x, pos.z);
    const near = base.inside(pos.x, pos.z, R.warnMargin);
    if (this.pass > 0) {
      this.pass -= dt;
      if (this.pass <= 0 && inside) { game.events.emit('toast:show', { key: 'army.pass.expired' }); this.warned = false; }
    }
    // The pass window at the guard post.
    const post = base.gatePoints().post;
    const atPost = p.mode === 'onFoot' && !p.dead && Math.hypot(p.position.x - post.x, p.position.z - post.z) < R.pass.reach;
    this.prompt(atPost && !this.hasPass && stars === 0 && !alert);

    if (!near) { this.warned = false; this.insideTime = 0; this.trespassed = false; this.inside = false; return; }
    if (this.hasPass || alert) { this.inside = inside; return; }
    if (!this.warned) {
      this.warned = true;
      this.warnings++;
      hooks.warn();
    }
    this.inside = inside;
    if (!inside) { this.insideTime = 0; return; }
    this.insideTime += dt;
    const wait = this.trespassed ? R.repeatSeconds : R.graceSeconds;
    if (stars === 0 && this.insideTime >= wait) {
      this.insideTime = 0;
      this.trespassed = true;
      this.trespasses++;
      hooks.trespass();
    }
  }

  dispose() { this.prompt(false); }
}
