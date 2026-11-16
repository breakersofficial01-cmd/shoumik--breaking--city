// Player actions: everything Shoumik does besides moving — punching, dancing, being hit,
// the animations other features ask for, and changing outfit.
// Used only by ./index.js. Other features talk to it through events:
//
//   listens  player:action { name, on?, side?, beat?, variant?, duration? }
//                play (on !== false) or stop any animation from animActions.js, e.g.
//                { name: 'dance', beat: fn } · { name: 'aim' } · { name: 'aim', on: false }
//                { name: 'enterVehicle', side: -1 } · { name: 'shoot' } · { name: 'melee' }
//            player:hit { x, z, power }       somebody hit him from (x, z)
//            outfit:set { id }                 wear an outfit from data/outfits.json
//   sends    player:attack { x, z, heading, range, arc, kind, power }   when a punch lands
//            player:actionChanged { name, on }
//            outfit:changed { id }

import { debug, log } from '../../core/debug.js';
import { ACTIONS } from '../../entities/people/animActions.js';

export class PlayerActions {
  constructor(game, cfg, state, animator, view) {
    this.game = game;
    this.cfg = cfg;
    this.state = state;
    this.animator = animator;
    this.view = view;                 // { setOutfit(outfit) }
    this.punchSide = 1;
    this.pendingHit = -1;             // seconds until the current punch lands (-1 = none)
    this.lastAction = null;
    this.outfits = game.config.get('outfits');
    const e = game.events;
    this.offs = [
      e.on('player:action', (p) => this.onAction(p || {})),
      e.on('player:hit', (p) => this.onHit(p || {})),
      e.on('outfit:set', ({ id }) => this.setOutfit(id)),
    ];
    if (debug.enabled) this.bindDebugKeys();
  }

  // ---- outfits
  outfitById(id) {
    return this.outfits.outfits.find((o) => o.id === id) || null;
  }

  /** The saved outfit if it is still valid, else the default one. */
  startOutfit() {
    return this.outfitById(this.game.save.data.outfit) || this.outfitById(this.outfits.default) || this.outfits.outfits[0];
  }

  setOutfit(id) {
    const outfit = this.outfitById(id);
    if (!outfit) return log.warn(`unknown outfit "${id}"`);
    if (outfit.unlocked !== true && !this.game.save.data.owned.outfits.includes(id)) return log.info(`outfit "${id}" is not owned yet`);
    this.view.setOutfit(outfit);
    this.state.outfit = id;
    this.game.save.data.outfit = id;
    this.game.events.emit('outfit:changed', { id });
  }

  // ---- animations asked for by events
  onAction(p) {
    if (!ACTIONS[p.name]) return log.warn(`player:action — unknown animation "${p.name}"`);
    if (p.on === false) this.animator.stop(p.name);
    else this.animator.play(p.name, p);
  }

  onHit({ x, z, power = 1 }) {
    const s = this.state;
    if (s.mode !== 'onFoot') return; // safe inside a vehicle (health arrives in Session 6)
    const dx = s.position.x - x, dz = s.position.z - z;
    const len = Math.hypot(dx, dz) || 1;
    const k = this.cfg.actions.hit.knockback * power;
    s.velocity.x += (dx / len) * k;
    s.velocity.z += (dz / len) * k;
    this.pendingHit = -1;
    this.animator.play('hit', { duration: this.cfg.actions.hit.duration });
  }

  /** True while an animation that freezes the stick is running. */
  get locked() {
    return this.cfg.actions.lockMovement.includes(this.animator.current);
  }

  /** How much of the normal speed he may use right now (slower while punching). */
  get moveFactor() {
    return this.animator.current === 'punch' ? this.cfg.actions.punch.moveFactor : 1;
  }

  update(dt, input, wantsToMove) {
    const a = this.animator;
    const s = this.state;
    const punch = this.cfg.actions.punch;
    if (wantsToMove && this.cfg.actions.cancelOnMove.includes(a.current)) a.stop();

    // Fists: the attack button throws alternating punches.
    if (input.pressed.attack && s.grounded && !this.locked && a.current !== 'punch' && a.current !== 'hit') {
      this.punchSide = -this.punchSide;
      a.play('punch', { side: this.punchSide, duration: punch.duration, mask: s.speed > 1 ? 'upper' : 'full' });
      this.pendingHit = punch.hitAt;
    }
    if (this.pendingHit >= 0) {
      this.pendingHit -= dt;
      if (this.pendingHit < 0 && a.current === 'punch') {
        this.game.events.emit('player:attack', {
          x: s.position.x, z: s.position.z, heading: s.heading,
          range: punch.range, arc: (punch.arcDegrees * Math.PI) / 180, kind: 'fists', power: punch.power,
        });
      }
    }

    const now = a.current;
    if (now !== this.lastAction) {
      if (this.lastAction) this.game.events.emit('player:actionChanged', { name: this.lastAction, on: false });
      if (now) this.game.events.emit('player:actionChanged', { name: now, on: true });
      this.lastAction = now;
      s.action = now;
    }
  }

  /** ?debug=1 only: number keys preview animations (data/player.json → debugAnimKeys). */
  bindDebugKeys() {
    const keys = this.cfg.debugAnimKeys || {};
    this.onKey = (e) => {
      const name = keys[e.code];
      if (!name || e.repeat) return;
      const looping = ACTIONS[name].duration == null || ACTIONS[name].hold;
      this.onAction({ name, on: !(looping && this.animator.current === name) });
    };
    window.addEventListener('keydown', this.onKey);
  }

  dispose() {
    this.offs.forEach((off) => off());
    if (this.onKey) window.removeEventListener('keydown', this.onKey);
  }
}
