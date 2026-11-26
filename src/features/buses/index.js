// Feature: buses (Roadmap 2 S6) — ride a local bus with other passengers.
//
//   1. Stand at a bus-stop shelter (world.roads.busStops) → after noticeSeconds a bus is
//      called: it appears down the road and drives up to your stop (entities/vehicles/driver.js).
//   2. It waits at the stop (people get off / on) → E at the front door → pay the fare
//      (data/economy.json → fares.bus) → Shoumik sits inside with the passengers.
//   3. The bus drives its line and pulls up at every bus stop on the way. The HUD shows the next
//      stop (Bangla first, English second). Get off at the next stop with E / Jump / নামো, or
//      pick a stop on the big map (M): the GPS shows it and the ride ends there.
//      ⏩ = fade and jump to just before the next stop.
//   4. Wanted stars do not fade while riding; from `policeStars` stars the police stop the bus
//      after a few seconds and you are pushed out.
// Settings: data/transit.json → bus, cabins.bus, passengers. Stop names: ./stops.js.
//
// The service bus is a normal fleet vehicle with driver 'transit' (the traffic feature leaves it
// alone and the vehicles feature cannot carjack it: tags.transit). Once you are off and it has
// driven on, it is handed to the traffic feature (traffic:adopt).
//
// Events  listens input:action, input:jump, ride:destination { line: 'bus', id },
//                 wanted:changed { stars }, player:busted, player:died
//         sends   map:blips { id: 'bus-stops' }, traffic:adopt { id }, toast:show, prompt:show/hide,
//                 ride:* (src/entities/transit/rider.js)

import { debugLine, log } from '../../core/debug.js';
import { Rng } from '../../core/rng.js';
import { t, pickName, formatMoney } from '../../ui/i18n.js';
import { DIRS } from '../../world/roads.js';
import { acquireFleet } from '../../entities/vehicles/fleet.js';
import { Driver } from '../../entities/vehicles/driver.js';
import { acquireCrowd } from '../../entities/people/crowd.js';
import { Animator } from '../../entities/people/animator.js';
import { buildLook } from '../../entities/people/looks.js';
import { Passengers } from '../../entities/transit/passengers.js';
import { getCabin, toWorld, pickSeat } from '../../entities/transit/cabin.js';
import { acquireRider } from '../../entities/transit/rider.js';
import { fareFor, payFare } from '../../entities/transit/fares.js';
import { nameStops, routeTo } from './stops.js';

let game = null;
let cfg = null;
let roads = null;
let fleet = null;
let driver = null;
let crowd = null;
let passengers = null;
let rider = null;
let cabin = null;
let rng = null;
let lane = 4.4;
let stars = 0;
let offs = [];
let promptKey = null;
let svc = null;        // the current bus service (see newService)
let near = { stop: null, t: 0 };
let cooldown = 0;
const _a = {};
const _b = {};

function prompt(key, vars) {
  const id = key ? key + JSON.stringify(vars || '') : null;
  if (id !== promptKey) {
    promptKey = id;
    if (key) game.events.emit('prompt:show', { id: 'ride-bus', key, vars });
    else game.events.emit('prompt:hide', { id: 'ride-bus' });
  }
  if (key) game.transitPrompt = 'bus';
  else if (game.transitPrompt === 'bus') game.transitPrompt = null;
}

/** The bus stop Shoumik stands at (on foot), or null. */
function stopHere() {
  const p = game.player.position;
  let best = null, bestD = cfg.stopRadius;
  for (const st of roads.busStops) {
    const d = Math.hypot(st.sx - p.x, st.sz - p.z);
    if (d < bestD) { bestD = d; best = st; }
  }
  return best;
}

/** Metres along segment (c, r, d) of the vehicle (in its lane). */
function along(v, seg) {
  const s = roads.segment(seg.c, seg.r, seg.d, lane);
  return (v.x - s.ax) * s.fx + (v.z - s.az) * s.fz;
}

/** The road segment the bus is on (or about to enter, inside a junction). */
function currentSeg(v) {
  const legs = v.brain?.legs || [];
  const l = legs.find((x) => x.kind === 'seg');
  return l ? { c: l.c, r: l.r, d: l.d } : null;
}

/** A random bus stop a few junctions away (the end of the line when no stop is picked). */
function pickTerminus(fromSeg) {
  const [lo, hi] = cfg.lineJunctions;
  const list = roads.busStops.filter((s) => {
    const d = Math.abs(s.c - fromSeg.c) + Math.abs(s.r - fromSeg.r);
    return d >= lo && d <= hi;
  });
  return list.length ? rng.pick(list) : rng.pick(roads.busStops);
}

function busUnit(v) {
  return {
    id: `bus-${v.id}`, kind: 'bus', cabin, vehicle: v,
    pose: (out) => { out.x = v.x; out.y = v.y; out.z = v.z; out.heading = v.heading; return out; },
    outsideY: () => game.world.heightAt(v.x + Math.cos(v.heading) * 3, v.z - Math.sin(v.heading) * 3),
    forward: () => v.heading,
    speed: () => v.speed,
  };
}

/** The bus driver (a real person on Medium/High, in the driving pose). */
function addDriver(s) {
  const ped = game.config.get('pedestrians');
  const look = buildLook(ped.archetypes.shirt_pant_man, ped.palettes, rng);
  const animator = new Animator(look.dims, {});
  const person = crowd.add(look, animator.pose, animator);
  animator.play('enterVehicle', { hold: true, duration: 0.01 });
  s.driverPerson = { person, animator };
}

function placeDriver(s, dt) {
  const d = s.driverPerson;
  if (!d || !cabin.driver) return;
  d.animator.update(dt, { speed: 0 });
  toWorld(busUnit(s.bus).pose(_a), cabin.driver.x, cabin.floor, cabin.driver.z, _b);
  Object.assign(d.person, { x: _b.x, y: _b.y, z: _b.z, groundY: _b.y, heading: s.bus.heading });
}

/** Give the bus its route (segs = segments to drive after the current one). */
function drive(s, cur, plan, final = null) {
  s.segs = [cur, ...plan.segs];
  s.segIndex = 0;
  const cruise = s.bus.T.cruise * cfg.speedFactor;
  driver.attach(s.bus, cur.c, cur.r, cur.d, { route: plan.route, stopU: final ? final.u : 0, cruise });
  // A line without a picked stop never ends: it is extended before the route runs out (update).
  if (!final) s.bus.brain.stopU = 1e9;
}

/** Call a bus to stop `stop`. */
function callBus(stop) {
  const T = fleet.cfg.types[cfg.type];
  if (!T) return null;
  let seg = { c: stop.c, r: stop.r, d: stop.d };
  let u = stop.u - cfg.approach;
  let lead = [];
  if (u < T.size[0]) {
    // Start on the road leading straight into this one.
    const D = DIRS[stop.d];
    const pc = stop.c - D.dc, pr = stop.r - D.dr;
    if (roads.hasRoad(pc, pr, stop.d)) {
      const len = roads.segment(pc, pr, stop.d, lane).len;
      seg = { c: pc, r: pr, d: stop.d };
      u = Math.max(T.size[0], len - (cfg.approach - stop.u));
      lead = [{ c: stop.c, r: stop.r, d: stop.d }];
    } else u = T.size[0];
  }
  const s0 = roads.segment(seg.c, seg.r, seg.d, lane);
  const x = s0.ax + s0.fx * u, z = s0.az + s0.fz * u;
  for (const o of [...fleet.vehicles]) {
    if (o.driver !== 'player' && !o.tags.owned && !o.tags.transit && Math.hypot(o.x - x, o.z - z) < 9) fleet.remove(o);
  }
  const v = fleet.create(cfg.type, { x, z, heading: s0.heading });
  if (!v) return null;
  v.driver = 'transit';
  v.tags.transit = true;
  const s = newService(v, stop);
  // Route: (lead into the stop's road) → the stop → on towards the end of the line.
  const last = { c: stop.c, r: stop.r, d: stop.d };
  s.terminus = pickTerminus(last);
  const rest = routeTo(roads, last.c, last.r, last.d, s.terminus) || { route: [], segs: [] };
  const plan = { route: [...lead.map((l) => l.d), ...rest.route], segs: [...lead, ...rest.segs] };
  drive(s, seg, plan);
  v.launch(v.T.cruise * 0.7);
  addDriver(s);
  passengers.setUnits([s.unit]);
  log.info(`buses: bus ${v.id} called to ${s.stop.id} (${pickName(stop.name)})`);
  return s;
}

function newService(v, stop) {
  svc = { bus: v, unit: busUnit(v), stop, state: 'coming', t: 0, segs: [], segIndex: 0, dest: null, terminus: null, lastStop: null, police: 0, driverPerson: null };
  return svc;
}

/** Stops still ahead of the bus on its planned roads (nearest first). */
function upcoming(s, max = 3) {
  const v = s.bus;
  const out = [];
  for (let k = s.segIndex; k < s.segs.length && out.length < max; k++) {
    const seg = s.segs[k];
    const st = roads.busStopOn(seg.c, seg.r, seg.d);
    if (!st) continue;
    if (k === s.segIndex && (along(v, seg) > st.u + 2 || st === s.lastStop)) continue;
    out.push(st);
  }
  return out;
}

/** Keep segIndex on the segment the bus is driving now; extend the line when it gets short. */
function track(s) {
  const cur = currentSeg(s.bus);
  if (cur) {
    for (let k = s.segIndex; k < s.segs.length; k++) {
      const g = s.segs[k];
      if (g.c === cur.c && g.r === cur.r && g.d === cur.d) { s.segIndex = k; break; }
    }
  }
  if (!s.dest && s.segs.length - s.segIndex < 4 && s.bus.brain?.route) {
    const last = s.segs[s.segs.length - 1];
    s.terminus = pickTerminus(last);
    const more = routeTo(roads, last.c, last.r, last.d, s.terminus);
    if (more) {
      s.bus.brain.route.push(...more.route);
      s.segs.push(...more.segs);
      s.bus.brain.final = false;
    }
  }
}

/** The stop the bus is standing at right now (or null). */
function standingAt(s) {
  const b = s.bus.brain;
  const cur = currentSeg(s.bus);
  if (!b || !cur || s.bus.speed > 0.6) return null;
  const st = roads.busStopOn(cur.c, cur.r, cur.d);
  if (!st || Math.abs(along(s.bus, cur) - st.u) > 5) return null;
  return b.busWait > 0 || b.final ? st : null;
}

function frontDoor(s) {
  const d = cabin.doors.reduce((a, x) => (x.side > 0 && x.z > a.z ? x : a), cabin.doors[0]);
  return toWorld(s.unit.pose(_a), d.x + 1.1, 0, d.z, {});
}

function board() {
  const s = svc;
  if (!payFare(game, 'bus')) return;
  game.events.emit('toast:show', { key: 'transit.paid', vars: { fare: formatMoney(fareFor(game, 'bus')) } });
  s.state = 'boarding';
  s.t = 0;
  const p = game.player;
  s.from = { x: p.position.x, z: p.position.z };
  p.mode = 'vehicle';
  p.velocity.x = p.velocity.z = 0;
}

function seatPlayer(s) {
  const used = new Set();
  const e = passengers.units.get(s.unit);
  if (e) for (const r of e.riders) if (r.seated) used.add(r.spot);
  const seat = pickSeat(cabin, used);
  passengers.reserve(s.unit, seat);
  s.state = 'riding';
  s.police = 0;
  rider.board(s.unit, seat, {
    kind: 'bus', line: { en: s.bus.T.name.en, bn: s.bus.T.name.bn }, icon: cfg.icon, vehicle: s.bus,
    onOff: () => rider.queueOff(!rider.offQueued),
    onSkip: () => skip(),
  });
  game.events.emit('ride:started', { type: 'bus', line: 'bus', fare: fareFor(game, 'bus') });
}

/** Off the bus at its door, on the kerb side. */
function alight(s, reason = 'arrived') {
  const pose = s.unit.pose(_a);
  const door = cabin.doors.find((d) => d.side > 0) || cabin.doors[0];
  const at = toWorld(pose, door.x + 1.3, 0, door.z, {});
  passengers.release(s.unit);
  if (s.dest) game.events.emit('route:clear');
  rider.leave({ x: at.x, z: at.z, heading: pose.heading + Math.PI / 2 });
  game.events.emit('ride:ended', { type: 'bus', place: s.lastStop?.id || null, arrived: reason === 'arrived' });
  s.state = 'leaving';
  s.t = 0;
  cooldown = 6;
  near = { stop: stopHere(), t: -15 }; // standing on at this stop does not call the next bus at once
}

/** Hand the bus over to normal traffic (it drives on and is recycled when far). */
function release(s) {
  const v = s.bus;
  if (s.driverPerson) crowd.remove(s.driverPerson.person);
  passengers.setUnits([]);
  if (!v.removed) {
    v.tags.transit = false;
    v.driver = 'ai';
    v.brain = null;
    game.events.emit('traffic:adopt', { id: v.id });
    if (!v.driver || v.driver !== 'ai' || !v.brain) fleet.remove(v);
  }
  svc = null;
}

function skip() {
  const s = svc;
  if (!s || s.state !== 'riding' || rider.fading) return;
  const next = upcoming(s, 1)[0];
  if (!next) return; // (also from a stop: it jumps on to the next one)
  rider.fadeThen(() => {
    if (svc !== s || s.state !== 'riding') return;
    const k = s.segs.findIndex((g, i) => i >= s.segIndex && g.c === next.c && g.r === next.r && g.d === next.d);
    if (k < 0) return;
    const v = s.bus;
    const seg = roads.segment(next.c, next.r, next.d, lane);
    const u = Math.max(v.T.size[0], next.u - game.config.get('transit').ride.skipBefore);
    const x = seg.ax + seg.fx * u, z = seg.az + seg.fz * u;
    for (const o of [...fleet.vehicles]) {
      if (o !== v && o.driver !== 'player' && !o.tags.owned && Math.hypot(o.x - x, o.z - z) < 9) fleet.remove(o);
    }
    v.place(x, z, seg.heading, game.world.heightAt(x, z));
    v.launch(v.T.cruise * 0.5);
    const rest = s.segs.slice(k + 1);
    drive(s, s.segs[k], { route: rest.map((g) => g.d), segs: rest }, s.dest);
    rider.update(0);
    rider.applyView(true);
  });
}

/** Map: he picked bus stop `id` as the end of the ride. */
function setDestination(id) {
  const s = svc;
  const st = roads.busStops.find((b) => b.id === id);
  if (!s || s.state !== 'riding' || !st) return;
  const cur = currentSeg(s.bus);
  if (!cur) return;
  let plan;
  if (cur.c === st.c && cur.r === st.r && cur.d === st.d && along(s.bus, cur) < st.u - 2) plan = { route: [], segs: [] };
  else plan = routeTo(roads, cur.c, cur.r, cur.d, st);
  if (!plan) return game.events.emit('toast:show', { key: 'ride.noRoute' });
  s.dest = st;
  drive(s, cur, plan, st);
  game.events.emit('route:set', { x: st.sx, z: st.sz, label: st.name, icon: cfg.icon });
}

function blips() {
  game.events.emit('map:blips', {
    id: 'bus-stops',
    points: roads.busStops.map((st) => ({
      id: st.id, x: st.sx, z: st.sz, color: cfg.mapColor, small: true, group: 'transit', routeable: true,
      label: { en: `🚏 ${st.name.en}`, bn: `🚏 ${st.name.bn}` },
      action: { key: 'transit.getOffHere', when: () => svc?.state === 'riding', run: () => setDestination(st.id) },
    })),
  });
}

function onAction() {
  if (game.paused || rider.fading) return;
  const s = svc;
  if (s?.state === 'riding' && game.ride === rider && rider.unit === s.unit) { rider.queueOff(!rider.offQueued); return; }
  if (s?.state === 'atStop' && game.player.mode === 'onFoot' && !game.ride) {
    const d = frontDoor(s);
    const p = game.player.position;
    if (Math.hypot(d.x - p.x, d.z - p.z) < cfg.doorRange) board();
  }
}

function abort() {
  const s = svc;
  if (!s) return;
  if (s.state === 'riding' && rider.unit === s.unit) {
    passengers.release(s.unit);
    rider.leave({ x: game.player.position.x, z: game.player.position.z });
  }
  if (s.state === 'boarding') game.player.mode = 'onFoot';
  s.state = 'leaving';
  s.t = 0;
}

function updateService(dt) {
  const s = svc;
  const v = s.bus;
  s.t += dt;
  if (v.removed || v.state !== 'ok') {
    // Burning, blown up or gone: everybody out.
    if (s.state === 'riding' && rider.unit === s.unit) { passengers.release(s.unit); rider.leave({ x: v.x + Math.cos(v.heading) * 3, z: v.z - Math.sin(v.heading) * 3 }); }
    if (s.state === 'boarding') game.player.mode = 'onFoot';
    if (s.driverPerson) crowd.remove(s.driverPerson.person);
    passengers.setUnits([]);
    if (!v.removed && v.state === 'ok') release(s); else svc = null;
    return;
  }
  track(s);
  const p = game.player;
  const policeStop = s.state === 'policeStop';
  if (!policeStop && v.brain) {
    const status = driver.update(v, dt);
    if (status === 'stuck' && s.state === 'coming') { fleet.remove(v); return; }
  } else { v.input.throttle = 0; v.input.handbrake = true; v.input.steer = 0; }
  placeDriver(s, dt);

  // A stop: people get off / on; Shoumik's own stop or his destination.
  const at = standingAt(s);
  if (at && at !== s.lastStop) {
    s.lastStop = at;
    passengers.stop(s.unit, 1);
    if (s.state === 'coming' && at === s.stop) { s.state = 'atStop'; s.t = 0; }
    else if (s.state === 'riding' && (at === s.dest || rider.offQueued)) { alight(s); return; }
  }

  switch (s.state) {
    case 'coming': {
      const far = Math.hypot(s.stop.sx - p.position.x, s.stop.sz - p.position.z) > cfg.stopRadius * 4;
      if (far || game.ride || s.t > 80) { s.state = 'leaving'; s.t = 0; }
      else prompt('transit.busComing');
      break;
    }
    case 'atStop': {
      v.brain.busWait = Math.max(v.brain.busWait, 0.3);
      if (p.mode === 'onFoot' && !game.ride) {
        const d = frontDoor(s);
        const close = Math.hypot(d.x - p.position.x, d.z - p.position.z) < cfg.doorRange;
        prompt(close ? 'transit.boardBus' : 'transit.busComing', { fare: formatMoney(fareFor(game, 'bus')) });
      }
      if (s.t > cfg.waitAtStop) { s.state = 'leaving'; s.t = 0; prompt(null); }
      break;
    }
    case 'boarding': {
      v.brain.busWait = Math.max(v.brain.busWait, 0.3);
      prompt(null);
      const k = Math.min(1, s.t / 0.6);
      const d = frontDoor(s);
      p.position.x = s.from.x + (d.x - s.from.x) * k;
      p.position.z = s.from.z + (d.z - s.from.z) * k;
      p.heading = Math.atan2(v.x - d.x, v.z - d.z);
      p.speed = 1.4;
      if (k >= 1) seatPlayer(s);
      break;
    }
    case 'riding': {
      prompt(null);
      if (game.ride !== rider || rider.unit !== s.unit) { s.state = 'leaving'; s.t = 0; break; }
      rider.update(dt);
      const next = upcoming(s, 1)[0];
      rider.setNext(next?.name || null, s.dest?.name || null, rider.offQueued ? 'transit.offNext' : null);
      // Police: with enough stars they stop the bus and push him out.
      s.police = stars >= cfg.policeStars ? s.police + dt : 0;
      if (s.police > cfg.policeStopSeconds) {
        game.events.emit('toast:show', { key: 'transit.policeStop' });
        s.state = 'policeStop';
        s.t = 0;
      }
      break;
    }
    case 'policeStop': {
      if (s.t > 1.2 && rider.unit === s.unit) alight(s, 'police');
      break;
    }
    case 'leaving': {
      if (game.transitPrompt === 'bus') prompt(null);
      const d = Math.hypot(v.x - p.position.x, v.z - p.position.z);
      if (s.t > 6 || d > 40) release(s);
      break;
    }
    default: break;
  }
}

export default {
  id: 'buses',

  async init(g) {
    game = g;
    cfg = g.config.get('transit').bus;
    roads = g.world.roads;
    lane = g.config.get('traffic').lanes.outer;
    rng = new Rng(g.config.get('world').seed ^ 0xb05);
    [fleet, crowd] = await Promise.all([acquireFleet(g), acquireCrowd(g)]);
    driver = new Driver(g, g.config.get('traffic'), rng);
    passengers = new Passengers(g, crowd, rng);
    rider = acquireRider(g);
    cabin = getCabin(g, 'bus');
    nameStops(roads.busStops, g.content.get('places'));
    offs = [
      g.events.on('input:action', onAction),
      g.events.on('input:jump', () => { if (svc?.state === 'riding' && rider.unit === svc.unit) rider.queueOff(true); }),
      g.events.on('ride:destination', ({ line, id }) => { if (line === 'bus') setDestination(id); }),
      g.events.on('wanted:changed', ({ stars: n = 0 }) => { stars = n; }),
      g.events.on('player:busted', abort),
      g.events.on('player:died', abort),
      g.events.on('game:ready', blips),
    ];
    blips();
    g.buses = {
      get service() { return svc; }, passengers, cabin,
      call: (stop) => (svc ? null : callBus(stop)),
      upcoming: (n) => (svc ? upcoming(svc, n) : []),
      setDestination, skip,
    };
    log.info(`buses: ${roads.busStops.length} stops`);
  },

  update(dt) {
    if (!game.player || !fleet) return;
    cooldown = Math.max(0, cooldown - dt);
    if (svc) updateService(dt);
    else {
      // Standing at a stop calls a bus.
      const p = game.player;
      const st = p.mode === 'onFoot' && !game.ride && !p.dead ? stopHere() : null;
      if (st && st === near.stop) near.t += dt; else near = { stop: st, t: 0 };
      if (st && near.t > cfg.noticeSeconds && cooldown <= 0) { cooldown = 3; callBus(st); }
      else if (game.transitPrompt === 'bus') prompt(null);
    }
    passengers.update(dt);
    debugLine('bus', svc ? `bus ${svc.bus.id} ${svc.state} seg ${svc.segIndex}/${svc.segs.length} ${svc.bus.speed.toFixed(1)} m/s` : 'bus none');
  },

  dispose() {
    offs.forEach((off) => off());
    offs = [];
    abort();
    if (svc) release(svc);
    passengers?.dispose();
    prompt(null);
    svc = null;
  },
};
