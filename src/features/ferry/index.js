// Feature: ferry (Roadmap 2 S7) — ride the Buriganga launch with other passengers.
// One river launch shuttles along the Buriganga (data/boats.json → ferry): Babubazar Launch
// Ghat → Sadarghat Launch Terminal → Sea Mouth Ghat (where the river meets the Bay), and back.
// It is a LineTrain on a water path (src/entities/transit/lineTrain.js) ridden like the MRT
// (src/entities/transit/lineRide.js, 'stairs' entry): walk to the ghat on the bank → E → fade →
// wait on the pontoon → E when the launch is alongside → pay the fare (economy.json →
// fares.launch) → sit on the deck with the passengers → get off at the next ghat (E / Jump /
// নামো) or at the ghat picked on the big map (M). Each ghat has a floating pontoon with a
// gangway to the bank. Model: the Kenney ocean liner from assets/boats/boats.glb (streamed),
// code-built until then.
//
// Events: sends ferry:arrived { line, station }, map:blips { id: 'launch-ghats' }, ride:*.
//         listens input:action, input:jump, ride:destination, player:busted, player:died.

import * as THREE from 'three';
import { ViaductPath } from '../../world/landmarks/viaduct.js';
import { LineTrain } from '../../entities/transit/lineTrain.js';
import { LineRide } from '../../entities/transit/lineRide.js';
import { Passengers } from '../../entities/transit/passengers.js';
import { buildLaunchGeometry, loadBoatKit } from '../../entities/boats/models.js';
import { VBuilder } from '../../entities/vehicles/shapes.js';
import { acquireCrowd } from '../../entities/people/crowd.js';
import { Rng } from '../../core/rng.js';
import { log, debugLine } from '../../core/debug.js';

let game = null;
let F = null;
let root = null;
let trains = [];
let ride = null;
let passengers = null;
let codeGeo = null;
let codeMat = null;
let real = null;
let pontoons = null;
let offs = [];
let kitState = 'wait';

/** A ghat: pontoon on the bank side of the launch, gangway to the bank, the foot on land. */
function ghatInfo(path, gh, waterY, bankZ) {
  const L = game.world.layout;
  const jx = L.minX + gh.at[0] * L.P + L.W / 2, jz = L.minZ + gh.at[1] * L.P + L.W / 2;
  const s = path.nearest(jx, jz);
  const here = path.at(s, {});
  const P = F.pontoon, T = F.launch;
  const off = T.carWidth / 2 + 1 + P.width / 2; // metres to the LEFT of +s (north while it runs east)
  const pc = path.at(s, {}, off);
  const foot = { x: pc.x, z: bankZ - 4, heading: 0 }; // facing the river (south)
  return {
    id: gh.id, name: gh.name, s, x: here.x, z: here.z, feet: [foot],
    pontoon: { x: pc.x, z: pc.z, heading: here.heading },
    platform() {
      // On the pontoon, facing the launch (turned a little along it) so the camera stays above the pontoon.
      return { x: pc.x, y: waterY + 0.95, z: pc.z, heading: here.heading - Math.PI / 2 + 0.35 };
    },
    doorSide: () => 1,
    onPlatform: () => false,
  };
}

/** Pontoons + gangways to the bank, one merged mesh. */
function buildPontoons(ghats, waterY, bankZ) {
  const vb = new VBuilder();
  const P = F.pontoon, C = P.colors;
  for (const g of ghats) {
    const { x, z, heading } = g.pontoon;
    const c = Math.cos(heading), s = Math.sin(heading);
    const W = (lx, y, lz) => [x + lx * c + lz * s, y, z - lx * s + lz * c];
    const hl = P.length / 2, hw = P.width / 2, y0 = waterY - 0.4, y1 = waterY + 0.9;
    const below = [x, y0 - 5, z];
    vb.quad(W(-hw, y1, -hl), W(hw, y1, -hl), W(hw, y1, hl), W(-hw, y1, hl), C.top, below);
    for (const [ax, az, bx, bz] of [[-hw, -hl, hw, -hl], [hw, -hl, hw, hl], [hw, hl, -hw, hl], [-hw, hl, -hw, -hl]]) {
      vb.quad(W(ax, y0, az), W(bx, y0, bz), W(bx, y1, bz), W(ax, y1, az), C.pontoon, [x, (y0 + y1) / 2, z]);
    }
    // A tin roof on posts over the middle.
    for (const lz of [-hl * 0.4, hl * 0.4]) for (const lx of [-hw + 0.3, hw - 0.3]) vb.beam(W(lx, y1, lz), W(lx, y1 + 2.6, lz), 0.14, C.rail);
    vb.quad(W(-hw - 0.3, y1 + 2.6, -hl * 0.5), W(hw + 0.3, y1 + 2.6, -hl * 0.5), W(hw + 0.3, y1 + 2.9, hl * 0.5), W(-hw - 0.3, y1 + 2.9, hl * 0.5), C.roof, [x, y1, z]);
    // Gangway from the pontoon to the bank (straight north to the river bank).
    const gw = P.gangwayWidth / 2, gz0 = z - hw, gz1 = bankZ - 1.5;
    if (gz1 < gz0) {
      vb.quad([x - gw, y1, gz0], [x + gw, y1, gz0], [x + gw, 0.6, gz1], [x - gw, 0.6, gz1], C.gangway, [x, -5, (gz0 + gz1) / 2]);
      for (const sx of [-gw, gw]) vb.beam([x + sx, y1 + 1, gz0], [x + sx, 1.6, gz1], 0.08, C.rail);
    }
  }
  const mesh = new THREE.Mesh(vb.build(), new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.name = 'launch-pontoons';
  mesh.matrixAutoUpdate = false;
  return mesh;
}

/** The real launch model (boats.glb child 'launch') sized like the code-built one. */
function realLaunch(kit) {
  const k = kit?.get(F.launch.model);
  if (!k) return null;
  const T = F.launch;
  const g = k.geometry.clone();
  g.rotateY(((T.rotY || 0) * Math.PI) / 180);
  g.computeBoundingBox();
  const b = g.boundingBox, size = b.getSize(new THREE.Vector3());
  g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
  const sx = T.carWidth / size.x, sz = T.carLength / size.z;
  g.scale(sx, sx * (T.heightScale ?? 1), sz);
  g.translate(0, -1.4, 0); // the hull sits in the water
  return { front: g, wagon: g, material: k.material };
}

function checkKit() {
  if (kitState !== 'wait') return;
  const st = game.streamer?.started;
  if (st && st.get('model.boats') === 'failed') { kitState = 'failed'; return; }
  if (st && st.get('model.boats') !== 'done') return;
  kitState = 'loading';
  loadBoatKit(game).then((kit) => {
    real = realLaunch(kit);
    kitState = real ? 'ready' : 'failed';
    if (real) for (const t of trains) t.useModels(real);
  });
}

export default {
  id: 'ferry',

  async init(g) {
    game = g;
    F = g.config.get('boats').ferry;
    if (!F) return;
    root = new THREE.Group();
    root.name = 'ferry';
    g.scene.add(root);
    const waterY = g.world.cfg.water.level;
    const bankZ = g.world.terrain?.field?.river?.z0 ?? g.world.layout.maxZ;
    const path = new ViaductPath(g.world.layout, F.path, F.cornerRadius);
    const ghats = F.ghats.map((gh) => ghatInfo(path, gh, waterY, bankZ));
    pontoons = buildPontoons(ghats, waterY, bankZ);
    root.add(pontoons);
    const crowd = await acquireCrowd(g);
    passengers = new Passengers(g, crowd, new Rng(g.config.get('world').seed ^ 0xfe77));
    codeGeo = buildLaunchGeometry(F.launch);
    codeMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    ride = new LineRide(g, {
      kind: 'launch', cabinKind: 'launch', lineId: F.id, line: F.name, icon: g.config.get('transit').launch.icon,
      fareId: 'launch', stations: ghats, entry: 'stairs', passengers,
    });
    trains = [];
    for (let i = 0; i < F.launch.count; i++) {
      trains.push(new LineTrain({
        path, T: F.launch, index: i, lineId: F.id, stations: ghats, side: 0, heightAt: () => waterY, root, geometry: codeGeo, material: codeMat,
        onArrive: (tr, st) => {
          g.events.emit('ferry:arrived', { line: F.id, station: st.id });
          ride.onArrive(tr, st);
        },
      }));
    }
    ride.setTrains(trains);
    const blips = () => g.events.emit('map:blips', { id: 'launch-ghats', points: ride.blips() });
    offs = [
      g.events.on('input:action', () => ride.onAction()),
      g.events.on('input:jump', () => ride.onJump()),
      g.events.on('ride:destination', ({ line, id }) => { if (line === F.id) ride.setDestination(id); }),
      g.events.on('player:busted', () => ride.abort()),
      g.events.on('player:died', () => ride.abort()),
      g.events.on('game:ready', blips),
    ];
    blips();
    g.ferry = { trains, ride, passengers, ghats };
    log.info(`ferry: ${ghats.length} ghats (${ghats.map((x) => x.id).join(', ')}), river line ${Math.round(path.length)} m`);
  },

  update(dt) {
    if (!F || !ride) return;
    checkKit();
    const focus = game.player?.position || game.camera.position;
    for (const t of trains) t.update(dt, focus);
    if (!game.player) return;
    ride.update(dt);
    passengers.update(dt);
    const t0 = trains[0];
    if (t0) debugLine('ferry', `launch s ${t0.s.toFixed(0)} v ${t0.speed.toFixed(1)} ${t0.stoppedAt ? `at ${t0.stoppedAt.id}` : ''}`);
  },

  dispose() {
    offs.forEach((off) => off());
    offs = [];
    ride?.abort();
    passengers?.dispose();
    root?.removeFromParent();
    codeGeo?.dispose();
    pontoons?.geometry.dispose();
    trains = [];
    ride = null;
  },
};
