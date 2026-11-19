// Installable app + offline play (Session 8). Page side of sw.js.
//
//   registerServiceWorker(pwaCfg)  -> called once by main.js after the game has loaded
//   pwa.canInstall()               -> true when Chrome/Edge offered "install" (Android, PC)
//   pwa.install()                  -> shows the browser's install dialog
//   pwa.isIOS() / pwa.installed()  -> iPhone needs "Share → Add to Home Screen" instead
//   event 'pwa:installable' { can } when the install offer appears or goes away
//
// The service worker URL carries data/pwa.json (sw.js?cfg=...), so editing that file is all it
// takes to change caching; browsers then update the worker by themselves.
// Skipped when: the browser has no service workers, data/pwa.json → register is false,
// the URL has ?sw=0, or an automated test browser runs the game (unless ?sw=1), so the test
// tools keep serving three.js from their local copy.

import { events } from './events.js';
import { debug, log } from './debug.js';

let offer = null; // the saved 'beforeinstallprompt' event

// Listen right away (this module is imported at boot): the browser may offer the install early.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); // we show our own button in Settings instead of the browser's mini bar
  offer = e;
  events.emit('pwa:installable', { can: true });
});
window.addEventListener('appinstalled', () => {
  offer = null;
  events.emit('pwa:installable', { can: false });
  log.info('app installed');
});

export const pwa = {
  canInstall: () => offer !== null,
  async install() {
    if (!offer) return false;
    const e = offer;
    offer = null;
    e.prompt();
    const choice = await e.userChoice.catch(() => null);
    events.emit('pwa:installable', { can: false });
    return choice?.outcome === 'accepted';
  },
  installed: () => window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || navigator.standalone === true,
  isIOS: () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
};

/** @param {object} cfg data/pwa.json */
export async function registerServiceWorker(cfg) {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return null;
  const flag = debug.flag('sw');
  if (cfg.register === false || flag === '0') return null;
  if (navigator.webdriver && flag !== '1') return null;
  const { _comment, ...settings } = cfg;
  try {
    // Relative URL: works under the GitHub Pages sub-path. Scope = the game folder.
    const reg = await navigator.serviceWorker.register(`sw.js?cfg=${encodeURIComponent(JSON.stringify(settings))}`, { scope: './' });
    log.info('service worker registered', reg.scope);
    return reg;
  } catch (err) {
    log.warn('service worker could not be registered (the game still works online)', err.message);
    return null;
  }
}
