// Feature: metro. MRT Line 6 trains running on the viaduct (world.landmarks.viaducts, kind
// 'rail'). Each train shuttles up and down its own track: it speeds up, slows down to stop
// at every station for a few seconds, and turns back at the ends of the line
// (src/entities/transit/lineTrain.js). Numbers and colours: data/landmarks.json → viaducts[].train.
//
// Roadmap 2 S6 — RIDING (src/entities/transit/lineRide.js): walk to the stairs under a station
// → E → wait on the platform → E when a train stands there (fare: data/economy.json → fares.metro)
// → sit inside with other passengers → get off at the next station (E / Jump / নামো) or at the
// station picked on the big map. Settings: data/transit.json → metro, cabins.metro, passengers.
//
// Events: sends metro:arrived { line, station } when a train stops at a station, map:blips
//         { id: 'metro-stations' }, ride:* (see lineRide.js / rider.js).
//         listens input:action, input:jump, ride:destination, player:busted, player:died.

import * as THREE from 'three';
import { loadTrainModels } from '../../entities/transit/trainModel.js';
import { LineTrain, buildCarGeometry } from '../../entities/transit/lineTrain.js';
import { LineRide } from '../../entities/transit/lineRide.js';
import { Passengers } from '../../entities/transit/passengers.js';
import { toWorld } from '../../entities/transit/cabin.js';
import { acquireCrowd } from '../../entities/people/crowd.js';
import { Rng } from '../../core/rng.js';
import { log } from '../../core/debug.js';

let game = null;
let trains = [];
let rides = [];
let passengers = null;
let root = null;
let geometry = null;
let real = null;   // { front, wagon, material } once the real 3D cars are loaded (Medium/High)
let offs = [];

/**
 * Everything a rider needs to know about one station: the stair feet on the sidewalks (where
 * you walk in), the two platforms (sign = which track side) and the door side of a train.
 */
function stationInfo(v, st, deckTop) {
  const line = v.line;
  const L = line.station.length / 2;
  const pose = { x: st.x, y: 0, z: st.z, heading: st.heading };
  const feet = [1, -1].map((s) => {
    const f = toWorld(pose, s * line.station.legOffset, 0, L * 0.72 + 0.8, {});
    return { x: f.x, z: f.z, heading: st.heading + Math.PI };
  });
  const platformY = line.deckY + line.deckThickness + 0.5;
  return {
    id: st.id, name: st.name, s: st.s, x: st.x, z: st.z, feet,
    platform(sign) {
      const out = {};
      // Near the platform edge, facing mostly along the track (turned a little towards it), so
      // the chase camera stays inside the station instead of behind its glass wall.
      v.path.at(st.s - 8, out, sign * (line.deckWidth / 2 + 0.8));
      return { x: out.x, y: platformY, z: out.z, heading: out.heading + (sign > 0 ? -0.35 : 0.35) };
    },
    doorSide: (tr) => Math.sign(tr.side) || 1,
    onPlatform: () => false,
    deckTop,
  };
}

export default {
  id: 'metro',

  async init(g) {
    game = g;
    root = new THREE.Group();
    root.name = 'metro';
    g.scene.add(root);
    trains = [];
    rides = [];
    const material = g.world.shared.facadeMaterial;
    const crowd = await acquireCrowd(g);
    passengers = new Passengers(g, crowd, new Rng(g.config.get('world').seed ^ 0x3e7c0));
    for (const v of g.world.landmarks?.viaducts || []) {
      if (v.kind !== 'rail' || !v.line.train) continue;
      const T = v.line.train;
      if (!geometry) geometry = buildCarGeometry(T);
      const y = v.line.deckY + v.line.deckThickness + 0.05;
      const stations = v.stations.map((st) => stationInfo(v, st, y));
      const ride = new LineRide(g, {
        kind: 'metro', lineId: v.id, line: v.line.name, icon: g.config.get('transit').metro.icon, fareId: 'metro',
        trains: [], stations, entry: 'stairs', passengers,
      });
      const mine = [];
      for (let i = 0; i < T.count; i++) {
        mine.push(new LineTrain({
          path: v.path, T, index: i, lineId: v.id, stations, heightAt: () => y, root, geometry, material,
          onArrive: (tr, st) => {
            g.events.emit('metro:arrived', { line: v.id, station: st.id });
            ride.onArrive(tr, st);
          },
        }));
      }
      ride.setTrains(mine);
      trains.push(...mine);
      rides.push(ride);
    }
    g.metro = { trains, rides, passengers }; // handle for debug tools and tests
    offs = [
      g.events.on('input:action', () => { for (const r of rides) if (r.onAction()) return; }),
      g.events.on('input:jump', () => { for (const r of rides) r.onJump(); }),
      g.events.on('ride:destination', ({ line, id }) => { for (const r of rides) if (r.lineId === line) r.setDestination(id); }),
      g.events.on('player:busted', () => rides.forEach((r) => r.abort())),
      g.events.on('player:died', () => rides.forEach((r) => r.abort())),
      g.events.on('game:ready', () => g.events.emit('map:blips', { id: 'metro-stations', points: rides.flatMap((r) => r.blips()) })),
    ];
    g.events.emit('map:blips', { id: 'metro-stations', points: rides.flatMap((r) => r.blips()) });
    // Real 3D cars (data/landmarks.json → train.model). Loaded in the background; the code-built
    // cars stay until it is ready, and stay for good on Low quality or if loading fails.
    const first = trains[0];
    if (first) {
      loadTrainModels(g, first.T).then((m) => {
        if (!m || !trains.length) return;
        real = m;
        for (const t of trains) t.useModels(m);
      }).catch((err) => log.warn(`metro: real model failed, keeping the built cars (${err.message})`));
    }
  },

  update(dt) {
    const focus = game.player?.position || game.camera.position;
    for (const t of trains) t.update(dt, focus);
    if (!game.player) return;
    for (const r of rides) r.update(dt);
    passengers.update(dt);
  },

  dispose() {
    offs.forEach((off) => off());
    offs = [];
    for (const r of rides) r.abort();
    passengers?.dispose();
    rides = [];
    root?.removeFromParent();
    geometry?.dispose();
    geometry = null;
    if (real) { real.front.dispose(); real.wagon.dispose(); real.material.dispose(); real = null; }
    trains = [];
  },
};
