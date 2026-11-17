// Content Service — the ONE door all game content comes through (CLAUDE.md rule 2).
// Game code asks:  content.get('lessons')   and never fetches content files itself.
//
// How a content type is loaded:
//   1. The local JSON (data/<type>.json) is always read first. It holds the `source` setting
//      and is the offline fallback.
//   2. If source.type names a remote adapter (e.g. "googleSheet"), that adapter is tried:
//      fresh cache -> network -> stale cache -> local JSON. Any error just moves down the list.
//   3. The result goes through the type's schema validator. Bad rows are skipped and
//      listed in the report (shown by the admin check in Session 5).
//
// To add a content type (e.g. posters): write a validator in validators.js and call
// content.registerType('posters', { localPath: 'data/posters.json', validate: validatePosters }).

import { log } from '../core/debug.js';
import { events } from '../core/events.js';
import { LocalJsonAdapter } from './adapters/LocalJsonAdapter.js';
import { GoogleSheetCsvAdapter } from './adapters/GoogleSheetCsvAdapter.js';
import { validateLessons, validatePlaces } from './validators.js';

const CACHE_PREFIX = 'breakingCity.content.';

class ContentService {
  constructor() {
    this.adapters = new Map();
    this.types = new Map();
    this.loaded = new Map();   // type -> { items, defaults, report }
    this.registerAdapter(new LocalJsonAdapter());
    this.registerAdapter(new GoogleSheetCsvAdapter());
    this.registerType('lessons', { localPath: 'data/lessons.json', validate: validateLessons });
    // Places are needed while the city is laid out (landmark plots), so they load at boot too.
    this.registerType('places', { localPath: 'data/places.json', validate: validatePlaces });
  }

  registerAdapter(adapter) {
    this.adapters.set(adapter.id, adapter);
  }

  /** @param {string} name  @param {{localPath:string, validate:(raw:any)=>{items:any[],defaults?:object,skipped:any[]}}} def */
  registerType(name, def) {
    this.types.set(name, { name, ...def });
  }

  readCache(type) {
    try {
      const raw = localStorage.getItem(CACHE_PREFIX + type);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  writeCache(type, sourceKey, data) {
    try {
      localStorage.setItem(CACHE_PREFIX + type, JSON.stringify({ savedAt: Date.now(), sourceKey, data }));
    } catch (err) {
      log.warn('content cache not written', err);
    }
  }

  /** Try the remote adapter. Returns { raw, source } or null to fall back to local. */
  async loadRemote(typeDef, source) {
    const adapter = this.adapters.get(source.type);
    const cfg = source[source.type] || {};
    if (!adapter) {
      log.warn(`content "${typeDef.name}": unknown source "${source.type}", using local file`);
      return null;
    }
    const sourceKey = JSON.stringify(cfg);
    const cache = this.readCache(typeDef.name);
    const cacheOk = cache && cache.sourceKey === sourceKey;
    const maxAge = (cfg.refreshMinutes ?? 60) * 60000;
    if (cacheOk && Date.now() - cache.savedAt < maxAge) {
      return { raw: cache.data, source: `${adapter.id} (cached)` };
    }
    try {
      const raw = await adapter.load(typeDef, cfg);
      this.writeCache(typeDef.name, sourceKey, raw);
      return { raw, source: adapter.id };
    } catch (err) {
      log.warn(`content "${typeDef.name}": ${adapter.id} failed (${err.message})`);
      if (cacheOk) return { raw: cache.data, source: `${adapter.id} (old cache, offline)` };
      return null;
    }
  }

  /** Load one content type. Never throws for bad content; only if the local file is missing. */
  async load(type) {
    const typeDef = this.types.get(type);
    if (!typeDef) throw new Error(`unknown content type "${type}"`);

    const local = await this.adapters.get('local').load(typeDef);
    let raw = local;
    let source = 'local';
    const wanted = local?.source?.type || 'local';
    if (wanted !== 'local') {
      const remote = await this.loadRemote(typeDef, local.source);
      if (remote) {
        // Remote data carries rows only; settings like `defaults` stay in the local file.
        raw = { ...local, ...remote.raw };
        source = remote.source;
      } else {
        source = 'local (fallback)';
      }
    }

    let result = typeDef.validate(raw);
    if (result.items.length === 0 && raw !== local) {
      log.warn(`content "${type}": remote data had no valid rows, using local file`);
      raw = local;
      source = 'local (fallback)';
      result = typeDef.validate(local);
    }
    const skipped = [...(result.skipped || []), ...(raw.extraSkipped || [])];
    for (const s of skipped) log.warn(`content "${type}": skipped ${s.id} — ${s.reason}`);

    const entry = {
      items: result.items,
      defaults: result.defaults || {},
      report: { type, source, loadedAt: Date.now(), count: result.items.length, skipped },
    };
    this.loaded.set(type, entry);
    log.info(`content "${type}": ${entry.report.count} loaded from ${source}, ${skipped.length} skipped`);
    events.emit('content:loaded', entry.report);
    return entry;
  }

  /** Load every registered type. A failing type is logged and left empty. */
  async loadAll() {
    for (const type of this.types.keys()) {
      try {
        await this.load(type);
      } catch (err) {
        log.error(`content "${type}" could not be loaded`, err);
        this.loaded.set(type, { items: [], defaults: {}, report: { type, source: 'none', loadedAt: Date.now(), count: 0, skipped: [{ id: '(file)', reason: err.message }] } });
      }
    }
  }

  /** Items of a loaded type (empty list if not loaded). */
  get(type) {
    return this.loaded.get(type)?.items || [];
  }

  /** Type-level settings from the local file (e.g. lessons defaults). */
  getDefaults(type) {
    return this.loaded.get(type)?.defaults || {};
  }

  /** What loaded, from where, and what was skipped (for the ?admin=1 check). */
  getReport(type) {
    return this.loaded.get(type)?.report || null;
  }
}

export const content = new ContentService();
