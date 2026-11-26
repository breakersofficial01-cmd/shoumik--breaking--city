// Feature: railway (Roadmap 2 S6). The passenger train on the ground railway built by
// src/world/landmarks/railway.js (data/landmarks.json → railways): Kamalapur Railway Station
// at the east edge of the city → Coconut Coast → Sobujpur in the northern paddy fields.
// One train shuttles up and down the single track and stops at every station
// (src/entities/transit/lineTrain.js; real Quaternius Train Pack cars on Medium/High).
//
// Riding (src/entities/transit/lineRide.js, 'walk' entry): walk onto a platform → the train
// waits for you → E → pay the fare (data/economy.json → fares.train) → sit with the other
// passengers → get off at the next station (E / Jump / নামো) or at the station picked on the
// big map (M). A moving train knocks down anyone standing on the track.
//
// Events: sends train:arrived { line, station }, map:blips { id: 'rail-stations' }, player:hit,
//         ride:* (lineRide.js / rider.js).
//         listens input:action, input:jump, ride:destination, player:busted, player:died.

import * as THREE from 'three';
import { LineTrain, buildCarGeometry } from '../../entities/transit/lineTrain.js';
import { LineRide } from '../../entities/transit/lineRide.js';
import { Passengers } from '../../entities/transit/passengers.js';
import { toWorld } from '../../entities/transit/cabin.js';
import { loadTrainModels } from '../../entities/transit/trainModel.js';
import { acquireCrowd } from '../../entities/people/crowd.js';
import { Rng } from '../../core/rng.js';
import { log, debugLine } from '../../core/debug.js';

let game = null;
let root = null;
let trains = [];
let rides = [];
let passengers = null;
let geometries = [];
let real = [];
let offs = [];
let hitCooldown = 0;
const _a = {};

/** Rider info for one station: platform, which side the doors open, "is he on it?". */
function stationInfo(rl, st) {
  const S = rl.line.station;
  const pose = { x: st.x, y: st.base, z: st.z, heading: st.heading };
  const sd = st.platformSide;
  const lo = Math.min(sd * S.edge, sd * (S.edge + S.width)), hi = Math.max(sd * S.edge, sd * (S.edge + S.width));
  const c = Math.cos(st.heading), s = Math.sin(st.heading);
  return {
    id: st.id, name: st.name, s: st.s, x: st.x, z: st.z, feet: [],
    platform() {
      const p = toWorld(pose, (lo + hi) / 2, S.height, 0, {});
      return { x: p.x, y: p.y, z: p.z, heading: st.heading + (sd > 0 ? -Math.PI / 2 : Math.PI / 2) };
    },
    doorSide: () => sd,
    /** Standing on the platform (or `extra` metres around it). */
    onPlatform(x, z, extra = 0) {
      const dx = x - st.x, dz = z - st.z;
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      return Math.abs(lz) < S.length / 2 + extra && lx > lo - 0.6 - extra && lx < hi + extra;
    },
  };
}

/** A moving train knocks down Shoumik if he stands on the track. */
function trackHit(tr, dt) {
  hitCooldown -= dt;
  const p = game.player;
  if (!p || p.mode !== 'onFoot' || tr.speed < 2 || hitCooldown > 0 || !tr.focusNear) return;
  const T = tr.T;
  for (let i = 0; i < tr.cars.length; i++) {
    tr.carPose(i, _a);
    const dx = p.position.x - _a.x, dz = p.position.z - _a.z;
    const c = Math.cos(_a.heading), s = Math.sin(_a.heading);
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    if (Math.abs(lx) < T.carWidth / 2 + 0.3 && Math.abs(lz) < T.carLength / 2 + 0.4) {
      hitCooldown = 1.5;
      game.events.emit('player:hit', { x: _a.x - c * Math.sign(lx || 1), z: _a.z + s * Math.sign(lx || 1), power: 3, by: 'train' });
      return;
    }
  }
}

export default {
  id: 'railway',

  async init(g) {
    game = g;
    root = new THREE.Group();
    root.name = 'railway';
    g.scene.add(root);
    trains = [];
    rides = [];
    const crowd = await acquireCrowd(g);
    passengers = new Passengers(g, crowd, new Rng(g.config.get('world').seed ^ 0x7a11));
    const material = g.world.shared.facadeMaterial;
    const icon = g.config.get('transit').train.icon;
    for (const rl of g.world.landmarks?.railways || []) {
      const T = rl.line.train;
      if (!T) continue;
      const geometry = buildCarGeometry(T);
      geometries.push(geometry);
      const stations = rl.stations.map((st) => stationInfo(rl, st));
      const ride = new LineRide(g, { kind: 'train', lineId: rl.id, line: rl.line.name, icon, fareId: 'train', stations, entry: 'walk', passengers });
      const mine = [];
      for (let i = 0; i < T.count; i++) {
        mine.push(new LineTrain({
          path: rl.path, T, index: i, lineId: rl.id, stations, side: 0, heightAt: rl.heightAt, root, geometry, material,
          onArrive: (tr, st) => {
            g.events.emit('train:arrived', { line: rl.id, station: st.id });
            ride.onArrive(tr, st);
          },
        }));
      }
      ride.setTrains(mine);
      trains.push(...mine);
      rides.push(ride);
      loadTrainModels(g, T).then((m) => {
        if (!m || !trains.length) return;
        real.push(m);
        for (const t of mine) t.useModels(m);
      }).catch((err) => log.warn(`railway: real model failed, keeping the built cars (${err.message})`));
    }
    const blips = () => g.events.emit('map:blips', { id: 'rail-stations', points: rides.flatMap((r) => r.blips()) });
    offs = [
      g.events.on('input:action', () => { for (const r of rides) if (r.onAction()) return; }),
      g.events.on('input:jump', () => { for (const r of rides) r.onJump(); }),
      g.events.on('ride:destination', ({ line, id }) => { for (const r of rides) if (r.lineId === line) r.setDestination(id); }),
      g.events.on('player:busted', () => rides.forEach((r) => r.abort())),
      g.events.on('player:died', () => rides.forEach((r) => r.abort())),
      g.events.on('game:ready', blips),
    ];
    blips();
    g.railway = { trains, rides, passengers }; // handle for debug tools and tests
    log.info(`railway: ${rides.length} line(s), ${trains.length} train(s), stations ${rides.flatMap((r) => r.stations.map((s) => s.id)).join(', ')}`);
  },

  update(dt) {
    const focus = game.player?.position || game.camera.position;
    for (const t of trains) { t.update(dt, focus); trackHit(t, dt); }
    if (!game.player) return;
    for (const r of rides) r.update(dt);
    passengers.update(dt);
    const t0 = trains[0];
    if (t0) debugLine('railway', `train s ${t0.s.toFixed(0)}/${t0.path.length.toFixed(0)} v ${t0.speed.toFixed(1)} ${t0.stoppedAt ? `at ${t0.stoppedAt.id}` : ''}`);
  },

  dispose() {
    offs.forEach((off) => off());
    offs = [];
    for (const r of rides) r.abort();
    passengers?.dispose();
    root?.removeFromParent();
    for (const geo of geometries) geo.dispose();
    for (const m of real) { m.front.dispose(); m.wagon.dispose(); m.material.dispose(); }
    geometries = [];
    real = [];
    trains = [];
    rides = [];
  },
};
