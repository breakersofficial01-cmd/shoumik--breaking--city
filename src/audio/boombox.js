// Boombox: a simple drum-and-bass loop made with the Web Audio API (no sound files, so it is
// royalty-free). Volume follows the distance to the nearest hangout spot.
// Session 7: it plays through the shared mixer (game.audio → 'music' bus), so Settings →
// sound and the music slider apply. Pausing is handled by game.audio (whole context).
//
// Browsers only allow sound after the player has touched the page, so the audio starts on
// the first tap/key press.
// Roadmap 2 S4: moved here from features/hotspots/ — the hotel dance lounge plays it too.

const STEP_KICK = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0];
const STEP_SNARE = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0];
const STEP_BASS = [0, 0, 3, 0, 0, 0, 5, 0, 0, 0, 3, 0, 7, 0, 5, 0]; // semitones above the root, 0 = rest (step 0 plays the root)

export class Boombox {
  /** @param {import('./audio.js').AudioManager} audio  game.audio */
  constructor(audio) {
    this.audio = audio;
    this.ctx = null;
    this.level = 0;
    this.bpm = 112;
    this.step = 0;
    this.nextTime = 0;
    this.timer = null;
    this.unlock = () => this.ensure();
    window.addEventListener('pointerdown', this.unlock);
    window.addEventListener('keydown', this.unlock);
  }

  ensure() {
    if (this.ctx) return;
    this.ctx = this.audio?.ensure() || null;
    if (!this.ctx) return;
    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 900;
    this.master.connect(this.filter).connect(this.audio.bus('music'));
    // One second of noise for snares and hi-hats.
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, len);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 90);
  }

  /** Beats since the music started (dancers move to this). Falls back to a plain clock. */
  beat() {
    const t = this.ctx && this.ctx.state === 'running' ? this.ctx.currentTime : performance.now() / 1000;
    return (t * this.bpm) / 60;
  }

  /** @param {number} level 0..1 loudness  @param {number} bpm */
  set(level, bpm) {
    this.level = level;
    if (bpm) this.bpm = bpm;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(level, now, 0.15);
    this.filter.frequency.setTargetAtTime(500 + 9000 * level * level, now, 0.2); // far away = muffled
  }

  setPaused(paused) {
    this.paused = paused; // the shared context is suspended by game.audio
  }

  tone(type, f0, f1, t, dur, gain) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  hiss(t, dur, gain, freq) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random() * 0.5, dur + 0.02);
  }

  schedule() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const stepLen = 60 / this.bpm / 4;
    if (this.nextTime < this.ctx.currentTime) this.nextTime = this.ctx.currentTime + 0.05;
    while (this.nextTime < this.ctx.currentTime + 0.25) {
      const t = this.nextTime;
      const i = this.step % 16;
      if (this.level > 0.004) {
        if (STEP_KICK[i]) this.tone('sine', 150, 42, t, 0.22, 0.9);
        if (STEP_SNARE[i]) this.hiss(t, 0.14, 0.45, 1800);
        if (i % 2 === 0) this.hiss(t, 0.04, i % 4 === 2 ? 0.22 : 0.1, 7000);
        if (i === 0 || STEP_BASS[i]) this.tone('square', 55 * 2 ** (STEP_BASS[i] / 12), 55 * 2 ** (STEP_BASS[i] / 12), t, stepLen * 1.8, 0.16);
      }
      this.step++;
      this.nextTime += stepLen;
    }
  }

  dispose() {
    clearInterval(this.timer);
    window.removeEventListener('pointerdown', this.unlock);
    window.removeEventListener('keydown', this.unlock);
    try { this.filter?.disconnect(); } catch { /* gone */ }
    this.ctx = null;
  }
}
