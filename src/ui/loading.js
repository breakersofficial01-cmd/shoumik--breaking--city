// Loading screen controller. The HTML lives in index.html (#loading) so something shows
// before any script has run. Text comes from data/strings.json once it is loaded.

import { t } from './i18n.js';

const el = () => document.getElementById('loading');

export const loading = {
  /** @param {number} fraction 0..1   @param {string} [statusKey] strings.json key */
  set(fraction, statusKey) {
    const bar = document.getElementById('loading-bar-fill');
    if (bar) bar.style.width = `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%`;
    if (statusKey) {
      const status = document.getElementById('loading-status');
      if (status) {
        status.dataset.i18n = statusKey;
        status.textContent = t(statusKey);
      }
    }
  },

  /** Show the "Tap to start" button and resolve when the player taps it. */
  waitForStart() {
    return new Promise((resolve) => {
      const btn = document.getElementById('loading-start');
      document.getElementById('loading-bar').hidden = true;
      btn.hidden = false;
      btn.addEventListener('click', () => resolve(), { once: true });
    });
  },

  hide() {
    const node = el();
    if (!node) return;
    node.classList.add('fade-out');
    setTimeout(() => node.remove(), 500);
  },

  /** Fatal boot error: keep the screen up and tell the player what to do. */
  fail(err) {
    const status = document.getElementById('loading-status');
    if (status) {
      delete status.dataset.i18n;
      const msg = t('loading.error');
      status.textContent = msg === 'loading.error' ? 'Could not load the game. Please reload.' : msg;
      status.classList.add('error');
    }
    console.error('[BC] boot failed', err);
  },
};
