// Horn sounds, made with the Web Audio API (no sound files). Kinds (data/vehicles.json → horn):
//   bell (rickshaw / bicycle), beep (CNG, bike), car, bus, siren.
// Session 7: plays through the shared mixer (game.audio, 'sfx' bus) so Settings → sound and
// the volume sliders apply. A real recording can replace a kind: data/assets.json →
// "sound.horn.<kind>" (played by game.audio instead of the code-made one).

const KINDS = {
  bell: { wave: 'triangle', notes: [[2100, 0, 0.09], [2100, 0.14, 0.12]], gain: 0.5 },
  beep: { wave: 'square', notes: [[620, 0, 0.22], [780, 0, 0.22]], gain: 0.28 },
  car: { wave: 'sawtooth', notes: [[410, 0, 0.36], [515, 0, 0.36]], gain: 0.3 },
  bus: { wave: 'sawtooth', notes: [[205, 0, 0.6], [259, 0, 0.6]], gain: 0.42 },
  siren: { wave: 'sine', notes: [[650, 0, 0.8]], sweep: 980, gain: 0.4 },
};

export class Horn {
  constructor(game, cfg) {
    this.game = game;
    this.cfg = cfg;
    this.ctx = null;
    this.lastAi = 0;
  }

  ensure() {
    return this.game.audio?.ensure() || null;
  }

  /** @param {string} kind  @param {number} x,z where it honks  @param {boolean} ai quieter, not too many at once */
  play(kind, x, z, ai) {
    if (this.game.save.data.settings.sound === false) return;
    const now = performance.now();
    if (ai) {
      if (now - this.lastAi < 350) return;
      this.lastAi = now;
    }
    const cam = this.game.camera.position;
    const level = Math.max(0, 1 - Math.hypot(x - cam.x, z - cam.z) / this.cfg.hearDistance);
    if (level <= 0.02) return;
    const audio = this.game.audio;
    if (audio?.fileFor(`horn.${kind}`)) { audio.play(`horn.${kind}`, { x, z, volume: ai ? this.cfg.aiVolume : 1 }); return; }
    const ctx = this.ensure();
    if (!ctx || ctx.state !== 'running') return;
    const pan = audio.spatial(x, z, this.cfg.hearDistance).pan;
    const bus = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
    if (bus.pan) bus.pan.value = pan;
    bus.connect(audio.bus('sfx'));
    setTimeout(() => bus.disconnect(), 1500);
    const k = KINDS[kind] || KINDS.car;
    const t0 = ctx.currentTime + 0.01;
    const vol = this.cfg.volume * k.gain * level * level * (ai ? this.cfg.aiVolume : 1);
    for (const [freq, at, len] of k.notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = k.wave;
      osc.frequency.setValueAtTime(freq, t0 + at);
      if (k.sweep) {
        osc.frequency.linearRampToValueAtTime(k.sweep, t0 + at + len / 2);
        osc.frequency.linearRampToValueAtTime(freq, t0 + at + len);
      }
      gain.gain.setValueAtTime(0, t0 + at);
      gain.gain.linearRampToValueAtTime(vol, t0 + at + 0.015);
      gain.gain.setValueAtTime(vol, t0 + at + len - 0.04);
      gain.gain.linearRampToValueAtTime(0, t0 + at + len);
      osc.connect(gain).connect(bus);
      osc.start(t0 + at);
      osc.stop(t0 + at + len + 0.02);
    }
  }

  dispose() {}
}
