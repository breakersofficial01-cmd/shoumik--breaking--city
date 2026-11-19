// Feature: settings. A gear button opens a panel (the game is paused while it is open):
//   Graphics quality Low / Medium / High           → game.setQuality()
//   Sound on/off + volume sliders (all, effects, music/radio, city sounds)  (Session 7)
//                                                   → save.data.settings.sound / volume, game.audio.applySettings()
//   Language বাংলা / English                        → setLanguage() (language:changed)  (Session 7)
//   Control size small / normal / large + left-handed layout → settings:controls  (Session 7)
//   Blood On/Off                                    → settings:blood { on }  (Session 6)
//   Shoumik's outfit                                → outfit:set { id } (player answers outfit:changed)
//   Reset save (asks twice)                         → save.wipe() + reload  (Session 7)
// Everything is saved in save.data.settings. Texts: data/strings.json → settings.*.

import { t, applyStrings, pickName, setLanguage, getLanguage } from '../../ui/i18n.js';

let game = null;
let button = null;
let panel = null;
let offs = [];
let resetArmed = false;

const GEAR = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="3.4"/><path d="M12 2.5v3M12 18.500v3M2.500 12h3M18.500 12h3M5.300 5.300l2.100 2.100M16.600 16.600l2.100 2.100M5.300 18.700l2.100-2.100M16.600 7.400l2.100-2.100"/></g></svg>';
const VOLUMES = ['master', 'sfx', 'music', 'ambience'];

/** A row of on/off-style choice buttons: data-<attr>="value". */
const segmented = (attr, values, keyOf) => `<div class="segmented">${values.map((v) => `<button type="button" data-${attr}="${v}" data-i18n="${keyOf(v)}"></button>`).join('')}</div>`;
const row = (labelKey, inner, stack = false) => `<div class="panel-row${stack ? ' panel-row-stack' : ''}"><span class="panel-label" data-i18n="${labelKey}"></span>${inner}</div>`;

function markActive() {
  const st = game.save.data.settings;
  const on = (sel, test) => panel.querySelectorAll(sel).forEach((b) => b.classList.toggle('active', test(b)));
  on('[data-quality]', (b) => b.dataset.quality === game.qualityName);
  on('[data-outfit]', (b) => b.dataset.outfit === game.player?.outfit);
  on('[data-blood]', (b) => (b.dataset.blood === 'on') === (st.blood !== false));
  on('[data-sound]', (b) => (b.dataset.sound === 'on') === (st.sound !== false));
  on('[data-lang]', (b) => b.dataset.lang === getLanguage());
  on('[data-size]', (b) => b.dataset.size === (st.controlSize || 'normal'));
  on('[data-layout]', (b) => b.dataset.layout === (st.controlLayout || 'right'));
  for (const v of VOLUMES) {
    const input = panel.querySelector(`[data-volume="${v}"]`);
    if (input) input.value = Math.round((st.volume?.[v] ?? 1) * 100);
  }
  panel.querySelector('.volumes').classList.toggle('muted', st.sound === false);
  const reset = panel.querySelector('[data-reset]');
  reset.textContent = t(resetArmed ? 'settings.resetConfirm' : 'settings.reset');
  reset.classList.toggle('armed', resetArmed);
}

function open() {
  panel.hidden = false;
  resetArmed = false;
  markActive();
  game.setPaused('settings', true);
  document.exitPointerLock?.();
}

function close() {
  panel.hidden = true;
  game.setPaused('settings', false);
  game.save.flush();
}

function soundChanged() {
  game.audio?.applySettings();
  markActive();
}

export default {
  id: 'settings',

  init(g) {
    game = g;
    button = document.createElement('button');
    button.id = 'settings-button';
    button.type = 'button';
    button.innerHTML = GEAR;
    button.addEventListener('click', open);
    g.ui.appendChild(button);

    const levels = Object.keys(g.config.get('quality').levels);
    const sizes = Object.keys(g.config.get('controls').touch.sizes || { normal: 1 }).filter((k) => !k.startsWith('_'));
    // Free outfits + the ones bought in the clothes shop (rebuilt on outfit:owned).
    const wearable = () => g.config.get('outfits').outfits.filter((o) => o.unlocked === true || g.save.data.owned.outfits.includes(o.id));
    let outfits = wearable();
    panel = document.createElement('div');
    panel.id = 'settings-panel';
    panel.className = 'overlay';
    panel.hidden = true;
    panel.innerHTML = `
      <div class="panel">
        <h2 data-i18n="settings.title"></h2>
        ${row('settings.quality', segmented('quality', levels, (l) => `settings.quality.${l}`))}
        <p class="panel-note" data-i18n="settings.qualityNote"></p>
        ${row('settings.sound', segmented('sound', ['on', 'off'], (v) => `settings.${v}`))}
        <div class="volumes">
          ${VOLUMES.map((v) => `<label class="volume"><span data-i18n="settings.volume.${v}"></span><input type="range" min="0" max="100" step="5" data-volume="${v}"></label>`).join('')}
        </div>
        ${row('settings.language', '<div class="segmented"><button type="button" data-lang="bn">বাংলা</button><button type="button" data-lang="en">English</button></div>')}
        ${row('settings.controlSize', segmented('size', sizes, (v) => `settings.size.${v}`))}
        ${row('settings.controlLayout', segmented('layout', ['right', 'left'], (v) => `settings.layout.${v}`))}
        ${row('settings.blood', segmented('blood', ['on', 'off'], (v) => `settings.${v}`))}
        ${row('settings.outfit', '<div class="choices"></div>', true)}
        <div class="panel-row panel-row-stack">
          <button type="button" class="panel-danger" data-reset></button>
          <p class="panel-note" data-i18n="settings.resetNote"></p>
        </div>
        <button type="button" class="panel-close" data-i18n="settings.close"></button>
      </div>`;
    const nameOutfits = () => {
      outfits = wearable();
      panel.querySelector('.choices').innerHTML = outfits.map((o) => `<button type="button" data-outfit="${o.id}"></button>`).join('');
      panel.querySelectorAll('[data-outfit]').forEach((b) => {
        b.textContent = pickName(outfits.find((o) => o.id === b.dataset.outfit)?.name);
      });
    };
    applyStrings(panel);
    nameOutfits();
    button.setAttribute('aria-label', t('settings.title'));
    g.ui.appendChild(panel);

    const st = () => g.save.data.settings;
    panel.addEventListener('input', (e) => {
      const v = e.target.closest('[data-volume]');
      if (!v) return;
      st().volume = { ...st().volume, [v.dataset.volume]: Number(v.value) / 100 };
      g.audio?.applySettings();
    });
    panel.addEventListener('click', (e) => {
      const pick = (attr) => e.target.closest(`[data-${attr}]`);
      let b;
      if ((b = pick('reset'))) {
        if (!resetArmed) { resetArmed = true; markActive(); return; }
        g.save.wipe(g.config.get('economy'));
        window.location.reload();
        return;
      }
      resetArmed = false;
      if ((b = pick('blood'))) {
        const on = b.dataset.blood === 'on';
        st().blood = on;
        g.events.emit('settings:blood', { on });
      } else if ((b = pick('sound'))) {
        st().sound = b.dataset.sound === 'on';
        soundChanged();
        if (st().sound) g.audio?.play('click');
      } else if ((b = pick('lang'))) {
        st().language = b.dataset.lang;
        setLanguage(b.dataset.lang);
      } else if ((b = pick('size'))) {
        st().controlSize = b.dataset.size;
        g.events.emit('settings:controls', {});
      } else if ((b = pick('layout'))) {
        st().controlLayout = b.dataset.layout;
        g.events.emit('settings:controls', {});
      } else if ((b = pick('outfit'))) {
        g.events.emit('outfit:set', { id: b.dataset.outfit });
      } else if ((b = pick('quality'))) {
        g.setQuality(b.dataset.quality);
      } else if (e.target.closest('.panel-close') || e.target === panel) {
        close();
        return;
      }
      markActive();
    });
    offs = [
      g.events.on('language:changed', () => { applyStrings(panel); nameOutfits(); button.setAttribute('aria-label', t('settings.title')); if (!panel.hidden) markActive(); }),
      g.events.on('outfit:owned', nameOutfits),
    ];
  },

  update() {},

  dispose() {
    offs.forEach((off) => off());
    offs = [];
    button?.remove();
    panel?.remove();
    button = panel = null;
  },
};
