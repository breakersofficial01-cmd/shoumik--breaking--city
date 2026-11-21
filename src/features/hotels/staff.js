// People inside a hotel (Roadmap 2 S4), drawn by the shared crowd renderer like pedestrians:
//   - the WAITER (or the bartender at the bar): walks along waypoints, carries a tray with the
//     order on it, stands at the table while you choose
//   - the receptionist behind the lobby desk
//   - diners sitting at some tables with their own dishes (one merged mesh for all their food)
//   - dancers on the bar's dance floor (plain party dancing, adults only — CLAUDE.md)
// Everybody only exists while Shoumik is near the hotel (wake / sleep), like the hotspots.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Animator } from '../../entities/people/animator.js';
import { buildLook } from '../../entities/people/looks.js';

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _one = new THREE.Vector3(1, 1, 1);
const _up = new THREE.Vector3(0, 1, 0);

/** A person who walks between points (waiter, bartender). */
export class Server {
  constructor(crowd, look, home, y, cfg) {
    this.crowd = crowd;
    this.cfg = cfg;
    this.animator = new Animator(look.dims, {});
    this.person = crowd.add(look, this.animator.pose);
    this.home = home;
    this.x = home.x; this.z = home.z; this.heading = home.heading; this.y = y;
    this.path = [];
    this.onArrive = null;
    this.faceTo = null;
    this.speed = 0;
    this.tray = new THREE.Group();
    this.tray.name = 'waiter-tray';
    this.sync();
  }

  /** Walk through the points ({x, z}) then call onArrive (and face `face` heading if given). */
  walk(points, onArrive = null, face = null) {
    this.path = points.slice();
    this.onArrive = onArrive;
    this.faceTo = face;
  }

  get busy() { return this.path.length > 0; }

  update(dt) {
    const c = this.cfg;
    let speed = 0;
    if (this.path.length) {
      const t = this.path[0];
      const dx = t.x - this.x, dz = t.z - this.z;
      const d = Math.hypot(dx, dz);
      const step = c.speed * dt;
      if (d <= step) {
        this.x = t.x; this.z = t.z;
        this.path.shift();
        if (!this.path.length) {
          const cb = this.onArrive;
          this.onArrive = null;
          cb?.();
        }
      } else {
        this.x += (dx / d) * step; this.z += (dz / d) * step;
        speed = c.speed;
        this.heading = wrap(this.heading + wrap(Math.atan2(dx, dz) - this.heading) * Math.min(1, c.turnSpeed * dt));
      }
    } else if (this.faceTo != null) {
      this.heading = wrap(this.heading + wrap(this.faceTo - this.heading) * Math.min(1, c.turnSpeed * dt));
    }
    this.speed = speed;
    this.animator.update(dt, { speed });
    this.sync();
  }

  sync() {
    Object.assign(this.person, { x: this.x, y: this.y, z: this.z, heading: this.heading, groundY: this.y });
    const r = this.cfg.trayReach;
    this.tray.position.set(this.x + Math.sin(this.heading) * r, this.y + this.cfg.trayHeight, this.z + Math.cos(this.heading) * r);
    this.tray.rotation.y = this.heading;
  }

  dispose() {
    this.crowd.remove(this.person);
    this.tray.removeFromParent();
  }
}

/** Somebody who stays in one place doing one animation (sitting, dancing, standing). */
function stayer(crowd, look, at, y, action = null, opts = {}) {
  const animator = new Animator(look.dims, { idle: opts.idle || 'idle' });
  const person = crowd.add(look, animator.pose);
  Object.assign(person, { x: at.x, y, z: at.z, heading: at.heading, groundY: y });
  const p = { person, animator, action, opts, start() { if (action) animator.play(action, opts); } };
  p.start();
  return p;
}

/**
 * Everyone in one hotel. `place` = what buildInterior returned. `pick(weights)` = seeded choice.
 */
export class HotelPeople {
  constructor(game, crowd, hotel, place, cfg, rng, pedCfg) {
    this.game = game;
    this.crowd = crowd;
    this.hotel = hotel;
    this.place = place;
    this.cfg = cfg;
    this.rng = rng;
    this.ped = pedCfg;
    this.y = place.y;
    this.people = [];
    this.servers = { waiter: null, bar: null };
    this.dinerTables = new Set();   // tables taken by diners (Shoumik cannot sit there)
    this.dinerMesh = null;
  }

  look(archetype) {
    const arch = this.ped.archetypes[archetype] || Object.values(this.ped.archetypes)[0];
    return buildLook(arch, this.ped.palettes, this.rng);
  }

  /** Make everybody (called when Shoumik comes near). dishMesh(listOfPlacedDishes) → mesh. */
  wake(scene, dishes, materials, beat) {
    const { place, hotel, cfg, rng } = this;
    const sv = cfg.waiter;
    this.servers.waiter = new Server(this.crowd, this.look(hotel.waiter), place.kitchen, this.y, sv);
    if (place.barServer) this.servers.bar = new Server(this.crowd, this.look(hotel.bar.server || 'waiter'), place.barServer, this.y, sv);
    for (const s of Object.values(this.servers)) if (s) scene.add(s.tray);
    this.people.push(stayer(this.crowd, this.look(hotel.waiter === 'waiter' ? 'waitress' : 'waiter'), place.reception, this.y));

    // Diners at some tables, each with a dish or two in front of them.
    const D = cfg.diners;
    let left = D.max;
    const placed = [];
    for (const t of place.tables) {
      if (left <= 0 || !rng.chance(D.share)) continue;
      this.dinerTables.add(t);
      const n = Math.min(left, rng.int(1, 3));
      const seats = t.chairs.slice();
      for (let i = seats.length - 1; i > 0; i--) { const j = rng.int(0, i); [seats[i], seats[j]] = [seats[j], seats[i]]; }
      for (let i = 0; i < n; i++) {
        const c = seats[i];
        this.people.push(stayer(this.crowd, this.look(rng.weighted(D.archetypes)), c, this.y, 'sit'));
        const count = rng.int(D.dishes[0], D.dishes[1]);
        for (let j = 0; j < count; j++) placed.push({ id: rng.pick(hotel.menu), ...dishSpot(t, c, j, count, cfg, this.y) });
        left--;
      }
    }
    // A few people at the bar stools too.
    for (const s of place.stools) {
      if (left <= 0 || !rng.chance(D.share * 0.6)) continue;
      s.taken = true;
      this.people.push(stayer(this.crowd, this.look(rng.weighted(D.archetypes)), s, this.y, 'sit'));
      placed.push({ id: rng.pick(hotel.bar.menu), ...stoolDishSpot(s, cfg, this.y) });
      left--;
    }
    this.dinerMesh = mergedDishes(placed, dishes, materials, cfg.dishScale);
    if (this.dinerMesh) scene.add(this.dinerMesh);

    // Dancers on the dance floor.
    const B = cfg.barCounter;
    for (const spot of place.danceSpots) {
      this.people.push(stayer(this.crowd, this.look(rng.weighted(B.danceArchetypes)), spot, this.y + 0.03, rng.chance(0.2) ? 'clap' : 'dance', { variant: rng.int(0, 2), beat }));
    }
  }

  update(dt, far) {
    for (const s of Object.values(this.servers)) if (s) { s.update(dt); s.person.far = far; }
    for (const p of this.people) { p.animator.update(dt, { speed: 0 }); p.person.far = far; }
  }

  /** People duck when there is shooting or an explosion nearby, then carry on. */
  scare(seconds) {
    this.scared = seconds;
    for (const p of this.people) if (p.action !== 'sit') p.animator.play('cower');
  }

  tick(dt) {
    if (!(this.scared > 0)) return;
    this.scared -= dt;
    if (this.scared <= 0) for (const p of this.people) p.start();
  }

  sleep() {
    for (const s of Object.values(this.servers)) s?.dispose();
    this.servers = { waiter: null, bar: null };
    for (const p of this.people) this.crowd.remove(p.person);
    this.people = [];
    this.dinerTables.clear();
    for (const s of this.place.stools) s.taken = false;
    if (this.dinerMesh) { this.dinerMesh.removeFromParent(); for (const m of this.dinerMesh.children) m.geometry.dispose(); }
    this.dinerMesh = null;
  }
}

/** Where dish j of n goes on table t in front of chair c (world x/z, table-top y, heading). */
export function dishSpot(t, c, j, n, cfg, floorY) {
  const dx = t.x - c.x, dz = t.z - c.z;
  const d = Math.hypot(dx, dz) || 1;
  const ux = dx / d, uz = dz / d;        // chair → table
  const reach = cfg.table.chairDistance - 0.38;
  const side = (j - (n - 1) / 2) * 0.24 * cfg.dishScale;
  return {
    x: c.x + ux * reach + uz * side,
    z: c.z + uz * reach - ux * side,
    y: floorY + cfg.table.height,
    heading: Math.atan2(-ux, -uz),
  };
}

/** Where a drink goes on the bar counter in front of stool s. */
export function stoolDishSpot(s, cfg, floorY, j = 0, n = 1) {
  const reach = cfg.barCounter.stoolZ - (cfg.barCounter.z0 + cfg.barCounter.z1) / 2; // local metres stool → counter middle
  const side = (j - (n - 1) / 2) * 0.22 * cfg.dishScale;
  const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
  return { x: s.x + fx * reach + fz * side, z: s.z + fz * reach - fx * side, y: floorY + cfg.barCounter.height, heading: s.heading + Math.PI };
}

/** All diners' dishes as one or two merged meshes (so 30 plates cost 2 draw calls). */
function mergedDishes(placed, dishes, materials, scale) {
  const solid = [], glass = [];
  for (const p of placed) {
    const g = dishes.get(p.id);
    _q.setFromAxisAngle(_up, p.heading || 0);
    _m.compose(_v.set(p.x, p.y, p.z), _q, _one.clone().multiplyScalar(scale));
    for (const part of [g.base, g.food]) if (part) solid.push(part.clone().applyMatrix4(_m));
    if (g.glass) glass.push(g.glass.clone().applyMatrix4(_m));
  }
  if (!solid.length && !glass.length) return null;
  const group = new THREE.Group();
  group.name = 'hotel-diner-dishes';
  if (solid.length) group.add(new THREE.Mesh(mergeGeometries(solid), materials.food));
  if (glass.length) { const m = new THREE.Mesh(mergeGeometries(glass), materials.glass); m.renderOrder = 2; group.add(m); }
  for (const g of [...solid, ...glass]) g.dispose();
  return group;
}
