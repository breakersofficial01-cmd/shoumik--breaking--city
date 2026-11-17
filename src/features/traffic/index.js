// Feature: traffic. AI vehicles driving around the player — rickshaws, CNGs, buses, cars…
// Which vehicles and how many per district: data/traffic.json → mix; how many in total:
// data/quality.json → traffic. The driving itself is entities/vehicles/driver.js.
//
// Like pedestrians, vehicles are recycled: one that falls far behind is removed and a new
// one appears on a road ahead (never close in front of the camera). Jam junctions
// (Farmgate, Shahbag) get extra vehicles, slower speeds and longer waits.
// NOTE: the fleet (physics) is stepped by the `vehicles` feature — keep both switched on.
//
// Events
//   listens  traffic:adopt { id }        somebody hands us a vehicle with a driver to look after
//            (a vehicle the player takes simply stops being ours: its driver is no longer 'ai')
//            vehicle:burning { id }      the driver jumps out
//   sends    vehicle:driverEjected { x, z, heading, archetype, angry, flee }   (pedestrians make him a person)
//            vehicle:horn { id, x, z, kind, ai }

import { debugLine } from '../../core/debug.js';
import { Rng } from '../../core/rng.js';
import { DIRS, opposite } from '../../world/roads.js';
import { buildLook } from '../../entities/people/looks.js';
import { acquireFleet } from '../../entities/vehicles/fleet.js';
import { Driver } from '../../entities/vehicles/driver.js';
import { buildShelters } from './shelters.js';

let game = null;
let cfg = null;
let pedCfg = null;
let fleet = null;
let driver = null;
let rng = null;
let roads = null;
let shelters = null;
let warm = true;
let offs = [];

const mixFor = (district) => cfg.mix[district?.id] || cfg.mix.default;
const mine = (v) => v.driver === 'ai' && v.brain && !v.removed;

/** Seat a visible rider on open vehicles (rickshaw puller, biker…). */
function addRider(v) {
  if (v.T.closed) return;
  const table = cfg.riderArchetypes[v.type] || cfg.riderArchetypes.default;
  const name = rng.weighted(table);
  const arch = pedCfg.archetypes[name];
  if (!arch) return;
  v.tags.riderArchetype = name;
  fleet.setRider(v, buildLook(arch, pedCfg.palettes, rng));
}

/** The driver leaves the vehicle (it is burning, or it was handed back empty). */
function bail(v, flee) {
  const left = { x: Math.cos(v.heading), z: -Math.sin(v.heading) };
  const side = v.T.size[1] / 2 + 0.7;
  fleet.setRider(v, null);
  game.events.emit('vehicle:driverEjected', {
    x: v.x - left.x * side, z: v.z - left.z * side, heading: v.heading,
    archetype: v.tags.riderArchetype || null, angry: false, flee,
  });
  v.driver = null;
  v.brain = null;
  v.input.throttle = 0;
  v.input.handbrake = true;
}

function trySpawn() {
  const s = cfg.spawn;
  const p = game.player.position;
  const a = rng.range(0, Math.PI * 2);
  const dist = rng.range(warm ? s.warmMinDistance : s.minDistance, s.maxDistance);
  let sx = p.x + Math.sin(a) * dist, sz = p.z + Math.cos(a) * dist;
  // Near a jam junction, half of the new vehicles appear on the roads leading into it.
  const jam = roads.jams.find((j) => Math.hypot(p.x - j.x, p.z - j.z) < s.maxDistance);
  if (jam && rng.chance(cfg.jamSpawnShare)) {
    const d = rng.range(15, jam.radius);
    sx = jam.x + Math.sin(a) * d; sz = jam.z + Math.cos(a) * d;
  }
  const seg = roads.nearestSegment(sx, sz);
  if (!seg) return false;
  // Drive the segment in either direction.
  let { c, r, d } = seg;
  let t = seg.t;
  if (rng.chance(0.5)) { c += DIRS[d].dc; r += DIRS[d].dr; d = opposite(d); t = 1 - t; }
  const district = game.world.districtAt(sx, sz);
  const type = rng.weighted(mixFor(district).types);
  const T = fleet.cfg.types[type];
  if (!T) return false;
  const lane = roads.segment(c, r, d, cfg.lanes[T.lane] ?? cfg.lanes.inner);
  const u = Math.max(T.size[0], Math.min(lane.len - T.size[0] - cfg.signals.stopLineBack, lane.len * t));
  const x = lane.ax + lane.fx * u, z = lane.az + lane.fz * u;
  const far = Math.hypot(x - p.x, z - p.z);
  if (far > s.maxDistance || far < (warm ? s.warmMinDistance : s.minDistance)) return false;
  if (!warm && far < s.minDistanceInView) {
    const cam = game.camera.position, f = game.cameraRig.forward();
    if (((x - cam.x) * f.x + (z - cam.z) * f.z) / (Math.hypot(x - cam.x, z - cam.z) || 1) > 0.2) return false;
  }
  if (fleet.nearest(x, z, s.clearGap, null)) return false;
  const v = fleet.create(type, { x, z, heading: lane.heading });
  if (!v) return false;
  v.driver = 'ai';
  driver.attach(v, c, r, d);
  const slow = roads.jamAt(x, z);
  v.launch(v.T.cruise * (slow ? slow.speedFactor : 1) * 0.8);
  addRider(v);
  return true;
}

function populate() {
  const s = cfg.spawn;
  const p = game.player.position;
  const district = game.world.districtAt(p.x, p.z);
  let target = game.quality.traffic * mixFor(district).density;
  for (const j of roads.jams) {
    if (Math.hypot(p.x - j.x, p.z - j.z) < j.radius * 2.2) target *= j.extraVehicles;
  }
  target = Math.round(target);
  let count = 0;
  for (const v of fleet.vehicles) if (mine(v)) count++;
  let made = 0;
  const maxNew = warm ? target : s.perFrame;
  for (let tries = warm ? target * 8 : s.triesPerFrame; tries > 0 && count + made < target && made < maxNew; tries--) {
    if (trySpawn()) made++;
  }
  warm = false;
  return count + made;
}

export default {
  id: 'traffic',

  async init(g) {
    game = g;
    cfg = g.config.get('traffic');
    pedCfg = g.config.get('pedestrians');
    roads = g.world.roads;
    rng = new Rng(g.config.get('world').seed ^ 0x7ea4f1c);
    fleet = await acquireFleet(g);
    driver = new Driver(g, cfg, rng);
    shelters = buildShelters(roads, cfg.busStops.shelter);
    if (shelters) g.world.root.add(shelters);
    warm = true;
    offs = [
      g.events.on('traffic:adopt', ({ id }) => {
        const v = fleet.byId(id);
        if (!v || v.state !== 'ok') return;
        const seg = roads.nearestSegment(v.x, v.z);
        if (!seg) return;
        // Carry on in the direction the vehicle is already facing.
        let { c, r, d } = seg;
        const D = DIRS[d];
        if (Math.sin(v.heading) * D.fx + Math.cos(v.heading) * D.fz < 0) { c += D.dc; r += D.dr; d = opposite(d); }
        v.driver = 'ai';
        driver.attach(v, c, r, d);
      }),
      g.events.on('vehicle:burning', ({ id }) => {
        const v = fleet.byId(id);
        if (v && mine(v)) bail(v, true);
      }),
    ];
  },

  update(dt) {
    if (!game.player || !fleet) return;
    const total = populate();
    const s = cfg.spawn;
    const p = game.player.position;
    // Next to a jam junction vehicles are recycled sooner, so more of them are in the jam.
    const limit = roads.jams.some((j) => Math.hypot(p.x - j.x, p.z - j.z) < j.radius * 1.5) ? s.jamDespawnDistance : s.despawnDistance;
    for (const v of [...fleet.vehicles]) {
      if (!mine(v)) continue;
      const dist = Math.hypot(v.x - p.x, v.z - p.z);
      if (dist > limit) { fleet.remove(v); continue; }
      if (v.state !== 'ok') { bail(v, true); continue; }
      const status = driver.update(v, dt);
      // Hopelessly stuck and nobody is watching closely: quietly take it away.
      if (status === 'stuck' && dist > cfg.ai.giveUpDistance) fleet.remove(v);
    }
    debugLine('traffic', `traffic ${total}  vehicles ${fleet.vehicles.length}`);
  },

  dispose() {
    offs.forEach((off) => off());
    offs = [];
    if (fleet) for (const v of [...fleet.vehicles]) if (mine(v)) fleet.remove(v);
    if (shelters) {
      shelters.geometry.dispose();
      shelters.material.dispose();
      shelters.removeFromParent();
    }
    shelters = fleet = driver = null;
  },
};
