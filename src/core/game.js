// Game: owns the renderer, scene, camera, world, input and the frame loop.
// Features receive this object in init(game) and use:
//   game.scene / game.camera / game.renderer
//   game.world        (heightAt, districtAt, collision, layout)
//   game.input        (move / held / pressed / look)
//   game.cameraRig    (ChaseCamera: setTarget, forward(), right())
//   game.events, game.config, game.save, game.economy, game.content, game.assets
//   game.player       (set by the player feature: { position, heading, speed, ... })
//   game.crowd        (shared instanced pedestrian renderer, made by acquireCrowd(game))
//   game.targets      (everything that can be shot: src/core/targets.js)
//   game.combatFx     (blood, bullet tracers, muzzle flashes: acquireCombatFx(game))
//   game.ui           (the #ui element: put HUD / overlays here)
//   game.graphics     (tone mapping, shadows, bloom: src/world/graphics/)
//   game.audio        (one Web Audio context + volume buses: src/audio/audio.js)
//   game.setPaused(reason, bool), game.setQuality(name)

import * as THREE from 'three';
import { events } from './events.js';
import { config } from './config.js';
import { save } from './save.js';
import { economy } from './economy.js';
import { debug, log, tickDebug, initDebugPanel } from './debug.js';
import { Input } from './input.js';
import { Targets } from './targets.js';
import { content } from '../content/ContentService.js';
import { assets } from '../assets/registry.js';
import { World } from '../world/world.js';
import { Graphics } from '../world/graphics/index.js';
import { AudioManager } from '../audio/audio.js';
import { ChaseCamera } from '../entities/chaseCamera.js';
import { loadFeatures } from '../features/index.js';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ui = document.getElementById('ui');
    this.events = events;
    this.config = config;
    this.save = save;
    this.economy = economy;
    this.content = content;
    this.assets = assets;
    this.player = null;
    this.crowd = null;
    this.targets = new Targets();
    this.combatFx = null;
    this.features = null;
    this.pauseReasons = new Set();
    this.running = false;
    this.lastTime = 0;
    this.frame = this.frame.bind(this);
    this.resize = this.resize.bind(this);
  }

  /** Which quality level to use: ?quality=low  >  saved setting  >  data/quality.json default. */
  pickQuality() {
    const q = config.get('quality');
    const wanted = debug.flag('quality') || save.data.settings.quality || q.default;
    return q.levels[wanted] ? wanted : q.default;
  }

  /** @param {(fraction:number)=>void} onProgress */
  async init(onProgress) {
    const camCfg = config.get('camera');
    this.qualityName = this.pickQuality();
    this.quality = config.get('quality').levels[this.qualityName];

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      // Can only be chosen at start-up. With post-effects on, anti-aliasing happens inside the
      // effect chain instead (data/quality.json → msaa), so the canvas itself does not need it.
      antialias: this.quality.antialias && !this.quality.postfx,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(camCfg.fov, 1, camCfg.near, 1000);

    this.world = new World(this);
    await this.world.init();
    this.graphics = new Graphics(this);
    onProgress(0.15);

    this.input = new Input(config.get('controls'), this.canvas);
    this.cameraRig = new ChaseCamera(this.camera, camCfg, this.world);
    this.applyQuality();
    this.resize();
    window.addEventListener('resize', this.resize);
    window.visualViewport?.addEventListener('resize', this.resize);
    document.addEventListener('visibilitychange', () => this.setPaused('hidden', document.hidden));

    initDebugPanel();
    this.audio = new AudioManager(this); // before features: they create their sounds in init()
    this.features = await loadFeatures(this);
    onProgress(0.3);

    // Build the city around the player before the first frame.
    const focus = this.player?.position || { x: 0, z: 0 };
    await this.world.buildAround(focus.x, focus.z, (f) => onProgress(0.3 + f * 0.7));
    this.cameraRig.update(0.016);
    this.world.update(0, focus);
    this.graphics.update(0, focus);
    this.renderer.compile(this.scene, this.camera);
    this.graphics.render(0);
    if (debug.enabled) window.BC = this; // handy in the browser console
    events.emit('game:ready', {});
  }

  applyQuality() {
    const q = this.quality;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatioCap) * q.renderScale);
    this.world.setQuality(q);
    this.graphics.setQuality(q);
  }

  /** Switch Low / Medium / High at any time. Saved for next launch. */
  setQuality(name) {
    const levels = config.get('quality').levels;
    if (!levels[name]) return;
    this.qualityName = name;
    this.quality = levels[name];
    save.data.settings.quality = name;
    this.applyQuality();
    this.resize();
    events.emit('quality:changed', { quality: name });
    log.info('quality', name);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.graphics?.setSize(w, h);
    events.emit('screen:resized', { width: w, height: h });
  }

  /** Pause/resume the simulation. Several things can pause at once (menu, portrait, hidden tab). */
  setPaused(reason, paused) {
    if (paused) this.pauseReasons.add(reason);
    else this.pauseReasons.delete(reason);
    events.emit('game:paused', { paused: this.pauseReasons.size > 0 });
  }

  get paused() {
    return this.pauseReasons.size > 0;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    requestAnimationFrame(this.frame);
    events.emit('game:started', {});
  }

  frame(now) {
    if (!this.running) return;
    requestAnimationFrame(this.frame);
    const maxDt = config.get('game').maxFrameSeconds;
    // The first rAF timestamp can be slightly older than start(), so never go below 0.
    const dt = Math.max(0, Math.min(maxDt, (now - this.lastTime) / 1000));
    this.lastTime = now;
    if (this.paused) {
      this.input.endFrame();
      return;
    }
    this.input.update();
    this.cameraRig.addLook(this.input.look.x, this.input.look.y);
    this.features.update(dt);
    this.crowd?.update();            // shared pedestrian renderer (src/entities/people/crowd.js)
    this.combatFx?.update(dt, this.camera); // blood, tracers (src/entities/effects/combatFx.js)
    this.cameraRig.update(dt);
    const focus = this.player?.position || this.camera.position;
    this.world.update(dt, focus);
    this.graphics.update(dt, focus);
    this.graphics.render(dt);
    this.input.endFrame();
    tickDebug(dt, this.renderer);
  }
}
