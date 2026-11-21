// Feature: streetLights (Roadmap 2, Session 1). Street lamps light up after dark:
//   - bulbs glow (bloom on Medium/High) and warm light pools appear on the ground
//     (both fade in with the lit windows that dayNight sets: world.cityShading.windows)
//   - a few REAL point lights sit on the lamps nearest to the player, so cars, people and
//     walls next to a lamp are lit too. How many: data/quality.json → streetLights
//     (0 on Low). The lights always exist on Medium/High (intensity 0 by day), so their
//     shaders are compiled once and never again at dusk.
// Load-shedding switches lamps off too (the materials are patched in world/street/index.js).
//
// Reads:   game.world.street (heads, materials), game.world.cityShading.windows, game.quality
// Listens: quality:changed
// Numbers: data/street.json → night, realLights.  Debug: BC.streetLights

import * as THREE from 'three';
import { debugLine } from '../../core/debug.js';

let game = null;
let cfg = null;
let street = null;
let lights = [];
let timer = 0;
let off = null;
let boost = 1;

/** Make (or remake) the real lights for the current quality. */
function makeLights() {
  for (const l of lights) { game.scene.remove(l); l.dispose?.(); }
  lights = [];
  const n = Math.max(0, game.quality?.streetLights | 0);
  const R = cfg.realLights;
  for (let i = 0; i < n; i++) {
    const l = new THREE.PointLight(R.color, 0, R.distance, R.decay);
    l.castShadow = false;
    l.name = `street-light-${i}`;
    game.scene.add(l);
    lights.push(l);
  }
  timer = 0;
}

/** Put the lights on the bulbs nearest to (x, z). Plain scan: a few thousand lamps, twice a second. */
function placeLights(x, z) {
  const h = street.heads;
  const n = lights.length;
  if (!n || !h.length) return;
  const best = new Array(n).fill(-1);
  const dist = new Array(n).fill(Infinity);
  for (let i = 0; i < h.length; i += 3) {
    const d = (h[i] - x) ** 2 + (h[i + 2] - z) ** 2;
    if (d >= dist[n - 1]) continue;
    let k = n - 1;
    while (k > 0 && dist[k - 1] > d) { dist[k] = dist[k - 1]; best[k] = best[k - 1]; k--; }
    dist[k] = d; best[k] = i;
  }
  lights.forEach((l, k) => {
    if (best[k] < 0) return;
    // Just under the bulb so the post does not hide it from the road.
    l.position.set(h[best[k]], h[best[k] + 1] - 0.4, h[best[k] + 2]);
  });
}

export default {
  id: 'streetLights',

  init(g) {
    game = g;
    street = g.world.street;
    if (!street?.materials) throw new Error('world.street is missing');
    cfg = g.config.get('street');
    boost = cfg.night.bulbBoost;
    makeLights();
    off = g.events.on('quality:changed', makeLights);
    g.streetLights = { get lights() { return lights; }, place: placeLights };
  },

  update(dt) {
    const k = game.world.cityShading.windows; // 0 day .. 1 night
    const { bulb, pool } = street.materials;
    bulb.emissiveIntensity = k * boost;
    pool.emissiveIntensity = k * cfg.night.poolStrength;
    pool.visible = k > 0.02;
    const R = cfg.realLights;
    for (const l of lights) l.intensity = k * R.intensity;
    timer -= dt;
    if (timer <= 0 && lights.length) {
      timer = R.updateSeconds;
      const p = game.player?.position || game.camera.position;
      placeLights(p.x, p.z);
    }
    debugLine('street', `street lamps ${Math.round(k * 100)}% · real lights ${lights.length}`);
  },

  dispose() {
    off?.();
    for (const l of lights) game.scene.remove(l);
    lights = [];
    if (street?.materials) {
      street.materials.bulb.emissiveIntensity = 0;
      street.materials.pool.visible = false;
    }
  },
};
