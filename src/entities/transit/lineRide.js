// LineRide: riding a train line (Roadmap 2 S6) — the MRT (features/metro) and the railway
// (features/railway) both use it with their own LineTrains and stations.
//
// MRT ('stairs' entry): walk to the stairs under a station → E → fade → Shoumik waits on the
//   platform (standing, the camera on him). E again with no train = back down to the street.
// Railway ('walk' entry): the platforms are walkable; stand on one near a waiting train.
// A train standing at the station + E → pay the fare → he sits in the nearest car with the
// other passengers. It stops at every station; he gets off when:
//   - it reaches the stop he picked on the big map (ride:destination), or
//   - he pressed নামো / E / Jump (he gets off at the NEXT station).
// ⏩ jumps the train to just before its next station (with a fade).
//
//   new LineRide(game, { kind, lineId, line, icon, fareId, trains, stations, entry, passengers, rng })
//     stations: [{ id, name, s, x, z, foot?: {x, z, heading}, platform: (sign) → {x, y, z, heading},
//                  doorSide: (train) → +1 | -1 }]
//   ride.onArrive(train, station)   (the feature passes it to its LineTrains)
//   ride.onAction() → true if it used the E press;  ride.onJump()
//   ride.update(dt)
// game.transitPrompt is set while one of its prompts shows (the vehicles feature then ignores E).

import { t, pickName, formatMoney, formatNumber } from '../../ui/i18n.js';
import { getCabin, toWorld, pickSeat } from './cabin.js';
import { acquireRider } from './rider.js';
import { fareFor, payFare } from './fares.js';

const _a = {};
const _b = {};

export class LineRide {
  constructor(game, o) {
    Object.assign(this, o);
    this.game = game;
    this.cfg = game.config.get('transit');
    this.kcfg = this.cfg[o.kind] || {};
    this.rider = acquireRider(game);
    this.cabin = getCabin(game, o.cabinKind || o.kind);
    this.state = 'none';           // none | platform (MRT waiting) | riding
    this.station = null;           // station he is at (platform) / last stopped at (riding)
    this.train = null;
    this.unit = null;
    this.dest = null;
    this.promptKey = null;
    this.unitTimer = 0;
    this.setTrains(o.trains || []);
  }

  /** One unit per car (passengers + riding). */
  setTrains(trains) {
    this.trains = trains;
    for (const tr of this.trains) {
      tr.units = tr.cars.map((_, i) => ({
        id: `${tr.lineId}-${tr.index}-${i}`, kind: this.cabinKind || this.kind, cabin: this.cabin, train: tr, index: i, mesh: tr.cars[i],
        pose: (out) => tr.carPose(i, out),
        outsideY: () => this.platformY(tr),
        forward: () => (tr.dir > 0 ? tr.carPose(i, _b).heading : tr.carPose(i, _b).heading + Math.PI),
        speed: () => tr.speed,
      }));
    }
  }

  get riding() { return this.state === 'riding'; }

  platformY(train) {
    const st = train.stoppedAt || this.station || this.stations[0];
    return st.platform(Math.sign(train.side) || 1).y;
  }

  prompt(key, vars) {
    const id = key ? key + JSON.stringify(vars || '') : null;
    if (id !== this.promptKey) {
      this.promptKey = id;
      if (key) this.game.events.emit('prompt:show', { id: `ride-${this.lineId}`, key, vars });
      else this.game.events.emit('prompt:hide', { id: `ride-${this.lineId}` });
    }
    // Only prompts you can act on with E take it from the vehicles feature (not "next train in…").
    if (key && key !== 'transit.waitTrainWalk') this.game.transitPrompt = this.lineId;
    else if (this.game.transitPrompt === this.lineId) this.game.transitPrompt = null;
  }

  /** The train standing at station st that he could get on (closest one). */
  waitingTrain(st) {
    return this.trains.find((tr) => tr.stoppedAt === st && (tr.wait > 0 || tr.hold > 0)) || null;
  }

  soonest(st) {
    let best = null, eta = Infinity;
    for (const tr of this.trains) { const e = tr.etaTo(st); if (e < eta) { eta = e; best = tr; } }
    return { train: best, eta };
  }

  /** Station whose stairs (MRT) or platform (railway) he is standing at, on foot. */
  stationHere() {
    const p = this.game.player.position;
    for (const st of this.stations) {
      if (this.entry === 'stairs') {
        for (const f of st.feet) if (Math.hypot(f.x - p.x, f.z - p.z) < this.kcfg.entryRadius) return st;
      } else if (st.onPlatform(p.x, p.z)) return st;
    }
    return null;
  }

  // ---------- E / Jump

  onAction() {
    const g = this.game;
    if (g.paused || this.rider.fading) return false;
    if (this.state === 'riding') {
      if (g.ride !== this.rider || this.rider.unit !== this.unit) return false;
      this.rider.queueOff(!this.rider.offQueued);
      return true;
    }
    if (this.state === 'platform') {
      const tr = this.waitingTrain(this.station);
      if (tr) this.board(tr);
      else this.leaveStation();
      return true;
    }
    if (g.player.mode !== 'onFoot' || g.player.dead || g.ride) return false;
    const st = this.stationHere();
    if (!st) return false;
    if (this.entry === 'stairs') { this.enterStation(st); return true; }
    const tr = this.waitingTrain(st);
    if (tr && this.nearTrain(tr)) { this.station = st; this.board(tr); return true; }
    return false;
  }

  onJump() {
    if (this.state !== 'riding' || this.rider.unit !== this.unit) return false;
    this.rider.queueOff(true);
    return true;
  }

  nearTrain(tr) {
    const p = this.game.player.position;
    return tr.units.some((u) => { u.pose(_a); return Math.hypot(_a.x - p.x, _a.z - p.z) < tr.T.carLength / 2 + this.kcfg.boardRange; });
  }

  // ---------- MRT platform

  enterStation(st) {
    const g = this.game;
    this.rider.fadeThen(() => {
      const { train } = this.soonest(st);
      const sign = Math.sign(train?.side || 1) || 1;
      const pl = st.platform(sign);
      this.state = 'platform';
      this.station = st;
      this.platformSign = sign;
      const p = g.player;
      p.mode = 'vehicle';
      p.vehicle = null;
      p.position.x = pl.x; p.position.y = pl.y; p.position.z = pl.z;
      p.heading = pl.heading;
      p.velocity.x = p.velocity.y = p.velocity.z = 0;
      g.cameraRig.setTarget(p, 'onFoot', true);
      g.events.emit('controls:mode', { mode: 'driving' });
      g.events.emit('ride:station', { line: this.lineId, station: st.id });
    });
  }

  leaveStation(at = null) {
    const g = this.game;
    const st = this.station;
    this.rider.fadeThen(() => {
      const f = at || st.feet[0];
      this.state = 'none';
      this.station = null;
      g.player.mode = 'onFoot';
      g.events.emit('controls:mode', { mode: 'onFoot' });
      g.events.emit('player:teleport', { x: f.x, z: f.z, heading: f.heading });
    });
  }

  // ---------- riding

  board(tr) {
    const g = this.game;
    if (!payFare(g, this.fareId)) return;
    const p = g.player.position;
    // The car nearest to him, a free seat in it.
    let unit = tr.units[0], best = Infinity;
    for (const u of tr.units) { u.pose(_a); const d = Math.hypot(_a.x - p.x, _a.z - p.z); if (d < best) { best = d; unit = u; } }
    const go = () => {
      this.passengers.setUnits(this.wantedUnits(unit));
      const seat = this.freeSeat(unit);
      this.passengers.reserve(unit, seat);
      this.state = 'riding';
      this.train = tr;
      this.unit = unit;
      tr.hold = Math.max(tr.hold, 1.5);
      this.rider.board(unit, seat, {
        kind: this.kind, line: this.line, icon: this.icon, vehicle: null,
        onOff: () => this.rider.queueOff(!this.rider.offQueued),
        onSkip: () => this.skip(),
      });
      this.refreshHud();
      g.events.emit('ride:started', { type: this.kind, line: this.lineId, fare: fareFor(g, this.fareId) });
    };
    this.rider.fadeThen(go);
  }

  freeSeat(unit) {
    const used = new Set();
    const e = this.passengers.units.get(unit);
    if (e) for (const r of e.riders) if (r.seated) used.add(r.spot);
    return pickSeat(unit.cabin, used);
  }

  skip() {
    if (this.state !== 'riding' || this.rider.fading) return;
    const tr = this.train;
    this.rider.fadeThen(() => tr.skipToNext(this.cfg.ride.skipBefore));
  }

  /** Map: he picked a station as the end of his ride. */
  setDestination(id) {
    const st = this.stations.find((s) => s.id === id);
    if (!st || this.state !== 'riding') return false;
    this.dest = st;
    this.game.events.emit('route:set', { x: st.x, z: st.z, label: st.name, icon: this.icon });
    this.refreshHud();
    return true;
  }

  refreshHud() {
    if (this.state !== 'riding') return;
    const next = this.train.nextStation();
    const note = this.rider.offQueued ? 'transit.offNext' : null;
    this.rider.setNext(next?.name || null, this.dest?.name || null, note);
  }

  /** A train stopped at a station (called by the feature's LineTrain onArrive). */
  onArrive(tr, st) {
    for (const u of tr.units) this.passengers.stop(u, st.doorSide(tr));
    // Keep it waiting a little longer while he stands on that platform.
    if (this.state === 'platform' && this.station === st) tr.hold = Math.max(tr.hold, this.cfg.ride.holdSeconds);
    if (this.entry === 'walk' && this.state === 'none' && st.onPlatform(this.game.player.position.x, this.game.player.position.z, 10)) tr.hold = Math.max(tr.hold, this.cfg.ride.holdSeconds);
    if (this.state !== 'riding' || tr !== this.train) return;
    this.station = st;
    if (this.dest === st || this.rider.offQueued) this.alight(st);
  }

  alight(st) {
    const g = this.game;
    const tr = this.train;
    const unit = this.unit;
    tr.hold = Math.max(tr.hold, 2);
    this.rider.fadeThen(() => {
      this.passengers.release(unit);
      const sign = st.doorSide(tr);
      let at;
      if (this.entry === 'stairs') {
        // Down the stairs on the side of his platform.
        const pl = st.platform(Math.sign(tr.side) || 1);
        at = st.feet.reduce((a, f) => (Math.hypot(f.x - pl.x, f.z - pl.z) < Math.hypot(a.x - pl.x, a.z - pl.z) ? f : a), st.feet[0]);
      } else {
        unit.pose(_a);
        const door = unit.cabin.doors.find((d) => d.side === sign) || unit.cabin.doors[0];
        toWorld(_a, door.x + sign * 2.2, 0, door.z, _b);
        at = { x: _b.x, z: _b.z, heading: _a.heading + (sign > 0 ? Math.PI / 2 : -Math.PI / 2) };
      }
      this.state = 'none';
      this.train = null;
      this.unit = null;
      this.station = null;
      if (this.dest === st) g.events.emit('route:clear');
      this.dest = null;
      this.rider.leave(at);
      g.events.emit('ride:ended', { type: this.kind, line: this.lineId, place: st.id, arrived: true });
    });
  }

  /** The cars that should have passengers: his car (+ neighbours), or the nearest train's cars. */
  wantedUnits(mine = null) {
    const g = this.game;
    const n = this.cfg.passengers.units[g.qualityName] ?? 1;
    const p = g.player.position;
    // Only while he rides or waits for this line: passengers in trains he only sees passing by
    // would take real-3D slots from the people around him (and cost frames).
    const waiting = this.state !== 'none' || (this.entry === 'walk' && this.stations.some((st) => st.onPlatform(p.x, p.z, 15)));
    if (!waiting && !mine) return [];
    const near = [];
    for (const tr of this.trains) {
      for (const u of tr.units) {
        u.pose(_a);
        const d = Math.hypot(_a.x - p.x, _a.z - p.z);
        if (u === mine || d < this.cfg.passengers.nearDistance) near.push({ u, d: u === mine ? -1 : d });
      }
    }
    near.sort((a, b) => a.d - b.d);
    return near.slice(0, Math.max(1, n)).map((x) => x.u);
  }

  update(dt) {
    const g = this.game;
    this.unitTimer -= dt;
    if (this.unitTimer <= 0) {
      this.unitTimer = 0.5;
      this.passengers.setUnits(this.wantedUnits(this.unit));
    }
    if (this.state === 'riding') {
      if (g.ride !== this.rider || this.rider.unit !== this.unit) { this.state = 'none'; return; } // thrown out (busted…)
      this.rider.update(dt);
      this.refreshHud();
      this.prompt(null);
      return;
    }
    if (this.state === 'platform') {
      const p = g.player;
      if (p.dead) { this.state = 'none'; p.mode = 'onFoot'; return this.prompt(null); }
      const tr = this.waitingTrain(this.station);
      if (tr) {
        tr.hold = Math.max(tr.hold, 0.5);
        this.prompt('transit.board', { fare: formatMoney(fareFor(g, this.fareId)) });
      } else {
        const { eta } = this.soonest(this.station);
        this.prompt('transit.waitTrain', { s: formatNumber(Math.max(1, Math.round(eta))) });
      }
      return;
    }
    // On foot: hints near stairs / on a platform.
    if (g.player.mode !== 'onFoot' || g.ride) return this.prompt(null);
    const st = this.stationHere();
    if (!st) return this.prompt(null);
    if (this.entry === 'stairs') return this.prompt('transit.enterStation', { station: pickName(st.name) });
    const tr = this.waitingTrain(st);
    if (tr && this.nearTrain(tr)) this.prompt('transit.board', { fare: formatMoney(fareFor(g, this.fareId)) });
    else {
      const { eta } = this.soonest(st);
      this.prompt('transit.waitTrainWalk', { s: formatNumber(Math.max(1, Math.round(eta))) });
    }
  }

  /** Map points for the stations (tap one while riding → "get off here"). */
  blips() {
    return this.stations.map((st) => ({
      id: st.id, x: st.x, z: st.z, label: st.name, icon: this.icon, group: 'transit', color: this.kcfg.mapColor, routeable: true,
      action: { key: 'transit.getOffHere', when: () => this.state === 'riding', run: () => this.setDestination(st.id) },
    }));
  }

  /** Thrown out at once (busted, wasted, feature off). */
  abort() {
    if (this.state === 'riding' && this.rider.unit === this.unit) {
      this.passengers.release(this.unit);
      const p = this.game.player.position;
      this.rider.leave({ x: p.x, z: p.z });
    }
    if (this.state === 'platform') { this.game.player.mode = 'onFoot'; this.game.events.emit('controls:mode', { mode: 'onFoot' }); }
    this.state = 'none';
    this.prompt(null);
  }
}

