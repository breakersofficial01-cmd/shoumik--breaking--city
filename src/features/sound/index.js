// Feature: sound (Session 7). Turns game events and the street around Shoumik into sound,
// through the shared mixer game.audio (src/audio/audio.js). All sounds are made in code unless a
// file is added in data/assets.json (see audio.js). Numbers: data/audio.json.
//
// Listens: weapon:fired, police:fired, explosion, ped:hit, vehicle:crashed, power:cut,
//          wanted:changed, shop:purchased / lesson:completed (small chime)
// Every frame (cheap, throttled): engine of the vehicle he drives, crowd murmur, distant
// traffic, sirens of police vehicles nearby, fire of burning vehicles, generators during
// load-shedding, and random crows (by day), hawkers' calls and rickshaw bells.
// Sends:   vehicle:horn { kind: 'bell', ai: true } for a nearby rickshaw (the horn code plays it)

import { debugLine } from '../../core/debug.js';

let game = null;
let cfg = null;
let A = null;
let offs = [];
let loops = {};
let scanTimer = 0;
let crowIn = 10;
let hawkerIn = 15;
let bellIn = 6;
let cut = null;
let crowdK = 0;
const rand = ([a, b]) => a + Math.random() * (b - a);

/** People within `range` metres of (x, z) — counted on the shared crowd. */
function countPeople(x, z, range) {
  let n = 0;
  for (const p of game.crowd?.people || []) if (Math.abs(p.x - x) < range && Math.abs(p.z - z) < range) n++;
  return n;
}

/** A random point a little away from Shoumik (for crows and hawkers). */
function around(p, min, max) {
  const a = Math.random() * Math.PI * 2, r = min + Math.random() * (max - min);
  return { x: p.x + Math.cos(a) * r, z: p.z + Math.sin(a) * r };
}

function scan() {
  const p = game.player?.position;
  if (!p) return;
  const amb = cfg.ambience;
  const vehicles = game.fleet?.vehicles || [];

  // Crowd murmur and distant traffic.
  crowdK = Math.min(1, countPeople(p.x, p.z, 25) / amb.crowdPeople);
  loops.crowd.set(crowdK * (game.clock?.night ? 0.6 : 1));
  let moving = 0;
  let sirenD = Infinity, sirenX = 0, fireD = Infinity, fireX = 0;
  for (const v of vehicles) {
    const d = Math.hypot(v.x - p.x, v.z - p.z);
    if (d < 70 && Math.abs(v.speed) > 2) moving++;
    if (v.tags?.police && v.driver === 'police' && d < sirenD) { sirenD = d; sirenX = v.x; }
    if (v.state === 'burning' && d < fireD) { fireD = d; fireX = v.x; }
  }
  loops.traffic.set(Math.min(1, moving / 8));
  const pan = (x) => Math.max(-1, Math.min(1, (x - p.x) / 30)) * 0.5;
  loops.siren.set(sirenD < amb.sirenRange ? (1 - sirenD / amb.sirenRange) ** 1.5 : 0, pan(sirenX));
  loops.fire.set(fireD < amb.fireRange ? 1 - fireD / amb.fireRange : 0, pan(fireX));

  // Generators hum inside a load-shedding district.
  const inCut = cut && p.x >= cut.x0 && p.x <= cut.x1 && p.z >= cut.z0 && p.z <= cut.z1;
  loops.generator.set(inCut ? 1 : 0);
}

/** Engine of the vehicle Shoumik is driving (pitch follows speed). */
function engine() {
  const v = game.player?.vehicle;
  const E = cfg.engine;
  if (!v || E.silentStyles.includes(v.T.style) || v.state === 'wreck') { loops.engine.set(0); return; }
  const k = Math.min(1, Math.abs(v.speed) / (v.T.maxSpeed || 20));
  const style = E.styles[v.T.style] ?? E.styles[v.type] ?? 1;
  loops.engine.setRate((E.idleHz + (E.topHz - E.idleHz) * k) * style);
  loops.engine.set(0.55 + 0.45 * Math.min(1, k + Math.abs(v.input?.throttle || 0) * 0.3));
}

function randomLife(dt) {
  const p = game.player?.position;
  if (!p) return;
  const amb = cfg.ambience;
  const night = !!game.clock?.night;
  crowIn -= dt;
  if (crowIn <= 0) {
    crowIn = rand(amb.crowEverySeconds);
    if (!night) game.audio.play('crow', { ...around(p, 15, 50), bus: 'ambience' });
  }
  hawkerIn -= dt;
  if (hawkerIn <= 0) {
    hawkerIn = rand(amb.hawkerEverySeconds);
    if (crowdK > 0.3 && (!night || (game.clock?.hour ?? 12) < 22)) game.audio.play('hawker', { ...around(p, 8, 25), bus: 'ambience' });
  }
  bellIn -= dt;
  if (bellIn <= 0) {
    bellIn = rand(amb.bellsEverySeconds);
    let best = null, bestD = amb.bellRange;
    for (const v of game.fleet?.vehicles || []) {
      if (v.T.style !== 'rickshaw' || v.driver === 'player' || Math.abs(v.speed) < 0.5) continue;
      const d = Math.hypot(v.x - p.x, v.z - p.z);
      if (d < bestD) { best = v; bestD = d; }
    }
    if (best) game.events.emit('vehicle:horn', { id: best.id, x: best.x, z: best.z, kind: best.T.horn || 'bell', ai: true });
  }
}

export default {
  id: 'sound',

  init(g) {
    game = g;
    A = g.audio;
    cfg = g.config.get('audio');
    if (!A) return;
    loops = {};
    for (const id of ['crowd', 'traffic', 'siren', 'fire', 'generator']) loops[id] = A.loop(id, 'ambience');
    loops.engine = A.loop('engine', 'sfx');
    const W = cfg.weaponSounds;
    offs = [
      g.events.on('weapon:fired', ({ id, x, z }) => A.play(W[id] || 'gun.pistol', { x, z })),
      g.events.on('police:fired', ({ x, z, rifle }) => A.play(rifle ? W.policeRifle : W.police, { x, z })),
      g.events.on('explosion', ({ x, z, power = 1 }) => A.play('explosion', { x, z, volume: Math.min(1, 0.5 + power * 0.5) })),
      g.events.on('ped:hit', ({ x, z }) => A.play('punch', { x, z })),
      g.events.on('vehicle:crashed', ({ x, z, speed }) => A.play('crash', { x, z, volume: Math.min(1, (speed || 5) / 15) })),
      g.events.on('power:cut', ({ rect, on }) => { cut = on ? rect : null; }),
      g.events.on('lesson:completed', ({ earned }) => { if (earned > 0) A.play('reward', { bus: 'sfx' }); }),
    ];
  },

  update(dt) {
    if (!A?.ctx) return;
    engine();
    scanTimer -= dt;
    if (scanTimer <= 0) {
      scanTimer = 0.4;
      scan();
    }
    randomLife(dt);
    debugLine('sound', `sound ${A.ctx.state} voices ${A.voices} crowd ${crowdK.toFixed(2)}${cut ? ' generator' : ''}`);
  },

  dispose() {
    offs.forEach((off) => off());
    offs = [];
    for (const l of Object.values(loops)) l.stop();
    loops = {};
  },
};
