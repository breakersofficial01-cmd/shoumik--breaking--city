// LineTrain: one train that shuttles up and down a fixed line (a path with stations), used by
// the MRT (features/metro, on the viaduct) and the railway (features/railway, on the ground).
// Moved out of features/metro in Roadmap 2 S6 so both lines share it.
//
// It speeds up, slows down to stop at every station for T.stopSeconds, and turns back at the
// ends of the line. Riders (src/entities/transit/lineRide.js) can keep it waiting (`hold`) and
// can jump it forward to just before its next station (`skipToNext`).
//
//   new LineTrain({ path, T, index, lineId, stations, heightAt, root, geometry, material, onArrive })
//     path      ViaductPath-like: at(s, out, side) → { x, z, heading }, length
//     T         train settings (data/landmarks.json → viaducts[].train / railways[].train)
//     stations  [{ id, name, s }] — s = metres along the path
//     heightAt  (s) → y of the car floor base at s (the deck top for the MRT)
//     onArrive  (train, station) called when it stops at a station
//   train.carPose(i, out)   → { x, y, z, heading } of car i (0 = the end towards +s)
//   train.stoppedAt         the station it is standing at (null while moving)
//   train.nextStation()     where it stops next (a station, or null at the end of the line)

import * as THREE from 'three';
import { GeoBuilder } from '../../world/geoBuilder.js';
import { Kit } from '../../world/landmarks/kit.js';

/** One code-built train car (MRT or railway coach), centred on the origin, nose towards +z. */
export function buildCarGeometry(T) {
  const b = { lit: new GeoBuilder(), glow: new GeoBuilder(), sign: new GeoBuilder() };
  const k = new Kit(b, { cx: 0, cz: 0, y: 0, angle: 0 });
  const hw = T.carWidth / 2, hl = T.carLength / 2, H = T.carHeight;
  k.box(-hw * 0.8, 0, -hl + 0.6, hw * 0.8, 0.55, hl - 0.6, T.under, { flat: true, faces: 'nsewb' });
  k.box(-hw, 0.55, -hl, hw, H - 0.35, hl, T.body, { flat: true, grad: 0.85 });
  k.box(-hw + 0.04, H - 0.35, -hl + 0.15, hw - 0.04, H, hl - 0.15, T.roof, { flat: true });
  for (const s of [-1, 1]) {
    const x = s * (hw + 0.01);
    const side = (y0, y1, hex) => k.quad([x, y0, s > 0 ? hl : -hl], [x, y0, s > 0 ? -hl : hl], [x, y1, s > 0 ? -hl : hl], [x, y1, s > 0 ? hl : -hl], hex);
    side(1.45, 2.55, T.window);
    side(0.95, 1.2, T.stripeA);
    side(1.2, 1.32, T.stripeB);
    for (const z of [-hl * 0.5, hl * 0.5]) k.quad([x, 0.6, z + (s > 0 ? 0.65 : -0.65)], [x, 0.6, z - (s > 0 ? 0.65 : -0.65)], [x, 2.75, z - (s > 0 ? 0.65 : -0.65)], [x, 2.75, z + (s > 0 ? 0.65 : -0.65)], T.window);
  }
  for (const s of [-1, 1]) {
    const z = s * (hl + 0.01);
    const end = (x0, x1, y0, y1, hex) => k.quad([s > 0 ? x0 : x1, y0, z], [s > 0 ? x1 : x0, y0, z], [s > 0 ? x1 : x0, y1, z], [s > 0 ? x0 : x1, y1, z], hex);
    end(-hw * 0.7, hw * 0.7, 1.5, 2.6, T.window);
    end(-hw * 0.75, -hw * 0.45, 0.9, 1.15, T.headlight);
    end(hw * 0.45, hw * 0.75, 0.9, 1.15, T.headlight);
    end(-hw, hw, 0.95, 1.2, T.stripeA);
  }
  return b.lit.build();
}

export class LineTrain {
  constructor(o) {
    this.path = o.path;
    this.T = o.T;
    this.lineId = o.lineId;
    this.index = o.index;
    this.heightAt = o.heightAt;
    this.onArrive = o.onArrive || null;
    this.side = o.side ?? (o.index % 2 === 0 ? this.T.trackOffset : -this.T.trackOffset);
    this.pitch = this.T.carLength + this.T.gap;
    this.length = this.T.cars * this.pitch;
    this.min = this.length / 2 + 2;
    this.max = this.path.length - this.length / 2 - 2;
    this.stations = o.stations.slice().sort((a, b) => a.s - b.s);
    this.stops = this.stations.map((s) => Math.max(this.min, Math.min(this.max, s.s)));
    this.dir = o.index % 2 === 0 ? 1 : -1;
    this.s = this.dir > 0 ? this.min : this.max;
    this.speed = 0;
    this.wait = 0;
    this.hold = 0;            // seconds a rider asks it to keep waiting (counts down)
    this.target = null;       // the stop (metres along) it is driving to; picked when it departs
    this.stoppedAt = null;
    this.focusNear = false;
    this.group = new THREE.Group();
    this.group.name = `${this.lineId}-train-${o.index}`;
    this.cars = [];
    for (let i = 0; i < this.T.cars; i++) {
      const car = new THREE.Mesh(o.geometry, o.material);
      car.matrixAutoUpdate = false;
      this.cars.push(car);
      this.group.add(car);
    }
    o.root.add(this.group);
    this._at = {};
  }

  /** Swap the code-built cars for real models: fronts at both ends, wagons between. */
  useModels(m) {
    const last = this.cars.length - 1;
    this.cars.forEach((car, i) => {
      const end = i === 0 || i === last;
      car.geometry = end ? m.front : m.wagon;
      car.material = m.material;
      car.userData.flip = i === last && last > 0;
    });
  }

  /** Next place to stop (metres along the path): the next station ahead, or the end. */
  nextStopS() {
    const end = this.dir > 0 ? this.max : this.min;
    let best = end;
    for (const st of this.stops) {
      if ((st - this.s) * this.dir > 1 && (st - best) * this.dir < 0) best = st;
    }
    return best;
  }

  /** The station it stops at next (the one it stands at while waiting; null = end of line). */
  nextStation() {
    if (this.stoppedAt && (this.wait > 0 || this.hold > 0)) return this.stoppedAt;
    const st = this.stationAtS(this.target ?? this.nextStopS());
    if (st) return st;
    // Next is just the end of the line: it turns round there, so name the first station after.
    const back = this.stops.map((x, i) => ({ x, i })).filter((o) => (o.x - this.s) * this.dir < -1);
    if (!back.length) return null;
    const pick = back.reduce((a, b) => ((b.x - a.x) * this.dir > 0 ? b : a));
    return this.stations[pick.i];
  }

  stationAtS(s) {
    for (let i = 0; i < this.stations.length; i++) if (Math.abs(this.stops[i] - s) < 1.5) return this.stations[i];
    return null;
  }

  /** Rough seconds until it stands at station st (distance / speed + the stops between). */
  etaTo(st) {
    const i = this.stations.indexOf(st);
    if (i < 0) return Infinity;
    if (this.stoppedAt === st && (this.wait > 0 || this.hold > 0)) return 0;
    const T = this.T;
    const target = this.stops[i];
    const end = this.dir > 0 ? this.max : this.min;
    let d, between = 0;
    if ((target - this.s) * this.dir > 0) {
      d = Math.abs(target - this.s);
      for (const s of this.stops) if ((s - this.s) * this.dir > 1 && (target - s) * this.dir > 1) between++;
    } else {
      // To the end of the line and back.
      d = Math.abs(end - this.s) + Math.abs(end - target);
      between = this.stops.length;
    }
    return Math.max(0, this.wait) + d / T.speed + between * (T.stopSeconds + 4);
  }

  /** Jump to a little before the next stop (a rider pressed "skip"). */
  skipToNext(before = 40) {
    // Standing at an end of the line: turn round first.
    if (this.s >= this.max - 0.5 && this.dir > 0) this.dir = -1;
    else if (this.s <= this.min + 0.5 && this.dir < 0) this.dir = 1;
    const s = this.nextStopS();
    const from = s - this.dir * before;
    if ((from - this.s) * this.dir > 0) this.s = from;
    this.speed = Math.min(this.T.speed * 0.6, Math.sqrt(2 * this.T.acceleration * before));
    this.wait = 0;
    this.hold = 0;
    this.stoppedAt = null;
    this.target = s;
  }

  update(dt, focus) {
    const T = this.T;
    if (this.wait > 0 || this.hold > 0) {
      this.wait -= dt;
      this.hold = Math.max(0, this.hold - dt);
      if (this.wait <= 0 && this.hold <= 0) {
        if (this.s >= this.max - 0.5 || this.s <= this.min + 0.5) this.dir = this.s >= this.max - 0.5 ? -1 : 1;
        this.stoppedAt = null;
      }
    } else {
      // The target is fixed when it departs: re-picking it every frame used to drop a station
      // that was less than a metre away, so a slow train could roll straight through it.
      if (this.target == null || (this.target - this.s) * this.dir < -0.5) this.target = this.nextStopS();
      const left = Math.abs(this.target - this.s);
      const want = Math.min(T.speed, Math.sqrt(2 * T.acceleration * left));
      this.speed = this.speed < want ? Math.min(want, this.speed + T.acceleration * dt) : want;
      const step = Math.min(left, this.speed * dt);
      this.s += step * this.dir;
      if (left - step < 0.05) {
        this.s = this.target;
        this.target = null;
        this.speed = 0;
        this.wait = T.stopSeconds;
        this.stoppedAt = this.stationAtS(this.s);
        if (this.stoppedAt) this.onArrive?.(this, this.stoppedAt);
      }
    }
    // Draw only when near.
    const at = this._at;
    this.path.at(this.s, at, this.side);
    this.focusNear = Math.hypot(at.x - focus.x, at.z - focus.z) < T.visibleDistance;
    this.group.visible = this.focusNear;
    if (!this.focusNear) return;
    this.cars.forEach((car, i) => {
      this.carPose(i, at);
      car.position.set(at.x, at.y, at.z);
      car.rotation.set(0, at.heading + (car.userData.flip ? Math.PI : 0), 0);
      car.updateMatrix();
    });
  }

  /** Where car i stands (car 0 = the end towards +s). heading = the +s direction. */
  carPose(i, out = {}) {
    const s = this.s + ((this.T.cars - 1) / 2 - i) * this.pitch;
    this.path.at(s, out, this.side);
    out.y = this.heightAt(s);
    out.s = s;
    return out;
  }
}
