// Feature: dayNight (Session 7). A game clock (1 day = data/dayNight.json → dayMinutes real
// minutes) that drives the whole look: painted sky blend (day / sunset / night), sun and moon,
// light colours, fog, exposure, neon brightness, bloom, lit windows and glowing shop signs.
// Rain (weather feature) greys it out through the `weather:changed { rain }` event.
// Load-shedding lives in ./loadShedding.js (same feature).
//
// Shares:  game.clock = { hour, night }  (read-only for others)
// Sends:   time:changed { hour, night } once per game minute,  time:night { night } when it flips
// Listens: weather:changed { rain },  time:set { hour } (debug / tools),  quality:changed
// Debug:   ?hour=21 starts at that time;  BC.events.emit('time:set', { hour: 12 })

import * as THREE from 'three';
import { debug, debugLine, log } from '../../core/debug.js';
import { setGlowLevel } from '../../world/graphics/glow.js';
import { sampleKeys, sunDirection } from './clock.js';
import { LoadShedding } from './loadShedding.js';

let game = null;
let cfg = null;
let wet = null;
let offs = [];
let hour = 17;
let rain = 0;
let sunTimer = 0;
let envTimer = 0;
let lastMinute = -1;
let night = null;
let shedding = null;
const tmpDir = new THREE.Vector3();
const lightDir = new THREE.Vector3();
const fogCol = new THREE.Color();
const wetFog = new THREE.Color();

/** Apply the look for the current hour (and rain) to the sky, lights, fog and city materials. */
function apply(force) {
  const k = sampleKeys(cfg.keys, hour);
  const { sky, cityShading } = game.world;
  sky.setSkyMix(k.sky[0], k.sky[1], k.sky[2]);
  sky.setTint(wet.skyTint, rain * wet.skyMix, 1 - rain * 0.25);

  sky.sunLight.color.copy(k.sun.color);
  sky.sunLight.intensity = k.sun.value * (1 - rain * (1 - wet.sunFactor));
  sky.hemi.color.copy(k.hemiSky);
  sky.hemi.groundColor.copy(k.hemiGround);
  sky.hemi.intensity = k.hemi * (1 - rain * 0.15);
  sky.ambient.color.copy(k.ambient.color);
  sky.ambient.intensity = k.ambient.value;

  fogCol.copy(k.fog).lerp(wetFog, rain * wet.fogMix);
  game.scene.fog.color.copy(fogCol);
  game.scene.background.copy(fogCol);
  const q = game.quality;
  const f = game.config.get('world').fog;
  const near = 1 - rain * (1 - wet.fogFactor);
  game.scene.fog.near = q.viewDistance * f.nearFactor * near;
  game.scene.fog.far = q.viewDistance * f.farFactor * (0.6 + 0.4 * near);

  game.graphics.setExposure(k.exposure * (1 - rain * 0.08));
  game.graphics.setBloomStrength(k.bloom);
  setGlowLevel(k.neon);
  game.scene.environmentIntensity = k.env * (1 - rain * 0.4);
  cityShading.setWindows(k.windows * (1 + rain * 0.3));
  cityShading.setSigns(Math.min(1, k.signs + rain * 0.4));

  // Hero (3D kit) towers: their glass glows a little at night.
  const glass = game.world.hero?.materials?.get('Glass');
  if (glass?.emissive) {
    cityShading.patchCut(glass); // dark during load-shedding too
    glass.emissive.set(cfg.windows.colors[0]).multiplyScalar(k.windows * (cfg.windows.heroGlass ?? 0.05));
  }

  // Sun by day, moon by night (same light, other side, weak and blue).
  if (force) sunTimer = 0;
  if (sunTimer <= 0) {
    sunTimer = cfg.sunPath.updateSeconds;
    sunDirection(cfg.sunPath, hour, game.config.get('world').sky.sunDirection, tmpDir);
    const isSun = tmpDir.y > -0.04;
    if (isSun) lightDir.copy(tmpDir);
    else lightDir.copy(tmpDir).negate().setY(Math.max(0.35, -tmpDir.y));
    sky.setSunDirection(isSun ? tmpDir : lightDir);
    sky.sun.material.color.set(isSun ? game.config.get('world').sky.sunColor : cfg.moon.color);
    sky.setSunScale(isSun ? 1 : cfg.moon.size / game.config.get('world').sky.sunSize);
    game.graphics.setSunDirection(lightDir.y > 0.05 ? lightDir : lightDir.setY(0.05).normalize());
  }

  const isNight = k.windows > 0.5;
  if (isNight !== night) {
    night = isNight;
    game.events.emit('time:night', { night });
  }
}

/** How often sky reflections are re-made: per quality (Session 8: rarer on Low), else dayNight.json. */
const envSeconds = () => game.quality?.environmentRefreshSeconds ?? cfg.environmentRefreshSeconds;

function setHour(h, emit = true) {
  hour = ((h % 24) + 24) % 24;
  game.clock.hour = hour;
  apply(true);
  game.graphics.refreshEnvironment();
  envTimer = envSeconds();
  if (emit) game.events.emit('time:changed', { hour, night });
}

export default {
  id: 'dayNight',

  init(g) {
    game = g;
    cfg = g.config.get('dayNight');
    wet = g.config.get('weather').wet;
    wetFog.set(wet.fogColor);
    game.clock = { hour: 0, night: false, get isNight() { return night; } };
    if (!g.world.sky.enableCycle(g.renderer, cfg.skies)) log.warn('dayNight: painted sky missing, the sky colour will not change');
    const start = parseFloat(debug.flag('hour'));
    const saved = g.save.data.clock;
    shedding = new LoadShedding(g, cfg.loadShedding);
    setHour(Number.isFinite(start) ? start : (typeof saved === 'number' ? saved : cfg.startHour), false);
    g.save.onBeforeSave((d) => { d.clock = Math.round(hour * 1000) / 1000; });
    offs = [
      g.events.on('weather:changed', ({ rain: r }) => { rain = r; }),
      g.events.on('time:set', ({ hour: h }) => setHour(h)),
      g.events.on('quality:changed', () => apply(true)),
    ];
  },

  update(dt) {
    hour = (hour + (dt * 24) / (cfg.dayMinutes * 60)) % 24;
    game.clock.hour = hour;
    game.clock.night = night;
    sunTimer -= dt;
    apply(false);
    envTimer -= dt;
    if (envTimer <= 0) {
      envTimer = envSeconds();
      game.graphics.refreshEnvironment();
    }
    const minute = Math.floor(hour * 60);
    if (minute !== lastMinute) {
      lastMinute = minute;
      game.events.emit('time:changed', { hour, night });
    }
    shedding.update(dt, night);
    const hh = Math.floor(hour), mm = Math.floor((hour - hh) * 60);
    debugLine('clock', `time ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}${night ? ' night' : ''}${rain > 0.01 ? ` rain ${rain.toFixed(2)}` : ''}${shedding.active ? ` | power cut ${shedding.active.district}` : ''}`);
  },

  dispose() {
    offs.forEach((off) => off());
    offs = [];
    shedding?.dispose();
    setGlowLevel(1);
    game.world.cityShading.setWindows(0);
    game.world.cityShading.setSigns(0);
  },
};
