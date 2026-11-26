// Feature: boats (Roadmap 2 S7) — drive a country boat, a speedboat or a yacht on the lakes
// (Hatirjheel, Gulshan, Dhanmondi), the Buriganga river and the sea.
//
//   ghats     data/boats.json → docks: a wooden jetty by the water with boats moored in a row
//             (docks.js). Free country boats (নৌকা) wait at every ghat; boats you OWN wait at
//             whichever ghat you walk to (save.data.owned.boats).
//   get in    stand near a moored boat → E (a short fade) → Shoumik sits at the helm
//   drive     stick / W-S = throttle / reverse, A-D = rudder, Jump / Space = brake, H = horn
//   get out   E → he steps onto the nearest dry land (the boat must be by a bank / jetty)
//   buy       the boat shop at Hatirjheel (shops feature, kind 'boats') → boat:grant { type }
// Boats stay on open water (world.waterAt, src/world/waterMap.js) and bounce off the bank
// (boat.js). Models: assets/boats/boats.glb (streamed after start), code-built until then.
//
// Events  listens input:action, input:horn, boat:grant { type }, vehicle:forceExit,
//                 player:busted, player:died
//         sends   boat:entered { id, type }  boat:exited { id, type }  boat:crash { speed }
//                 vehicle:horn { x, z, kind }  prompt:show / prompt:hide  map:blips { id: 'ghats' }
//                 controls:mode  player:action  player:teleport  toast:show

import { log, debugLine } from '../../core/debug.js';
import { t, pickName, formatNumber } from '../../ui/i18n.js';
import { Boat } from './boat.js';
import { Wake } from './wake.js';
import { planDock, findShore, buildJetties } from './docks.js';
import { buildBoatGeometry, loadBoatKit, kitMesh } from '../../entities/boats/models.js';
import { acquireRider } from '../../entities/transit/rider.js';
import * as THREE from 'three';

let game = null;
let cfg = null;
let docks = [];
let boats = [];
let jetties = null;
let wake = null;
let root = null;
let kit = null;            // Map name → { geometry, material } once boats.glb has arrived
let kitState = 'wait';     // wait → loading → ready | failed
let codeGeo = new Map();   // type → code-built geometry
let codeMat = null;
let driving = null;        // the boat Shoumik drives
let offs = [];
let nextId = 1;
let promptKey = null;
let hud = null;
let hudTimer = 0;
let waterY = 0;
const _s = {};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function setPrompt(key, vars) {
  const id = key ? key + JSON.stringify(vars || '') : null;
  if (id === promptKey) return;
  promptKey = id;
  if (key) game.events.emit('prompt:show', { id: 'boat', key, vars });
  else game.events.emit('prompt:hide', { id: 'boat' });
  if (key === 'boat.enter') game.transitPrompt = 'boat';
  else if (game.transitPrompt === 'boat') game.transitPrompt = null;
}

/** A boat's mesh: the real model when boats.glb is in, else the code-built one. */
function modelFor(type, T) {
  if (kit) {
    const m = kitMesh(kit, T.model, T.rotY || 0, T.draft ?? 0.3);
    if (m) return m;
  }
  if (!codeGeo.has(type)) codeGeo.set(type, buildBoatGeometry(type, T));
  const m = new THREE.Mesh(codeGeo.get(type), codeMat);
  m.castShadow = true;
  return m;
}

function spawn(type, at, tags = {}) {
  const T = cfg.types[type];
  if (!T) return null;
  const b = new Boat(nextId++, type, T, modelFor(type, T), waterY);
  b.tags = { ...tags };
  b.place(at.x, at.z, at.heading);
  root.add(b.mesh);
  boats.push(b);
  return b;
}

function remove(b) {
  b.removed = true;
  b.mesh.removeFromParent();
  boats.splice(boats.indexOf(b), 1);
}

/** Owned boat i is somewhere in the world right now? */
const ownedOut = (i) => boats.some((b) => b.tags.owned === i);

/** Moor the free boats and the boats he owns at a ghat (when he comes near). */
function fillDock(d) {
  const used = new Set(boats.filter((b) => b.tags.dock === d && !b.tags.moved).map((b) => b.tags.spot));
  let spot = 0;
  const next = () => { while (used.has(spot)) spot++; return spot < d.spots.length ? spot++ : -1; };
  const owned = game.save.data.owned.boats || [];
  owned.slice(0, cfg.docks.owned).forEach((entry, i) => {
    if (!entry || ownedOut(i)) return;
    const k = next();
    if (k >= 0) spawn(entry.type, d.spots[k], { dock: d, spot: k, owned: i });
  });
  if (!d.freeSpawned) {
    d.freeSpawned = true;
    for (const type of d.def.free || []) {
      const k = next();
      if (k >= 0) spawn(type, d.spots[k], { dock: d, spot: k, free: true });
    }
  }
}

/** Boats nobody uses go away when he is far: moored ones with their ghat, others far away. */
function tidy() {
  const p = game.player.position;
  const show = cfg.docks.showDistance;
  for (const d of docks) {
    const dist = Math.hypot(d.land.x - p.x, d.land.z - p.z);
    if (dist < show) fillDock(d);
    else if (dist > show * 1.4 && d.freeSpawned) {
      d.freeSpawned = false;
      for (const b of [...boats]) if (b.tags.dock === d && !b.tags.moved && b !== driving) remove(b);
    }
  }
  for (const b of [...boats]) {
    if (b === driving || !b.tags.moved) continue;
    if (Math.hypot(b.x - p.x, b.z - p.z) > show * 2.5) remove(b); // owned ones wait at the next ghat again
  }
}

/** The boat he could get into (nearest moored / parked boat within range). */
function nearbyBoat() {
  const p = game.player.position;
  let best = null, bestD = cfg.enter.range;
  for (const b of boats) {
    if (b.driver) continue;
    const d = b.distanceTo(p.x, p.z);
    if (d < bestD) { bestD = d; best = b; }
  }
  return best;
}

function enter(b) {
  const g = game;
  const p = g.player;
  driving = b;
  b.driver = 'player';
  b.tags.moved = true;
  p.mode = 'vehicle';
  p.vehicle = b;
  p.velocity.x = p.velocity.y = p.velocity.z = 0;
  p.grounded = true;
  if (p.model) p.model.visible = true;
  g.events.emit('player:action', b.type === 'nouka' ? { name: 'sit' } : { name: 'enterVehicle', side: -1, duration: 0.01 });
  g.events.emit('controls:mode', { mode: 'driving' });
  g.cameraRig.setTarget(b, 'driving', true, b.T.camera || 1);
  setPrompt(null);
  seatPlayer();
  g.events.emit('boat:entered', { id: b.id, type: b.type });
}

function exit(at) {
  const g = game;
  const b = driving;
  if (!b) return;
  driving = null;
  b.driver = null;
  b.input.throttle = b.input.steer = 0;
  b.input.brake = true;
  const p = g.player;
  p.mode = 'onFoot';
  p.vehicle = null;
  g.events.emit('player:action', { name: b.type === 'nouka' ? 'sit' : 'enterVehicle', on: false });
  g.events.emit('controls:mode', { mode: 'onFoot' });
  g.events.emit('player:teleport', { x: at.x, z: at.z, heading: at.heading || 0 });
  g.events.emit('boat:exited', { id: b.id, type: b.type });
}

/** Keep him at the helm. */
function seatPlayer() {
  const b = driving;
  const p = game.player;
  b.localToWorld(b.T.seat, _s);
  p.position.x = _s.x; p.position.y = _s.y; p.position.z = _s.z;
  p.heading = b.heading;
  p.speed = 0;
}

function onAction() {
  const g = game;
  if (g.paused || g.player.dead) return;
  const rider = acquireRider(g);
  if (rider.fading) return;
  if (driving) {
    const shore = findShore(g.world, driving, cfg.enter.exitSearch);
    if (!shore) { g.events.emit('toast:show', { key: 'boat.noShore' }); return; }
    if (Math.abs(driving.speed) > 3) { g.events.emit('toast:show', { key: 'boat.slowDown' }); return; }
    rider.fadeThen(() => exit(shore));
    return;
  }
  if (g.player.mode !== 'onFoot' || g.ride) return;
  const b = nearbyBoat();
  if (b) rider.fadeThen(() => { if (!b.removed && !b.driver && game.player.mode === 'onFoot') enter(b); });
}

function driveInput(b) {
  const input = game.input;
  let thr = Math.abs(input.move.y) > 0.2 ? input.move.y : 0;
  if (input.held.sprint) thr = 1;
  b.input.throttle = clamp(thr, -1, 1);
  b.input.steer = clamp(-input.move.x, -1, 1);
  b.input.brake = !!input.held.jump;
}

/** Boats bump each other apart (the one he drives pushes moored ones). */
function push() {
  const R = cfg.physics.pushRadius;
  for (let i = 0; i < boats.length; i++) {
    for (let j = i + 1; j < boats.length; j++) {
      const a = boats[i], b = boats[j];
      // Rough hull size (boats moored side by side at a ghat must not push each other).
      const min = (Math.min(a.T.length, b.T.length) + Math.max(a.T.width, b.T.width)) * R;
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
      if (d >= min || d < 1e-3) continue;
      const k = (min - d) / d;
      const wa = a === driving ? 0.2 : 0.5, wb = b === driving ? 0.2 : 0.5;
      const ax = a.x - dx * k * wa, az = a.z - dz * k * wa, bx = b.x + dx * k * wb, bz = b.z + dz * k * wb;
      if (game.world.waterAt(ax, az)) { a.x = ax; a.z = az; }
      if (game.world.waterAt(bx, bz)) { b.x = bx; b.z = bz; }
      if (a !== driving) a.tags.moved = a.tags.moved || d < min * 0.7;
      if (b !== driving) b.tags.moved = b.tags.moved || d < min * 0.7;
    }
  }
}

function blips() {
  game.events.emit('map:blips', {
    id: 'ghats',
    points: docks.map((d) => ({ id: d.id, x: d.land.x, z: d.land.z, label: d.name, icon: '⚓', group: 'transit', color: cfg.mapColor || '#7fd0ff', routeable: true })),
  });
}

function updateHud(dt) {
  const show = !!driving;
  if (hud.hidden === show) hud.hidden = !show;
  if (!show) return;
  hudTimer -= dt;
  if (hudTimer > 0) return;
  hudTimer = 0.15;
  hud.querySelector('.drive-name').textContent = pickName(driving.T.name);
  hud.querySelector('.drive-speed').textContent = t('vehicle.speed', { speed: formatNumber(Math.abs(driving.speed) * 3.6) });
}

/** boats.glb arrived (streamed after start): swap every boat to its real model. */
function checkKit() {
  if (kitState !== 'wait') return;
  const st = game.streamer?.started;
  if (st && st.get('model.boats') === 'failed') { kitState = 'failed'; return; }
  if (st && st.get('model.boats') !== 'done') return;
  kitState = 'loading';
  loadBoatKit(game).then((k) => {
    if (!k) { kitState = 'failed'; return; }
    kit = k;
    kitState = 'ready';
    for (const b of boats) b.setModel(modelFor(b.type, b.T));
  });
}

export default {
  id: 'boats',

  init(g) {
    game = g;
    cfg = g.config.get('boats');
    waterY = g.world.cfg.water.level;
    root = new THREE.Group();
    root.name = 'boats';
    g.scene.add(root);
    codeMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    docks = [];
    for (const def of cfg.docks.list) {
      const d = planDock(g.world, def);
      if (d) docks.push(d); else log.warn(`boats: no place for ghat "${def.id}" near ${def.near}`);
    }
    jetties = buildJetties(docks, waterY);
    root.add(jetties);
    wake = new Wake(g.scene, cfg.wake, waterY);
    hud = document.createElement('div');
    hud.id = 'boat-hud';
    hud.hidden = true;
    hud.innerHTML = '<span class="drive-name"></span><span class="drive-speed"></span>';
    g.ui.appendChild(hud);
    if (!g.save.data.owned.boats) g.save.data.owned.boats = [];
    offs = [
      g.events.on('input:action', onAction),
      g.events.on('input:horn', () => { if (driving && !g.paused) g.events.emit('vehicle:horn', { id: driving.id, x: driving.x, z: driving.z, kind: driving.T.horn, ai: false }); }),
      g.events.on('boat:grant', ({ type }) => {
        if (!cfg.types[type]) return log.warn(`boat:grant — unknown boat "${type}"`);
        g.save.data.owned.boats.push({ type });
        g.save.flush();
        g.events.emit('toast:show', { key: 'boat.bought', vars: { boat: pickName(cfg.types[type].name) } });
      }),
      g.events.on('vehicle:forceExit', () => { if (driving) { const s = findShore(g.world, driving, 60) || { x: driving.x, z: driving.z }; exit(s); } }),
      g.events.on('player:busted', () => { if (driving) exit(findShore(g.world, driving, 60) || { x: driving.x, z: driving.z }); }),
      g.events.on('player:died', () => { if (driving) exit(findShore(g.world, driving, 60) || { x: driving.x, z: driving.z }); }),
      g.events.on('game:ready', blips),
    ];
    blips();
    g.boats = {
      get list() { return boats; }, get docks() { return docks; }, get driving() { return driving; },
      get kitState() { return kitState; },
      spawn: (type, at) => spawn(type, at, { moved: true }),
      enter: (b) => enter(b),
      shore: () => (driving ? findShore(g.world, driving, cfg.enter.exitSearch) : null),
    };
    log.info(`boats: ${docks.length} ghats (${docks.map((d) => `${d.id} ${d.spots.length} spots`).join(', ')})`);
  },

  update(dt) {
    if (!game.player) return;
    checkKit();
    tidy();
    const waterAt = game.world.waterAt;
    const P = cfg.physics;
    if (driving) {
      if (game.player.mode !== 'vehicle' || game.player.vehicle !== driving) driving = null; // thrown out
    }
    if (driving && !game.paused) driveInput(driving);
    for (const b of boats) {
      if (b === driving || b.speed !== 0 || b.yawRate !== 0) {
        if (b !== driving) { b.input.throttle = 0; b.input.steer = 0; b.input.brake = true; }
        const crash = b.update(dt, waterAt, cfg.blocked?.list, P);
        if (b === driving && crash > P.crashSpeed) game.events.emit('boat:crash', { id: b.id, speed: crash });
      } else {
        b.time += dt;
        b.sync(dt);
      }
      wake.emit(b, dt);
    }
    push();
    wake.update(dt);
    if (driving) seatPlayer();
    // Prompt: get in / out.
    if (driving) setPrompt(findShore(game.world, driving, cfg.enter.exitSearch) ? 'boat.exit' : null);
    else if (game.player.mode === 'onFoot' && !game.ride) {
      const b = nearbyBoat();
      setPrompt(b ? 'boat.enter' : null, b ? { boat: pickName(b.T.name) } : null);
    } else setPrompt(null);
    updateHud(dt);
    debugLine('boat', driving ? `boat ${driving.type} ${driving.speed.toFixed(1)} m/s  ${game.world.waterAt(driving.x, driving.z)}` : `boats ${boats.length}`);
  },

  dispose() {
    offs.forEach((off) => off());
    offs = [];
    if (driving) exit({ x: game.player.position.x, z: game.player.position.z });
    setPrompt(null);
    for (const b of [...boats]) remove(b);
    wake?.dispose();
    jetties?.geometry.dispose();
    root?.removeFromParent();
    for (const geo of codeGeo.values()) geo.dispose();
    codeGeo = new Map();
    hud?.remove();
    docks = [];
  },
};
