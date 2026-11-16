// Parked vehicles: empty vehicles at the side of the road that Shoumik can simply take, plus
// rickshaw / CNG STANDS (a driver waiting for a fare) next to every place in data/places.json.
// Used only by ./index.js. Numbers: data/vehicles.json → parked, rides.
//
// Every spot ("slot") is worked out once from the city seed, so the same streets always have
// the same vehicles. Slots near the player get a real vehicle; the feature's clean-up removes
// vehicles nobody uses once they are far away, and the slot fills again next time.
// A slot Shoumik emptied stays empty until he has been far away (resetDistance).

import { hashInts, Rng } from '../../core/rng.js';
import { buildLook } from '../../entities/people/looks.js';

export class Parked {
  constructor(game, fleet, cfg, places) {
    this.game = game;
    this.fleet = fleet;
    this.cfg = cfg;
    this.P = cfg.parked;
    this.roads = game.world.roads;
    this.rng = new Rng(game.config.get('world').seed ^ 0x9a4ced);
    this.timer = 0;
    this.slots = [];
    this.buildSlots(places);
  }

  /** Where a vehicle of this type stands on segment (c, r, d), `t` (0..1) along it. */
  spot(c, r, d, t, type) {
    const T = this.cfg.types[type];
    const P = this.P;
    const seg = this.roads.segment(c, r, d, T.size[1] > P.wideAboveWidth ? P.wideKerbOffset : P.kerbOffset);
    return { x: seg.ax + seg.fx * seg.len * t, z: seg.az + seg.fz * seg.len * t, heading: seg.heading };
  }

  buildSlots(places) {
    const L = this.game.world.layout;
    const R = this.roads;
    const P = this.P;
    for (let c = 0; c <= L.cols; c++) {
      for (let r = 0; r <= L.rows; r++) {
        for (let d = 0; d < 4; d++) {
          if (!R.hasRoad(c, r, d)) continue;
          const h = hashInts(L.seed, c, r, d, 31);
          const rng = new Rng(h);
          if (rng.next() >= P.chance) continue;
          const t = rng.range(0.3, 0.8);
          const mid = R.segment(c, r, d, 0);
          const district = L.districtAt(mid.ax + mid.fx * mid.len * t, mid.az + mid.fz * mid.len * t);
          const type = rng.weighted(P.mix[district?.id] || P.mix.default);
          if (!this.cfg.types[type]) continue;
          this.slots.push({ c, r, d, type, stand: false, ...this.spot(c, r, d, t, type), vehicle: null, spent: false });
        }
      }
    }
    // Stands: one of each hire vehicle on the roads leaving every place's junction.
    for (const place of places) {
      const exits = R.exits(place.col, place.row);
      if (!R.isJunction(place.col, place.row) || !exits.length) continue;
      this.cfg.rides.standsPerPlace.forEach((type, i) => {
        if (!this.cfg.types[type]?.ride) return;
        const d = exits[i % exits.length];
        const t = 0.14 + 0.07 * Math.floor(i / exits.length);
        this.slots.push({ c: place.col, r: place.row, d, type, stand: true, ...this.spot(place.col, place.row, d, t, type), vehicle: null, spent: false });
      });
    }
  }

  /** Give a stand vehicle its waiting driver. */
  addWaitingDriver(v) {
    const pedCfg = this.game.config.get('pedestrians');
    const table = this.game.config.get('traffic').riderArchetypes;
    const name = this.rng.weighted(table[v.type] || table.default);
    const arch = pedCfg.archetypes[name];
    v.tags.stand = true;
    v.tags.riderArchetype = name;
    if (arch) this.fleet.setRider(v, buildLook(arch, pedCfg.palettes, this.rng));
  }

  update(dt) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = this.P.scanEvery;
    const P = this.P;
    const p = this.game.player.position;
    let live = 0;
    const wanted = [];
    for (const s of this.slots) {
      if (s.vehicle && (s.vehicle.removed || s.vehicle.tags.slot !== s)) s.vehicle = null;
      const dist = Math.hypot(s.x - p.x, s.z - p.z);
      if (s.spent && dist > P.resetDistance) s.spent = false;
      if (s.vehicle) { if (!s.stand) live++; continue; }
      if (!s.spent && dist < P.spawnDistance) { s.dist = dist; wanted.push(s); }
    }
    wanted.sort((a, b) => a.dist - b.dist);
    const cap = this.game.quality.parked;
    for (const s of wanted) {
      if (!s.stand && live >= cap) continue;
      if (this.fleet.nearest(s.x, s.z, 2.2, null)) continue; // something is already standing there
      const v = this.fleet.create(s.type, { x: s.x, z: s.z, heading: s.heading });
      if (!v) break;
      v.tags.slot = s;
      v.tags.seg = { c: s.c, r: s.r, d: s.d };
      v.input.handbrake = true;
      s.vehicle = v;
      if (s.stand) this.addWaitingDriver(v);
      else live++;
    }
  }
}
