// Code-made sounds (Session 7 placeholders — no sound files, so nothing to license).
// SYNTH[kind](audio, t, out, def, opts) plays one short sound into `out` starting at time t and
// returns its length in seconds. LOOPS[kind](audio, out, def) starts a sound that runs until
// stop(); it may offer setRate(rate, now). Shapes come from data/audio.json (sounds / loops).
// Real recordings can replace any of these: data/assets.json → "sound.<id>" (see audio.js).

const rand = (a, b) => a + Math.random() * (b - a);

/** White-noise source (shared 2 s buffer), started at a random offset. */
function noise(audio, t, dur, loop = false) {
  const s = audio.ctx.createBufferSource();
  s.buffer = audio.noise;
  s.loop = loop;
  s.start(t, Math.random() * 1.5, loop ? undefined : dur + 0.05);
  return s;
}

function filter(ctx, type, freq, q = 0.7) {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

/** Gain with a fast attack and an exponential fade over `dur`. */
function env(ctx, t, peak, dur, attack = 0.004) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  return g;
}

function tone(ctx, type, f0, f1, t, dur, peak, out, attack) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  o.connect(env(ctx, t, peak, dur, attack)).connect(out);
  o.start(t);
  o.stop(t + dur + 0.05);
  return o;
}

export const SYNTH = {
  /** Gunshot: a bright noise crack + a low body thump + a short room tail. */
  gun(audio, t, out, d) {
    const ctx = audio.ctx;
    const len = d.length || 0.25;
    noise(audio, t, len).connect(filter(ctx, 'highpass', d.crack * 0.4)).connect(filter(ctx, 'lowpass', d.crack * 2.5)).connect(env(ctx, t, 1, len * 0.6, 0.001)).connect(out);
    tone(ctx, 'sine', d.body * 1.8, d.body * 0.45, t, len * 0.8, 0.9, out, 0.001);
    noise(audio, t + 0.02, len * 2).connect(filter(ctx, 'bandpass', 700, 0.6)).connect(env(ctx, t + 0.02, 0.18, len * 2.2, 0.01)).connect(out);
    return len * 2.4;
  },

  /** Explosion: a long low rumble + a crackle on top. */
  boom(audio, t, out, d) {
    const ctx = audio.ctx;
    const len = d.length || 2;
    const lp = filter(ctx, 'lowpass', 900);
    lp.frequency.setValueAtTime(1800, t);
    lp.frequency.exponentialRampToValueAtTime(120, t + len);
    noise(audio, t, len).connect(lp).connect(env(ctx, t, 1, len, 0.008)).connect(out);
    tone(ctx, 'sine', 70, 28, t, len * 0.7, 1, out, 0.01);
    noise(audio, t + 0.05, len * 0.5).connect(filter(ctx, 'highpass', 2500)).connect(env(ctx, t + 0.05, 0.25, len * 0.5)).connect(out);
    return len;
  },

  /** Breaking glass (molotov): several short high pings over noise. */
  glass(audio, t, out, d) {
    const ctx = audio.ctx;
    noise(audio, t, d.length).connect(filter(ctx, 'highpass', 3500)).connect(env(ctx, t, 0.7, d.length, 0.001)).connect(out);
    for (let i = 0; i < 5; i++) tone(ctx, 'triangle', rand(2500, 5200), rand(2400, 5000), t + rand(0, 0.12), rand(0.06, 0.2), 0.25, out);
    return d.length + 0.15;
  },

  /** Punch / crash: a dull low knock. */
  thud(audio, t, out, d) {
    const ctx = audio.ctx;
    tone(ctx, 'sine', d.freq * 1.6, d.freq * 0.6, t, d.length, 1, out, 0.002);
    noise(audio, t, d.length * 0.6).connect(filter(ctx, 'lowpass', 900)).connect(env(ctx, t, 0.6, d.length * 0.6, 0.001)).connect(out);
    return d.length;
  },

  /** Crow: two or three harsh "caw" sounds (sawtooth through a nasal band filter). */
  crow(audio, t, out) {
    const ctx = audio.ctx;
    const n = Math.random() < 0.5 ? 2 : 3;
    let at = t;
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      const f = rand(520, 640);
      o.frequency.setValueAtTime(f * 1.15, at);
      o.frequency.exponentialRampToValueAtTime(f * 0.8, at + 0.28);
      const bp = filter(ctx, 'bandpass', 1300, 3);
      o.connect(bp).connect(env(ctx, at, 0.8, 0.3, 0.02)).connect(out);
      o.start(at);
      o.stop(at + 0.35);
      at += rand(0.35, 0.5);
    }
    return at - t;
  },

  /** Hawker's call: a sung, wavering two-note "voice" (formant-filtered buzz). */
  hawker(audio, t, out) {
    const ctx = audio.ctx;
    const base = rand(170, 230);
    const notes = [[1, 0.35], [1.19, 0.5], [1, 0.3], [0.89, 0.6]];
    let at = t;
    for (const [m, len] of notes) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(base * m, at);
      const vib = ctx.createOscillator();
      vib.frequency.value = 5.5;
      const vg = ctx.createGain();
      vg.gain.value = base * 0.02;
      vib.connect(vg).connect(o.frequency);
      const f1 = filter(ctx, 'bandpass', rand(650, 800), 4);
      const f2 = filter(ctx, 'bandpass', rand(1100, 1300), 5);
      const g = env(ctx, at, 0.7, len, 0.05);
      o.connect(f1).connect(g);
      o.connect(f2).connect(g);
      g.connect(out);
      o.start(at); vib.start(at);
      o.stop(at + len + 0.05); vib.stop(at + len + 0.05);
      at += len * 0.95;
    }
    return at - t;
  },

  /** Thunder: a slow rolling low rumble. */
  thunder(audio, t, out, d) {
    const ctx = audio.ctx;
    const len = d.length || 3;
    const lp = filter(ctx, 'lowpass', 260);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(1, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.4, t + len * 0.3);
    g.gain.exponentialRampToValueAtTime(0.7, t + len * 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    noise(audio, t, len).connect(lp).connect(g).connect(out);
    return len;
  },

  /** UI click. */
  click(audio, t, out) { tone(audio.ctx, 'triangle', 1400, 900, t, 0.05, 0.6, out, 0.001); return 0.06; },

  /** Reward chime: a bright rising arpeggio. */
  chime(audio, t, out) {
    [523, 659, 784, 1047].forEach((f, i) => tone(audio.ctx, 'triangle', f, f, t + i * 0.09, 0.4, 0.5, out));
    return 0.8;
  },

  /** Camera shutter: two clicks. */
  shutter(audio, t, out) {
    const ctx = audio.ctx;
    noise(audio, t, 0.03).connect(filter(ctx, 'bandpass', 3000, 1)).connect(env(ctx, t, 0.8, 0.03, 0.001)).connect(out);
    noise(audio, t + 0.09, 0.04).connect(filter(ctx, 'bandpass', 2200, 1)).connect(env(ctx, t + 0.09, 0.6, 0.04, 0.001)).connect(out);
    return 0.15;
  },
};

/** Helper for loops: a list of nodes to stop together. */
function group(nodes, extra = {}) {
  return { stop() { for (const n of nodes) { try { n.stop(); } catch { /* already */ } } }, ...extra };
}

export const LOOPS = {
  /** Rain: steady hiss + a softer low patter. */
  rain(audio, out) {
    const ctx = audio.ctx;
    const a = noise(audio, ctx.currentTime, 0, true);
    a.connect(filter(ctx, 'bandpass', 4200, 0.5)).connect(out);
    const b = noise(audio, ctx.currentTime, 0, true);
    const g = ctx.createGain();
    g.gain.value = 0.6;
    b.connect(filter(ctx, 'lowpass', 600)).connect(g).connect(out);
    return group([a, b]);
  },

  /** Crowd murmur: band-limited noise whose loudness and pitch wander like many voices. */
  crowd(audio, out) {
    const ctx = audio.ctx;
    const n = noise(audio, ctx.currentTime, 0, true);
    const bp = filter(ctx, 'bandpass', 500, 1.4);
    const g = ctx.createGain();
    g.gain.value = 0.6;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.7;
    const lg = ctx.createGain();
    lg.gain.value = 0.35;
    lfo.connect(lg).connect(g.gain);
    const lfo2 = ctx.createOscillator();
    lfo2.frequency.value = 0.23;
    const lg2 = ctx.createGain();
    lg2.gain.value = 160;
    lfo2.connect(lg2).connect(bp.frequency);
    n.connect(bp).connect(g).connect(out);
    lfo.start(); lfo2.start();
    return group([n, lfo, lfo2]);
  },

  /** Distant traffic: a low rumble. */
  trafficBed(audio, out) {
    const ctx = audio.ctx;
    const n = noise(audio, ctx.currentTime, 0, true);
    n.connect(filter(ctx, 'lowpass', 220)).connect(out);
    return group([n]);
  },

  /** Engine: two detuned saws through a low-pass; setRate() follows the speed. */
  engine(audio, out) {
    const ctx = audio.ctx;
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    o1.type = 'sawtooth'; o2.type = 'square';
    o1.frequency.value = 40; o2.frequency.value = 20.4;
    const lp = filter(ctx, 'lowpass', 500, 2);
    const g2 = ctx.createGain();
    g2.gain.value = 0.5;
    o1.connect(lp); o2.connect(g2).connect(lp);
    lp.connect(out);
    o1.start(); o2.start();
    return group([o1, o2], {
      setRate(hz, now) {
        o1.frequency.setTargetAtTime(hz, now, 0.08);
        o2.frequency.setTargetAtTime(hz * 0.51, now, 0.08);
        lp.frequency.setTargetAtTime(300 + hz * 7, now, 0.1);
      },
    });
  },

  /** Police siren: a sine sweeping up and down. */
  siren(audio, out) {
    const ctx = audio.ctx;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 800;
    const lfo = ctx.createOscillator();
    lfo.type = 'triangle';
    lfo.frequency.value = 0.45;
    const lg = ctx.createGain();
    lg.gain.value = 260;
    lfo.connect(lg).connect(o.frequency);
    o.connect(filter(ctx, 'lowpass', 2200)).connect(out);
    o.start(); lfo.start();
    return group([o, lfo]);
  },

  /** Diesel generator (load-shedding): a rough 50 Hz chug. */
  generator(audio, out) {
    const ctx = audio.ctx;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = 50;
    const am = ctx.createOscillator();
    am.frequency.value = 12.5;
    const ag = ctx.createGain();
    ag.gain.value = 0.4;
    const g = ctx.createGain();
    g.gain.value = 0.6;
    am.connect(ag).connect(g.gain);
    o.connect(filter(ctx, 'lowpass', 260)).connect(g).connect(out);
    o.start(); am.start();
    return group([o, am]);
  },

  /** Fire crackle: noise with random pops. */
  fire(audio, out) {
    const ctx = audio.ctx;
    const n = noise(audio, ctx.currentTime, 0, true);
    const g = ctx.createGain();
    g.gain.value = 0.5;
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 9;
    const lg = ctx.createGain();
    lg.gain.value = 0.4;
    lfo.connect(lg).connect(g.gain);
    n.connect(filter(ctx, 'bandpass', 1800, 0.8)).connect(g).connect(out);
    lfo.start();
    return group([n, lfo]);
  },
};
