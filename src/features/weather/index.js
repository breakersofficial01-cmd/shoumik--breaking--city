// Feature: weather (Session 7) — monsoon rain. Rain comes and goes by itself
// (data/weather.json): falling drops around the camera (one LineSegments, moved in the shader,
// so it costs one draw call), wet dark roads with a sheen (world.cityShading.setWet), rain sound,
// lightning flashes with thunder in heavy rain. The sky/fog/light changes are done by the
// dayNight feature, which listens to weather:changed.
//
// Shares:  game.weather = { rain, wet }  (read-only)
// Sends:   weather:changed { rain }  (0..1, when it changes)
// Listens: weather:set { rain: true|false }  (debug / tools),  quality:changed
// Debug:   ?rain=1 starts raining;  BC.events.emit('weather:set', { rain: true })

import * as THREE from 'three';
import { debug } from '../../core/debug.js';

let game = null;
let cfg = null;
let offs = [];
let drops = null;
let flashLight = null;
let rainLoop = null;
let rain = 0;          // current strength 0..1
let target = 0;        // where rain is heading
let wetness = 0;       // roads dry slower than the rain stops
let phaseLeft = 0;     // seconds until the rain starts / stops by itself
let thunderIn = 0;
let flash = 0;
let lastSent = -1;
let elapsed = 0;

const rand = ([a, b]) => a + Math.random() * (b - a);

const vertexShader = /* glsl */`
  attribute float aEnd;
  uniform float uTime; uniform vec3 uCenter; uniform vec3 uBox; uniform vec3 uVel; uniform float uLen;
  varying float vEnd;
  void main() {
    vec3 p = position + uVel * uTime;
    p = mod(p - uCenter + uBox * 0.5, uBox) + uCenter - uBox * 0.5;   // wrap around the camera
    p -= normalize(uVel) * uLen * aEnd;                                   // the tail of the drop
    vEnd = aEnd;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }`;
const fragmentShader = /* glsl */`
  uniform vec3 uColor; uniform float uOpacity;
  varying float vEnd;
  void main() { gl_FragColor = vec4(uColor, uOpacity * (1.0 - vEnd * 0.8)); }`;

function buildDrops(count) {
  if (drops) { game.scene.remove(drops); drops.geometry.dispose(); drops.material.dispose(); }
  const D = cfg.drops;
  const [w, h] = D.box;
  const pos = new Float32Array(count * 6);
  const end = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const x = Math.random() * w, y = Math.random() * h, z = Math.random() * w;
    pos.set([x, y, z, x, y, z], i * 6);
    end[i * 2 + 1] = 1;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
  const mat = new THREE.ShaderMaterial({
    vertexShader, fragmentShader, transparent: true, depthWrite: false,
    uniforms: {
      uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(w, h, w) },
      uVel: { value: new THREE.Vector3(D.wind[0], -D.speed, D.wind[1]) }, uLen: { value: D.length },
      uColor: { value: new THREE.Color(D.color) }, uOpacity: { value: 0 },
    },
  });
  drops = new THREE.LineSegments(geo, mat);
  drops.name = 'rain';
  drops.frustumCulled = false;
  drops.visible = false;
  drops.userData.noCastShadow = true;
  game.scene.add(drops);
}

function setRaining(on) {
  target = on ? 1 : 0;
  phaseLeft = (on ? rand(cfg.rainMinutes) : rand(cfg.dryMinutes)) * 60;
  thunderIn = rand(cfg.thunder.everySeconds);
}

function thunder() {
  flash = cfg.thunder.flash;
  const delay = rand(cfg.thunder.delaySeconds);
  setTimeout(() => game.audio?.play('thunder', { volume: 0.5 + rain * 0.5, bus: 'ambience' }), delay * 1000);
}

export default {
  id: 'weather',

  init(g) {
    game = g;
    cfg = g.config.get('weather');
    buildDrops(cfg.drops.count[g.qualityName] ?? cfg.drops.count.medium);
    // Lightning: an extra light that is normally off (added once so shaders never recompile).
    flashLight = new THREE.HemisphereLight('#dfe6ff', '#8890a8', 0);
    g.scene.add(flashLight);
    rainLoop = g.audio?.loop('rain');
    g.weather = { get rain() { return rain; }, get wet() { return wetness; } }; // read-only for others
    const forced = debug.flag('rain');
    setRaining(forced === '1' || (forced !== '0' && cfg.startRaining));
    if (target === 1 && forced === '1') rain = wetness = 1;
    if (!cfg.enabled && forced !== '1') target = 0;
    offs = [
      g.events.on('weather:set', ({ rain: on }) => setRaining(!!on)),
      g.events.on('weather:thunder', thunder),
      g.events.on('quality:changed', ({ quality }) => buildDrops(cfg.drops.count[quality] ?? cfg.drops.count.medium)),
    ];
  },

  update(dt) {
    elapsed += dt;
    if (cfg.enabled) {
      phaseLeft -= dt;
      if (phaseLeft <= 0) setRaining(target === 0);
    }
    const step = dt / cfg.fadeSeconds;
    rain += Math.max(-step, Math.min(step, target - rain));
    // Roads get wet quickly (10 s) and dry slowly (60 s).
    if (rain > wetness) wetness = Math.min(rain, wetness + dt / 10);
    else wetness = Math.max(rain, wetness - dt / 60);

    if (Math.abs(rain - lastSent) > 0.01 || (rain === 0 && lastSent !== 0)) {
      lastSent = rain;
      game.events.emit('weather:changed', { rain });
    }
    game.world.cityShading.setWet(wetness, game.scene.fog.color, cfg.wet);

    drops.visible = rain > 0.01;
    if (drops.visible) {
      const u = drops.material.uniforms;
      u.uTime.value = elapsed;
      u.uCenter.value.copy(game.camera.position);
      u.uOpacity.value = cfg.drops.opacity * rain;
    }
    rainLoop?.set(rain);

    if (rain > 0.7) {
      thunderIn -= dt;
      if (thunderIn <= 0) {
        thunderIn = rand(cfg.thunder.everySeconds);
        thunder();
      }
    }
    flash = Math.max(0, flash - dt * 6);
    flashLight.intensity = flash * (0.6 + Math.random() * 0.4);
  },

  dispose() {
    offs.forEach((off) => off());
    offs = [];
    rainLoop?.stop();
    if (drops) { game.scene.remove(drops); drops.geometry.dispose(); drops.material.dispose(); drops = null; }
    flashLight?.removeFromParent();
    game.world.cityShading.setWet(0, null, cfg.wet);
  },
};
