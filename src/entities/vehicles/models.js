// VehicleLibrary: builds (and caches) the body geometry for every vehicle type + paint colour,
// works out where the wheels go, and paints the rickshaw "art panel" textures.
//
// To add a vehicle: add a type to data/vehicles.json using an existing `style`. A brand-new
// style needs a builder function here (BUILDERS) — see modelsCars.js / modelsSmall.js.
// Real 3D models can replace these later through the asset registry
// (ids `geometry.vehicle.<type>`); the code-made ones are the placeholders.

import * as THREE from 'three';
import { VBuilder, makeWheelGeometry } from './shapes.js';
import { buildCar, buildPickup, buildVan, buildBus, buildLeguna } from './modelsCars.js';
import { buildCng, buildRickshaw, buildBicycle, buildMotorbike } from './modelsSmall.js';

const BUILDERS = {
  car: buildCar, pickup: buildPickup, van: buildVan, bus: buildBus, leguna: buildLeguna,
  cng: buildCng, rickshaw: buildRickshaw, bicycle: buildBicycle, motorbike: buildMotorbike,
};

/** Wheel positions from the type's wheel block. Front wheels (z > 0) steer. */
function wheelLayout(T) {
  const { radius: r, width: w, track, base, layout } = T.wheel;
  const zf = base / 2, zb = -base / 2, x = track / 2;
  if (layout === '2') return [{ x: 0, y: r, z: zf, r, w, front: true }, { x: 0, y: r, z: zb, r, w }];
  if (layout === '3') return [{ x: 0, y: r, z: zf, r, w, front: true }, { x, y: r, z: zb, r, w }, { x: -x, y: r, z: zb, r, w }];
  return [
    { x, y: r, z: zf, r, w, front: true }, { x: -x, y: r, z: zf, r, w, front: true },
    { x, y: r, z: zb, r, w }, { x: -x, y: r, z: zb, r, w },
  ];
}

/** A hand-painted looking rickshaw back panel: bright ground, border, flowers and a sun. */
function paintArtPanel(variant) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  const sets = [
    ['#0b3d91', '#ffd400', '#ff2e63', '#2ec4b6', '#ffffff'],
    ['#b3001b', '#ffe066', '#00a878', '#3a86ff', '#ffffff'],
    ['#0a7d4b', '#ff9f1c', '#f15bb5', '#fee440', '#ffffff'],
  ];
  const [bg, a, b, d, w] = sets[variant % sets.length];
  g.fillStyle = bg; g.fillRect(0, 0, 128, 64);
  g.strokeStyle = a; g.lineWidth = 4; g.strokeRect(3, 3, 122, 58);
  g.strokeStyle = b; g.lineWidth = 2; g.strokeRect(8, 8, 112, 48);
  const flower = (x, y, r, petal, heart) => {
    g.fillStyle = petal;
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      g.arc(x + Math.cos(i * 1.047) * r, y + Math.sin(i * 1.047) * r, r * 0.62, 0, 6.3);
      g.fill();
    }
    g.fillStyle = heart; g.beginPath(); g.arc(x, y, r * 0.55, 0, 6.3); g.fill();
  };
  // Rising sun in the middle with rays, flowers either side, leaves along the bottom.
  g.fillStyle = a; g.beginPath(); g.arc(64, 44, 15, Math.PI, 0); g.fill();
  g.strokeStyle = a; g.lineWidth = 2;
  for (let i = 0; i <= 6; i++) {
    const t = Math.PI + (i / 6) * Math.PI;
    g.beginPath(); g.moveTo(64 + Math.cos(t) * 18, 44 + Math.sin(t) * 18); g.lineTo(64 + Math.cos(t) * 26, 44 + Math.sin(t) * 26); g.stroke();
  }
  flower(27, 28, 8, b, w); flower(101, 28, 8, b, w);
  flower(40, 46, 4.5, d, a); flower(88, 46, 4.5, d, a);
  g.fillStyle = d;
  for (let x = 16; x < 116; x += 12) { g.beginPath(); g.ellipse(x, 52, 5, 2.2, 0.5, 0, 6.3); g.fill(); }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

export class VehicleLibrary {
  /** @param {object} cfg data/vehicles.json */
  constructor(cfg) {
    this.cfg = cfg;
    this.cache = new Map();
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.wreckMaterial = new THREE.MeshLambertMaterial({ color: cfg.palette.wreck });
    this.wheelGeometry = makeWheelGeometry(cfg.palette.tyre, cfg.palette.hub);
    this.panelGeometry = new THREE.PlaneGeometry(1, 1).rotateY(Math.PI); // faces backwards
    this.panelMaterials = [0, 1, 2].map((i) => new THREE.MeshLambertMaterial({ map: paintArtPanel(i) }));
  }

  /** @returns {{geometry:THREE.BufferGeometry, wheels:Array, triangles:number}} */
  get(typeId, paint, second) {
    const key = `${typeId}|${paint}|${second || ''}`;
    let entry = this.cache.get(key);
    if (!entry) {
      const T = this.cfg.types[typeId];
      const vb = new VBuilder(T.dent || 0, key.length + paint.charCodeAt(2));
      (BUILDERS[T.style] || buildCar)(vb, T, { ...this.cfg.palette, paint, second });
      const geometry = vb.build();
      entry = { geometry, wheels: wheelLayout(T), triangles: vb.idx.length / 3 };
      this.cache.set(key, entry);
    }
    return entry;
  }

  /** The painted panel on the back of a rickshaw (its own small mesh so Session 4 can put posters there). */
  makeArtPanel(variant) {
    const mesh = new THREE.Mesh(this.panelGeometry, this.panelMaterials[variant % this.panelMaterials.length]);
    mesh.name = 'art-panel';
    mesh.scale.set(0.86, 0.66, 1);
    mesh.position.set(0, 0.84, -0.905);
    return mesh;
  }

  dispose() {
    for (const e of this.cache.values()) e.geometry.dispose();
    this.cache.clear();
    this.material.dispose();
    this.wreckMaterial.dispose();
    this.wheelGeometry.dispose();
    this.panelGeometry.dispose();
    for (const m of this.panelMaterials) { m.map.dispose(); m.dispose(); }
  }
}
