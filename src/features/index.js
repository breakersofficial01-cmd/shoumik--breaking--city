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
  // Roadmap 2 S5: stray dogs, cats, cows, goats, crows and ducks around Shoumik.
  animals: () => import('./animals/index.js'),
  posters: () => import('./posters/index.js'),
  metro: () => import('./metro/index.js'),
  // Roadmap 2 S6: ride buses (bus stops), the MRT (metro, above) and trains with passengers.
  railway: () => import('./railway/index.js'),
  buses: () => import('./buses/index.js'),
  // Roadmap 2 S7: drive boats on the lakes, river and sea; ride the Buriganga launch.
  boats: () => import('./boats/index.js'),
  ferry: () => import('./ferry/index.js'),
  entrances: () => import('./entrances/index.js'),
  classes: () => import('./classes/index.js'),
  shops: () => import('./shops/index.js'),
  // Session 9: health packs on the streets; the earn offer + class landing page.
  healthPacks: () => import('./healthPacks/index.js'),
  earn: () => import('./earn/index.js'),
  // Session 6: weapons in his hand, wanted stars + stats, the police, busted / jail / wasted.
  weapons: () => import('./weapons/index.js'),
  crime: () => import('./crime/index.js'),
  police: () => import('./police/index.js'),
  // Roadmap 2 S8: the cantonment, soldiers, army trucks and tanks (after police: uses its officer brain).
  army: () => import('./army/index.js'),
  jail: () => import('./jail/index.js'),
  // Session 7: time of day + load-shedding, monsoon rain, all sounds, radio, profile card,
  // reward codes, screenshots, the 17+ age screen.
  dayNight: () => import('./dayNight/index.js'),
  // Roadmap 2 S1: street lamps glow at night, light pools, a few real lights near the player.
  streetLights: () => import('./streetLights/index.js'),
  weather: () => import('./weather/index.js'),
  // Roadmap 2 S4: the three hotels — lobby, restaurant with a waiter, bar + dance lounge. After
  // dayNight + weather so its indoor light and no-rain-inside win.
  hotels: () => import('./hotels/index.js'),
  sound: () => import('./sound/index.js'),
  radio: () => import('./radio/index.js'),
  rewardCodes: () => import('./rewardCodes/index.js'),
  profileCard: () => import('./profileCard/index.js'),
  screenshot: () => import('./screenshot/index.js'),
  ageGate: () => import('./ageGate/index.js'),
  // Session 8: lowers the graphics quality by itself when the phone is too slow.
  autoQuality: () => import('./autoQuality/index.js'),
  // Roadmap 2 G1: downloads the rest (trains, guns, new areas) bit by bit while you play.
  streaming: () => import('./streaming/index.js'),
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
  // Roadmap 2 G1: download every feature's code AT ONCE (it used to be one after another, each
  // waiting for the previous download — seconds on mobile data), then start them in order.
  const modules = new Map();
  for (const [id, load] of Object.entries(LOADERS)) {
    if (flags[id] === true) modules.set(id, load().catch((err) => ({ error: err })));
  }
  for (const id of Object.keys(LOADERS)) {
    if (flags[id] !== true) {
      log.info(`feature "${id}" is switched off`);
      continue;
    }
    try {
      const mod = await modules.get(id);
      if (mod.error) throw mod.error;
      const feature = mod.default;
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
