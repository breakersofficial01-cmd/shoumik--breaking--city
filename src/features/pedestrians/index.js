// Feature: pedestrians. Dhaka's street crowd — lungi, panjabi, shirt-pant, saree, salwar
// kameez, hijab, office wear, hawkers, rickshaw pullers, students, Gen-Z streetwear.
// They walk the sidewalks, cross roads, run from danger, shout, and some hit back.
//
// How it is built (so it stays fast on a phone):
//   - looks come from data/pedestrians.json (archetypes + colours) → entities/people/looks.js
//   - everybody is drawn by the shared instanced crowd (entities/people/crowd.js)
//   - a fixed POOL of pedestrian objects is reused: people far from the player are recycled
//     and re-appear ahead of him; how many depends on the quality level and the district
//   - LOD: far people are drawn simpler and skip collision checks
//
// Events
//   listens  player:attack { x, z, heading, range, arc, power }   → who got hit
//            danger:raised { x, z, radius, source }               → run / cower / shout
//            vehicle:driverEjected { x, z, heading, archetype, angry }  → a driver thrown out of his vehicle becomes a pedestrian
//            explosion { x, z, radius }                            → everybody close is knocked down
//   Vehicles: people dive away from fast vehicles and are knocked down when hit (roadSense.js).
//   sends    ped:hit { x, z, down }      danger:raised (when the player hits somebody)
//            player:hit { x, z, power }  (a pedestrian punched Shoumik)

import { debug, debugLine } from '../../core/debug.js';
import { Rng } from '../../core/rng.js';
import { Animator } from '../../entities/people/animator.js';
import { buildLook } from '../../entities/people/looks.js';
import { acquireCrowd } from '../../entities/people/crowd.js';
import { SidewalkNav } from './navigation.js';
import { Brain } from './brain.js';
import { Bubbles } from './bubbles.js';
import { RoadSense } from './roadSense.js';

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

let game = null;
let cfg = null;
let crowd = null;
let nav = null;
let brain = null;
let bubbles = null;
let roadSense = null;
let rng = null;
let peds = [];      // the pool
let active = 0;
let warm = true;    // first fill: people may appear anywhere, even in view
let offs = [];

function makePed() {
  const ped = {
    active: false, x: 0, y: 0, z: 0, heading: 0, speed: 0,
    state: 'walk', timer: 0, node: null, prev: null, off: 2, crossing: false,
    walkSpeed: 1.2, runSpeed: 5, hp: 1, fighter: false, arch: null,
    stuck: 0, markX: 0, markZ: 0, fleeFrom: null, fleePlayer: false, fleeTurn: 0,
    punchIn: 0, hitIn: -1, punchSide: 1,
    animator: new Animator(null),
    person: null,
    circle: { x: 0, z: 0, r: cfg.spawn.radius, owner: null },
  };
  ped.circle.owner = ped;
  return ped;
}

function shout(ped, kind) {
  const keys = cfg.shouts[kind];
  if (keys?.length) bubbles.say(ped, rng.pick(keys));
}

function despawn(ped) {
  if (!ped.active) return;
  ped.active = false;
  crowd.remove(ped.person);
  ped.person = null;
  game.world.collision.dynamic.delete(ped.circle);
  active--;
}

/** Put a pooled pedestrian on the sidewalk at `spot`, walking towards one end of that edge. */
function spawn(ped, spot, district, archetype = null) {
  const mix = cfg.districts[district?.id] || cfg.districts.default;
  const arch = cfg.archetypes[archetype] || cfg.archetypes[rng.weighted(mix.mix)] || Object.values(cfg.archetypes)[0];
  const look = buildLook(arch, cfg.palettes, rng);
  const forward = rng.chance(0.5);
  Object.assign(ped, {
    active: true, arch, x: spot.x, z: spot.z, y: game.world.heightAt(spot.x, spot.z),
    node: forward ? spot.b : spot.a, prev: forward ? spot.a : spot.b,
    state: 'walk', timer: 0, crossing: false, speed: 0, stuck: 0, markX: spot.x, markZ: spot.z,
    walkSpeed: rng.range(arch.speed[0], arch.speed[1]),
    fighter: rng.chance(arch.brave), fleeFrom: null, hitIn: -1,
  });
  ped.hp = ped.fighter ? cfg.behaviour.fighterHealth : cfg.behaviour.health;
  const target = nav.cornerPos(ped.node, ped.off, { x: 0, z: 0 });
  ped.heading = Math.atan2(target.x - ped.x, target.z - ped.z);
  ped.animator.dims = look.dims;
  ped.animator.configure({ idle: arch.idle || 'idle', stride: arch.stride ?? 1, runAt: 5 });
  ped.animator.reset();
  ped.person = crowd.add(look, ped.animator.pose);
  game.world.collision.dynamic.add(ped.circle);
  active++;
}

/** Try to find a good sidewalk spot around the player for a new pedestrian. */
function findSpot(ped) {
  const s = cfg.spawn;
  const p = game.player.position;
  const cam = game.camera.position;
  const fwd = game.cameraRig.forward();
  const a = rng.range(0, Math.PI * 2);
  const d = rng.range(warm ? 8 : s.minDistance, s.maxDistance);
  ped.off = rng.range(s.laneOffset[0], s.laneOffset[1]);
  const spot = nav.sidewalkSpot(p.x + Math.sin(a) * d, p.z + Math.cos(a) * d, ped.off);
  if (!spot) return null;
  const dist = Math.hypot(spot.x - p.x, spot.z - p.z);
  if (dist > s.maxDistance || dist < (warm ? 6 : s.minDistance)) return null;
  if (!warm && dist < s.minDistanceInView) {
    // Close spots are only allowed where the camera is not looking.
    const cx = spot.x - cam.x, cz = spot.z - cam.z;
    if ((cx * fwd.x + cz * fwd.z) / (Math.hypot(cx, cz) || 1) > 0.25) return null;
  }
  if (game.world.collision.isBlocked(spot.x, spot.z, s.radius)) return null;
  return spot;
}

function populate() {
  const s = cfg.spawn;
  const district = game.world.districtAt(game.player.position.x, game.player.position.z);
  const density = (cfg.districts[district?.id] || cfg.districts.default).density;
  const target = Math.min(peds.length, Math.round(game.quality.pedestrians * density));
  let made = 0;
  const maxNew = warm ? target : s.perFrame;
  for (let tries = warm ? target * 6 : s.triesPerFrame; tries > 0 && active < target && made < maxNew; tries--) {
    const ped = peds.find((x) => !x.active);
    if (!ped) break;
    const spot = findSpot(ped);
    if (!spot) continue;
    spawn(ped, spot, game.world.districtAt(spot.x, spot.z));
    made++;
  }
  warm = false;
}

/** Something frightening happened at (x, z). */
function onDanger({ x, z, radius, source }) {
  const b = cfg.behaviour;
  const r = radius || b.dangerRadius;
  for (const ped of peds) {
    if (!ped.active || ped.state === 'down' || ped.state === 'dive' || ped.state === 'fight' || ped.state === 'flee') continue;
    if (Math.hypot(ped.x - x, ped.z - z) > r) continue;
    if (rng.chance(b.shoutChance)) shout(ped, 'flee');
    if (rng.chance(b.cowerChance)) brain.startCower(ped, { x, z });
    else brain.startFlee(ped, { x, z }, source === 'player');
  }
}

/** Shoumik swung at something: hit the nearest pedestrian in front of him. */
function onPlayerAttack({ x, z, heading, range, arc, power = 1 }) {
  let best = null;
  let bestD = range;
  for (const ped of peds) {
    if (!ped.active || ped.state === 'down') continue;
    const dx = ped.x - x, dz = ped.z - z;
    const d = Math.hypot(dx, dz);
    if (d > bestD) continue;
    if (d > 0.3 && Math.abs(wrapAngle(Math.atan2(dx, dz) - heading)) > arc / 2) continue;
    best = ped;
    bestD = d;
  }
  if (!best) return;
  best.hp -= power;
  const down = best.hp <= 0;
  if (down) {
    brain.knockDown(best);
    shout(best, 'pain');
  } else {
    best.animator.play('hit');
    brain.startFight(best);
    shout(best, 'angry');
  }
  game.events.emit('ped:hit', { x: best.x, z: best.z, down });
  game.events.emit('danger:raised', { x: best.x, z: best.z, radius: cfg.behaviour.dangerRadius, source: 'player' });
}

/** A driver was dragged (or jumped) out of his vehicle: he becomes a pedestrian right there. */
function onDriverEjected({ x, z, heading, archetype, angry }) {
  let ped = peds.find((p) => !p.active);
  if (!ped) {
    // Pool is full: reuse the person furthest from the player.
    const p = game.player.position;
    let far = -1;
    for (const q of peds) {
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d > far) { far = d; ped = q; }
    }
    despawn(ped);
  }
  const spot = nav.sidewalkSpot(x, z, 2);
  if (!spot) return;
  ped.off = 2;
  spawn(ped, { ...spot, x, z }, game.world.districtAt(x, z), archetype);
  ped.heading = heading;
  shout(ped, 'jack');
  if (angry) {
    ped.fighter = true;
    ped.hp = cfg.behaviour.fighterHealth;
    brain.startFight(ped);
  } else {
    brain.knockDown(ped);
  }
}

function onExplosion({ x, z, radius }) {
  for (const ped of peds) {
    if (!ped.active || ped.state === 'down' || Math.hypot(ped.x - x, ped.z - z) > radius) continue;
    brain.knockDown(ped);
    shout(ped, 'pain');
    game.events.emit('ped:hit', { x: ped.x, z: ped.z, down: true, byExplosion: true });
  }
}

export default {
  id: 'pedestrians',

  async init(g) {
    game = g;
    cfg = g.config.get('pedestrians');
    rng = new Rng(g.config.get('world').seed ^ 0x5eed);
    crowd = await acquireCrowd(g);
    nav = new SidewalkNav(g.world.layout);
    bubbles = new Bubbles(g, cfg.behaviour.maxBubbles, cfg.behaviour.bubbleSeconds);
    brain = new Brain({
      game: g, cfg: cfg.behaviour, spawnCfg: cfg.spawn, nav, rng, shout,
      hitPlayer: (ped) => g.events.emit('player:hit', { x: ped.x, z: ped.z, power: cfg.behaviour.punchPower }),
    });
    roadSense = new RoadSense({ game: g, cfg: cfg.behaviour, radius: cfg.spawn.radius, brain, rng, shout });
    const most = Math.max(...Object.values(g.config.get('quality').levels).map((q) => q.pedestrians || 0));
    peds = Array.from({ length: most }, makePed);
    active = 0;
    warm = true;
    if (debug.enabled) g.debugPeds = peds; // ?debug=1: inspect them in the console as BC.debugPeds
    offs = [
      g.events.on('player:attack', onPlayerAttack),
      g.events.on('danger:raised', onDanger),
      g.events.on('vehicle:driverEjected', onDriverEjected),
      g.events.on('explosion', onExplosion),
    ];
  },

  update(dt) {
    if (!game.player) return;
    const s = cfg.spawn;
    const p = game.player.position;
    const lod = game.quality.pedLodDistance;
    populate();
    const traffic = roadSense.collect() > 0;
    for (const ped of peds) {
      if (!ped.active) continue;
      const dist = Math.hypot(ped.x - p.x, ped.z - p.z);
      if (dist > s.despawnDistance) { despawn(ped); continue; }
      const near = dist < s.collideDistance;
      if (traffic && near && ped.state !== 'down' && ped.state !== 'dive') roadSense.check(ped);
      brain.update(ped, dt, near);
      const ground = game.world.heightAt(ped.x, ped.z);
      ped.y += (ground - ped.y) * Math.min(1, 14 * dt);
      ped.circle.x = ped.x;
      ped.circle.z = ped.z;
      ped.circle.r = ped.state === 'down' ? 0 : s.radius;
      ped.animator.update(dt, { speed: ped.speed, panic: ped.state === 'flee' });
      const person = ped.person;
      person.x = ped.x; person.y = ped.y; person.z = ped.z;
      person.heading = ped.heading;
      person.groundY = ground;
      person.far = dist > lod;
    }
    bubbles.update(dt);
    debugLine('peds', `people ${active}/${peds.length}`);
  },

  dispose() {
    offs.forEach((off) => off());
    offs = [];
    for (const ped of peds) despawn(ped);
    peds = [];
    bubbles?.dispose();
    bubbles = brain = nav = roadSense = null;
  },
};
