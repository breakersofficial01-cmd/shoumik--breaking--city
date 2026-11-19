// Code-made radio music (Session 7 placeholder — generated, so it is royalty-free). A small
// step sequencer: every "song" picks a chord progression and a melody at random, plays a few
// minutes, then a new song starts. Three styles (data/radio.json → stations[].style):
//   pop    — four-on-the-floor kick, claps, bass, chord stabs, a bright lead
//   folk   — tabla-like drums, a drone and a plucked dotara-like melody (Bangla folk feel)
//   synth  — 80s neon synthwave: big snare, arpeggios, pads
// Output goes to a GainNode you give it (the radio connects it to game.audio's music bus).

const PENTA = [0, 2, 4, 7, 9, 12, 14, 16];
const FOLK = [0, 1, 4, 5, 7, 8, 10, 12, 13];
const MINOR = [0, 2, 3, 5, 7, 8, 10, 12, 14, 15];
const PROGRESSIONS = {
  pop: [[0, 'M'], [7, 'M'], [9, 'm'], [5, 'M']],
  folk: [[0, 'm'], [0, 'm'], [5, 'm'], [7, 'M']],
  synth: [[0, 'm'], [8, 'M'], [3, 'M'], [10, 'M']],
};
const PATTERNS = {
  pop: { kick: '1000100010001000', snare: '0000100000001000', hat: '0010001000100010' },
  folk: { dha: '1001001010010010', na: '0010110001001101', hat: '0000000000000000' },
  synth: { kick: '1000000010100000', snare: '0000100000001000', hat: '1010101010101010' },
};

export class RadioMusic {
  /**
   * @param {AudioContext} ctx
   * @param {AudioNode} out       where the music goes
   * @param {{style:string,bpm:number,key:number}} station
   * @param {AudioBuffer} noise   shared white noise (game.audio.noise)
   */
  constructor(ctx, out, station, noise) {
    this.ctx = ctx;
    this.out = out;
    this.st = station;
    this.noise = noise;
    this.style = PROGRESSIONS[station.style] ? station.style : 'pop';
    this.step = 0;
    this.next = ctx.currentTime + 0.1;
    this.newSong();
    this.timer = setInterval(() => this.schedule(), 100);
  }

  newSong() {
    const r = () => Math.random();
    const prog = PROGRESSIONS[this.style].slice();
    if (r() < 0.5) prog.push(prog.shift()); // start somewhere else for variety
    this.prog = prog;
    this.bpm = this.st.bpm * (0.95 + r() * 0.1);
    const scale = this.style === 'folk' ? FOLK : this.style === 'synth' ? MINOR : PENTA;
    // A 2-bar melody (32 steps) repeated with small changes; -1 = rest.
    this.melody = Array.from({ length: 32 }, (_, i) => (r() < (i % 4 === 0 ? 0.75 : 0.35) ? scale[Math.floor(r() * scale.length)] : -1));
    this.songSteps = 16 * 4 * (12 + Math.floor(r() * 8)); // 12-20 bars of 4 chords
  }

  hz(semi) { return this.st.key * 2 ** (semi / 12); }

  env(t, peak, dur, attack = 0.005) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(this.out);
    return g;
  }

  osc(type, freq, t, dur, peak, { to = freq, attack, filter } = {}) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to !== freq) o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
    const g = this.env(t, peak, dur, attack);
    if (filter) {
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(filter, t);
      f.frequency.exponentialRampToValueAtTime(Math.max(200, filter * 0.25), t + dur);
      o.connect(f).connect(g);
    } else o.connect(g);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  hiss(t, dur, peak, hp) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = hp;
    s.connect(f).connect(this.env(t, peak, dur, 0.002));
    s.start(t, Math.random(), dur + 0.05);
  }

  chord(root, kind) { return [root, root + (kind === 'm' ? 3 : 4), root + 7]; }

  playStep(t, i) {
    const s16 = i % 16;
    const bar = Math.floor(i / 16) % 4;
    const [root, kind] = this.prog[bar];
    const P = PATTERNS[this.style];
    const len = 60 / this.bpm / 4;
    if (this.style === 'pop') {
      if (P.kick[s16] === '1') this.osc('sine', 140, t, 0.25, 0.9, { to: 45 });
      if (P.snare[s16] === '1') this.hiss(t, 0.16, 0.35, 1500);
      if (P.hat[s16] === '1') this.hiss(t, 0.04, 0.12, 7000);
      if (s16 % 2 === 0) this.osc('triangle', this.hz(root - 12), t, len * 1.8, 0.35);
      if (s16 % 4 === 2) for (const n of this.chord(root, kind)) this.osc('square', this.hz(n + 12), t, len * 1.2, 0.05, { filter: 2600 });
      const m = this.melody[i % 32];
      if (m >= 0 && Math.floor(i / 128) % 2 === 1) this.osc('square', this.hz(m + 24), t, len * 1.6, 0.06, { filter: 3500 });
    } else if (this.style === 'folk') {
      if (P.dha[s16] === '1') this.osc('sine', 110, t, 0.22, 0.7, { to: 62 });
      if (P.na[s16] === '1') this.osc('triangle', 640, t, 0.09, 0.22, { to: 560 });
      if (s16 === 0 && bar % 2 === 0) { // drone: root + fifth for two bars
        this.osc('sine', this.hz(root - 12), t, len * 32, 0.12, { attack: 0.4 });
        this.osc('sine', this.hz(root - 5), t, len * 32, 0.07, { attack: 0.4 });
      }
      const m = this.melody[i % 32];
      if (m >= 0) this.osc('sawtooth', this.hz(m + 12), t, len * 2.5, 0.12, { filter: 2400, attack: 0.002 }); // plucked dotara
    } else {
      if (P.kick[s16] === '1') this.osc('sine', 120, t, 0.3, 0.9, { to: 40 });
      if (P.snare[s16] === '1') { this.hiss(t, 0.4, 0.35, 900); this.osc('triangle', 220, t, 0.12, 0.3, { to: 120 }); }
      if (P.hat[s16] === '1') this.hiss(t, 0.03, 0.08, 8000);
      if (s16 % 2 === 0) this.osc('sawtooth', this.hz(root - 12), t, len * 1.6, 0.16, { filter: 900 });
      const arp = this.chord(root, kind);
      this.osc('sawtooth', this.hz(arp[s16 % 3] + 12 + (s16 % 6 >= 3 ? 12 : 0)), t, len * 0.9, 0.05, { filter: 3000 });
      if (s16 === 0) for (const n of arp) this.osc('sawtooth', this.hz(n), t, len * 16, 0.03, { attack: 0.3, filter: 1800 });
      const m = this.melody[i % 32];
      if (m >= 0 && Math.floor(i / 64) % 2 === 1) this.osc('triangle', this.hz(m + 24), t, len * 2, 0.08);
    }
  }

  schedule() {
    if (this.ctx.state !== 'running') { this.next = this.ctx.currentTime + 0.1; return; }
    const len = 60 / this.bpm / 4;
    if (this.next < this.ctx.currentTime) this.next = this.ctx.currentTime + 0.05;
    while (this.next < this.ctx.currentTime + 0.3) {
      this.playStep(this.next, this.step);
      this.step++;
      if (this.step >= this.songSteps) { this.step = 0; this.newSong(); this.next += 1.2; } // a short gap between songs
      this.next += len;
    }
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }
}
