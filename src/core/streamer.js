// Streamer (Roadmap 2, G1): fast start + gradual loading. Settings: data/streaming.json.
//
//   1. BOOT    streamer.prefetchBoot(quality) — called by main.js the moment the settings are
//              loaded. Starts every download the start area needs at once, so they run while
//              the player signs in and while the city is built (before, each one waited for
//              the step before it). Nothing waits here: later `assets.load(id)` calls simply
//              get the same download (the registry shares one promise per id).
//   2. AFTER   streamer.update(dt, focus, fps) — called by the `streaming` feature every frame.
//      START   Downloads `afterStart` assets one or two at a time while the frame rate is fine,
//              and `areas` groups when Shoumik comes near them (new districts of Roadmap 2).
//              Sends `stream:loaded { group }` when a whole area group is ready.
//
// An id ending in '*' means every id in data/assets.json that starts with it.
// Debug: BC.streamer.report()

import { log } from './debug.js';
import { checkDevice } from './deviceCheck.js';

export class Streamer {
  /**
   * @param {import('../assets/registry.js').assets} assets
   * @param {object} cfg  data/streaming.json
   */
  constructor(assets, cfg) {
    this.assets = assets;
    this.cfg = cfg || { boot: [], afterStart: [], areas: [] };
    this.started = new Map();   // id -> 'loading' | 'done' | 'failed'
    this.queue = [];            // ids waiting for an idle moment
    this.running = 0;
    this.timer = 0;
    this.areasDone = new Set();
    this.events = null;
  }

  /** Expand one entry (wildcards, quality filter) into asset ids that have a file. */
  idsOf(entry, quality) {
    if (entry.qualities && quality && !entry.qualities.includes(quality)) return [];
    const all = Object.keys(this.assets.overrides || {});
    const ids = entry.id.endsWith('*') ? all.filter((k) => k.startsWith(entry.id.slice(0, -1))) : [entry.id];
    return ids.filter((id) => this.assets.url(id));
  }

  /** Start one download (no waiting). */
  start(id) {
    if (this.started.has(id)) return;
    this.started.set(id, 'loading');
    this.running++;
    this.assets.load(id)
      .then(() => this.started.set(id, 'done'), (err) => { this.started.set(id, 'failed'); log.warn(`stream: ${id} failed`, err?.message || err); })
      .finally(() => { this.running--; });
  }

  /**
   * Quality before the game exists (no save yet): ?quality=, else the weak-device check.
   * Used only to pick what to prefetch — a wrong guess just downloads a little more or less.
   */
  static guessQuality(qualityCfg, performanceCfg, flag) {
    if (flag && qualityCfg.levels[flag]) return flag;
    try {
      if (checkDevice(performanceCfg.weakDevice).weak) return 'low';
    } catch { /* unknown device: use the default */ }
    return qualityCfg.default;
  }

  /** Step 1: start every boot download at once. */
  prefetchBoot(quality) {
    const ids = (this.cfg.boot || []).flatMap((e) => this.idsOf(e, quality));
    for (const id of ids) this.start(id);
    log.info(`stream: boot prefetch for ${quality} — ${ids.length} files`);
    return ids.length;
  }

  /** Step 2 setup: what to fetch after the start (once the real quality is known). */
  afterStart(quality, events) {
    this.quality = quality;
    this.events = events;
    this.queue = (this.cfg.afterStart || []).flatMap((e) => this.idsOf(e, quality)).filter((id) => !this.started.has(id));
  }

  /**
   * @param {number} dt  @param {{x:number, z:number}} focus  @param {number} fps
   * @param {(col:number, row:number) => {x:number, z:number}} junction  grid → world
   */
  update(dt, focus, fps, junction) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = this.cfg.checkSeconds ?? 1;
    // Areas first: something the player is walking into matters more than warming the cache.
    for (const area of this.cfg.areas || []) {
      if (this.areasDone.has(area.id)) continue;
      const at = junction(area.at[0], area.at[1]);
      if (Math.hypot(at.x - focus.x, at.z - focus.z) > area.radius) continue;
      const ids = (area.assets || []).flatMap((e) => this.idsOf(typeof e === 'string' ? { id: e } : e, this.quality));
      for (const id of ids) this.start(id);
      if (ids.every((id) => this.started.get(id) === 'done' || this.started.get(id) === 'failed')) {
        this.areasDone.add(area.id);
        this.events?.emit('stream:loaded', { group: area.id });
      }
    }
    if (fps < (this.cfg.idleFps ?? 24)) return;
    while (this.queue.length && this.running < (this.cfg.maxParallel ?? 2)) this.start(this.queue.shift());
  }

  /** Debug summary. */
  report() {
    const count = (s) => [...this.started.values()].filter((v) => v === s).length;
    return { done: count('done'), loading: count('loading'), failed: count('failed'), waiting: this.queue.length };
  }
}
