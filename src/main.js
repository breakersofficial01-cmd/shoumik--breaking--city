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

async function boot() {
  const started = performance.now();
  loading.set(0.03);

  // 1) The few files the loading screen itself needs, then the saved game.
  await config.loadSome(['ui', 'strings', 'game', 'economy']);
  const ui = config.get('ui');
  save.load(config.get('game'), config.get('economy'));
  initI18n({ stringsCfg: config.get('strings'), uiCfg: ui, economyCfg: config.get('economy'), savedLanguage: save.data.settings.language });
  loading.set(0.08, 'loading.fonts');

  // 2) Fonts and the rest of the settings files, side by side.
  await Promise.all([
    loadFonts(ui).then(() => setLanguage(getLanguage(), true)), // re-apply so the UI picks up the loaded font
    config.loadAll(),
  ]);
  assets.configure(config.get('assets'));
  registerProceduralTextures(assets);

  // 3) Content (lessons) through the Content Service.
  loading.set(0.2, 'loading.content');
  await content.loadAll();

  // 4) The 3D world and all features.
  loading.set(0.25, 'loading.city');
  const game = new Game(document.getElementById('game'));
  await game.init((f) => loading.set(0.25 + f * 0.75));
  save.startAutosave(config.get('game').autosaveSeconds);
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
}

boot().catch((err) => loading.fail(err));
