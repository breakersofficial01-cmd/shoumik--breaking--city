// Feature: vehicles. Everything Shoumik does with vehicles: getting in and out (carjacking
// included), driving, hired rickshaw / CNG rides, parked vehicles to take, the vehicles he
// owns, horn, and the small speed display. It also steps the shared fleet (physics) once a
// frame, so it must stay switched on for the traffic feature to move.
//
//   boarding.js  in / out + seat        rides.js   hired rides + menu
//   parked.js    roadside vehicles      horn.js    placeholder horn sounds
// Vehicle types and all numbers: data/vehicles.json. Engine: src/entities/vehicles/.
// This feature is listed BEFORE `player` in features/index.js: we move the vehicle first,
// then the player feature draws Shoumik on its seat in the same frame.
//
// Driving controls: stick / A-D = steer, stick forward or W or the Run button = accelerate,
// stick back / S = brake then reverse, Jump button / Space = handbrake, Enter / E = get out,
// Horn / H = horn.
//
// Events
//   listens  input:action, input:horn
//            vehicle:grant { type, color? }   Shoumik now OWNS a vehicle (shops, Session 5)
//            garage:changed { col, row, dir } he moved home: parked owned vehicles move there
//            vehicle:exploded { id }          he is thrown out if he was inside
//            vehicle:horn { x, z, kind, ai }  play a horn (AI drivers send these)
//            vehicle:forceExit {}             throw him out at once (busted / wasted)
//   sends    prompt:show / prompt:hide, vehicle:horn, player:hit, and everything listed in
//            boarding.js and rides.js

import { debugLine, log } from '../../core/debug.js';
import { Rng } from '../../core/rng.js';
import { t, pickName, formatNumber, formatMoney } from '../../ui/i18n.js';
import { dirByName } from '../../world/roads.js';
import { acquireFleet } from '../../entities/vehicles/fleet.js';
import { Boarding } from './boarding.js';
import { Rides } from './rides.js';
import { Parked } from './parked.js';
import { Horn } from './horn.js';

let game = null;
let cfg = null;
let fleet = null;
let boarding = null;
let rides = null;
let parked = null;
let horn = null;
let hud = null;
let offs = [];
let promptKey = null;
let hudTimer = 0;
let gcTimer = 0;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function setPrompt(key, vars) {
  const id = key ? key + JSON.stringify(vars || '') : null;
  if (id === promptKey) return;
  promptKey = id;
  if (key) game.events.emit('prompt:show', { id: 'vehicle', key, vars });
  else game.events.emit('prompt:hide', { id: 'vehicle' });
}

/** Vehicles Shoumik owns wait at the garage spot (data/vehicles.json → garage). */
function spawnOwned(entry, index) {
  // The home's garage (save.data.garage, set by the shops feature) or the default spot.
  const g = { ...cfg.garage, ...(game.save.data.garage || {}) };
  const T = cfg.types[entry.type];
  if (!T) return null;
  const roads = game.world.roads;
  const d = dirByName(g.dir);
  if (!roads.hasRoad(g.col, g.row, d)) return null;
  const seg = roads.segment(g.col, g.row, d, T.size[1] > cfg.parked.wideAboveWidth ? cfg.parked.wideKerbOffset : cfg.parked.kerbOffset);
  const u = Math.min(seg.len - 6, g.firstAt + index * g.spacing);
  const v = fleet.create(entry.type, { x: seg.ax + seg.fx * u, z: seg.az + seg.fz * u, heading: seg.heading, color: entry.color });
  if (!v) return null;
  v.tags.owned = true;
  v.input.handbrake = true;
  return v;
}

/** Move every owned vehicle nobody is using to the (new) garage. */
function reparkOwned() {
  for (const v of [...fleet.vehicles]) {
    if (v.tags.owned && !v.driver && v !== boarding.vehicle) fleet.remove(v);
  }
  game.save.data.owned.vehicles.forEach((entry, i) => entry && spawnOwned(entry, i));
}

function grant({ type, color }) {
  if (!cfg.types[type]) return log.warn(`vehicle:grant — unknown type "${type}"`);
  const list = game.save.data.owned.vehicles;
  const entry = { type, color: color || cfg.types[type].colors[0] };
  list.push(entry);
  spawnOwned(entry, list.length - 1);
  game.save.flush();
}

/** What the Enter button would do right now, and the hint for it. */
function nearbyVehicle() {
  const p = game.player.position;
  // Roadmap 2 S6: the bus Shoumik rides / waits for (tags.transit) cannot be taken.
  // Roadmap 2 S8: nor can a tank or an army vehicle the army is driving (tags.noBoard).
  return fleet.nearest(p.x, p.z, cfg.enterExit.range, (v) => v.state !== 'wreck' && !v.airborne && !v.tags.transit && !v.tags.noBoard);
}

function onAction() {
  if (game.paused || !game.player) return;
  if (!boarding.onFoot) return boarding.requestExit();
  if (game.transitPrompt || game.ride) return; // Roadmap 2 S6: E belongs to a bus / train prompt
  if (game.player.mode !== 'onFoot') return;
  const v = nearbyVehicle();
  if (!v) return;
  if (rides.canHire(v)) rides.open(v);
  else boarding.enter(v, false);
}

function onHornButton() {
  const v = boarding.vehicle;
  if (!v || game.paused || boarding.state === 'exiting') return;
  game.events.emit('vehicle:horn', { id: v.id, x: v.x, z: v.z, kind: v.T.horn, ai: false });
}

/** Turn stick / keys / buttons into pedal and wheel positions. */
function driveInput(v) {
  const input = game.input;
  let thr = Math.abs(input.move.y) > 0.2 ? input.move.y : 0;
  if (input.held.sprint) thr = 1;
  v.input.throttle = clamp(thr, -1, 1);
  v.input.steer = clamp(-input.move.x, -1, 1);
  v.input.handbrake = !!input.held.jump;
}

function updatePromptAndHud(dt) {
  const v = boarding.vehicle;
  if (boarding.onFoot) {
    const near = game.player.mode === 'onFoot' ? nearbyVehicle() : null;
    if (!near) setPrompt(null);
    else if (rides.canHire(near)) setPrompt('vehicle.hire', { vehicle: pickName(near.T.name), fare: formatMoney(rides.fareOf(near)) });
    else if (near.driver === 'ai') setPrompt('vehicle.jack');
    else setPrompt('vehicle.enter', { vehicle: pickName(near.T.name) });
  } else if (v && v.state === 'burning') setPrompt('vehicle.burning');
  else setPrompt(null);

  const show = !!v && boarding.state !== 'exiting';
  if (hud.hidden === show) hud.hidden = !show;
  if (!show) return;
  hudTimer -= dt;
  if (hudTimer > 0) return;
  hudTimer = 0.15;
  hud.querySelector('.drive-name').textContent = pickName(v.T.name);
  hud.querySelector('.drive-speed').textContent = t('vehicle.speed', { speed: formatNumber(v.speed * cfg.hud.speedUnitFactor) });
  hud.querySelector('.drive-health i').style.width = `${Math.round(v.healthShare * 100)}%`;
}

/** Remove vehicles nobody is using once they are far away. */
function cleanUp(dt) {
  gcTimer -= dt;
  if (gcTimer > 0) return;
  gcTimer = 1;
  const p = game.player.position;
  const far = cfg.parked.despawnDistance;
  for (const v of [...fleet.vehicles]) {
    if (v.driver || v.tags.owned || v === boarding.vehicle) continue;
    if (Math.hypot(v.x - p.x, v.z - p.z) > far) fleet.remove(v);
  }
}

export default {
  id: 'vehicles',

  async init(g) {
    game = g;
    cfg = g.config.get('vehicles');
    fleet = await acquireFleet(g);
    // Places are loaded at boot by the Content Service (the city layout needs them too).
    const rng = new Rng(g.config.get('world').seed ^ 0x51de);
    boarding = new Boarding(g, fleet, cfg, rng);
    rides = new Rides(g, fleet, cfg, boarding, rng, { enter: (v, passenger) => boarding.enter(v, passenger) });
    parked = new Parked(g, fleet, cfg, g.content.get('places'));
    horn = new Horn(g, cfg.horn);

    hud = document.createElement('div');
    hud.id = 'drive-hud';
    hud.hidden = true;
    hud.innerHTML = '<span class="drive-name"></span><span class="drive-speed"></span><span class="drive-health"><i></i></span>';
    g.ui.appendChild(hud);

    g.save.data.owned.vehicles.forEach((entry, i) => entry && spawnOwned(entry, i));
    offs = [
      g.events.on('input:action', onAction),
      g.events.on('input:horn', onHornButton),
      g.events.on('vehicle:grant', (p) => grant(p || {})),
      g.events.on('garage:changed', reparkOwned),
      g.events.on('vehicle:horn', ({ x, z, kind, ai }) => horn.play(kind, x, z, ai)),
      g.events.on('vehicle:forceExit', () => { if (!boarding.onFoot) boarding.exitNow(true); }),
      g.events.on('vehicle:exploded', ({ id, x, z }) => {
        if (boarding.vehicle?.id !== id) return;
        boarding.exitNow(true);
        g.events.emit('player:hit', { x, z, power: 3, by: 'explosion' });
      }),
    ];
    log.info(`vehicles: ${Object.keys(cfg.types).length} types, ${parked.slots.length} roadside spots`);
  },

  update(dt) {
    if (!game.player) return;
    game.world.roads.time += dt;
    parked.update(dt);
    const v = boarding.vehicle;
    if (v && boarding.state === 'driving' && !boarding.exitQueued) driveInput(v);
    boarding.update(dt);
    rides.update(dt);
    fleet.update(dt);
    boarding.afterPhysics();
    updatePromptAndHud(dt);
    cleanUp(dt);
    if (boarding.vehicle) debugLine('vehicle', `${boarding.vehicle.type} ${boarding.vehicle.speed.toFixed(1)} m/s  hp ${Math.round(boarding.vehicle.health)}  ${boarding.state}`);
    else debugLine('vehicle', 'on foot');
  },

  dispose() {
    offs.forEach((off) => off());
    offs = [];
    setPrompt(null);
    rides?.dispose();
    horn?.dispose();
    hud?.remove();
    game.fleet?.dispose();
    game.fleet = null;
    fleet = boarding = rides = parked = horn = hud = null;
  },
};
