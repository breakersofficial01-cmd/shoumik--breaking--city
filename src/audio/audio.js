// Audio (Session 7): ONE Web Audio context for the whole game, with four volume buses
//   master ─┬─ sfx       (guns, explosions, horns, crashes)
//           ├─ music     (vehicle radio, hangout boombox)
//           └─ ambience  (rain, crowds, traffic, crows, generators)
// Game owns it as game.audio (made in Game.init, before features).
//
//   audio.play('gun.pistol', { x, z })        short sound, positional when x/z are given
//   const l = audio.loop('rain'); l.set(0.7)   a long sound; set(level 0..1), setRate(r), stop()
//   audio.bus('music')                         a GainNode to connect your own nodes to
//   audio.ctx                                  null until the first tap/key (browser rule)
//   audio.applySettings()                      after Settings changes sound / volumes
//
// Each sound id is made in code (src/audio/synth.js, recipe chosen by data/audio.json →
// sounds.<id>.kind) unless data/assets.json has a 'sound.<id>' file: then the decoded file plays
// instead — real recordings can replace the placeholders without code changes.

import { SYNTH, LOOPS } from './synth.js';
import { log } from '../core/debug.js';

export class AudioManager {
  /** @param {import('../core/game.js').Game} game */
  constructor(game) {
    this.game = game;
    this.cfg = game.config.get('audio');
    this.ctx = null;
    this.buses = {};
    this.buffers = new Map();   // sound id -> AudioBuffer (from a file), or null while loading
    this.loops = new Set();
    this.voices = 0;
    this.paused = false;
    this.unlock = () => this.ensure();
    window.addEventListener('pointerdown', this.unlock, true);
    window.addEventListener('keydown', this.unlock, true);
    game.events.on('game:paused', ({ paused }) => this.setPaused(paused));
  }

  get settings() { return this.game.save.data.settings; }

  /** Create the context on the first user gesture (browsers block sound before that). */
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && !this.paused) this.ctx.resume().catch(() => {});
      return this.ctx;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { this.ctx = new AC(); } catch { return null; }
    const ctx = this.ctx;
    // A gentle limiter so many guns + an explosion never clip.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.ratio.value = 8;
    limiter.connect(ctx.destination);
    this.buses.master = ctx.createGain();
    this.buses.master.connect(limiter);
    for (const name of ['sfx', 'music', 'ambience']) {
      this.buses[name] = ctx.createGain();
      this.buses[name].connect(this.buses.master);
    }
    // One shared second of white noise (gun cracks, rain, crowds).
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.applySettings();
    for (const l of this.loops) l.start();
    log.info('audio: context started');
    return ctx;
  }

  /** Sound on/off and the four volume sliders (save.data.settings). */
  applySettings() {
    if (!this.ctx) return;
    const s = this.settings;
    const v = s.volume || {};
    const B = this.cfg.buses;
    const on = s.sound !== false;
    const now = this.ctx.currentTime;
    // While the context is suspended (game paused by the settings panel) time stands still,
    // so set the values directly instead of fading.
    const set = (param, value) => {
      param.cancelScheduledValues(now);
      if (this.ctx.state === 'running') param.setTargetAtTime(value, now, 0.05);
      else param.value = value;
    };
    set(this.buses.master.gain, on ? B.master * (v.master ?? 1) : 0);
    for (const name of ['sfx', 'music', 'ambience']) set(this.buses[name].gain, B[name] * (v[name] ?? 1));
  }

  get enabled() { return this.settings.sound !== false; }

  bus(name) { return this.ensure() ? this.buses[name] : null; }

  setPaused(paused) {
    this.paused = paused;
    if (!this.ctx) return;
    if (paused) this.ctx.suspend().catch(() => {});
    else this.ctx.resume().catch(() => {});
  }

  /** Loudness 0..1 and stereo pan -1..1 of a sound at (x, z) as heard by the camera. */
  spatial(x, z, hear) {
    const cam = this.game.camera;
    const dx = x - cam.position.x;
    const dz = z - cam.position.z;
    const dist = Math.hypot(dx, dz);
    const range = hear || this.cfg.hearDistance;
    const k = Math.max(0, 1 - dist / range);
    // Camera right vector on the ground: (cos y, -sin y) for a three.js camera yaw y.
    const e = cam.matrixWorld.elements;
    const rx = e[0], rz = e[2];
    const rl = Math.hypot(rx, rz) || 1;
    const pan = dist > 0.5 ? ((dx * rx + dz * rz) / rl / dist) * this.cfg.panStrength : 0;
    return { level: k * k, pan: Math.max(-1, Math.min(1, pan)) };
  }

  /** Start loading a sound file for an id when data/assets.json has 'sound.<id>'. */
  fileFor(id) {
    if (this.buffers.has(id)) return this.buffers.get(id);
    const assetId = `sound.${id}`;
    if (!this.game.assets.url(assetId)) { this.buffers.set(id, null); return null; }
    this.buffers.set(id, null);
    this.game.assets.load(assetId)
      .then((data) => this.ctx.decodeAudioData(data.slice ? data.slice(0) : data))
      .then((buf) => this.buffers.set(id, buf))
      .catch((err) => log.warn(`audio: ${assetId} could not be played, using the code-made sound`, err));
    return null;
  }

  /**
   * Play a short sound once.
   * @param {string} id      key in data/audio.json → sounds
   * @param {{x?:number,z?:number,volume?:number,rate?:number,bus?:string}} opts
   */
  play(id, opts = {}) {
    if (!this.enabled || this.paused) return;
    const ctx = this.ensure();
    if (!ctx || ctx.state !== 'running') return;
    if (this.voices >= this.cfg.maxVoices) return;
    const def = this.cfg.sounds[id] || { kind: id, gain: 0.5 };
    let level = 1, pan = 0;
    if (opts.x != null) {
      ({ level, pan } = this.spatial(opts.x, opts.z, def.hear));
      if (level < 0.01) return;
    }
    const out = ctx.createGain();
    out.gain.value = level * (def.gain ?? 0.5) * (opts.volume ?? 1);
    let tail = out;
    if (ctx.createStereoPanner && pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      out.connect(p);
      tail = p;
    }
    tail.connect(this.buses[opts.bus || 'sfx']);
    const t = ctx.currentTime + 0.005;
    const buf = this.fileFor(id);
    let length;
    if (buf) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = opts.rate ?? 1;
      src.connect(out);
      src.start(t);
      length = buf.duration / (opts.rate ?? 1);
    } else {
      const recipe = SYNTH[def.kind];
      if (!recipe) return;
      length = recipe(this, t, out, def, opts);
    }
    this.voices++;
    setTimeout(() => { this.voices--; try { tail.disconnect(); } catch { /* gone */ } }, (length + 0.3) * 1000);
  }

  /**
   * A long sound that keeps playing; set(level) fades it (0 = silent but kept, cheap).
   * @param {string} id  key in data/audio.json → loops
   * @param {string} [busName]
   */
  loop(id, busName = 'ambience') {
    const audio = this;
    const def = this.cfg.loops[id] || { kind: id, gain: 0.4 };
    const handle = {
      id, level: 0, rate: 1, pan: 0, node: null, out: null, panner: null,
      start() {
        const ctx = audio.ctx;
        if (!ctx || handle.out) return;
        handle.out = ctx.createGain();
        handle.out.gain.value = 0;
        let tail = handle.out;
        if (ctx.createStereoPanner) {
          handle.panner = ctx.createStereoPanner();
          handle.out.connect(handle.panner);
          tail = handle.panner;
        }
        tail.connect(audio.buses[busName]);
        handle.node = LOOPS[def.kind]?.(audio, handle.out, def) || null;
        handle.apply();
      },
      apply() {
        if (!handle.out) return;
        const now = audio.ctx.currentTime;
        handle.out.gain.setTargetAtTime(handle.level * (def.gain ?? 0.4), now, 0.12);
        handle.panner?.pan.setTargetAtTime(handle.pan, now, 0.1);
        handle.node?.setRate?.(handle.rate, now);
      },
      /** @param {number} level 0..1  @param {number} [pan] -1..1 */
      set(level, pan = 0) {
        level = Math.max(0, Math.min(1, level));
        if (Math.abs(level - handle.level) < 0.01 && Math.abs(pan - handle.pan) < 0.05) return;
        handle.level = level;
        handle.pan = pan;
        handle.apply();
      },
      setRate(rate) {
        if (Math.abs(rate - handle.rate) < 0.01) return;
        handle.rate = rate;
        handle.apply();
      },
      stop() {
        handle.node?.stop?.();
        try { handle.out?.disconnect(); handle.panner?.disconnect(); } catch { /* gone */ }
        handle.out = handle.node = handle.panner = null;
        audio.loops.delete(handle);
      },
    };
    this.loops.add(handle);
    if (this.ctx) handle.start();
    return handle;
  }

  dispose() {
    window.removeEventListener('pointerdown', this.unlock, true);
    window.removeEventListener('keydown', this.unlock, true);
    for (const l of [...this.loops]) l.stop();
    this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}
