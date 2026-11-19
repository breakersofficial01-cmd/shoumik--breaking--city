// Feature: radio (Session 7). Vehicles with a radio (not rickshaws / bicycles, data/radio.json →
// noRadio) play one of 3 stations while Shoumik is inside. Music is made in code (./music.js)
// unless the station lists sound files (tracks = asset ids). The DJ "talks" now and then: a line
// in Bangla or English (game language) slides in at the top of the screen.
// R key / the 📻 touch button (only shown while driving) = next station → … → off.
// The chosen station is saved (save.data.settings.radio, -1 = off).
//
// Listens: vehicle:entered, vehicle:exited, input:radio, language:changed
// Sends:   radio:changed { station }   (-1 = off)

import { pickName, t } from '../../ui/i18n.js';
import { RadioMusic } from './music.js';
import { log } from '../../core/debug.js';

let game = null;
let cfg = null;
let offs = [];
let banner = null;
let bannerTimer = null;
let music = null;      // RadioMusic or a file player { stop() }
let out = null;        // GainNode of the station playing now
let inRadioVehicle = false;
let djIn = 0;
const rand = ([a, b]) => a + Math.random() * (b - a);

const station = () => game.save.data.settings.radio ?? 0;

function show(text) {
  banner.innerHTML = '';
  const icon = document.createElement('b');
  icon.textContent = '📻 ';
  const span = document.createElement('span');
  span.textContent = text;
  banner.append(icon, span);
  banner.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => banner.classList.remove('show'), cfg.djShowSeconds * 1000);
}

/** Play a station's sound files one after another (when data/radio.json lists tracks). */
function filePlayer(ctx, dest, ids) {
  let stopped = false, src = null, i = Math.floor(Math.random() * ids.length);
  const next = async () => {
    if (stopped) return;
    try {
      const data = await game.assets.load(ids[i % ids.length]);
      const buf = await ctx.decodeAudioData(data.slice ? data.slice(0) : data);
      if (stopped) return;
      src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(dest);
      src.onended = () => { i++; next(); };
      src.start();
    } catch (err) {
      log.warn('radio: track could not be played', err);
    }
  };
  next();
  return { stop() { stopped = true; try { src?.stop(); } catch { /* done */ } } };
}

function stopMusic() {
  music?.stop();
  music = null;
  if (out) {
    const o = out;
    const ctx = game.audio.ctx;
    o.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
    setTimeout(() => o.disconnect(), 800);
    out = null;
  }
}

function startMusic() {
  stopMusic();
  const i = station();
  const st = cfg.stations[i];
  const ctx = game.audio?.ensure();
  if (!st || !ctx) return;
  out = ctx.createGain();
  out.gain.value = 0;
  out.gain.setTargetAtTime(1, ctx.currentTime, 0.3);
  out.connect(game.audio.bus('music'));
  const tracks = (st.tracks || []).filter((id) => game.assets.url(id));
  music = tracks.length ? filePlayer(ctx, out, tracks) : new RadioMusic(ctx, out, st, game.audio.noise);
  djIn = rand(cfg.djEverySeconds) * 0.5;
}

function announce() {
  const st = cfg.stations[station()];
  show(st ? pickName(st.name) : t('radio.off'));
}

function setStation(i) {
  game.save.data.settings.radio = i;
  if (inRadioVehicle) {
    if (i >= 0) startMusic(); else stopMusic();
    announce();
  }
  game.events.emit('radio:changed', { station: i });
}

function hasRadio(type) {
  const T = game.config.get('vehicles').types[type];
  return !!T && !cfg.noRadio.includes(T.style);
}

export default {
  id: 'radio',

  init(g) {
    game = g;
    cfg = g.config.get('radio');
    banner = document.createElement('div');
    banner.className = 'radio-banner';
    g.ui.appendChild(banner);
    offs = [
      g.events.on('vehicle:entered', ({ type }) => {
        inRadioVehicle = hasRadio(type);
        g.events.emit('radio:available', { on: inRadioVehicle });
        if (!inRadioVehicle) return;
        if (station() >= 0) startMusic();
        announce();
      }),
      g.events.on('vehicle:exited', () => {
        inRadioVehicle = false;
        g.events.emit('radio:available', { on: false });
        stopMusic();
        banner.classList.remove('show');
      }),
      g.events.on('input:radio', () => {
        if (!inRadioVehicle) return;
        const n = cfg.stations.length;
        const cur = station();
        setStation(cur + 1 >= n ? -1 : cur + 1);
      }),
      g.events.on('radio:set', ({ station: i }) => setStation(i)),
    ];
  },

  update(dt) {
    if (!music || !inRadioVehicle) return;
    djIn -= dt;
    if (djIn <= 0) {
      djIn = rand(cfg.djEverySeconds);
      const st = cfg.stations[station()];
      const line = st?.dj?.[Math.floor(Math.random() * st.dj.length)];
      if (line) show(`${pickName(st.name)} — ${pickName(line)}`);
    }
  },

  dispose() {
    offs.forEach((off) => off());
    offs = [];
    stopMusic();
    clearTimeout(bannerTimer);
    banner?.remove();
  },
};
