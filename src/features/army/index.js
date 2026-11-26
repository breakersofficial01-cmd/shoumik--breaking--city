// Feature: army (Roadmap 2 S8) — the cantonment north of the city and the army.
//
//   ./base.js     the walled base (built in code when the 'cantonment' stream group is reached)
//   ./rules.js    warning → 1 star for trespassing, the visitor pass at the guard post
//   ./soldier.js  soldiers (police Officer brain + guard / patrol)
//   ./drive.js    ArmyDriver (trucks round the base)     ./tank.js  tanks (turret, chase, fire)
//   ./shells.js   tank shells (explode like a grenade)   ./units.js spawning + the army response
//
// Near the base (wakeDistance) the residents appear: gate guards, inside guards, patrols, parked
// trucks and tanks, a truck driving round the ring road and a tank round the parade ground (counts
// per quality, data/army.json → quality). Far away (sleepDistance) they are removed again.
// Trespassing (1 star): the nearest guards come to arrest him. Attacking a soldier or an army
// vehicle = attackArmy (5 stars) and the ALERT: every soldier shoots, extra soldiers, army trucks
// (police pickup driving, crew jumps out) and tanks chase him and fire; until the stars are gone.
// Busted / wasted work as before (soldiers can arrest too: player:busted).
//
// Events
//   listens  stream:loaded { group: 'cantonment' }, wanted:changed, police:standDown, player:attack,
//            explosion, combat:hit (army vehicles hit), vehicle:exploded, input:action (pass),
//            player:busted, quality:changed
//   sends    crime:committed (trespassArmy, attackArmy), army:sight { seen }, army:killed { by },
//            army:alert { on }, player:busted { stars }, player:hit, player:damage, police:fired,
//            danger:raised, explosion, toast:show, prompt:show / prompt:hide, map:blips (cantonment, army)
// Debug: BC.army (see the bottom of this file).

import { debugLine, log } from '../../core/debug.js';
import { Rng } from '../../core/rng.js';
import { COLLIDE } from '../../world/collision.js';
import { acquireCrowd } from '../../entities/people/crowd.js';
import { acquireFleet } from '../../entities/vehicles/fleet.js';
import { acquireCombatFx } from '../../entities/effects/combatFx.js';
import { Bubbles } from '../../ui/bubbles.js';
import { CantonmentBase } from './base.js';
import { GateRules } from './rules.js';
import { Shells } from './shells.js';
import { Units } from './units.js';

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

let game = null;
let cfg = null;
let pad = null;
let base = null;
let building = false;
let ctx = null;
let rules = null;
let units = null;
let shells = null;
let bubbles = null;
let stars = 0;
let alert = false;
let awake = false;
let seen = null;
let sightIn = 0;
let bust = 0;
let bustCooldown = 0;
let blipsSent = false;
let armyBlipIn = 0;
let offs = [];

const playerPos = () => {
  const p = game.player;
  return p.mode !== 'onFoot' && p.vehicle ? p.vehicle : p.position;
};

async function build() {
  if (base || building || !pad) return;
  building = true;
  const b = new CantonmentBase(game, pad, cfg);
  try { await b.build(); } catch (err) { log.warn('army: building the cantonment failed', err); building = false; return; }
  base = b;
  ctx.base = base;
  rules = new GateRules({ ...ctx, hooks: { warn: onWarn, trespass: onTrespass } });
  units = new Units(ctx, shells);
  log.info(`army: cantonment built (${base.colliders} colliders, ${base.lampCount} lamps, ${base.treeCount} trees)`);
}

// ---------------------------------------------------------------- the rules' hooks
function onWarn() {
  const g = units.nearestSoldier(playerPos(), 90, (s) => s.calm);
  if (g) { g.watching = true; bubbles.say(g, ctx.rng.pick(cfg.shouts.warn)); }
  game.events.emit('toast:show', { key: 'army.warn', seconds: 4 });
}

function onTrespass() {
  game.events.emit('crime:committed', { type: 'trespassArmy', x: playerPos().x, z: playerPos().z });
  game.events.emit('toast:show', { key: 'army.trespass', seconds: 4 });
  units.sendGuards(playerPos(), false);
}

/** Shoumik hurt a soldier or an army vehicle: 5 stars and the army comes. */
function onAttack() {
  rules?.cancelPass();
  if (stars < 5) game.events.emit('crime:committed', { type: 'attackArmy', x: playerPos().x, z: playerPos().z });
  if (!alert) {
    alert = true;
    game.events.emit('army:alert', { on: true });
    game.events.emit('toast:show', { key: 'army.alert', seconds: 5 });
    log.info('army: ALERT');
  }
  units?.alertAll();
}

function endAlert() {
  if (alert) game.events.emit('army:alert', { on: false });
  alert = false;
  units?.standDown();
  bust = 0;
}

// ---------------------------------------------------------------- what Shoumik does to the army
function onPlayerAttack({ x, z, heading, range, arc, power = 1, damage = 0, weapon = 'fists' }) {
  if (!units) return;
  let best = null, bestD = range;
  for (const s of units.soldiers) {
    if (s.state === 'dead') continue;
    const dx = s.x - x, dz = s.z - z;
    const d = Math.hypot(dx, dz);
    if (d > bestD || (d > 0.3 && Math.abs(wrapAngle(Math.atan2(dx, dz) - heading)) > arc / 2)) continue;
    best = s; bestD = d;
  }
  if (!best) return;
  const knock = weapon === 'fists' ? --best.hp <= 0 : power >= 3;
  best.onHit({ damage: weapon === 'fists' ? (best.state === 'down' ? 30 : 6) : damage, kind: 'melee', by: 'player', knockDown: knock, dirX: Math.sin(heading), dirZ: Math.cos(heading) });
}

function onExplosion({ x, z, radius, by = null }) {
  if (!units) return;
  const share = game.config.get('combat').people.explosionKillShare;
  let hurt = false;
  for (const s of units.soldiers) {
    if (s.state === 'dead') continue;
    const d = Math.hypot(s.x - x, s.z - z);
    if (d > radius) continue;
    if (d < radius * share) s.die(by, (s.x - x) / (d || 1), (s.z - z) / (d || 1)); // die() sends army:killed
    else s.knockDown();
    hurt = true;
  }
  if (hurt && by === 'player') onAttack();
}

/** Soldiers hit by the vehicle Shoumik drives. */
function runOver() {
  const v = game.player.mode !== 'onFoot' ? game.player.vehicle : null;
  if (!v || !(v.speed >= 3.2) || !units) return;
  const killSpeed = game.config.get('combat').people.runOverKillSpeed;
  for (const s of units.soldiers) {
    if (s.state === 'dead' || s.state === 'down') continue;
    if (v.distanceTo(s.x, s.z) > 0.5) continue;
    if (v.speed >= killSpeed) s.die('player', v.vx / v.speed, v.vz / v.speed);
    else s.knockDown();
    onAttack();
  }
}

// ---------------------------------------------------------------- sight + arrest
function checkSight() {
  const p = playerPos();
  let any = false;
  if (stars > 0 && units) {
    for (const s of units.soldiers) {
      s.sees = false;
      if (s.state !== 'chase') continue;
      const d = Math.hypot(p.x - s.x, p.z - s.z);
      if (d > cfg.soldier.sightRange) continue;
      const free = game.world.collision.raycast(s.x, s.z, (p.x - s.x) / (d || 1), (p.z - s.z) / (d || 1), d, COLLIDE.SOLID);
      s.sees = free >= d - 0.8;
      if (s.sees || d < 12) any = true;
    }
    for (const t of units.tanks) if (t.mode === 'chase' && t.sees) any = true;
    for (const c of units.chasers) if (c.state === 'chase' && (c.sees || (c.dist ?? 999) < 15)) any = true;
  }
  if (any !== seen) {
    seen = any;
    game.events.emit('army:sight', { seen });
  }
}

function checkBust(dt) {
  const p = game.player;
  const O = game.config.get('police').officer;
  bustCooldown -= dt;
  if (stars === 0 || p.dead || p.frozen || !units || bustCooldown > 0) { bust = 0; return; }
  let holding = false;
  for (const s of units.soldiers) {
    if (s.state !== 'chase') continue;
    if (p.mode === 'onFoot') {
      if (s.dist < O.arrestReach && p.speed < O.bustMaxSpeed && p.grounded) holding = true;
    } else if (p.vehicle && p.vehicle.speed < O.bustVehicleSpeed && p.vehicle.distanceTo(s.x, s.z) < O.bustVehicleReach) holding = true;
  }
  bust = holding ? bust + dt : Math.max(0, bust - dt * 2);
  if (bust >= O.bustSeconds) {
    bust = 0;
    game.events.emit('player:busted', { stars });
  }
}

// ---------------------------------------------------------------- map
function sendBlips(dt) {
  if (!blipsSent) {
    blipsSent = true;
    game.events.emit('map:blips', { id: 'cantonment', points: [{ id: 'cantonment', x: pad.cx, z: pad.cz, color: pad.mapColor || '#8a9a5a', icon: cfg.mapIcon, label: cfg.name, group: 'outskirts', routeable: true, big: true }] });
  }
  armyBlipIn -= dt;
  if (armyBlipIn > 0 || !units) return;
  armyBlipIn = game.config.get('mapView')?.policeEvery || 0.5;
  const pts = alert ? units.blips() : [];
  if (pts.length || units.blipsShown) game.events.emit('map:blips', { id: 'army', points: pts });
  units.blipsShown = pts.length > 0;
}

export default {
  id: 'army',

  async init(g) {
    game = g;
    cfg = g.config.get('army');
    pad = g.world.terrain?.field.pads.find((p) => p.id === cfg.padId) || null;
    if (!pad) { log.warn('army: no cantonment pad in data/terrain.json (terrain off?) — the army is off'); return; }
    const [crowd, fleet, fx] = await Promise.all([acquireCrowd(g), acquireFleet(g), acquireCombatFx(g)]);
    const peds = g.config.get('pedestrians');
    const police = g.config.get('police');
    ctx = {
      game: g, cfg, crowd, fleet, fx, rng: new Rng(g.config.get('world').seed ^ 0xa4a1),
      combat: g.config.get('combat'), palettes: { ...peds.palettes, ...cfg.palettes },
      // The soldier brain is the police Officer: give it the army numbers and looks.
      soldierCfg: { ...police, officer: { ...police.officer, ...cfg.soldier }, archetypes: cfg.archetypes, shouts: cfg.shouts },
      material: fleet.lib.material, wreckMaterial: fleet.lib.wreckMaterial, base: null,
      say: (o, kind) => { const keys = cfg.shouts[kind]; if (keys?.length) bubbles.say(o, ctx.rng.pick(keys)); },
      onAttack, isAlert: () => alert, stars: () => stars,
    };
    shells = new Shells(ctx);
    bubbles = new Bubbles(g, 3, peds.behaviour.bubbleSeconds);
    offs = [
      g.events.on('stream:loaded', ({ group }) => { if (group === 'cantonment') build(); }),
      g.events.on('wanted:changed', ({ stars: n }) => {
        const before = stars;
        stars = n || 0;
        if (stars === 0 && before > 0) endAlert();
        seen = null;
      }),
      g.events.on('police:standDown', endAlert),
      g.events.on('player:busted', () => { bustCooldown = 3; }),
      g.events.on('player:attack', onPlayerAttack),
      g.events.on('explosion', onExplosion),
      g.events.on('combat:hit', ({ kind, by, id }) => {
        if (by !== 'player' || kind !== 'vehicle') return;
        const v = fleet.vehicles.find((x) => x.id === id);
        if (v?.tags.army) onAttack();
      }),
      g.events.on('vehicle:exploded', ({ id, by }) => { if (by === 'player' && units?.isArmyVehicle(id)) onAttack(); }),
      g.events.on('input:action', () => { if (rules?.promptOn && game.transitPrompt === 'army') rules.buyPass(); }),
      g.events.on('quality:changed', () => { if (awake && !alert) { units.sleep(); units.wake(); } }),
    ];
    {
      // Console / tools: BC.army.report(), BC.army.units, BC.army.rules, BC.army.build()
      g.army = {
        get base() { return base; }, get units() { return units; }, get rules() { return rules; }, get shells() { return shells; },
        get alert() { return alert; }, get awake() { return awake; }, get stars() { return stars; }, pad,
        // Base frame (gate on −x) → world, also before the base is built (tools).
        toWorld: (x, z) => { const a = ((cfg.base.angle || 0) * Math.PI) / 180; return { x: pad.cx + x * Math.cos(a) + z * Math.sin(a), z: pad.cz - x * Math.sin(a) + z * Math.cos(a), heading: (deg) => (deg * Math.PI) / 180 + a }; },
        build, attack: onAttack,
        report: () => ({ built: !!base, awake, alert, stars, ...(units ? units.report() : {}), shells: shells.list.length, fired: shells.fired, exploded: shells.exploded, warnings: rules?.warnings || 0, trespasses: rules?.trespasses || 0, pass: rules?.pass || 0 }),
      };
    }
    log.info('army ready');
  },

  update(dt) {
    if (!pad || !game.player) return;
    const p = playerPos();
    const d = Math.hypot(p.x - pad.cx, p.z - pad.cz);
    sendBlips(dt);
    // Fallback when the streaming feature is off: build when close.
    if (!base) { if (!game.streamer && d < cfg.wakeDistance) build(); return; }
    const wantAwake = awake ? d < cfg.sleepDistance || alert : d < cfg.wakeDistance;
    if (wantAwake && !awake) { awake = true; units.wake(); }
    else if (!wantAwake && awake) { awake = false; units.sleep(); }
    rules.update(dt, p, stars, alert);
    units.update(dt, { stars, alert, awake });
    shells.update(dt);
    base.update(dt, units.vehicleNearGate(base.gatePoints().gate, cfg.base.gate.openDistance));
    runOver();
    sightIn -= dt;
    if (sightIn <= 0) { sightIn = 0.25; checkSight(); }
    checkBust(dt);
    bubbles.update(dt);
    debugLine('army', `army ${awake ? 'awake' : 'asleep'}${alert ? ' ALERT' : ''} · ${units.summary()} · shells ${shells.list.length}${rules.hasPass ? ` · pass ${Math.round(rules.pass)}s` : ''}`);
  },

  dispose() {
    offs.forEach((off) => off());
    offs = [];
    units?.sleep(true);
    rules?.dispose();
    shells?.dispose();
    bubbles?.dispose();
    base?.dispose();
    base = null;
    game?.events.emit('map:blips', { id: 'army', points: [] });
  },
};
