// Versioned save in localStorage, with migrations (CLAUDE.md "Save").
//
//   save.load()              -> reads + migrates (call once at boot)
//   save.data                -> the live save object; change it freely
//   save.flush()             -> write now
//   save.startAutosave(sec)  -> write every N seconds and when the tab is hidden
//
// HOW TO CHANGE THE SAVE FORMAT (never break old saves):
//   1. Bump SAVE_VERSION.
//   2. Add a migration to MIGRATIONS keyed by the OLD version that upgrades the object.
//   3. Add the new field to defaults() too.

import { events } from './events.js';
import { log } from './debug.js';

export const SAVE_VERSION = 2;

/** MIGRATIONS[n] upgrades a save from version n to n+1. */
const MIGRATIONS = {
  // Version 0 = pre-release test saves that only had { cash }.
  0: (old) => ({ ...defaults({ startCash: old.cash ?? 500 }), cash: old.cash ?? 500 }),
  // Version 2 (Session 2) added the outfit Shoumik is wearing.
  1: (old) => ({ ...old, outfit: null }),
};

function defaults({ startCash = 500 } = {}) {
  return {
    version: SAVE_VERSION,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    cash: startCash,
    player: null,                     // { x, z, heading } once the player has moved
    outfit: null,                     // id from data/outfits.json (null = the default outfit)
    settings: { quality: null, language: null, blood: true },
    lessons: {},                      // lessonId -> result (Session 5)
    owned: { vehicles: [], homes: [], weapons: [], outfits: [] },
    stats: {},
    flags: {},                        // misc one-off flags (age gate etc.)
  };
}

class SaveStore {
  constructor() {
    this.key = 'breakingCity.save';
    this.data = defaults();
    this.memoryOnly = false;          // true when localStorage is blocked (private mode)
    this.timer = null;
    this.beforeSave = [];             // callbacks that copy live state into save.data
  }

  /** @param {{saveKey:string}} gameCfg  @param {{startCash:number}} economyCfg */
  load(gameCfg, economyCfg) {
    this.key = gameCfg.saveKey || this.key;
    const fresh = defaults(economyCfg);
    let raw = null;
    try {
      raw = localStorage.getItem(this.key);
    } catch (err) {
      this.memoryOnly = true;
      log.warn('localStorage unavailable, progress will not be kept', err);
    }
    if (!raw) {
      this.data = fresh;
      return this.data;
    }
    try {
      let obj = JSON.parse(raw);
      let v = Number.isInteger(obj.version) ? obj.version : 0;
      if (v > SAVE_VERSION) throw new Error(`save v${v} is newer than the game (v${SAVE_VERSION})`);
      while (v < SAVE_VERSION) {
        if (!MIGRATIONS[v]) throw new Error(`no migration from v${v}`);
        obj = MIGRATIONS[v](obj);
        obj.version = ++v;
        log.info('save migrated to v' + v);
      }
      // Fill in any missing fields so later code can rely on them.
      this.data = { ...fresh, ...obj, settings: { ...fresh.settings, ...obj.settings }, owned: { ...fresh.owned, ...obj.owned } };
    } catch (err) {
      log.warn('save was unreadable, keeping a backup and starting fresh', err);
      try { localStorage.setItem(this.key + '.broken', raw); } catch { /* ignore */ }
      this.data = fresh;
    }
    return this.data;
  }

  /** Register a function that runs right before each save (e.g. store player position). */
  onBeforeSave(fn) {
    this.beforeSave.push(fn);
  }

  flush() {
    for (const fn of this.beforeSave) {
      try { fn(this.data); } catch (err) { log.error('beforeSave failed', err); }
    }
    this.data.updatedAt = Date.now();
    if (this.memoryOnly) return false;
    try {
      localStorage.setItem(this.key, JSON.stringify(this.data));
      events.emit('save:written', { at: this.data.updatedAt });
      return true;
    } catch (err) {
      log.warn('could not write save', err);
      return false;
    }
  }

  startAutosave(seconds) {
    this.stopAutosave();
    this.timer = setInterval(() => this.flush(), Math.max(5, seconds) * 1000);
    this._onHide = () => { if (document.visibilityState === 'hidden') this.flush(); };
    this._onPageHide = () => this.flush();
    document.addEventListener('visibilitychange', this._onHide);
    window.addEventListener('pagehide', this._onPageHide);
  }

  stopAutosave() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    document.removeEventListener('visibilitychange', this._onHide);
    window.removeEventListener('pagehide', this._onPageHide);
  }

  /** Wipe progress (used by Settings → reset save in a later session). */
  reset(economyCfg) {
    this.data = defaults(economyCfg);
    this.flush();
    events.emit('save:reset', {});
  }
}

export const save = new SaveStore();
