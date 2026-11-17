// Feature: metro. MRT Line 6 trains running on the viaduct (world.landmarks.viaducts, kind
// 'rail'). Each train shuttles up and down its own track: it speeds up, slows down to stop
// at every station for a few seconds, and turns back at the ends of the line.
// Numbers and colours: data/landmarks.json → viaducts[].train. Scenery only for now — riding
// the metro is an idea in docs/NEXT.md.
//
// Events: sends metro:arrived { line, station } when a train stops at a station.

import * as THREE from 'three';
import { GeoBuilder } from '../../world/geoBuilder.js';
import { Kit } from '../../world/landmarks/kit.js';

let game = null;
let trains = [];
let root = null;
let geometry = null;
const at = {};

/** One MRT car, centred on the origin, nose towards +z. */
function buildCar(T) {
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

class Train {
  constructor(v, index) {
    this.v = v;
    this.T = v.line.train;
    this.path = v.path;
    this.side = index % 2 === 0 ? this.T.trackOffset : -this.T.trackOffset;
    this.length = this.T.cars * (this.T.carLength + this.T.gap);
    this.min = this.length / 2 + 2;
    this.max = this.path.length - this.length / 2 - 2;
    this.stops = v.stations.map((s) => s.s).sort((a, b) => a - b);
    this.dir = index % 2 === 0 ? 1 : -1;
    this.s = this.dir > 0 ? this.min : this.max;
    this.speed = 0;
    this.wait = 0;
    this.y = v.line.deckY + v.line.deckThickness + 0.05;
    this.group = new THREE.Group();
    this.group.name = `metro-${v.id}-${index}`;
    this.cars = [];
    for (let i = 0; i < this.T.cars; i++) {
      const car = new THREE.Mesh(geometry, game.world.shared.facadeMaterial);
      car.matrixAutoUpdate = false;
      this.cars.push(car);
      this.group.add(car);
    }
    root.add(this.group);
  }

  /** Next place to stop: the next station ahead, or the end of the line. */
  nextStop() {
    const ahead = this.stops.filter((s) => (s - this.s) * this.dir > 1).sort((a, b) => (a - b) * this.dir);
    const end = this.dir > 0 ? this.max : this.min;
    const st = ahead.length ? ahead[0] : end;
    return this.dir > 0 ? Math.min(st, end) : Math.max(st, end);
  }

  update(dt, focus) {
    const T = this.T;
    if (this.wait > 0) {
      this.wait -= dt;
      if (this.wait <= 0 && (this.s >= this.max - 0.5 || this.s <= this.min + 0.5)) this.dir = this.s >= this.max - 0.5 ? -1 : 1;
    } else {
      const left = Math.abs(this.nextStop() - this.s);
      const want = Math.min(T.speed, Math.sqrt(2 * T.acceleration * left));
      this.speed = this.speed < want ? Math.min(want, this.speed + T.acceleration * dt) : want;
      const step = Math.min(left, this.speed * dt);
      this.s += step * this.dir;
      if (left - step < 0.05) {
        this.speed = 0;
        this.wait = T.stopSeconds;
        const st = this.v.stations.find((s) => Math.abs(s.s - this.s) < 1);
        if (st) game.events.emit('metro:arrived', { line: this.v.id, station: st.id });
      }
    }
    // Draw only when near (the deck sections are culled the same way).
    this.path.at(this.s, at, this.side);
    const near = Math.hypot(at.x - focus.x, at.z - focus.z) < T.visibleDistance;
    this.group.visible = near;
    if (!near) return;
    const pitch = T.carLength + T.gap;
    this.cars.forEach((car, i) => {
      const s = this.s + (((T.cars - 1) / 2 - i) * pitch);
      this.path.at(s, at, this.side);
      car.position.set(at.x, this.y, at.z);
      car.rotation.set(0, at.heading, 0);
      car.updateMatrix();
    });
  }
}

export default {
  id: 'metro',

  init(g) {
    game = g;
    root = new THREE.Group();
    root.name = 'metro';
    g.scene.add(root);
    trains = [];
    for (const v of g.world.landmarks?.viaducts || []) {
      if (v.kind !== 'rail' || !v.line.train) continue;
      if (!geometry) geometry = buildCar(v.line.train);
      for (let i = 0; i < v.line.train.count; i++) trains.push(new Train(v, i));
    }
    g.metro = { trains }; // read-only handle for debug tools
  },

  update(dt) {
    const focus = game.player?.position || game.camera.position;
    for (const t of trains) t.update(dt, focus);
  },

  dispose() {
    root?.removeFromParent();
    geometry?.dispose();
    geometry = null;
    trains = [];
  },
};
