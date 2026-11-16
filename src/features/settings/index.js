// Feature: settings (first small version). A gear button opens a panel where the player
// picks graphics quality Low / Medium / High. Session 7 adds the rest (sound, language,
// control size, Blood On/Off, reset save) to this same folder.
// The game is paused while the panel is open.

import { t, applyStrings } from '../../ui/i18n.js';

let game = null;
let button = null;
let panel = null;
let offs = [];

const GEAR = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="3.4"/><path d="M12 2.5v3M12 18.500v3M2.500 12h3M18.500 12h3M5.300 5.300l2.100 2.100M16.600 16.600l2.100 2.100M5.300 18.700l2.100-2.100M16.600 7.400l2.100-2.100"/></g></svg>';

function markActive() {
  panel.querySelectorAll('[data-quality]').forEach((b) => {
    b.classList.toggle('active', b.dataset.quality === game.qualityName);
  });
}

function open() {
  panel.hidden = false;
  markActive();
  game.setPaused('settings', true);
  document.exitPointerLock?.();
}

function close() {
  panel.hidden = true;
  game.setPaused('settings', false);
  game.save.flush();
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
    panel = document.createElement('div');
    panel.id = 'settings-panel';
    panel.className = 'overlay';
    panel.hidden = true;
    panel.innerHTML = `
      <div class="panel">
        <h2 data-i18n="settings.title"></h2>
        <div class="panel-row">
          <span class="panel-label" data-i18n="settings.quality"></span>
          <div class="segmented">
            ${levels.map((l) => `<button type="button" data-quality="${l}" data-i18n="settings.quality.${l}"></button>`).join('')}
          </div>
        </div>
        <p class="panel-note" data-i18n="settings.qualityNote"></p>
        <button type="button" class="panel-close" data-i18n="settings.close"></button>
      </div>`;
    applyStrings(panel);
    button.setAttribute('aria-label', t('settings.title'));
    g.ui.appendChild(panel);

    panel.addEventListener('click', (e) => {
      const q = e.target.closest('[data-quality]');
      if (q) {
        g.setQuality(q.dataset.quality);
        markActive();
      } else if (e.target.closest('.panel-close') || e.target === panel) {
        close();
      }
    });
    offs = [g.events.on('language:changed', () => applyStrings(panel))];
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
