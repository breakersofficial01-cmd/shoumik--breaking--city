// Rider: Shoumik as a passenger (Roadmap 2 S6) — shared by the buses, metro and railway
// features. One ride at a time (game.ride holds the active one; features check it).
//
//   const rider = acquireRider(game)   ONE shared rider (one HUD) for all three features
//   rider.board(unit, seat, { kind, line: {bn, en}, icon, vehicle, onOff, onSkip })  sit down
//   rider.update(dt)            keep him on his seat, move the cabin + camera
//   rider.setNext(station, destination, note)   HUD: next stop (Bangla first, English second)
//   rider.leave({ x, z, heading })  step off (back on foot at that spot)
//
// While riding: game.player.mode = 'vehicle' (the player feature only animates him),
// game.player.vehicle = the bus (or null in a train: police then chase his position),
// wanted stars do not fade (wanted:hold { on: true }) and the 'sit' animation plays.
// Camera: 'inside' (from the back of the cabin, drag to look around) or 'outside' (chase cam
// behind the vehicle) — the 🎥 button / C toggles (data/transit.json → camera).
//
// Events sent: ride:boarded { kind, line }  ride:left { kind, line }  wanted:hold { on }
//              controls:mode { mode }  player:action { name: 'sit' }

import { t, pickName } from '../../ui/i18n.js';
import { makeCabinMeshes, placeCabinMesh, disposeCabinMeshes, toWorld } from './cabin.js';

const _p = {};
const _w = {};
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** "শাহবাগ · Shahbag" — Bangla first, English second (the owner's rule for ride HUDs). */
export function bothNames(name) {
  if (!name) return { bn: '—', en: '' };
  return { bn: name.bn || name.en || '', en: name.en || '' };
}

export class Rider {
  constructor(game) {
    this.game = game;
    this.hooks = {};
    this.cfg = game.config.get('transit');
    this.unit = null;
    this.view = this.cfg.camera.view;
    this.proxy = { position: { x: 0, y: 0, z: 0 }, heading: 0, speed: 0 };
    this.eye = { x: 0, y: 0, z: 0, heading: 0 };
    this.buildHud();
    this._key = (e) => {
      if (!this.unit || e.code !== 'KeyC' || e.target?.closest?.('input, textarea')) return;
      this.toggleView();
    };
    window.addEventListener('keydown', this._key);
  }

  get riding() { return !!this.unit; }

  buildHud() {
    const el = document.createElement('div');
    el.id = 'ride-hud';
    el.hidden = true;
    el.innerHTML = `
      <div class="rh-line"></div>
      <div class="rh-next"><span class="rh-label"></span> <b class="rh-bn"></b> <small class="rh-en"></small></div>
      <div class="rh-dest" hidden></div>
      <div class="rh-note" hidden></div>
      <div class="rh-btns">
        <button type="button" data-off></button>
        <button type="button" data-view></button>
        <button type="button" data-map></button>
        <button type="button" data-skip></button>
      </div>`;
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || !this.unit) return;
      if (b.dataset.off !== undefined) this.hooks.onOff?.();
      else if (b.dataset.view !== undefined) this.toggleView();
      else if (b.dataset.map !== undefined) this.game.events.emit('map:open');
      else if (b.dataset.skip !== undefined) this.hooks.onSkip?.();
    });
    this.game.ui.appendChild(el);
    this.hud = el;
    this.fadeEl = document.createElement('div');
    this.fadeEl.id = 'transit-fade';
    this.game.ui.appendChild(this.fadeEl);
  }

  /** Fade to black, run fn() in the dark, fade back in (getting on/off trains, skipping). */
  fadeThen(fn) {
    const ms = this.cfg.ride.fadeSeconds * 1000;
    this.fading = true;
    this.fadeEl.classList.add('on');
    setTimeout(() => {
      try { fn(); } finally {
        this.fadeEl.classList.remove('on');
        setTimeout(() => { this.fading = false; }, ms);
      }
    }, ms);
  }

  relabel() {
    const q = (s) => this.hud.querySelector(s);
    q('[data-off]').textContent = t(this.offQueued ? 'transit.offQueued' : 'transit.off');
    q('[data-view]').textContent = `🎥 ${t(this.view === 'inside' ? 'transit.viewOutside' : 'transit.viewInside')}`;
    q('[data-map]').textContent = `🗺 ${t('transit.pickStop')}`;
    q('[data-skip]').textContent = `⏩ ${t('transit.skip')}`;
    q('.rh-label').textContent = t('transit.next');
  }

  /** Sit down on `seat` of `unit`. */
  board(unit, seat, o) {
    const g = this.game;
    const player = g.player;
    this.unit = unit;
    this.seat = seat;
    this.kind = o.kind;
    this.line = o.line;
    this.hooks = { onOff: o.onOff, onSkip: o.onSkip };
    this.offQueued = false;
    player.mode = 'vehicle';
    player.vehicle = o.vehicle || null;
    player.velocity.x = player.velocity.y = player.velocity.z = 0;
    player.grounded = true;
    player.speed = 0;
    if (player.model) player.model.visible = true;
    g.events.emit('player:action', { name: 'sit' });
    g.events.emit('controls:mode', { mode: 'driving' });
    g.events.emit('wanted:hold', { on: true });
    this.cabin = makeCabinMeshes(unit.cabin);
    g.scene.add(this.cabin);
    g.ride = this;
    this.hud.querySelector('.rh-line').textContent = `${o.icon || ''} ${pickName(o.line)}`;
    this.hud.hidden = false;
    this.setNext(null, null, null);
    this.update(0);
    this.applyView(true);
    g.events.emit('ride:boarded', { kind: this.kind, line: pickName(this.line) });
  }

  toggleView() {
    this.view = this.view === 'inside' ? 'outside' : 'inside';
    this.applyView(true);
  }

  applyView(snap) {
    const rig = this.game.cameraRig;
    if (this.view === 'inside') {
      rig.setInside(this.eye, { yaw: this.cfg.camera.lookYaw, pitch: this.cfg.camera.lookPitch });
    } else {
      rig.setInside(null);
      rig.setTarget(this.proxy, 'driving', snap, this.cfg.camera.outsideScale[this.kind] || 1.5);
    }
    this.relabel();
  }

  /** HUD: the next stop, the picked destination (if any) and a short note. */
  setNext(next, dest, noteKey, vars) {
    const n = bothNames(next);
    this.hud.querySelector('.rh-bn').textContent = n.bn;
    this.hud.querySelector('.rh-en').textContent = n.en;
    const d = this.hud.querySelector('.rh-dest');
    d.hidden = !dest;
    if (dest) { const b = bothNames(dest); d.textContent = `🧭 ${t('transit.dest')} ${b.bn} · ${b.en}`; }
    const note = this.hud.querySelector('.rh-note');
    note.hidden = !noteKey;
    if (noteKey) note.textContent = t(noteKey, vars);
    this.nextName = next;
    this.destName = dest;
  }

  queueOff(on = true) {
    this.offQueued = on;
    this.relabel();
  }

  update(dt) {
    const u = this.unit;
    if (!u) return;
    const pose = u.pose(_p);
    const p = this.game.player;
    toWorld(pose, this.seat.x, u.cabin.floor, this.seat.z, _w);
    p.position.x = _w.x; p.position.y = _w.y; p.position.z = _w.z;
    p.heading = wrap(pose.heading + (this.seat.heading || 0));
    p.speed = 0;
    placeCabinMesh(this.cabin, pose);
    // Inside a bus: hide its outer model (the real bus model is not hollow and would hide the
    // cabin); same for the train car he sits in. The fleet shows a bus again by itself; a car
    // mesh is shown again in leave(). Runs after the fleet / train update.
    const shell = u.mesh || u.vehicle?.mesh; // a train car's mesh / the bus
    if (shell) shell.visible = this.view !== 'inside';
    // Outside camera: follow the vehicle (a point above its middle).
    const forward = u.forward ? u.forward() : pose.heading;
    this.proxy.position.x = pose.x; this.proxy.position.y = pose.y + (u.cabin.floor || 0); this.proxy.position.z = pose.z;
    this.proxy.heading = forward;
    this.proxy.speed = u.speed ? u.speed() : 0;
    // Inside camera: from the back wall (the back = against the direction of travel).
    const back = wrap(forward - pose.heading) > Math.PI / 2 || wrap(forward - pose.heading) < -Math.PI / 2 ? -1 : 1;
    const e = u.cabin.eye;
    toWorld(pose, e.x, e.y, e.z * back, this.eye);
    this.eye.heading = forward;
  }

  /** Step off at { x, z, heading } (on foot again). */
  leave(at) {
    const g = this.game;
    if (!this.unit) return;
    const player = g.player;
    if (this.unit.mesh) this.unit.mesh.visible = true;
    this.unit = null;
    g.ride = null;
    g.cameraRig.setInside(null);
    disposeCabinMeshes(this.cabin);
    this.cabin = null;
    this.hud.hidden = true;
    player.mode = 'onFoot';
    player.vehicle = null;
    g.events.emit('player:action', { name: 'sit', on: false });
    g.events.emit('controls:mode', { mode: 'onFoot' });
    g.events.emit('wanted:hold', { on: false });
    g.events.emit('player:teleport', { x: at.x, z: at.z, heading: at.heading || 0 });
    g.events.emit('ride:left', { kind: this.kind, line: pickName(this.line) });
  }

  dispose() {
    if (this.unit) this.leave({ x: this.game.player.position.x, z: this.game.player.position.z });
    window.removeEventListener('keydown', this._key);
    this.hud.remove();
    this.fadeEl.remove();
    if (this.game.rider === this) this.game.rider = null;
  }
}

/** The one shared rider (made on first use). */
export function acquireRider(game) {
  if (!game.rider) game.rider = new Rider(game);
  return game.rider;
}
