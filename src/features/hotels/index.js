// Feature: hotels (Roadmap 2 S4). Three big hotels — Breaking Hotel (Gulshan, with a bar and
// dance lounge), Shoumik's Culinary (Hatirjheel) and Bengali Heritage (Old Dhaka). The outside
// is a landmark (src/world/landmarks/hotels.js); this feature does the inside:
//   - sliding glass doors that open once the inside has loaded (data/streaming.json → areas
//     'hotel-<id>' brings assets/food/food.glb; until then they stay shut)
//   - walking in: a short fade, a closer indoor camera, the room lights itself (no rain inside)
//   - lobby, restaurant, bar (./interior.js) with a receptionist, diners, dancers (./staff.js)
//   - sit at a free table (or a bar stool) → the waiter walks over → menu card (./menu.js) →
//     pay → he brings the dishes on a tray → eat → health (./order.js, 3D food: ./dishes.js)
//   - the bar's dance floor: press ঢোকো / E to dance (plain party dancing, adults only)
// Numbers: data/hotels.json. Menu: data/menu.json. Prices: data/economy.json → prices.food /
// prices.drink, overridden by the Products tab of the Google Sheet (kind food / drink).
//
// Events  listens stream:loaded { group }, input:action, input:jump, player:actionChanged,
//                 player:died, player:busted, jail:entered, danger:raised, language:changed
//         sends   interior:changed { inside, id } (dayNight: indoor light, weather: no rain),
//                 hotel:ate { hotel, items }, prompt:show / prompt:hide { id: 'hotel' },
//                 toast:show, map:blips { id: 'hotels' }, player:teleport / freeze / action /
//                 heal, shop:purchased { shop, kind, item, price }, earn:offer (menu: not enough Taka)
// Debug: BC.hotels (list, seat(hotelId), state()).

import * as THREE from 'three';
import { log, debugLine } from '../../core/debug.js';
import { Rng } from '../../core/rng.js';
import { COLLIDE } from '../../world/collision.js';
import { HOTEL_SHELL as S } from '../../world/landmarks/hotels.js';
import { acquireCrowd } from '../../entities/people/crowd.js';
import { Boombox } from '../../audio/boombox.js';
import { pickName } from '../../ui/i18n.js';
import { buildInterior } from './interior.js';
import { DishMaker } from './dishes.js';
import { HotelPeople } from './staff.js';
import { MenuCard, menuBook } from './menu.js';
import { Meal } from './order.js';

let game = null;
let cfg = null;
let crowd = null;
let boombox = null;
let root = null;
let hotels = [];          // runtime per hotel (below)
let mats = null;
let dishes = null;
let card = null;
let menu = null;
let inside = null;        // hotel runtime Shoumik is inside
let seat = null;          // { kind, table|stool, chair, rt }
let meal = null;
let dancing = false;
let promptKey = null;
let fadeEl = null;
let offs = [];

/** Room lights itself (same look day and night): adds the surface colour × amount as emission. */
function selfLit(mat, amount) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uSelfLight = { value: amount };
    sh.fragmentShader = `uniform float uSelfLight;\n${sh.fragmentShader}`.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += diffuseColor.rgb * uSelfLight;');
  };
  mat.customProgramCacheKey = () => `selfLit${amount}`;
  return mat;
}

const local = (rt, x, z) => { const s = rt.site, c = Math.cos(s.angle), n = Math.sin(s.angle), dx = x - s.cx, dz = z - s.cz; return { x: dx * c - dz * n, z: dx * n + dz * c }; };
const world = (rt, x, z) => { const s = rt.site, c = Math.cos(s.angle), n = Math.sin(s.angle); return { x: s.cx + x * c + z * n, z: s.cz - x * n + z * c }; };
const hotelName = (rt) => pickName(rt.place?.name || rt.placeDef?.name) || rt.hotel.id;

function prompt(key) {
  if (key === promptKey) return;
  promptKey = key;
  if (key) game.events.emit('prompt:show', { id: 'hotel', key });
  else game.events.emit('prompt:hide', { id: 'hotel' });
}

function fade() {
  // The black layer exists only during the fade, so it never catches a tap on the HUD.
  fadeEl.hidden = false;
  requestAnimationFrame(() => fadeEl.classList.add('on'));
  setTimeout(() => fadeEl.classList.remove('on'), (cfg.fadeSeconds * 1000) / 2);
  setTimeout(() => { fadeEl.hidden = true; }, cfg.fadeSeconds * 1000 + 50);
}

// ---- doors: two sliding glass leaves + a collider that is removed once the inside is ready
function makeDoors(rt) {
  const D = cfg.doors;
  const group = new THREE.Group();
  group.name = `hotel-doors-${rt.hotel.id}`;
  const p = world(rt, 0, S.z1 - S.wall / 2);
  group.position.set(p.x, rt.site.y, p.z);
  group.rotation.y = rt.site.angle;
  const glass = new THREE.MeshStandardMaterial({ color: D.glass, transparent: true, opacity: 0.55, roughness: 0.1, metalness: 0.3 });
  const frame = new THREE.MeshStandardMaterial({ color: D.frame, roughness: 0.4, metalness: 0.6 });
  rt.leaves = [-1, 1].map((side) => {
    const leaf = new THREE.Group();
    leaf.add(new THREE.Mesh(new THREE.BoxGeometry(D.width - 0.1, D.height - 0.1, 0.05), glass));
    const f = new THREE.Mesh(new THREE.BoxGeometry(D.width, 0.1, 0.08), frame);
    f.position.y = D.height / 2 - 0.05;
    leaf.add(f, f.clone().translateY(-(D.height - 0.1)));
    leaf.position.set(side * D.width / 2, D.height / 2, 0);
    leaf.userData.side = side;
    group.add(leaf);
    return leaf;
  });
  root.add(group);
  rt.doorGroup = group;
  const a = world(rt, -S.door, S.z1 - S.wall), b = world(rt, S.door, S.z1);
  rt.doorBox = game.world.collision.add(Math.min(a.x, b.x), Math.min(a.z, b.z), Math.max(a.x, b.x), Math.max(a.z, b.z), COLLIDE.SOLID);
  rt.doorOpen = 0;
}

// ---- building the inside (when its stream group has arrived)
async function buildInside(rt) {
  if (rt.built || rt.building) return;
  rt.building = true;
  try {
    if (!dishes.kit && game.assets.url('model.food.kit')) {
      try { dishes.setKit(await game.assets.load('model.food.kit')); } catch (err) { log.warn('hotels: food models not available, using stand-ins', err.message); }
    }
    const L = game.world.landmarks;
    const place = buildInterior(rt.site, rt.hotel, cfg, L.signUv?.(rt.site.id) || null);
    place.y = rt.site.y;
    const g = new THREE.Group();
    g.name = `hotel-inside-${rt.hotel.id}`;
    for (const [key, mat] of [['lit', mats.lit], ['glow', L.materials.glow], ['sign', L.materials.sign]]) {
      if (place.builders[key].isEmpty) continue;
      const mesh = new THREE.Mesh(place.builders[key].build(), mat);
      mesh.matrixAutoUpdate = false;
      g.add(mesh);
    }
    for (const c of place.colliders) game.world.collision.add(c.x0, c.z0, c.x1, c.z1, c.camera ? COLLIDE.SOLID | COLLIDE.CAMERA : COLLIDE.SOLID);
    root.add(g);
    rt.group = g;
    rt.place = Object.assign(place, { name: rt.placeDef.name });
    rt.people = new HotelPeople(game, crowd, rt.hotel, place, cfg, new Rng(rt.seed), game.config.get('pedestrians'));
    rt.built = true;
    game.world.collision.setFlags(rt.doorBox, 0);
    log.info(`hotel "${rt.hotel.id}" inside ready: ${place.tables.length} tables, ${place.stools.length} bar stools`);
  } catch (err) {
    log.error(`hotel "${rt.hotel.id}" inside could not be built`, err);
  } finally {
    rt.building = false;
  }
}

// ---- seats
function freeTableNear(rt, p) {
  let best = null, bd = cfg.table.sitRadius;
  for (const t of rt.place.tables) {
    if (rt.people.dinerTables.has(t)) continue;
    const d = Math.hypot(t.x - p.x, t.z - p.z);
    if (d < bd) { bd = d; best = t; }
  }
  return best;
}

function freeStoolNear(rt, p) {
  let best = null, bd = 1.3;
  for (const s of rt.place.stools) {
    if (s.taken) continue;
    const d = Math.hypot(s.x - p.x, s.z - p.z);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

function onDanceFloor(rt, p) {
  const D = rt.place?.dance;
  if (!D) return false;
  const l = local(rt, p.x, p.z);
  return l.x > D.x0 && l.x < D.x1 && l.z > D.z0 && l.z < D.z1;
}

function sitDown(rt, kind, thing) {
  const p = game.player.position;
  let chair = thing;
  if (kind === 'table') chair = thing.chairs.reduce((a, c) => (Math.hypot(c.x - p.x, c.z - p.z) < Math.hypot(a.x - p.x, a.z - p.z) ? c : a));
  seat = { kind, rt, chair, table: kind === 'table' ? thing : null, stool: kind === 'stool' ? thing : null };
  if (kind === 'stool') thing.taken = true;
  game.events.emit('player:teleport', { x: chair.x, z: chair.z, heading: chair.heading });
  game.cameraRig.setTarget(game.player, 'indoor', true);
  game.events.emit('player:freeze', { on: true });
  game.events.emit('player:action', { name: 'sit' });
  meal = new Meal(rt, seat, helpers);
  meal.call();
}

function standUp(eatRest = true) {
  if (!seat) return;
  meal?.end(eatRest);
  meal = null;
  if (seat.stool) seat.stool.taken = false;
  const c = seat.chair, back = seat.table || seat.stool;
  // Step out on the far side of the chair from the table.
  const dx = c.x - back.x, dz = c.z - back.z, d = Math.hypot(dx, dz) || 1;
  const out = seat.kind === 'stool' ? 0.8 : 0.55;
  seat = null;
  game.events.emit('player:action', { name: 'sit', on: false });
  game.events.emit('player:freeze', { on: false });
  if (!game.player.dead) {
    game.events.emit('player:teleport', { x: c.x + (dx / d) * out, z: c.z + (dz / d) * out, heading: Math.atan2(dx, dz) });
    if (inside) game.cameraRig.setTarget(game.player, 'indoor', true);
  }
  prompt(null);
}

const helpers = {
  get game() { return game; }, get cfg() { return cfg; }, get card() { return card; }, get menu() { return menu; },
  get dishes() { return dishes; }, get materials() { return mats; }, get root() { return root; },
  hotelName, prompt: (key) => { if (seat) prompt(key); },
};

function onAction() {
  if (!inside?.built || game.paused || game.player?.mode !== 'onFoot' || game.player.dead) return;
  if (seat) {
    if (meal && (meal.state === 'idle' || meal.state === 'done')) { meal.clearDishes(); meal.call(); }
    return;
  }
  const p = game.player.position;
  const rt = inside;
  if (onDanceFloor(rt, p)) {
    if (!dancing) game.events.emit('player:action', { name: 'dance', beat: () => boombox.beat() });
    return;
  }
  const t = freeTableNear(rt, p);
  if (t) return sitDown(rt, 'table', t);
  const s = freeStoolNear(rt, p);
  if (s) sitDown(rt, 'stool', s);
}

function setInside(rt) {
  if (rt === inside) return;
  if (seat && !rt) standUp(true);
  inside = rt;
  fade();
  game.world.sky.indoorLight = rt ? cfg.indoorLight.ambient : 0;
  game.events.emit('interior:changed', { inside: !!rt, id: rt?.hotel.id || null });
  game.cameraRig.setTarget(game.player, rt ? 'indoor' : 'onFoot');
  if (rt) game.events.emit('toast:show', { key: 'hotel.welcome', vars: { hotel: hotelName(rt) } });
  else prompt(null);
}

export default {
  id: 'hotels',

  async init(g) {
    game = g;
    cfg = g.config.get('hotels');
    menu = menuBook(g);
    g.cameraRig.cfg.indoor = cfg.camera; // the indoor camera mode (ChaseCamera reads cfg[mode])
    crowd = await acquireCrowd(g);
    boombox = new Boombox(g.audio);
    root = new THREE.Group();
    root.name = 'hotels';
    g.scene.add(root);
    const facade = g.world.shared.facadeMaterial;
    mats = {
      lit: selfLit(new THREE.MeshLambertMaterial({ map: facade.map, vertexColors: true }), cfg.indoorLight.selfLight),
      food: selfLit(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), cfg.indoorLight.selfLight),
      glass: new THREE.MeshStandardMaterial({ color: '#e8f6ff', transparent: true, opacity: 0.35, roughness: 0.08, depthWrite: false }),
    };
    dishes = new DishMaker(g.config.get('menu').items, null);
    card = new MenuCard(g, menu, cfg.order.maxItems);
    fadeEl = document.createElement('div');
    fadeEl.className = 'hotel-fade';
    fadeEl.hidden = true;
    fadeEl.style.pointerEvents = 'none';
    fadeEl.style.transitionDuration = `${cfg.fadeSeconds / 2}s`;
    g.ui.appendChild(fadeEl);

    const places = g.content.get('places') || [];
    const seed = g.config.get('world').seed;
    hotels = [];
    cfg.hotels.forEach((hotel, i) => {
      const site = g.world.landmarks?.sites.find((s) => s.id === hotel.place);
      if (!site) { log.warn(`hotel "${hotel.id}": no landmark for place "${hotel.place}"`); return; }
      const placeDef = places.find((p) => p.id === hotel.place) || { name: { en: hotel.id, bn: hotel.id } };
      const rt = { hotel, site, placeDef, group: null, place: null, people: null, built: false, awake: false, seed: (seed ^ 0x4073e1) + i * 977, stream: `hotel-${hotel.id}` };
      makeDoors(rt);
      hotels.push(rt);
    });
    g.events.emit('map:blips', {
      id: 'hotels',
      points: hotels.map((rt) => { const p = world(rt, 0, S.z1 + 8); return { id: rt.hotel.id, x: p.x, z: p.z, color: '#ffd35a', icon: rt.hotel.icon, label: rt.placeDef.name, group: 'hotels', big: true, routeable: true }; }),
    });

    offs = [
      g.events.on('stream:loaded', ({ group }) => { const rt = hotels.find((h) => h.stream === group); if (rt) buildInside(rt); }),
      g.events.on('input:action', onAction),
      g.events.on('input:jump', () => { if (seat && !game.paused) standUp(true); }),
      g.events.on('player:actionChanged', ({ name, on }) => { if (name === 'dance') dancing = on; }),
      g.events.on('player:died', () => standUp(false)),
      g.events.on('player:busted', () => standUp(false)),
      g.events.on('jail:entered', () => standUp(false)),
      g.events.on('danger:raised', ({ x, z, radius = 16 }) => {
        for (const rt of hotels) if (rt.awake && Math.hypot(rt.site.cx - x, rt.site.cz - z) < radius + 40) rt.people.scare(4);
      }),
      g.events.on('game:paused', ({ paused }) => boombox.setPaused(paused)),
    ];
    g.hotels = {
      list: hotels,
      get inside() { return inside; },
      get seat() { return seat; },
      get meal() { return meal; },
      card,
      build: (id) => buildInside(hotels.find((h) => h.hotel.id === id)),
      doorOf: (id) => { const rt = hotels.find((h) => h.hotel.id === id); return rt && world(rt, 0, S.z1 + 3); },
      standUp,
    };
    log.info('hotels:', hotels.map((h) => `${h.hotel.id} @ ${h.site.cx.toFixed(0)},${h.site.cz.toFixed(0)}`).join(' | '));
  },

  update(dt) {
    const pl = game.player;
    if (!pl) return;
    const p = pl.position;
    let now = null, music = 0, bpm = cfg.barCounter.bpm;
    for (const rt of hotels) {
      const d = Math.hypot(rt.site.cx - p.x, rt.site.cz - p.z);
      // Fallback when the streaming feature is switched off: build when close.
      if (!rt.built && !game.features?.get?.('streaming') && d < cfg.room.showDistance * 2) buildInside(rt);
      if (rt.group) rt.group.visible = d < cfg.room.showDistance;
      // Doors slide open when he is close (and the inside is ready).
      const door = world(rt, 0, S.z1);
      const want = rt.built && Math.hypot(door.x - p.x, door.z - p.z) < cfg.doors.openDistance ? 1 : 0;
      rt.doorOpen += Math.sign(want - rt.doorOpen) * Math.min(Math.abs(want - rt.doorOpen), cfg.doors.speed * dt);
      for (const leaf of rt.leaves) leaf.position.x = leaf.userData.side * cfg.doors.width / 2 * (1 + 0.95 * rt.doorOpen);
      rt.doorGroup.visible = d < cfg.room.showDistance * 2;
      if (!rt.built) continue;
      // People only while he is near.
      const wake = d < cfg.diners.wakeDistance;
      if (wake && !rt.awake) { rt.people.wake(root, dishes, mats, () => boombox.beat()); rt.awake = true; }
      else if (!wake && rt.awake && d > cfg.diners.wakeDistance + 15) { if (seat?.rt === rt) standUp(false); rt.people.sleep(); rt.awake = false; }
      if (rt.awake) { rt.people.update(dt, d > game.quality.pedLodDistance); rt.people.tick(dt); }
      // Inside?
      const l = local(rt, p.x, p.z);
      if (pl.mode === 'onFoot' && l.x > S.x0 && l.x < S.x1 && l.z > S.z0 && l.z < S.z1 - S.wall) now = rt;
      if (rt.place?.dance && rt.awake) {
        const D = rt.place.dance, c = world(rt, (D.x0 + D.x1) / 2, (D.z0 + D.z1) / 2);
        const hd = Math.hypot(c.x - p.x, c.z - p.z);
        const hear = cfg.barCounter.hearDistance * (now === rt ? 1 : 0.35);
        if (hd < hear) { music = Math.max(music, (1 - hd / hear) ** 2); bpm = cfg.barCounter.bpm; }
      }
    }
    if (now !== inside) setInside(now);
    // Keep the indoor camera (a teleport, e.g. sitting down, resets the chase camera to 'onFoot').
    if (inside && pl.mode === 'onFoot' && game.cameraRig.mode !== cfg.camera) game.cameraRig.setTarget(pl, 'indoor');
    boombox.set(game.save.data.settings.sound === false ? 0 : cfg.barCounter.musicVolume * music, bpm);
    meal?.update(dt);

    // The one-line hint.
    if (inside?.built && pl.mode === 'onFoot' && !pl.dead) {
      if (seat) { if (meal && ['idle', 'done'].includes(meal.state)) prompt(meal.state === 'done' ? 'hotel.again' : 'hotel.idle'); }
      else if (onDanceFloor(inside, p)) prompt(dancing ? 'hotspot.stop' : 'hotspot.dance');
      else if (freeTableNear(inside, p)) prompt('hotel.sit');
      else if (freeStoolNear(inside, p)) prompt('hotel.sitBar');
      else prompt(null);
    } else if (!inside && !seat) {
      const near = hotels.find((rt) => !rt.built && Math.hypot(world(rt, 0, S.z1).x - p.x, world(rt, 0, S.z1).z - p.z) < cfg.doors.openDistance + 2);
      prompt(near ? 'hotel.loading' : null);
    }
    debugLine('hotel', inside ? `hotel ${inside.hotel.id}${seat ? ` · ${meal?.state}` : ''}` : '');
  },

  dispose() {
    standUp(false);
    offs.forEach((off) => off());
    offs = [];
    for (const rt of hotels) { if (rt.awake) rt.people.sleep(); game.world.collision.setFlags(rt.doorBox, 0); }
    hotels = [];
    boombox?.dispose();
    card?.dispose();
    dishes?.dispose();
    fadeEl?.remove();
    root?.removeFromParent();
    if (game.world.sky) game.world.sky.indoorLight = 0;
    game.events.emit('prompt:hide', { id: 'hotel' });
    game.hotels = null;
  },
};
