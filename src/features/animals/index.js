// Feature: animals (Roadmap 2 S5). Stray dogs and cats on the sidewalks, cows and goats in Old
// Dhaka's lanes and the countryside fields, crows on wires and rooftops, ducks on the lakes and
// ponds. They live around Shoumik like the pedestrians: appear out of view, disappear far away.
//   - models.js  code-built low-poly bodies (no download, nothing to stream)
//   - render.js  a few InstancedMeshes per kind (body, head, legs, wings)
//   - spots.js   where each kind may be (sidewalk, lane, field, wire, roof, water)
//   - brain.js   wander / lie down / graze / swim / perch, flee, fly away
// Gunshots, explosions and `danger:raised` scare them (birds fly off); a car driving at them
// makes them jump away — animals are never hurt (no gore, CLAUDE.md / owner). Numbers and
// counts per quality: data/animals.json.
//
// Listens: weapon:fired, police:fired, explosion, danger:raised, vehicle:crashed.
// Debug / tests: BC.animals.report(), .nearest(kinds), .testSpots()

import { Rng } from '../../core/rng.js';
import { debugLine } from '../../core/debug.js';
import { KIND } from '../../world/layout.js';
import { SidewalkNav } from '../pedestrians/navigation.js';
import { MODELS } from './models.js';
import { AnimalRenderer } from './render.js';
import { AnimalSpots } from './spots.js';
import { AnimalBrain } from './brain.js';
import { hexToLinear } from '../../world/geoBuilder.js';

let game = null;
let cfg = null;
let rng = null;
let spots = null;
let brain = null;
let renderer = null;
let animals = [];
let offs = [];
let warm = true;
let carTimer = 0;
let last = null;
const models = {};

function quota() {
  return cfg.quality[game.qualityName] || cfg.quality.medium;
}

function count(kind) {
  let n = 0;
  for (const a of animals) if (a.kind === kind) n++;
  return n;
}

/** Try to add one animal of a kind that is below its number. */
function populate() {
  const q = quota();
  const S = cfg.spawn;
  if (animals.length >= q.total) return;
  const p = game.player.position;
  const cam = game.camera.position;
  const fwd = game.cameraRig.forward();
  const kinds = Object.keys(cfg.kinds).filter((k) => (q[k] || 0) > count(k));
  if (!kinds.length) return;
  for (let t = warm ? S.warmTries : S.tries; t > 0; t--) {
    const name = rng.pick(kinds);
    const k = cfg.kinds[name];
    const ang = rng.range(0, Math.PI * 2);
    const d = rng.range(warm ? 6 : S.minDistance, S.maxDistance);
    const s = spots.find(name, k, p.x + Math.sin(ang) * d, p.z + Math.cos(ang) * d, rng);
    if (!s) continue;
    const dist = Math.hypot(s.x - p.x, s.z - p.z);
    if (dist > S.maxDistance || dist < (warm ? 4 : S.minDistance)) continue;
    if (!warm && dist < S.minDistanceInView) {
      const cx = s.x - cam.x, cz = s.z - cam.z;
      if ((cx * fwd.x + cz * fwd.z) / (Math.hypot(cx, cz) || 1) > 0.25) continue;
    }
    add(name, k, s);
    if (!warm) return;
    if (animals.length >= q.total) return;
  }
}

function add(name, k, s) {
  const c = hexToLinear(rng.pick(k.colours));
  const a = {
    kind: name, k, model: models[name], x: s.x, y: s.y, z: s.z,
    heading: s.heading ?? rng.range(-Math.PI, Math.PI), scale: rng.range(0.9, 1.1), color: c,
    state: 'idle', timer: rng.range(0.5, 3), pose: 'stand', speed: 0, tx: s.x, tz: s.z,
    legPhase: rng.range(0, 6), legAmp: 0, lie: 0, headPitch: 0, headYaw: 0, wings: 0, flap: 0,
    pitch: 0, bob: 0, hop: 0, vy: 0, seed: rng.range(0, 10), look: 0,
    perched: k.where === 'perch', water: s.water || null, visible: true,
  };
  brain.idle(a);
  animals.push(a);
}

/** After the quality went down: remove the farthest animal of a kind that has too many. */
function trim() {
  const q = quota();
  const over = Object.keys(cfg.kinds).find((name) => count(name) > (q[name] || 0));
  if (!over && animals.length <= q.total) return;
  const p = game.player.position;
  let far = -1, fd = -1;
  animals.forEach((a, i) => {
    if (over && a.kind !== over) return;
    const d = Math.hypot(a.x - p.x, a.z - p.z);
    if (d > fd) { fd = d; far = i; }
  });
  if (far >= 0) animals.splice(far, 1);
}

/** Everything within `radius` of (x, z) runs or flies off. */
function scareAt(x, z, radius) {
  for (const a of animals) {
    if (Math.hypot(a.x - x, a.z - z) < radius) brain.scare(a, x, z, true);
  }
}

/** Moving vehicles near animals: jump away; driving straight through one = a hop, then run. */
function checkCars() {
  const fleet = game.fleet;
  if (!fleet) return;
  const B = cfg.behaviour;
  for (const v of fleet.vehicles) {
    const sp = Math.abs(v.speed || 0);
    if (sp < B.carSpeed) continue;
    for (const a of animals) {
      if (a.state === 'flee' || a.state === 'fly' || a.perched || a.water) continue;
      const d = Math.hypot(a.x - v.x, a.z - v.z);
      if (d > B.carRadius) continue;
      if (d < 1.4) brain.bump(a, v.vx || 0, v.vz || 0);
      else brain.scare(a, v.x, v.z, true);
    }
  }
}

export default {
  id: 'animals',

  init(g) {
    game = g;
    cfg = g.config.get('animals');
    rng = new Rng(g.config.get('world').seed ^ 0xa11a);
    const capacity = {};
    for (const name of Object.keys(cfg.kinds)) {
      capacity[name] = Math.max(...Object.values(cfg.quality).map((q) => q[name] || 0));
      if (MODELS[name]) models[name] = MODELS[name]();
    }
    renderer = new AnimalRenderer(g.scene, capacity);
    spots = new AnimalSpots(g, cfg, new SidewalkNav(g.world.layout));
    brain = new AnimalBrain({ game: g, cfg, spots, rng });
    animals = [];
    warm = true;
    const near = (radius) => ({ x, z }) => scareAt(x, z, radius);
    offs = [
      g.events.on('weapon:fired', near(cfg.behaviour.scareRadius)),
      g.events.on('police:fired', near(cfg.behaviour.scareRadius)),
      g.events.on('explosion', ({ x, z, radius = 6 }) => scareAt(x, z, Math.max(cfg.behaviour.scareRadius, radius * 3))),
      g.events.on('danger:raised', ({ x, z, radius = 12 }) => scareAt(x, z, radius)),
      g.events.on('vehicle:crashed', near(cfg.behaviour.scareRadius * 0.5)),
    ];
    g.animals = {
      list: animals,
      report: () => {
        const byKind = {};
        for (const a of animals) byKind[a.kind] = (byKind[a.kind] || 0) + 1;
        return { total: animals.length, byKind, fleeing: animals.filter((a) => a.state === 'flee' || a.state === 'fly').length };
      },
      nearest: (kinds) => {
        const p = game.player.position;
        let best = null, bd = Infinity;
        for (const a of animals) {
          if (kinds && !kinds.includes(a.kind)) continue;
          const d = Math.hypot(a.x - p.x, a.z - p.z);
          if (d < bd) { bd = d; best = a; }
        }
        return best && { kind: best.kind, x: best.x, y: best.y, z: best.z, state: best.state };
      },
      testSpots,
    };
  },

  update(dt) {
    if (!game.player) return;
    const p = game.player.position;
    // A teleport (jail, tests, the map) starts a fresh fill around the new place.
    if (last && Math.hypot(p.x - last.x, p.z - last.z) > 60) warm = true;
    last = { x: p.x, z: p.z };
    populate();
    trim();
    warm = false;
    carTimer -= dt;
    if (carTimer <= 0) { carTimer = 0.15; checkCars(); }
    const B = cfg.behaviour;
    const S = cfg.spawn;
    for (let i = animals.length - 1; i >= 0; i--) {
      const a = animals[i];
      const d = Math.hypot(a.x - p.x, a.z - p.z);
      const gone = a.state === 'fly' && (d > a.k.fly.gone || a.timer <= 0);
      if (d > S.despawnDistance || gone) { animals.splice(i, 1); continue; }
      if (d < B.playerRadius && a.state === 'idle') brain.scare(a, p.x, p.z, false);
      brain.update(a, dt);
    }
    renderer.draw(animals);
    debugLine('animals', `animals ${animals.length}`);
  },

  dispose() {
    offs.forEach((off) => off());
    offs = [];
    renderer?.dispose();
    renderer = null;
    animals = [];
    if (game) game.animals = null;
  },
};

/** For tools/people-check.js: places to photograph each kind (street, Old Dhaka, a lake, fields). */
function testSpots() {
  const L = game.world.layout;
  const p = game.player.position;
  const out = [{ label: 'street', kinds: ['dog', 'cat'], x: p.x, z: p.z }, { label: 'crows', kinds: ['crow'], x: p.x, z: p.z }];
  // The Old Dhaka block nearest the middle of Old Dhaka (not one at the edge of the city).
  const olds = L.pieces.filter((q) => q.kind === KIND.BLOCK && L.districts[q.district]?.id === 'old-dhaka' && !q.area);
  if (olds.length) {
    const mx = olds.reduce((s, q) => s + q.x, 0) / olds.length, mz = olds.reduce((s, q) => s + q.z, 0) / olds.length;
    const old = olds.reduce((b, q) => (Math.hypot(q.x - mx, q.z - mz) < Math.hypot(b.x - mx, b.z - mz) ? q : b));
    out.push({ label: 'old-dhaka', kinds: ['cow', 'goat'], x: old.x - 3, z: old.z + old.d / 2 });
  }
  const lake = L.pieces.find((q) => q.kind === KIND.WATER && q.w > 40);
  if (lake) out.push({ label: 'lake', kinds: ['duck'], x: lake.x - 4, z: lake.z + lake.d / 2 });
  const T = game.world.terrain;
  if (T) {
    const zones = cfg.kinds.cow.zones;
    const cx = (L.minX + L.maxX) / 2, cz = (L.minZ + L.maxZ) / 2;
    search: for (let r = 400; r < 2400; r += 120) {
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2;
        const x = cx + Math.sin(a) * r, z = cz + Math.cos(a) * r;
        const zone = T.zoneAt(x, z);
        if (zone && zones.includes(zone.id) && game.world.heightAt(x, z) > game.config.get('world').water.level + 0.5 && !game.world.collision.isBlocked(x, z, 2)) {
          out.push({ label: 'fields', kinds: ['cow', 'goat'], x, z });
          break search;
        }
      }
    }
  }
  return out;
}
