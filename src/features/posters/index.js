// Feature: posters. Billboards, LED screens, wall / bus-stop / pillar posters and adverts on
// buses and rickshaws, all driven by data/posters.json (through the Content Service, so it
// can later come from a Google Sheet). Where the slots are: slots.js + data/posterSlots.json.
//
//   - Only posters inside their start/end dates and districts are shown (schedule.js).
//   - Pictures load lazily near the player (library.js). Far slots are not drawn.
//   - Walk up to a poster that has a link and look at it: a button "পোস্টার খুলুন ↗" appears
//     (or press F, or tap the poster itself). The link opens in a new tab / app.
//
// Events
//   listens  input:open                 open the poster being looked at
//            quality:changed            draw distance
//   sends    poster:opened { id, slot, link }
//            prompt:show / prompt:hide  (desktop hint)

import * as THREE from 'three';
import { log, debugLine } from '../../core/debug.js';
import { hashInts } from '../../core/rng.js';
import { validatePosters } from '../../content/validators.js';
import { t } from '../../ui/i18n.js';
import { planSlots } from './slots.js';
import { buildFrames, cullFrames } from './frames.js';
import { PosterLibrary } from './library.js';
import { VehiclePosters } from './vehicles.js';
import { todayString, dayNumber, isLive, eligible, weightedPick, playlist } from './schedule.js';

let game = null;
let cfg = null;         // data/posterSlots.json
let settings = null;    // data/posters.json → settings
let library = null;
let vehicles = null;
let root = null;
let frames = null;
let slots = [];
let live = [];          // posters showing today
let today = '';
let clock = 0;
let dateTimer = 0;
let lazyTimer = 0;
let lookTimer = 0;
let target = null;      // { slot, poster } being looked at
let button = null;
let offs = [];
const geo = new THREE.PlaneGeometry(1, 1);
const tmp = new THREE.Vector3();
const camDir = new THREE.Vector3();

/** One poster for a normal slot (the same all day). */
function pickFor(shape, district, seed) {
  return weightedPick(eligible(live, shape, district), hashInts(seed, dayNumber()));
}

/** Work out what every slot shows (start of game, every minute, after midnight). */
function schedule() {
  today = todayString();
  live = game.content.get('posters').filter((p) => isLive(p, today));
  for (const p of live) library.register(p.id, p.image);
  slots.forEach((s, i) => {
    if (s.kind === 'led') {
      s.list = playlist(eligible(live, s.shape, s.district));
      if (new Set(s.list).size < 2) s.list.push(null); // null = the default poster, so a screen always changes
    }
    else s.poster = pickFor(s.shape, s.district, i);
  });
}

/** The poster an LED screen shows right now. */
function ledPoster(s) {
  if (!s.list?.length) return null;
  const phase = hashInts(s.x | 0, s.z | 0) % s.list.length;
  return s.list[(Math.floor(clock / settings.ledRotateSeconds) + phase) % s.list.length];
}

function makeMesh(s) {
  const mesh = new THREE.Mesh(geo, library.material(null, s.shape));
  mesh.name = `poster-${s.id}`;
  mesh.position.set(s.x, s.y, s.z);
  mesh.rotation.y = s.heading;
  mesh.scale.set(s.w, s.h, 1);
  mesh.updateMatrix();
  mesh.matrixAutoUpdate = false;
  mesh.userData.slot = s;
  s.mesh = mesh;
  root.add(mesh);
}

/** Show the right picture on every near slot; load pictures that are getting close. */
function refreshSlots(focus) {
  const far = game.quality.viewDistance;
  cullFrames(frames, focus, far, cfg.frameCell);
  for (const s of slots) {
    // Big boards (roof billboards, LED screens) are seen from far away; small posters are not.
    const draw = s.kind === 'billboard' || s.kind === 'led' ? far : game.quality.posterDistance;
    const lazy = Math.max(draw, settings.lazyLoadDistance);
    const d = Math.hypot(s.x - focus.x, s.z - focus.z);
    if (s.kind === 'led') s.poster = ledPoster(s);
    if (d < lazy && s.poster) library.request(s.poster.id);
    if (s.kind === 'led' && d < lazy) for (const p of s.list) if (p) library.request(p.id); // the next ones too
    const visible = d < draw;
    if (visible && !s.mesh) makeMesh(s);
    if (!s.mesh) continue;
    s.mesh.visible = visible;
    if (visible) s.mesh.material = library.material(s.poster?.id, s.shape);
  }
  const lazy = Math.max(game.quality.posterDistance, settings.lazyLoadDistance);
  for (const s of vehicles.slots) {
    if (!s.poster) { if (s.kind === 'bus') s.mesh.material = library.material(null, 'wide'); continue; }
    const near = Math.hypot(s.vehicle.x - focus.x, s.vehicle.z - focus.z) < lazy;
    if (near) library.request(s.poster.id);
    s.mesh.material = s.kind === 'rickshaw'
      ? (library.isReady(s.poster.id) ? library.croppedMaterial(s.poster.id, 'wide', s.keep) : s.original)
      : library.croppedMaterial(s.poster.id, 'wide', s.keep);
  }
}

// ---------------------------------------------------------------- tap to open

/** Is the camera looking at this poster, close enough and from the front? */
function lookScore(x, y, z, heading, tap, player) {
  if (Math.hypot(x - player.x, z - player.z) > tap) return -1;
  const cam = game.camera.position;
  const dx = x - cam.x, dy = y - cam.y, dz = z - cam.z;
  if (Math.sin(heading) * -dx + Math.cos(heading) * -dz <= 0) return -1; // seen from behind
  const len = Math.hypot(dx, dy, dz) || 1;
  const cos = (dx * camDir.x + dy * camDir.y + dz * camDir.z) / len;
  return cos >= Math.cos((settings.lookAngleDegrees * Math.PI) / 180) ? cos : -1;
}

function findTarget() {
  const player = game.player?.position;
  if (!player) return null;
  game.camera.getWorldDirection(camDir);
  let best = null, bestScore = -1;
  const consider = (slot, poster, x, y, z, heading) => {
    if (!poster?.link) return;
    const score = lookScore(x, y, z, heading, slot.tap, player);
    if (score > bestScore) { bestScore = score; best = { slot, poster }; }
  };
  for (const s of slots) if (s.mesh?.visible) consider(s, s.poster, s.x, s.y, s.z, s.heading);
  for (const s of vehicles.slots) {
    if (!s.poster?.link || !s.mesh.visible) continue;
    const w = vehicles.where(s, tmp);
    consider(s, s.poster, w.x, w.y, w.z, w.heading);
  }
  return best;
}

function openPoster(hit) {
  if (!hit?.poster?.link) return;
  window.open(hit.poster.link, '_blank', 'noopener');
  game.events.emit('poster:opened', { id: hit.poster.id, slot: hit.slot.id, link: hit.poster.link });
  log.info(`poster opened: ${hit.poster.id} (${hit.slot.id})`);
}

function showTarget(next) {
  if (next?.poster === target?.poster && next?.slot === target?.slot) return;
  target = next;
  button.hidden = !target;
  if (target) game.events.emit('prompt:show', { id: 'poster', key: 'poster.hint', vars: { key: settings.openKeyHint } });
  else game.events.emit('prompt:hide', { id: 'poster' });
}

/** A quick tap on the screen right on top of a poster opens it too. */
function onCanvasTap(e) {
  if (e.pointerType === 'mouse' && game.input.pointerLocked) return;
  const rect = game.canvas.getBoundingClientRect();
  const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  const ray = new THREE.Raycaster();
  ray.setFromCamera(ndc, game.camera);
  const meshes = [...slots.filter((s) => s.mesh?.visible && s.poster?.link).map((s) => s.mesh), ...[...vehicles.slots].filter((s) => s.poster?.link).map((s) => s.mesh)];
  const hit = ray.intersectObjects(meshes, false)[0];
  if (!hit) return;
  const slot = hit.object.userData.slot || [...vehicles.slots].find((s) => s.mesh === hit.object);
  if (slot && Math.hypot(hit.point.x - game.player.position.x, hit.point.z - game.player.position.z) <= slot.tap) openPoster({ slot, poster: slot.poster });
}

export default {
  id: 'posters',

  async init(g) {
    game = g;
    cfg = g.config.get('posterSlots');
    g.content.registerType('posters', { localPath: 'data/posters.json', validate: validatePosters });
    await g.content.load('posters');
    settings = g.content.getDefaults('posters');
    library = new PosterLibrary(g.assets, settings.defaults || {});
    await library.init();
    root = new THREE.Group();
    root.name = 'posters';
    g.scene.add(root);
    slots = planSlots(g.world, cfg, g.config.get('world'));
    frames = buildFrames(slots, cfg, { lit: g.world.shared.facadeMaterial, glow: new THREE.MeshBasicMaterial({ vertexColors: true }) }, g.world.collision);
    root.add(frames);
    vehicles = new VehiclePosters(g, cfg.vehicles, pickFor);
    // Read-only handle for debug tools (tools/poster-check.js) and later features.
    g.posters = { get slots() { return slots; }, get vehicleSlots() { return vehicles.slots; }, get target() { return target; }, library };
    schedule();
    const counts = {};
    for (const s of slots) counts[s.kind] = (counts[s.kind] || 0) + 1;
    log.info(`posters: ${live.length} live today, slots ${Object.entries(counts).map(([k, n]) => `${k} ${n}`).join(', ')}`);

    button = document.createElement('button');
    button.type = 'button';
    button.className = 'poster-open';
    button.hidden = true;
    button.textContent = t('poster.open');
    button.addEventListener('click', () => openPoster(target));
    g.ui.appendChild(button);
    let down = null;
    const onDown = (e) => { down = { x: e.clientX, y: e.clientY, at: performance.now() }; };
    const onUp = (e) => {
      if (!down || performance.now() - down.at > 300 || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 12) return;
      onCanvasTap(e);
    };
    g.canvas.addEventListener('pointerdown', onDown);
    g.canvas.addEventListener('pointerup', onUp);
    offs = [
      () => { g.canvas.removeEventListener('pointerdown', onDown); g.canvas.removeEventListener('pointerup', onUp); },
      g.events.on('input:open', () => openPoster(target)),
      g.events.on('language:changed', () => { button.textContent = t('poster.open'); }),
    ];
  },

  update(dt) {
    if (!game.player) return;
    clock += dt;
    vehicles.scan(dt);
    dateTimer -= dt;
    if (dateTimer <= 0) {
      dateTimer = settings.refreshDatesSeconds;
      if (todayString() !== today) schedule();
    }
    lazyTimer -= dt;
    if (lazyTimer <= 0) {
      lazyTimer = 0.25;
      refreshSlots(game.player.position);
    }
    lookTimer -= dt;
    if (lookTimer <= 0) {
      lookTimer = 0.15;
      showTarget(findTarget());
    }
    debugLine('posters', `posters ${slots.filter((s) => s.mesh?.visible).length}/${slots.length} + ${vehicles.slots.size} on vehicles, ${library.loadedCount} pictures`);
  },

  dispose() {
    offs.forEach((off) => off());
    offs = [];
    vehicles?.dispose();
    library?.dispose();
    root?.removeFromParent();
    button?.remove();
    slots = [];
    game.events.emit('prompt:hide', { id: 'poster' });
  },
};
