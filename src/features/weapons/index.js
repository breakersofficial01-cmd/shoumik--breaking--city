// Feature: weapons (Session 6). Shoumik's weapons: fists, cricket bat, machete, guns and
// molotovs. Which ones he owns comes from the weapon shop (save.data.owned.weapons); bullets
// are in save.data.ammo. Numbers and models: data/weapons.json.
//
// Controls: Q / অস্ত্র button = next weapon, click / আঘাত = attack. Guns:
//   desktop  free aim — bullets go to the crosshair in the middle of the screen; hold the
//            right mouse button for the closer over-the-shoulder view
//   phones   aim assist — the gun locks on to the best target in front (red ring)
//
//   ./firing.js   bullets   ./throwing.js   molotovs   ./models.js   models   ./hud.js   badge, crosshair
//
// Events
//   listens  input:weapon, weapon:owned { id } (shop: a new weapon → its starting ammo),
//            weapon:ammo { id, amount } (shop: an ammo box), weapons:lose {} (wasted),
//            vehicle:entered / vehicle:exited (weapon hidden while in a vehicle)
//   sends    weapon:changed { id, ammo }   weapon:fired { id, x, z }   weapon:empty { id } (Session 9: no bullets left)   player:action (aim/shoot/melee)
//            player:attack (bat / machete swings, like a punch)   danger:raised (gunshots)
//            crime:committed { type: 'shotsFired' }   combat:hit (firing.js)

import * as THREE from 'three';
import { debugLine, log } from '../../core/debug.js';
import { acquireCombatFx } from '../../entities/effects/combatFx.js';
import { WeaponModels } from './models.js';
import { Gunner } from './firing.js';
import { Molotovs } from './throwing.js';
import { WeaponHud } from './hud.js';

const DEG = Math.PI / 180;
const _dir = new THREE.Vector3();

let game = null;
let cfg = null;
let byId = new Map();
let models = null;
let gunner = null;
let molotovs = null;
let hud = null;
let offs = [];
let current = null;      // weapon entry in the hand
let cooldown = 0;
let aimTimer = 0;        // > 0 while the gun is raised
let pending = null;      // { t, fn } a swing / throw that lands a moment after the button
let shotsCrimeIn = 0;
let lockTarget = null;

const save = () => game.save.data;
const ammoOf = (w) => (w.type === 'gun' || w.type === 'throw' ? save().ammo[w.id] || 0 : null);
const owns = (id) => id === 'fists' || save().owned.weapons.includes(id);

/** Weapons he can switch to right now, in data/weapons.json → order. */
function available() {
  return cfg.order.map((id) => byId.get(id)).filter((w) => w && owns(w.id) && (w.type !== 'throw' || ammoOf(w) > 0));
}

async function equip(id, silent = false) {
  const w = byId.get(id) || byId.get('fists');
  current = w;
  save().weapon = w.id;
  game.player.weapon = w.type === 'fists' ? null : { id: w.id, type: w.type };
  aimTimer = 0;
  stopAim();
  const model = await models.get(w);
  if (current !== w) return; // switched again while loading
  attachModel(model);
  if (!silent) game.events.emit('weapon:changed', { id: w.id, ammo: ammoOf(w) });
}

function attachModel(model) {
  const hand = game.player.hand;
  if (!hand) return;
  if (!model || game.player.mode !== 'onFoot') return hand.clear();
  // The real model (Medium/High) uses grips, the code-built one (Low) lowGrips.
  const grip = (hand.kind === 'low' ? cfg.lowGrips : cfg.grips)[current.grip];
  if (grip) hand.attach(model, grip);
}

function cycle() {
  if (game.paused || !game.player || game.player.mode !== 'onFoot' || game.player.dead) return;
  const list = available();
  const i = list.findIndex((w) => w.id === current?.id);
  equip(list[(i + 1) % list.length].id);
}

function stopAim() {
  game.player.aimHeading = null;
  game.cameraRig.setAim(false);
  game.events.emit('player:action', { name: 'shoot', on: false });
  game.events.emit('player:action', { name: 'aim', on: false });
}

/** Free aim (mouse) or aim assist (touch). Returns { dx, dy, dz, heading, target }. */
function aimDirection(w) {
  const p = game.player;
  const cam = game.camera;
  const o = gunner.muzzle();
  if (!game.input.usingTouch) {
    // The crosshair is the middle of the screen: find what it points at, then aim the gun there.
    const fwd = cam.getWorldDirection(_dir);
    const skip = Math.hypot(cam.position.x - p.position.x, cam.position.z - p.position.z) + 0.6;
    const hit = gunner.trace(cam.position.x, cam.position.y, cam.position.z, fwd.x, fwd.y, fwd.z, w.range + skip, skip);
    const tx = cam.position.x + fwd.x * hit.dist, ty = cam.position.y + fwd.y * hit.dist, tz = cam.position.z + fwd.z * hit.dist;
    return toPoint(o, tx, ty, tz, null);
  }
  // Phones: lock on to the best target in front of the camera (or of Shoumik while he moves).
  const f = game.cameraRig.forward();
  const t = game.targets.bestInCone(p.position.x, p.position.z, f.x, f.z, (w.aimAssistDegrees || 30) * DEG, Math.min(w.range, cfg.aim.lockRange), (x) => !x.isPlayer && !x.friendly);
  if (t) return toPoint(o, t.x, t.y + t.h * 0.62, t.z, t);
  return toPoint(o, o.x + f.x * 30, o.y - 0.4, o.z + f.z * 30, null);
}

function toPoint(o, tx, ty, tz, target) {
  const dx = tx - o.x, dy = ty - o.y, dz = tz - o.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  return { dx: dx / len, dy: dy / len, dz: dz / len, heading: Math.atan2(dx, dz), target, tx, tz };
}

function fireGun(w) {
  const left = ammoOf(w);
  if (left <= 0) { game.events.emit('weapon:empty', { id: w.id }); return; } // Session 9: shops show the way to buy bullets
  const aim = aimDirection(w);
  game.player.aimHeading = aim.heading;
  aimTimer = cfg.aim.holdSeconds;
  save().ammo[w.id] = left - 1;
  game.events.emit('player:action', { name: 'shoot' });
  if (gunner.fire(w, aim.dx, aim.dy, aim.dz)) hud.flashHit(game.config.get('combat').hitMarkerSeconds);
  const p = game.player.position;
  game.events.emit('weapon:fired', { id: w.id, x: p.x, z: p.z });
  game.events.emit('danger:raised', { x: p.x, z: p.z, radius: w.noise, source: 'player' });
  if (shotsCrimeIn <= 0) {
    shotsCrimeIn = cfg.aim.shotsFiredEvery;
    game.events.emit('crime:committed', { type: 'shotsFired', x: p.x, z: p.z });
  }
  if (left - 1 <= 0) {
    game.events.emit('weapon:changed', { id: w.id, ammo: 0 });
    game.events.emit('weapon:empty', { id: w.id });
  }
}

function swing(w) {
  game.events.emit('player:action', { name: 'melee' });
  pending = {
    t: w.hitAt, fn: () => {
      const p = game.player;
      game.events.emit('player:attack', {
        x: p.position.x, z: p.position.z, heading: p.heading, range: w.range, arc: w.arcDegrees * DEG,
        kind: w.id, weapon: w.id, power: w.knockDown ? 3 : 1, damage: w.damage,
      });
      // A swing also dents the vehicle in front of him.
      const ax = p.position.x + Math.sin(p.heading) * w.range * 0.7, az = p.position.z + Math.cos(p.heading) * w.range * 0.7;
      const v = game.fleet?.nearest(ax, az, w.range * 0.7, (x) => x.state !== 'wreck');
      if (v) { v.tags.lastHitBy = 'player'; game.fleet.damage(v, w.vehicleDamage || 0); game.combatFx?.spark(ax, p.position.y + 1, az); }
    },
  };
}

function throwOne(w) {
  if (ammoOf(w) <= 0) return;
  const aim = aimDirection(w);
  game.player.aimHeading = aim.heading;
  aimTimer = 0.5;
  game.events.emit('player:action', { name: 'melee' });
  pending = {
    t: 0.28, fn: () => {
      save().ammo[w.id] = Math.max(0, (save().ammo[w.id] || 0) - 1);
      const o = gunner.muzzle();
      const far = Math.min(w.range, Math.hypot(aim.tx - o.x, aim.tz - o.z));
      molotovs.throw(w, o.x, o.y + 0.25, o.z, o.x + Math.sin(aim.heading) * far, o.z + Math.cos(aim.heading) * far);
      if (ammoOf(w) <= 0) equip('fists');
      else game.events.emit('weapon:changed', { id: w.id, ammo: ammoOf(w) });
    },
  };
}

function onOwned({ id }) {
  const w = byId.get(id);
  if (!w) return;
  const a = save().ammo;
  if (w.type === 'gun' || w.type === 'throw') a[id] = Math.min(w.maxAmmo, (a[id] || 0) + (w.type === 'throw' ? w.ammoPack : w.startAmmo));
  if (w.type === 'throw' && !save().owned.weapons.includes(id)) save().owned.weapons.push(id);
  equip(id);
}

function onAmmo({ id, amount }) {
  const w = byId.get(id);
  if (!w) return;
  const a = save().ammo;
  a[id] = Math.min(w.maxAmmo, (a[id] || 0) + (amount ?? w.ammoPack));
  if (current?.id === id) game.events.emit('weapon:changed', { id, ammo: a[id] });
}

function onLose() {
  save().owned.weapons = [];
  save().ammo = {};
  equip('fists');
}

export default {
  id: 'weapons',

  async init(g) {
    game = g;
    cfg = g.config.get('weapons');
    byId = new Map(cfg.weapons.map((w) => [w.id, w]));
    if (!save().ammo) save().ammo = {};
    // Guns bought before bullets existed (Session 5 saves) get their starting ammo once.
    for (const id of save().owned.weapons) {
      const w = byId.get(id);
      if (w && w.type === 'gun' && save().ammo[id] === undefined) save().ammo[id] = w.startAmmo;
    }
    const fx = await acquireCombatFx(g);
    models = new WeaponModels(g, cfg);
    gunner = new Gunner(g, cfg, fx);
    molotovs = new Molotovs(g, fx, models);
    hud = new WeaponHud(g);
    offs = [
      g.events.on('input:weapon', cycle),
      g.events.on('weapon:owned', onOwned),
      g.events.on('weapon:ammo', onAmmo),
      g.events.on('weapons:lose', onLose),
      g.events.on('vehicle:entered', () => { stopAim(); g.player.hand?.clear(); }),
      g.events.on('vehicle:exited', () => equip(current?.id || 'fists', true)),
      g.events.on('language:changed', () => hud.refresh()),
    ];
    const start = save().weapon;
    await equip(start && owns(start) && byId.has(start) ? start : 'fists', true);
    log.info(`weapons: ${available().map((w) => w.id).join(', ')}`);
  },

  update(dt) {
    const p = game.player;
    if (!p) return;
    cooldown -= dt;
    shotsCrimeIn -= dt;
    hud.update(dt);
    molotovs.update(dt);
    const w = current;
    const onFoot = p.mode === 'onFoot' && !p.dead && !p.frozen;
    hud.setWeapon(w, ammoOf(w), p.mode === 'onFoot');

    if (pending) {
      pending.t -= dt;
      if (pending.t <= 0) { const fn = pending.fn; pending = null; if (onFoot) fn(); }
    }
    const input = game.input;
    const gun = w.type === 'gun';
    const desktop = !input.usingTouch;
    hud.showCrosshair(onFoot && gun && desktop);
    if (!onFoot) { lockTarget = null; hud.showLock(null); if (p.aimHeading != null) stopAim(); return; }

    // Aiming view (desktop right mouse) and keeping the gun raised for a moment after a shot.
    const aiming = gun && input.held.aim;
    game.cameraRig.setAim(aiming);
    if (aiming) {
      p.aimHeading = Math.atan2(game.camera.getWorldDirection(_dir).x, _dir.z);
      aimTimer = Math.max(aimTimer, 0.2);
      if (game.player.action !== 'shoot' && game.player.action !== 'aim') game.events.emit('player:action', { name: 'aim' });
    }
    if (aimTimer > 0) {
      aimTimer -= dt;
      if (aimTimer <= 0 && !aiming) stopAim();
    }

    // Phones: show what the gun would lock on to.
    if (gun && input.usingTouch) {
      const f = game.cameraRig.forward();
      lockTarget = game.targets.bestInCone(p.position.x, p.position.z, f.x, f.z, (w.aimAssistDegrees || 30) * DEG, Math.min(w.range, cfg.aim.lockRange), (x) => !x.isPlayer && !x.friendly);
      hud.showLock(lockTarget);
    } else if (lockTarget) { lockTarget = null; hud.showLock(null); }

    const wants = w.auto ? input.held.attack : input.pressed.attack;
    if (!wants || cooldown > 0 || w.type === 'fists' || !p.grounded) return;
    cooldown = w.fireEvery;
    if (gun) fireGun(w);
    else if (w.type === 'melee') swing(w);
    else if (w.type === 'throw') throwOne(w);
    debugLine('weapon', `${w.id} ammo ${ammoOf(w) ?? '-'}`);
  },

  dispose() {
    offs.forEach((off) => off());
    offs = [];
    molotovs?.dispose();
    hud?.dispose();
    game.player?.hand?.clear();
    if (game.player) { game.player.weapon = null; game.player.aimHeading = null; }
    models = gunner = molotovs = hud = current = null;
  },
};
