// Feature: hotspots. Gen-Z hangout spots (TSC, Hatirjheel, Gulshan café, Dhanmondi lakeside)
// where stylish young adults dance to a boombox. Shoumik can join in.
// Spots come from data/hotspots.json through the Content Service. All dancers are adults;
// the dancing is plain party dancing (no sexual content — CLAUDE.md).
//
// Dancers are drawn by the shared crowd (entities/people/crowd.js) and only exist while the
// player is near a spot. The mat, boombox and neon posts are always there.
//
// Events
//   listens  input:action                      → start dancing when standing at a spot
//            player:actionChanged { name, on } → update the on-screen hint
//            danger:raised { x, z }            → dancers duck for a few seconds
//            game:paused { paused }            → pause the music
//   sends    player:action { name: 'dance', beat }
//            prompt:show { id, key } / prompt:hide { id }   (the HUD shows the hint)
//            hotspot:entered { id } / hotspot:left { id }

import * as THREE from 'three';
import { markGlow } from '../../world/graphics/glow.js';
import { log, debugLine } from '../../core/debug.js';
import { Rng } from '../../core/rng.js';
import { isRaised } from '../../world/layout.js';
import { validateHotspots } from '../../content/validators.js';
import { Animator } from '../../entities/people/animator.js';
import { buildLook } from '../../entities/people/looks.js';
import { acquireCrowd } from '../../entities/people/crowd.js';
import { buildHotspotProps } from './props.js';
import { Boombox } from './boombox.js';

const SIDE = {
  N: { ax: 1, az: 0, nx: 0, nz: 1 },
  S: { ax: 1, az: 0, nx: 0, nz: -1 },
  W: { ax: 0, az: 1, nx: 1, nz: 0 },
  E: { ax: 0, az: 1, nx: -1, nz: 0 },
};

let game = null;
let settings = null;
let pedCfg = null;
let crowd = null;
let boombox = null;
let rng = null;
let spots = [];
let materials = null;
let root = null;
let inside = null;      // the spot Shoumik is standing at
let dancing = false;
let offs = [];

/** Work out where a spot and its dancers stand in the city. Returns null if it cannot fit. */
function place(item) {
  const L = game.world.layout;
  const p = L.piece(2 * item.col + 1, 2 * item.row + 1);
  if (!p || !isRaised(p)) return null;
  const s = SIDE[item.side];
  const perRow = Math.ceil(item.dancers / item.rows);
  const length = perRow * settings.spacing;
  const depth = item.rows === 1 ? 1.1 : item.rows * settings.rowGap;
  const mid = item.inset + ((item.rows - 1) * settings.rowGap) / 2;
  // A point on the chosen edge, then `mid` metres into the block.
  const ex = s.ax ? p.x + item.along * p.w : (item.side === 'W' ? p.x : p.x + p.w);
  const ez = s.az ? p.z + item.along * p.d : (item.side === 'N' ? p.z : p.z + p.d);
  const x = ex + s.nx * mid, z = ez + s.nz * mid;
  const spot = { ...item, ...s, x, z, y: p.y, length, depth, dancers: [], live: false, scared: 0 };
  spot.box = item.rows > 1
    ? { x: x - s.nx * (depth / 2 + 1.2), z: z - s.nz * (depth / 2 + 1.2) }
    : { x: x + s.ax * (length / 2 + 0.9), z: z + s.az * (length / 2 + 0.9) };
  const face = item.rows > 1 ? Math.atan2(-s.nx, -s.nz) : Math.atan2(s.nx, s.nz);
  spot.places = [];
  for (let r = 0; r < item.rows; r++) {
    for (let c = 0; c < perRow && spot.places.length < item.dancers; c++) {
      const t = (c - (perRow - 1) / 2) * settings.spacing + (r % 2) * 0.4;
      const n = (r - (item.rows - 1) / 2) * settings.rowGap;
      const px = x + s.ax * t + s.nx * n, pz = z + s.az * t + s.nz * n;
      if (game.world.collision.isBlocked(px, pz, 0.32)) continue; // a pole or tree is in the way
      spot.places.push({ x: px, z: pz, heading: face + rng.range(-0.35, 0.35) });
    }
  }
  return spot;
}

function wake(spot) {
  spot.live = true;
  const beat = () => boombox.beat();
  for (const pl of spot.places) {
    const arch = pedCfg.archetypes[rng.weighted(settings.dancerArchetypes)];
    if (!arch) continue;
    const look = buildLook(arch, pedCfg.palettes, rng);
    const animator = new Animator(look.dims, { idle: 'phone' });
    const d = {
      ...pl, y: spot.y, animator, clap: rng.chance(settings.clapChance), variant: rng.int(0, 2),
      changeAt: 0, circle: { x: pl.x, z: pl.z, r: 0.3 },
    };
    d.person = crowd.add(look, animator.pose);
    Object.assign(d.person, { x: d.x, y: d.y, z: d.z, heading: d.heading, groundY: spot.y });
    d.start = () => animator.play(d.clap ? 'clap' : 'dance', { variant: d.variant, beat });
    d.start();
    game.world.collision.dynamic.add(d.circle);
    spot.dancers.push(d);
  }
}

function sleep(spot) {
  spot.live = false;
  for (const d of spot.dancers) {
    crowd.remove(d.person);
    game.world.collision.dynamic.delete(d.circle);
  }
  spot.dancers.length = 0;
}

function showPrompt() {
  if (inside) game.events.emit('prompt:show', { id: 'hotspot', key: dancing ? 'hotspot.stop' : 'hotspot.dance' });
  else game.events.emit('prompt:hide', { id: 'hotspot' });
}

export default {
  id: 'hotspots',

  async init(g) {
    game = g;
    pedCfg = g.config.get('pedestrians');
    rng = new Rng(g.config.get('world').seed ^ 0xda9ce);
    g.content.registerType('hotspots', { localPath: 'data/hotspots.json', validate: validateHotspots });
    await g.content.load('hotspots');
    settings = g.content.getDefaults('hotspots');
    crowd = await acquireCrowd(g);
    boombox = new Boombox();
    materials = {
      lit: new THREE.MeshLambertMaterial({ vertexColors: true }),
      neon: markGlow(new THREE.MeshBasicMaterial({ vertexColors: true }), 'glow'), // unlit = glows
    };
    root = new THREE.Group();
    root.name = 'hotspots';
    g.scene.add(root);
    spots = [];
    for (const item of g.content.get('hotspots')) {
      if (!item.active) continue;
      const spot = place(item);
      if (!spot || spot.places.length === 0) { log.warn(`hotspot "${item.id}" does not fit at col ${item.col}, row ${item.row}`); continue; }
      root.add(buildHotspotProps(spot, settings, materials));
      spots.push(spot);
    }
    log.info('hotspots:', spots.map((s) => `${s.id} @ ${s.x.toFixed(0)},${s.z.toFixed(0)}`).join(' | '));
    offs = [
      g.events.on('input:action', () => {
        if (inside && !dancing && game.player?.mode === 'onFoot') g.events.emit('player:action', { name: 'dance', beat: () => boombox.beat() });
      }),
      g.events.on('player:actionChanged', ({ name, on }) => { if (name === 'dance') { dancing = on; showPrompt(); } }),
      g.events.on('danger:raised', ({ x, z, radius = 16 }) => {
        for (const s of spots) {
          if (!s.live || Math.hypot(s.x - x, s.z - z) > radius + s.length / 2) continue;
          s.scared = 4;
          for (const d of s.dancers) d.animator.play('cower');
        }
      }),
      g.events.on('game:paused', ({ paused }) => boombox.setPaused(paused)),
    ];
  },

  update(dt) {
    if (!game.player) return;
    const p = game.player.position;
    const lod = game.quality.pedLodDistance;
    let nearest = null;
    let nearestD = Infinity;
    let here = null;
    for (const s of spots) {
      const dist = Math.hypot(s.x - p.x, s.z - p.z);
      if (dist < nearestD) { nearestD = dist; nearest = s; }
      if (dist < settings.joinRadius + s.length / 2 - 1) here = here || s;
      if (!s.live && dist < settings.activeDistance) wake(s);
      else if (s.live && dist > settings.activeDistance + 15) sleep(s);
      if (!s.live) continue;
      if (s.scared > 0) {
        s.scared -= dt;
        if (s.scared <= 0) for (const d of s.dancers) d.start();
      }
      const beat = boombox.beat();
      for (const d of s.dancers) {
        if (s.scared <= 0 && !d.clap && beat > d.changeAt) {
          d.changeAt = beat + rng.int(settings.moveChangeBeats[0], settings.moveChangeBeats[1]);
          d.variant = (d.variant + rng.int(1, 2)) % 3;
          d.start();
        }
        d.animator.update(dt, { speed: 0 });
        d.person.far = dist > lod;
      }
    }
    // Music: only the nearest spot is heard, quieter with distance.
    const a = settings.audio;
    const muted = game.save.data.settings.sound === false;
    const k = nearest && nearestD < a.hearDistance && !muted ? (1 - nearestD / a.hearDistance) ** 2 : 0;
    boombox.set(a.volume * k, nearest?.bpm);

    if (here !== inside) {
      if (inside) game.events.emit('hotspot:left', { id: inside.id });
      inside = here;
      if (inside) game.events.emit('hotspot:entered', { id: inside.id });
      showPrompt();
    }
    debugLine('hotspot', nearest ? `hotspot ${nearest.id} ${nearestD.toFixed(0)} m` : '');
  },

  dispose() {
    offs.forEach((off) => off());
    offs = [];
    for (const s of spots) sleep(s);
    spots = [];
    boombox?.dispose();
    root?.removeFromParent();
    game.events.emit('prompt:hide', { id: 'hotspot' });
  },
};
