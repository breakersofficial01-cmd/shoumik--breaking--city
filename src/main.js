// Boot sequence. Order matters:
//   settings files → save → strings → fonts → content (lessons) → 3D world → features → start
// Anything that fails here shows a friendly message on the loading screen.

import { config } from './core/config.js';
import { save } from './core/save.js';
import { debug, log } from './core/debug.js';
import { Game } from './core/game.js';
import { content } from './content/ContentService.js';
import { assets } from './assets/registry.js';
import { registerProceduralTextures } from './assets/proceduralTextures.js';
import { loadFonts } from './ui/fonts.js';
import { initI18n, setLanguage, getLanguage } from './ui/i18n.js';
import { loading } from './ui/loading.js';
import { registerServiceWorker } from './core/pwa.js';
import { account } from './core/account.js';
import { showSignIn } from './ui/signIn.js';

/** Phones: go fullscreen + landscape when the player taps Start (best effort). */
async function enterFullscreen() {
  if (!window.matchMedia('(pointer: coarse)').matches) return;
  try {
    await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
    await screen.orientation?.lock?.('landscape');
  } catch {
    /* not supported (e.g. iPhone Safari) — the rotate screen covers this case */
  }
}

/** Pause while a phone is held upright (the CSS shows the "rotate" screen). */
function watchOrientation(game) {
  const portrait = window.matchMedia('(orientation: portrait) and (pointer: coarse)');
  const apply = () => game.setPaused('portrait', portrait.matches);
  portrait.addEventListener('change', apply);
  apply();
}

/** Language of the save from before accounts existed (so the sign-in screen matches it). */
function oldSaveLanguage(gameCfg) {
  try { return JSON.parse(localStorage.getItem(gameCfg.saveKey) || '{}').settings?.language || null; } catch { return null; }
}

/**
 * Put the right save under the player's key before it is loaded:
 *  - the first account made on this phone takes over the old single-player save (owner's progress);
 *  - a sign-in that brought a save from the Google Sheet wins when it is newer than this phone's copy.
 */
function prepareSave(oldKey, key, signed) {
  try {
    if (signed?.adoptOldSave) {
      const old = localStorage.getItem(oldKey);
      if (old && !localStorage.getItem(key)) localStorage.setItem(key, old);
      if (!signed.test) account.markOldSaveAdopted(); // the test player only borrows it
    }
    if (signed?.save) {
      const remote = JSON.parse(signed.save);
      const local = JSON.parse(localStorage.getItem(key) || 'null');
      if (remote?.version && (!local || (remote.updatedAt || 0) > (local.updatedAt || 0))) localStorage.setItem(key, signed.save);
    }
  } catch (err) {
    log.warn('could not prepare the save', err);
  }
}

async function boot() {
  const started = performance.now();
  loading.set(0.03);

  // 1) The few files the loading screen and the sign-in screen need.
  await config.loadSome(['ui', 'strings', 'game', 'economy', 'sheet', 'accounts']);
  const ui = config.get('ui');
  const gameCfg = config.get('game');
  account.init(config.get('sheet'), config.get('accounts'));
  initI18n({ stringsCfg: config.get('strings'), uiCfg: ui, economyCfg: config.get('economy'), savedLanguage: account.language || oldSaveLanguage(gameCfg) });
  loading.set(0.08, 'loading.fonts');

  // 2) Fonts and the rest of the settings files, side by side.
  const settingsLoaded = config.loadAll();
  await loadFonts(ui).then(() => setLanguage(getLanguage(), true)); // re-apply so the UI picks up the loaded font

  // 2b) Session 9: who is playing? Every player has their own save (src/core/account.js).
  let signed = null;
  if (!account.current) {
    if (debug.flag('autostart') === '1') { await account.useTestAccount(); signed = { adoptOldSave: true, test: true }; } // test tools never wait here
    else signed = await showSignIn({ account, accountsCfg: config.get('accounts') });
  }
  const key = account.saveKey(gameCfg.saveKey);
  prepareSave(gameCfg.saveKey, key, signed);
  save.load(gameCfg, config.get('economy'), key);
  if (save.data.settings.language) setLanguage(save.data.settings.language, true);
  await settingsLoaded;
  assets.configure(config.get('assets'));
  registerProceduralTextures(assets);
  content.configureSheet(config.get('sheet'));

  // 3) Content (lessons) through the Content Service.
  loading.set(0.2, 'loading.content');
  await content.loadAll();

  // 4) The 3D world and all features.
  loading.set(0.25, 'loading.city');
  const game = new Game(document.getElementById('game'));
  game.account = account; // Session 9: who is playing (HUD name, profile card, sign out)
  await game.init((f) => loading.set(0.25 + f * 0.75));
  save.startAutosave(gameCfg.autosaveSeconds);
  account.startSync(save, game);
  watchOrientation(game);

  // 5) Ready. Wait for a tap (needed on phones for fullscreen and, later, sound).
  const wait = ui.loading.minMilliseconds - (performance.now() - started);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  loading.set(1, 'loading.ready');
  log.info(`boot took ${Math.round(performance.now() - started)} ms`);
  if (debug.flag('autostart') !== '1') {
    await loading.waitForStart();
    await enterFullscreen();
  }
  loading.hide();
  game.start();
  // 6) Offline play + install (Session 8). After the start so it never slows the first load.
  registerServiceWorker(config.get('pwa'));
}

boot().catch((err) => loading.fail(err));
