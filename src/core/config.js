// Loads the tunable-number files from /data (economy, world, districts, ui, ...).
// Game code reads them with:  config.get('economy').startCash
//
// NOTE: *content* (lessons, posters, ...) is NOT loaded here. Content always goes through
// src/content/ContentService.js so it can later come from a Google Sheet.
//
// To add a new data file: put data/<name>.json in place and add <name> to FILES below.

import { log } from './debug.js';

const FILES = [
  'game', 'ui', 'strings', 'features', 'economy', 'world', 'districts',
  'quality', 'controls', 'player', 'camera', 'assets', 'links', 'outfits', 'pedestrians', 'vehicles', 'traffic', 'landmarks', 'posterSlots', 'graphics', 'heroBuildings', 'shops', 'combat', 'police', 'weapons',
  'audio', 'dayNight', 'weather', 'radio', 'profile', 'signboards',
  'pwa', 'performance',
  'sheet', 'accounts', 'healthPacks', 'mapView',
  'street', 'streaming', 'terrain',
  'hotels', 'menu',
  'people', 'animals',
  'transit', 'boats',
];

const store = new Map();

async function fetchJson(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

export const config = {
  /**
   * Load every data file. Relative paths keep this working on GitHub Pages sub-paths.
   * @param {(done:number,total:number)=>void} onProgress
   */
  async loadAll(onProgress) {
    let done = 0;
    await Promise.all(FILES.map(async (name) => {
      store.set(name, await fetchJson(`data/${name}.json`));
      onProgress?.(++done, FILES.length);
    }));
    log.info('config loaded', FILES.join(', '));
  },

  /** Load only some files (used early for the loading screen). */
  async loadSome(names) {
    await Promise.all(names.map(async (name) => {
      if (!store.has(name)) store.set(name, await fetchJson(`data/${name}.json`));
    }));
  },

  /** Get a loaded data file by name (without .json). */
  get(name) {
    if (!store.has(name)) throw new Error(`config "${name}" is not loaded`);
    return store.get(name);
  },

  has: (name) => store.has(name),
};
