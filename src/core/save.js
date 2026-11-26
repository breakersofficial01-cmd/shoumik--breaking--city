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

export const SAVE_VERSION = 5;

/** MIGRATIONS[n] upgrades a save from version n to n+1. */
const MIGRATIONS = {
  // Version 0 = pre-release test saves that only had { cash }.
  0: (old) => ({ ...defaults({ startCash: old.cash ?? 500 }), cash: old.cash ?? 500 }),
  // Version 2 (Session 2) added the outfit Shoumik is wearing.
  1: (old) => ({ ...old, outfit: null }),
  // Version 3 (Session 5) added health, the home Shoumik lives in, its garage and class
  // progress. Outfits that became shop items are kept by players who were wearing them.
  2: (old) => {
    const outfits = old.owned?.outfits || [];
    if (old.outfit && !outfits.includes(old.outfit)) outfits.push(old.outfit);
    return { ...old, health: null, home: null, garage: null, classes: {}, owned: { ...old.owned, outfits } };
  },
  // Version 4 (Session 6) added bullets, the weapon in his hand, armour, the wanted level
  // and the jail. Guns bought in Session 5 have no ammo entry yet: the weapons feature gives
  // them their starting ammo (data/weapons.json → startAmmo).
  3: (old) => ({ ...old, ammo: {}, weapon: null, armour: 0, wanted: null, jail: null, stats: old.stats || {} }),
  // Version 5 (Session 7) added the time of day, unlocked reward codes and the sound /
  // controls settings (filled in from defaults() by load()).
  4: (old) => ({ ...old, clock: null, rewards: {}, playSeconds: old.playSeconds || 0 }),
};

function defaults({ startCash = 500, starter = null } = {}) {
  // Session 9: a new player starts with data/economy.json → starter (a pistol + 30 bullets in hand).
  const gun = starter?.weapon || null;
  return {
    version: SAVE_VERSION,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    cash: startCash,
    player: null,                     // { x, z, heading } once the player has moved
    outfit: null,                     // id from data/outfits.json (null = the default outfit)
    settings: {
      quality: null, language: null, blood: true,
      qualityAuto: false,             // Session 8: true while the game (not the player) picked the quality
      resolutionScale: 1,             // Session 8: < 1 when the autoQuality watchdog lowered the resolution on Low
      sound: true,                    // Session 7: all sound on/off
      volume: { master: 0.8, sfx: 1, music: 0.7, ambience: 0.8 }, // 0..1 each (data/audio.json → buses)
      controlSize: 'normal',          // touch buttons: small | normal | large (data/controls.json → touch.sizes)
      controlLayout: 'right',         // right = buttons on the right; left = mirrored for left-handed players
      radio: 0,                       // last radio station index (-1 = off)
    },
    clock: null,                      // Session 7: time of day in hours (0-24); null = data/dayNight.json → startHour
    rewards: {},                      // reward code id -> unlocked at (ms)
    playSeconds: 0,                   // total time played (profile card)
    health: null,                     // Shoumik's health (null = full, data/player.json → health)
    home: null,                       // { id, x, z, heading } the home he sleeps in (shops feature)
    garage: null,                     // { col, row, dir } where owned vehicles park (null = data/vehicles.json → garage)
    lessons: {},                      // lessonId -> { attempts, paid: [questionIds], earned, best, lastAt }
    classes: {},                      // Quiz Class: { lastDay, rounds, earned, bestStreak }
    owned: { vehicles: [], homes: [], weapons: gun ? [gun] : [], outfits: [], boats: [] }, // boats: Roadmap 2 S7 ([{ type }])
    ammo: gun ? { [gun]: starter.ammo || 0 } : {}, // weapon id -> bullets (molotovs: bottles)
    weapon: gun,                     // weapon id in his hand (null = fists)
    armour: 0,                        // body armour points (data/combat.json → player.armourMax)
    wanted: null,                     // { heat } — a chase goes on after a reload
    jail: null,                       // { owed, paid } while he studies his way out of jail
    stats: {},                        // kills, policeKilled, carsDestroyed, longestChase, busted, wasted, shotsFired
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
  load(gameCfg, economyCfg, key = null) {
    // Session 9: every account has its own key ("<saveKey>.<phone>", src/core/account.js).
    this.key = key || gameCfg.saveKey || this.key;
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
      this.isNew = true;              // Session 9: a brand-new player (tutorial hints)
      return this.data;
    }
    this.isNew = false;
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
      this.data = { ...fresh, ...obj, settings: { ...fresh.settings, ...obj.settings, volume: { ...fresh.settings.volume, ...obj.settings?.volume } }, owned: { ...fresh.owned, ...obj.owned }, classes: { ...obj.classes } };
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

  /**
   * Settings → Reset save: delete the saved game and block every later write (the page is
   * reloaded right after, so the live state of features cannot write the old game back).
   * Keeps the age confirmation, language and sound settings so a reset does not ask again.
   */
  wipe(economyCfg) {
    this.stopAutosave();
    const keep = { settings: { ...this.data.settings }, flags: { ageOk: this.data.flags?.ageOk } };
    this.data = { ...defaults(economyCfg), ...keep };
    this.beforeSave = [];
    try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch { /* ignore */ }
    this.memoryOnly = true; // no more writes until the reload
  }

  /** Wipe progress in place (kept for tools; Settings uses wipe() + reload). */
  reset(economyCfg) {
    this.data = defaults(economyCfg);
    this.flush();
    events.emit('save:reset', {});
  }
}

export const save = new SaveStore();
