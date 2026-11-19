// Feature registry (CLAUDE.md rule 3).
//
// A feature is a folder src/features/<id>/index.js that default-exports
//     { id, init(game), update(dt), dispose() }
// It is listed in LOADERS below and switched on/off in data/features.json.
//
// HOW TO ADD A FEATURE
//   1. Create src/features/<id>/index.js with the shape above.
//   2. Add one line to LOADERS (order = init/update order).
//   3. Add "<id>": true to data/features.json.
// Features must not import each other — use game.events (src/core/events.js).
//
// data/features.json may already list features from later sessions (vehicles, police...).
// Those are simply skipped until their folder exists.

import { log } from '../core/debug.js';

const LOADERS = {
  // traffic + vehicles run BEFORE the player: vehicles move first, then Shoumik is drawn on his seat.
  traffic: () => import('./traffic/index.js'),
  vehicles: () => import('./vehicles/index.js'),
  player: () => import('./player/index.js'),
  pedestrians: () => import('./pedestrians/index.js'),
  hotspots: () => import('./hotspots/index.js'),
  posters: () => import('./posters/index.js'),
  metro: () => import('./metro/index.js'),
  entrances: () => import('./entrances/index.js'),
  classes: () => import('./classes/index.js'),
  shops: () => import('./shops/index.js'),
  touchControls: () => import('./touchControls/index.js'),
  hud: () => import('./hud/index.js'),
  minimap: () => import('./minimap/index.js'),
  settings: () => import('./settings/index.js'),
};

export async function loadFeatures(game) {
  const flags = game.config.get('features');
  const active = [];
  const notBuilt = [];

  for (const id of Object.keys(flags)) {
    if (id.startsWith('_') || flags[id] !== true) continue;
    if (!LOADERS[id]) notBuilt.push(id);
  }
  for (const [id, load] of Object.entries(LOADERS)) {
    if (flags[id] !== true) {
      log.info(`feature "${id}" is switched off`);
      continue;
    }
    try {
      const feature = (await load()).default;
      await feature.init(game);
      active.push(feature);
    } catch (err) {
      // One broken feature must not stop the game from starting.
      log.error(`feature "${id}" failed to start`, err);
    }
  }
  log.info('features on:', active.map((f) => f.id).join(', '));
  if (notBuilt.length) log.info('features not built yet:', notBuilt.join(', '));

  return {
    list: active,
    get: (id) => active.find((f) => f.id === id) || null,
    update(dt) {
      for (const f of active) f.update(dt);
    },
    dispose() {
      for (const f of active.reverse()) f.dispose();
      active.length = 0;
    },
  };
}
