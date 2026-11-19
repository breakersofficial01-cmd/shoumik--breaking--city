// Feature: autoQuality (Session 8). Watches the real frame rate while the GAME chose the
// graphics quality (save.data.settings.qualityAuto) and steps down when the phone struggles:
//   High → Medium → Low, then on Low: lower picture resolution in small steps.
// Each step shows a short toast (data/strings.json → autoQuality.*). Picking a quality in
// Settings switches this off for good. Numbers: data/performance.json → watchdog.
// Emits: quality changes through game.setQuality(name, { auto: true }), toast:show.

import { log } from '../../core/debug.js';

let game = null;
let cfg = null;
let offs = [];
let warmup = 0;        // seconds of play to ignore before measuring
let frames = 0;
let elapsed = 0;       // real seconds measured in this sample
let last = 0;          // performance.now() of the previous update
let goodSamples = 0;

const active = () => game.save.data.settings.qualityAuto === true && game.autoQualityAllowed();

function restart(extraWarmup = 0) {
  frames = 0;
  elapsed = 0;
  last = 0;
  warmup = extraWarmup;
}

/** One sample finished: step down if the average FPS was too low. */
function judge(fps) {
  const w = cfg.watchdog;
  if (fps >= w.downgradeBelowFps) {
    goodSamples += 1;
    return;
  }
  const levels = Object.keys(game.config.get('quality').levels); // low, medium, high (in order)
  const i = levels.indexOf(game.qualityName);
  if (i > 0) {
    log.info(`autoQuality: ${fps.toFixed(1)} fps → ${levels[i - 1]}`);
    game.setQuality(levels[i - 1], { auto: true });
    game.events.emit('toast:show', { key: 'autoQuality.lowered' });
  } else {
    const scale = game.save.data.settings.resolutionScale || 1;
    const next = Math.round((scale - w.renderScaleStep) * 100) / 100;
    if (next < w.minRenderScale) { goodSamples = w.maxChecks; return; } // nothing left to lower
    log.info(`autoQuality: ${fps.toFixed(1)} fps on Low → resolution ×${next}`);
    game.setResolutionScale(next);
    game.events.emit('toast:show', { key: 'autoQuality.resolution' });
  }
  goodSamples = 0;
  restart(w.warmupSeconds / 2); // let the new settings settle before measuring again
}

export default {
  id: 'autoQuality',

  init(g) {
    game = g;
    cfg = g.config.get('performance');
    goodSamples = 0;
    restart(cfg.watchdog.warmupSeconds);
    offs = [
      // Menus, phone held upright, tab hidden: the gap must not count as a slow frame.
      g.events.on('game:paused', () => { last = 0; frames = 0; elapsed = 0; }),
      g.events.on('quality:changed', ({ auto }) => { if (!auto) goodSamples = cfg.watchdog.maxChecks; }),
    ];
  },

  update(dt) {
    if (goodSamples >= cfg.watchdog.maxChecks || !active()) return;
    if (warmup > 0) { warmup -= dt; return; }
    const now = performance.now();
    if (last) {
      const gap = (now - last) / 1000;
      if (gap > 1) { frames = 0; elapsed = 0; } // a hitch (e.g. a menu just closed): start over
      else { frames += 1; elapsed += gap; }
    }
    last = now;
    if (elapsed >= cfg.watchdog.sampleSeconds) {
      judge(frames / elapsed);
      frames = 0;
      elapsed = 0;
    }
  },

  dispose() {
    offs.forEach((off) => off());
    offs = [];
  },
};
