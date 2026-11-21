// Feature: police (Session 6). Sends the police after Shoumik while he has wanted stars:
//   1 star   officers on foot with batons — they run up and arrest him
//   2 stars  more officers, now with pistols
//   3 stars  + police pickups that chase and ram him; their crew jumps out when he is on foot
//   4 stars  + the black-uniform unit (rifles) in black pickups, and road blocks ahead of him
//   5 stars  everything + a helicopter with a spotlight and a gunner
// Numbers: data/police.json (levels, spawn, officer, car, roadblock, helicopter). No real
// police names, crests or logos are used.
//
//   ./officers.js  one officer on foot        ./pursuit.js    a chasing pickup
//   ./roadblock.js road blocks                ./helicopter.js the helicopter
//
// Busted: an officer next to him for officer.bustSeconds while he is on foot and slow (or in a
// vehicle that has stopped) → player:busted { stars }. The jail feature does the rest.
//
// Events
//   listens  wanted:changed { stars }, police:standDown {} (Update 9b: penalty paid → all units leave), player:attack (punches / bat / machete on officers),
//            explosion { x, z, radius, by }, vehicle:driverEjected { police: true } (a police
//            driver dragged out becomes an officer), vehicle:entered (he took a police car)
//   sends    map:blips { id: 'police' } (Session 9: where the police are, while wanted)
//            police:sight { seen }   police:killed { by }   player:busted { stars }
//            player:damage / player:hit   danger:raised   crime:committed (destroyPolice, stealPolice)
//            combat:hit (melee on officers)

import { debugLine, log } from '../../core/debug.js';
import { Rng } from '../../core/rng.js';
import { COLLIDE } from '../../world/collision.js';
import { acquireCrowd } from '../../entities/people/crowd.js';
import { acquireFleet } from '../../entities/vehicles/fleet.js';
import { acquireCombatFx } from '../../entities/effects/combatFx.js';
import { Bubbles } from '../../ui/bubbles.js';
import { Officer } from './officers.js';
import { PoliceCar } from './pursuit.js';
import { Roadblocks } from './roadblock.js';
import { Helicopter } from './helicopter.js';

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

let game = null;
let cfg = null;
let ctx = null;
let officers = [];
let cars = [];
let heli = null;
let roadblocks = null;
let bubbles = null;
let stars = 0;
let spawnIn = 0;
let sightIn = 0;
let seen = null;          // last police:sight sent (null = send the next one whatever it is)
let bust = 0;
let offs = [];

const level = () => (stars > 0 ? cfg.levels[Math.min(stars, cfg.levels.length) - 1] : null);
const scaled = (n) => (n > 0 ? Math.max(1, Math.round(n * (game.quality.police ?? 1))) : 0);
const playerPos = () => {
  const p = game.player;
  return p.mode !== 'onFoot' && p.vehicle ? p.vehicle : p.position;
};

/** A free spot between min and max metres away, preferably behind the camera. */
function findSpot(min, max, onRoad = false) {
  const p = playerPos();
  const f = game.cameraRig.forward();
  const rng = ctx.rng;
  for (let i = 0; i < cfg.spawn.triesPerSpawn; i++) {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(min, max);
    const x = p.x + Math.sin(a) * d, z = p.z + Math.cos(a) * d;
    if (i < cfg.spawn.triesPerSpawn / 2 && Math.sin(a) * f.x + Math.cos(a) * f.z > 0.3) continue; // in view
    if (onRoad) {
      const near = game.world.roads.nearestSegment(x, z);
      if (!near) continue;
      const seg = game.world.roads.segment(near.c, near.r, near.d, 1.7);
      const u = seg.len * near.t;
      const sx = seg.ax + seg.fx * u, sz = seg.az + seg.fz * u;
      if (game.world.collision.isBlocked(sx, sz, 1.4)) continue;
      // Face roughly towards him.
      const toward = (p.x - sx) * seg.fx + (p.z - sz) * seg.fz > 0;
      return { x: sx, z: sz, heading: toward ? seg.heading : seg.heading + Math.PI };
    }
    if (!game.world.layout.pieceAt(x, z) || game.world.collision.isBlocked(x, z, 0.5)) continue;
    return { x, z, heading: Math.atan2(p.x - x, p.z - z) };
  }
  return null;
}

function spawnOfficer(kind, x, z, armed) {
  const o = new Officer(ctx, kind, x, z, armed);
  const p = playerPos();
  o.heading = Math.atan2(p.x - x, p.z - z);
  officers.push(o);
  return o;
}

function spawnCar() {
  const L = level();
  const spot = findSpot(cfg.spawn.carMinDistance, cfg.spawn.carMaxDistance, true);
  if (!spot) return;
  const types = cfg.car.types?.length ? cfg.car.types : [cfg.car.type]; // pickups and jeeps (Roadmap 2 S2)
  const v = ctx.fleet.create(types[Math.floor(Math.random() * types.length)], { x: spot.x, z: spot.z, heading: spot.heading, color: L.carColor });
  if (v) cars.push(new PoliceCar(ctx, v));
}

/** Keep the right number of each unit for the current stars. */
function staff(dt) {
  const L = level();
  spawnIn -= dt;
  if (!L || spawnIn > 0) return;
  spawnIn = cfg.spawn.every;
  const foot = officers.filter((o) => o.kind === 'police' && o.state !== 'dead' && o.state !== 'retreat').length;
  const swat = officers.filter((o) => o.kind === 'swat' && o.state !== 'dead' && o.state !== 'retreat').length;
  const chasing = cars.filter((c) => c.state === 'chase').length;
  if (foot < scaled(L.foot)) {
    const s = findSpot(cfg.spawn.minDistance, cfg.spawn.maxDistance);
    if (s) spawnOfficer('police', s.x, s.z, L.armed);
  } else if (swat < scaled(L.swat)) {
    const s = findSpot(cfg.spawn.minDistance, cfg.spawn.maxDistance);
    if (s) spawnOfficer('swat', s.x, s.z, true);
  } else if (chasing < scaled(L.cars)) {
    spawnCar();
  }
  if (L.helicopter && !heli) {
    const p = playerPos();
    heli = new Helicopter({ ...ctx, hooks: heliHooks }, p.x + 60, p.z + 60);
  }
  for (const o of officers) if (o.kind === 'police' && L.armed) o.armed = true;
}

/** Police shot at him from (x, y, z): hit or miss, tracer, damage. */
function shootFrom(x, y, z, accuracy, damage) {
  const p = game.player;
  if (!p || p.dead) return;
  game.events.emit('police:fired', { x, z, rifle: damage >= cfg.officer.swatDamage }); // Session 7: the sound feature plays the shot
  const t = playerPos();
  const ty = (p.mode === 'onFoot' ? p.position.y : t.y || p.position.y) + 1.2;
  const dx = t.x - x, dz = t.z - z;
  const dist = Math.hypot(dx, dz) || 1;
  const sprinting = p.mode === 'onFoot' && p.speed > 6;
  const chance = accuracy * Math.min(1.3, 10 / dist) * (sprinting ? 0.6 : 1);
  const hit = ctx.rng.chance(Math.min(0.9, chance));
  const miss = hit ? 0 : 1.2 + ctx.rng.range(0, 1.5);
  const side = ctx.rng.chance(0.5) ? 1 : -1;
  const ex = t.x + (-dz / dist) * miss * side, ez = t.z + (dx / dist) * miss * side;
  ctx.fx.flash(x, y, z);
  ctx.fx.tracer(x, y, z, ex, ty + (hit ? 0 : ctx.rng.range(-0.6, 0.6)), ez);
  game.events.emit('danger:raised', { x, z, radius: 22, source: 'police' });
  if (!hit) return;
  if (p.mode === 'onFoot') {
    ctx.fx.blood(t.x, ty, t.z, dx / dist, dz / dist);
    game.events.emit('player:damage', { amount: damage, by: 'police', x, z });
  } else if (p.vehicle) {
    ctx.fx.spark(t.x, ty, t.z);
    ctx.fleet.damage(p.vehicle, damage * 2);
    game.events.emit('player:damage', { amount: damage * game.config.get('combat').player.vehicleBulletShare, by: 'police', x, z });
  }
}

const hooks = {
  shoot: (o) => shootFrom(o.x, o.y + 1.35, o.z, o.kind === 'swat' ? cfg.officer.swatAccuracy : cfg.officer.accuracy, o.kind === 'swat' ? cfg.officer.swatDamage : cfg.officer.damage),
  hitPlayer: (o) => game.events.emit('player:hit', { x: o.x, z: o.z, power: cfg.officer.meleePower, by: 'police' }),
  killed: (o, by) => game.events.emit('police:killed', { x: o.x, z: o.z, by }),
  say: (o, kind) => { const keys = cfg.shouts[kind]; if (keys?.length) bubbles.say(o, ctx.rng.pick(keys)); },
  crewOut: (car, n) => {
    const v = car.v;
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? 1 : -1;
      const out = v.T.size[1] / 2 + 0.7;
      const x = v.x + Math.cos(v.heading) * out * side, z = v.z - Math.sin(v.heading) * out * side;
      if (!game.world.collision.isBlocked(x, z, 0.4)) spawnOfficer(level()?.swat ? 'swat' : 'police', x, z, level()?.armed ?? true);
    }
    v.driver = null; // an empty police pickup — he can take it (that is a crime too)
  },
};

/** What the helicopter reports back. */
const heliHooks = {
  shootFrom: (x, y, z, acc, dmg) => shootFrom(x, y, z, acc, dmg),
  killed: (by) => {
    heliKiller = by;
    if (by === 'player') game.events.emit('crime:committed', { type: 'destroyPolice', x: heli?.x, z: heli?.z });
  },
  down: (x, z) => {
    game.events.emit('explosion', { x, z, radius: 9, power: 1, by: heliKiller });
    for (let i = 0; i < 20; i++) ctx.fx.fire(x, game.world.heightAt(x, z) + 1, z, 3);
    game.events.emit('danger:raised', { x, z, radius: 40, source: 'explosion' });
  },
};
let heliKiller = null;   // who shot the helicopter down (for the explosion it makes)

/** Melee from Shoumik: the nearest officer in front of him takes the hit. */
function onPlayerAttack({ x, z, heading, range, arc, power = 1, damage = 0, weapon = 'fists' }) {
  let best = null, bestD = range;
  for (const o of officers) {
    if (o.state === 'dead') continue;
    const dx = o.x - x, dz = o.z - z;
    const d = Math.hypot(dx, dz);
    if (d > bestD || (d > 0.3 && Math.abs(wrapAngle(Math.atan2(dx, dz) - heading)) > arc / 2)) continue;
    best = o; bestD = d;
  }
  if (!best) return;
  const dirX = Math.sin(heading), dirZ = Math.cos(heading);
  const knock = weapon === 'fists' ? --best.hp <= 0 : power >= 3;
  const killed = best.onHit({ damage: weapon === 'fists' ? (best.state === 'down' ? 30 : 6) : damage, kind: 'melee', by: 'player', knockDown: knock, dirX, dirZ }) === 'killed';
  game.events.emit('combat:hit', { kind: 'police', by: 'player', police: true, killed });
}

function onExplosion({ x, z, radius, by = null }) {
  const share = game.config.get('combat').people.explosionKillShare;
  for (const o of officers) {
    if (o.state === 'dead') continue;
    const d = Math.hypot(o.x - x, o.z - z);
    if (d > radius) continue;
    if (d < radius * share) o.die(by, (o.x - x) / (d || 1), (o.z - z) / (d || 1));
    else o.knockDown();
  }
}

/** Officers hit by the vehicle Shoumik drives. */
function runOver() {
  const v = game.player.mode !== 'onFoot' ? game.player.vehicle : null;
  if (!v || v.speed < 3.2) return;
  const killSpeed = game.config.get('combat').people.runOverKillSpeed;
  for (const o of officers) {
    if (o.state !== 'chase' && o.state !== 'retreat') continue;
    if (v.distanceTo(o.x, o.z) > 0.5) continue;
    if (v.speed >= killSpeed) o.die('player', v.vx / v.speed, v.vz / v.speed);
    else o.knockDown();
    game.events.emit('combat:hit', { kind: 'police', by: 'player', police: true, killed: o.state === 'dead' });
  }
}

/** Can any unit see him? (a few times a second) */
function checkSight() {
  const p = playerPos();
  const range = cfg.officer.sightRange;
  let any = !!(heli && heli.state === 'fly');
  for (const o of officers) {
    o.sees = false;
    if (o.state !== 'chase') continue;
    const d = Math.hypot(p.x - o.x, p.z - o.z);
    if (d > range) continue;
    const free = game.world.collision.raycast(o.x, o.z, (p.x - o.x) / (d || 1), (p.z - o.z) / (d || 1), d, COLLIDE.SOLID);
    o.sees = free >= d - 0.8;
    if (o.sees || d < 12) any = true;
  }
  for (const c of cars) if (c.state === 'chase' && (c.sees || (c.dist ?? 999) < 15)) any = true;
  if (stars === 0) any = false;
  if (any !== seen) {
    seen = any;
    game.events.emit('police:sight', { seen });
  }
}

/** Arrest check: an officer holding him (on foot and slow, or in a stopped vehicle). */
function checkBust(dt) {
  const p = game.player;
  const O = cfg.officer;
  if (stars === 0 || p.dead || p.frozen) { bust = 0; return; }
  let holding = false;
  for (const o of officers) {
    if (o.state !== 'chase') continue;
    if (p.mode === 'onFoot') {
      if (o.dist < O.arrestReach && p.speed < O.bustMaxSpeed && p.grounded) holding = true;
    } else if (p.vehicle && p.vehicle.speed < O.bustVehicleSpeed && p.vehicle.distanceTo(o.x, o.z) < O.bustVehicleReach) holding = true;
  }
  bust = holding ? bust + dt : Math.max(0, bust - dt * 2);
  if (bust >= O.bustSeconds) {
    bust = 0;
    game.events.emit('player:busted', { stars });
  }
}

/**
 * Update 9b: the penalty is paid (bail, jail, a new life) → every unit leaves at once instead of
 * retreating past him, the road blocks and the helicopter go, and the map dots disappear.
 */
function standDown() {
  for (const o of officers) o.remove();
  for (const c of cars) if (!c.v.removed) { if (c.v.driver === 'police') c.v.driver = null; ctx.fleet.remove(c.v); }
  officers = [];
  cars = [];
  roadblocks?.clear();
  heli?.dispose();
  heli = null;
  heliKiller = null;
  stars = 0;
  bust = 0;
  spawnIn = cfg.spawn.every;
  blipsShown = true; // so the next map update removes the dots
  blipIn = 0;
}

function onWanted({ stars: n }) {
  const before = stars;
  stars = n || 0;
  if (stars === 0 && before > 0) {
    for (const o of officers) o.retreat();
    for (const c of cars) c.retreat();
    heli?.leave();
    bust = 0;
  }
  if (stars > before) spawnIn = Math.min(spawnIn, 0.4);
  seen = null; // report sight again at the next check, whatever it is
}

// Session 9: while he is wanted, every officer, police pickup and the helicopter are shown on
// the minimap and the full map (blue dots / red cars), so the player sees where the police are.
let blipIn = 0;
let blipsShown = false;
function sendMapBlips(dt) {
  blipIn -= dt;
  if (blipIn > 0) return;
  const mv = game.config.get('mapView');
  blipIn = mv?.policeEvery || 0.5;
  if (stars <= 0) {
    if (blipsShown) game.events.emit('map:blips', { id: 'police', points: [] });
    blipsShown = false;
    return;
  }
  const c = mv?.colors || {};
  const points = [];
  for (const o of officers) if (o.state !== 'dead') points.push({ x: o.x, z: o.z, color: c.police || '#3d7bff', group: 'police', pin: true, small: true, blink: true });
  for (const k of cars) if (k.alive) points.push({ x: k.v.x, z: k.v.z, color: c.policeCar || '#ff3355', icon: '🚓', group: 'police', pin: true, blink: true });
  if (heli) points.push({ x: heli.x, z: heli.z, color: c.policeCar || '#ff3355', icon: '🚁', group: 'police', pin: true, blink: true });
  game.events.emit('map:blips', { id: 'police', points });
  blipsShown = true;
}

export default {
  id: 'police',

  async init(g) {
    game = g;
    cfg = g.config.get('police');
    const [crowd, fleet, fx] = await Promise.all([acquireCrowd(g), acquireFleet(g), acquireCombatFx(g)]);
    const peds = g.config.get('pedestrians');
    ctx = {
      game: g, cfg, combat: g.config.get('combat'), rng: new Rng(g.config.get('world').seed ^ 0x9011ce),
      crowd, fleet, fx, palettes: { ...peds.palettes, ...cfg.palettes }, hooks,
    };
    bubbles = new Bubbles(g, 3, peds.behaviour.bubbleSeconds);
    roadblocks = new Roadblocks({ ...ctx, hooks: { spawnOfficer } });
    offs = [
      g.events.on('wanted:changed', onWanted),
      g.events.on('police:standDown', standDown),
      g.events.on('player:attack', onPlayerAttack),
      g.events.on('explosion', onExplosion),
      g.events.on('vehicle:driverEjected', ({ x, z, police }) => { if (police) spawnOfficer(level()?.swat ? 'swat' : 'police', x, z, !!level()?.armed); }),
      g.events.on('vehicle:entered', ({ id, jacked }) => {
        const v = fleet.vehicles.find((x) => x.id === id);
        cars = cars.filter((c) => c.v !== v);
        if (v?.tags.police && !jacked) g.events.emit('crime:committed', { type: 'stealPolice', x: v.x, z: v.z });
      }),
    ];
    if (g.debugPeds !== undefined) g.debugPolice = { officers: () => officers, cars: () => cars, heli: () => heli };
    log.info('police ready');
  },

  update(dt) {
    if (!game.player) return;
    staff(dt);
    for (const o of officers) o.update(dt);
    for (const c of cars) if (c.alive) c.update(dt);
    if (heli) heli.update(dt);
    runOver();
    sightIn -= dt;
    if (sightIn <= 0) { sightIn = 0.25; checkSight(); }
    checkBust(dt);
    roadblocks.update(dt, !!level()?.roadblocks, level()?.carColor);
    bubbles.update(dt);

    // Clear away the dead, the far away and the units of a chase that is over.
    const p = playerPos();
    const far = cfg.spawn.despawnDistance;
    officers = officers.filter((o) => {
      const d = Math.hypot(o.x - p.x, o.z - p.z);
      const gone = d > far || (o.state === 'dead' && o.timer <= 0) || (o.state === 'retreat' && (o.timer <= 0 || d > 60));
      if (gone) o.remove();
      return !gone;
    });
    cars = cars.filter((c) => {
      const v = c.v;
      const d = Math.hypot(v.x - p.x, v.z - p.z);
      if (!c.alive) { if (v.driver === 'police') v.driver = null; return false; }
      const gone = d > far || (c.state === 'retreat' && (c.timer > 12 || d > 80)) || (c.state === 'parked' && stars === 0 && d > 50);
      if (gone && !v.removed) ctx.fleet.remove(v);
      return !gone;
    });
    if (heli && (heli.state === 'gone' || Math.hypot(heli.x - p.x, heli.z - p.z) > far * 1.5)) { heli.dispose(); heli = null; heliKiller = null; }
    sendMapBlips(dt);
    debugLine('police', `stars ${stars} officers ${officers.length} cars ${cars.length}${heli ? ' heli' : ''} ${seen ? 'SEEN' : 'hidden'} bust ${bust.toFixed(1)}`);
  },

  dispose() {
    offs.forEach((off) => off());
    offs = [];
    for (const o of officers) o.remove();
    for (const c of cars) if (!c.v.removed) ctx.fleet.remove(c.v);
    officers = [];
    cars = [];
    roadblocks?.clear();
    heli?.dispose();
    heli = null;
    bubbles?.dispose();
    game.events.emit('map:blips', { id: 'police', points: [] });
  },
};
