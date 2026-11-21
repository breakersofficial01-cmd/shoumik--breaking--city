// Weapon models for Shoumik's hand. Guns are GLB files from the asset registry
// (data/weapons.json → weapons[].asset); the cricket bat, machete, molotov bottle (and since
// Roadmap 2 S2 the knife, grenade and grenade launcher) are built
// here in code (weapons[].build, colours in builds). Every model is returned sized in metres
// (its long side = weapons[].length) and pointing along +x like the gun pack.
// Used only by ./index.js.

import * as THREE from 'three';

const _box = new THREE.Box3();
const _size = new THREE.Vector3();

function mat(color) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.1 });
}

/** A box from x0 to x1 along the weapon, h high and w wide, centred on y = cy. */
function bar(group, x0, x1, h, w, color, cy = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, h, w), mat(color));
  m.position.set((x0 + x1) / 2, cy, 0);
  group.add(m);
  return m;
}

const BUILDERS = {
  // Handle at x = 0 (in the hand), blade towards +x. One metre long; scaled afterwards.
  bat(C) {
    const g = new THREE.Group();
    bar(g, -0.06, 0.3, 0.035, 0.035, C.grip);
    bar(g, -0.06, 0.0, 0.04, 0.04, C.handle);
    bar(g, 0.3, 1.0, 0.11, 0.035, C.blade);
    return g;
  },
  machete(C) {
    const g = new THREE.Group();
    bar(g, -0.05, 0.22, 0.04, 0.03, C.handle);
    bar(g, 0.22, 0.95, 0.09, 0.008, C.blade, 0.015);
    bar(g, 0.22, 0.95, 0.015, 0.009, C.edge, -0.035);
    return g;
  },
  // Roadmap 2 S2 ------------------------------------------------------------------------
  knife(C) {
    const g = new THREE.Group();
    bar(g, -0.05, 0.4, 0.07, 0.05, C.handle);
    bar(g, 0.4, 1.0, 0.1, 0.012, C.blade, 0.01);
    return g;
  },
  grenade(C) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.38, 10, 8).scale(1.15, 1, 1), mat(C.body));
    body.position.x = 0.45;
    const lever = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.12), mat(C.lever));
    lever.position.set(0.5, 0.38, 0);
    const pin = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.025, 6, 12), mat(C.pin));
    pin.position.set(0.82, 0.38, 0);
    g.add(body, lever, pin);
    return g;
  },
  launcher(C) {
    const g = new THREE.Group();
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.62, 12).rotateZ(-Math.PI / 2), mat(C.tube));
    tube.position.set(0.62, 0.05, 0);
    g.add(tube);
    bar(g, 0.05, 0.42, 0.12, 0.1, C.body, 0.02);   // body
    bar(g, -0.32, 0.05, 0.09, 0.07, C.body, 0.0);  // stock
    bar(g, 0.12, 0.2, 0.2, 0.06, C.grip, -0.12);   // grip
    bar(g, 0.35, 0.52, 0.06, 0.04, C.sight, 0.17); // sight
    return g;
  },
  molotov(C) {
    const g = new THREE.Group();
    const glass = new THREE.MeshStandardMaterial({ color: C.glass, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.6, 10).rotateZ(-Math.PI / 2), glass);
    body.position.x = 0.3;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.25, 8).rotateZ(-Math.PI / 2), glass);
    neck.position.x = 0.72;
    const rag = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.12), mat(C.rag));
    rag.position.x = 0.92;
    g.add(body, neck, rag);
    return g;
  },
};

/** Scale an object so its longest side is `length` metres. */
function fit(obj, length) {
  _box.setFromObject(obj);
  _box.getSize(_size);
  const longest = Math.max(_size.x, _size.y, _size.z) || 1;
  const wrap = new THREE.Group();
  obj.scale.multiplyScalar(length / longest);
  wrap.add(obj);
  wrap.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  return wrap;
}

export class WeaponModels {
  constructor(game, cfg) {
    this.game = game;
    this.cfg = cfg;
    this.cache = new Map(); // weapon id -> Promise<Object3D | null>
  }

  /** @returns {Promise<THREE.Object3D|null>} a model for weapon w, or null (fists / failed). */
  get(w) {
    if (!w || w.type === 'fists') return Promise.resolve(null);
    if (!this.cache.has(w.id)) this.cache.set(w.id, this.make(w));
    return this.cache.get(w.id);
  }

  async make(w) {
    try {
      if (w.build && BUILDERS[w.build]) return fit(BUILDERS[w.build](this.cfg.builds[w.build] || {}), w.length);
      if (w.asset) {
        await this.game.assets.load(w.asset);
        return fit(this.game.assets.instance(w.asset), w.length);
      }
    } catch (err) {
      console.warn(`weapon model "${w.id}" not available`, err?.message);
    }
    return null;
  }

  /** A loose bottle / grenade in flight (not in the hand). build = 'molotov' | 'grenade'. */
  async bottle(build = 'molotov') {
    const w = this.cfg.weapons.find((x) => x.build === build);
    const m = await this.get(w);
    return m ? m.clone() : null;
  }
}
