// Player accounts (Session 9). One account per Bangladeshi phone number, a 4-digit PIN, the
// player's name and class. Every account has its OWN save (localStorage key
// "<game.saveKey>.<phone>"), so several people can play on one phone.
//
// Where accounts live:
//   - on this device: localStorage "breakingCity.accounts" (only a salted SHA-256 hash of the PIN)
//   - in the shared Google Sheet, Players tab, through the Apps Script web app
//     (tools/sheets/Code.gs; link in data/sheet.json → apiUrl). The sheet checks that a phone
//     number is used only once, hashes the PIN with a secret pepper and keeps the progress
//     (cash, vehicles, weapons, homes, lessons + the whole save as JSON) so the player can sign
//     in on another phone. While apiUrl is empty accounts stay on this device only.
//
//   account.init(sheetCfg, accountsCfg)
//   account.current                 { phone, name, classLevel, remote } or null
//   await account.signUp({ phone, name, classLevel, pin })   → { ok, error? }
//   await account.signIn({ phone, pin })                      → { ok, error?, save? (JSON text) }
//   account.saveKey(base)           the localStorage key of the current player's save
//   account.startSync(save)         send progress to the sheet every sheet.syncSeconds (+ on close)
//   account.signOut()               forget who is playing (the page is reloaded after)
// Error codes: badPhone, badName, badClass, badPinFormat, pinMismatch, exists, notFound, badPin,
//              locked, offline, server  (texts: data/strings.json → account.error.<code>)

import { log } from './debug.js';

const STORE = 'breakingCity.accounts';

function readStore() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (s && typeof s === 'object' && s.list) return s;
  } catch { /* ignore */ }
  return { current: null, list: {}, adoptedOldSave: false, language: null };
}

function writeStore(s) {
  try { localStorage.setItem(STORE, JSON.stringify(s)); } catch (err) { log.warn('accounts not saved', err); }
}

/** 01XXXXXXXXX from +8801…, 8801…, 01…, Bangla digits too. '' when it is not a BD mobile number. */
export function normalizePhone(raw) {
  let d = String(raw || '').replace(/[০-৯]/g, (c) => String('০১২৩৪৫৬৭৮৯'.indexOf(c))).replace(/[\s-]/g, '').replace(/^\+/, '');
  if (/^8801[3-9]\d{8}$/.test(d)) d = d.slice(2);
  return /^01[3-9]\d{8}$/.test(d) ? d : '';
}

async function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomId() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

class AccountStore {
  constructor() {
    this.store = readStore();
    this.sheet = {};
    this.cfg = {};
    this.syncTimer = null;
    this.lastSyncAt = 0;
    this.saveRef = null;
    this.syncState = 'off';       // off | ok | failed | elsewhere  (profile card shows it)
  }

  init(sheetCfg, accountsCfg) {
    this.sheet = sheetCfg || {};
    this.cfg = accountsCfg || {};
  }

  get online() { return !!this.sheet.apiUrl; }
  get current() {
    const p = this.store.current;
    return p && this.store.list[p] ? { phone: p, ...this.store.list[p] } : null;
  }
  get known() { return Object.entries(this.store.list).map(([phone, a]) => ({ phone, name: a.name })); }

  /** Remember the language picked on the sign-in screen (before any save is loaded). */
  get language() { return this.store.language; }
  set language(l) { this.store.language = l; writeStore(this.store); }

  saveKey(base) {
    return this.store.current ? `${base}.${this.store.current}` : base;
  }

  async post(body) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.sheet.timeoutMs || 9000);
    try {
      // text/plain = a "simple" request: no CORS pre-flight, which Apps Script cannot answer.
      const res = await fetch(this.sheet.apiUrl, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'text/plain;charset=utf-8' }, redirect: 'follow', signal: ctrl.signal });
      return await res.json();
    } catch (err) {
      log.warn('account: sheet not reachable', err.message);
      return { ok: false, error: 'offline' };
    } finally {
      clearTimeout(timer);
    }
  }

  check({ phone, name, classLevel, pin, pin2 }, signUp) {
    const p = normalizePhone(phone);
    if (!p) return { error: 'badPhone' };
    if (!/^\d{4}$/.test(String(pin || '').replace(/[০-৯]/g, (c) => String('০১২৩৪৫৬৭৮৯'.indexOf(c))))) return { error: 'badPinFormat' };
    if (signUp) {
      if (String(name || '').trim().length < 2) return { error: 'badName' };
      if (!String(classLevel || '').trim()) return { error: 'badClass' };
      if (pin !== pin2) return { error: 'pinMismatch' };
    }
    return { phone: p, pin: String(pin).replace(/[০-৯]/g, (c) => String('০১২৩৪৫৬৭৮৯'.indexOf(c))) };
  }

  async remember(phone, { name, classLevel, pin, token, remote, createdAt }) {
    const salt = randomId();
    this.store.list[phone] = { name, classLevel, salt, pinHash: await sha256(`${salt}|${phone}|${pin}`), token: token || null, remote: !!remote, createdAt: createdAt || Date.now() };
    this.store.current = phone;
    writeStore(this.store);
  }

  /**
   * New account. With the sheet connected the sheet decides if the number is free (it must be
   * reachable); without it the number only has to be new on this device.
   * The first account made on a phone that already has an old single-player save gets that save
   * (the owner's progress from before accounts existed).
   */
  async signUp(form) {
    const c = this.check(form, true);
    if (c.error) return { ok: false, error: c.error };
    const name = String(form.name).trim().slice(0, 40);
    const classLevel = String(form.classLevel).trim().slice(0, 40);
    if (this.store.list[c.phone]) return { ok: false, error: 'exists' };
    let token = null;
    if (this.online) {
      const r = await this.post({ action: 'signup', phone: c.phone, name, classLevel, pin: c.pin, save: '' });
      if (!r.ok) return { ok: false, error: r.error || 'server' };
      token = r.token;
    }
    await this.remember(c.phone, { name, classLevel, pin: c.pin, token, remote: this.online });
    return { ok: true, adoptOldSave: !this.store.adoptedOldSave };
  }

  /** Mark the old single-player save as taken (main.js copies it into the new account). */
  markOldSaveAdopted() {
    this.store.adoptedOldSave = true;
    writeStore(this.store);
  }

  /** Sign in. A known account on this device works offline; the sheet is asked when it can be. */
  async signIn(form) {
    const c = this.check(form, false);
    if (c.error) return { ok: false, error: c.error };
    const local = this.store.list[c.phone];
    if (local) {
      if (await sha256(`${local.salt}|${c.phone}|${c.pin}`) !== local.pinHash) return { ok: false, error: 'badPin' };
      this.store.current = c.phone;
      writeStore(this.store);
      if (this.online) {
        const r = await this.post({ action: 'signin', phone: c.phone, pin: c.pin });
        if (r.ok) { local.token = r.token; local.remote = true; writeStore(this.store); return { ok: true, save: r.save || '' }; }
      }
      return { ok: true, save: '' };
    }
    if (!this.online) return { ok: false, error: 'notFound' };
    const r = await this.post({ action: 'signin', phone: c.phone, pin: c.pin });
    if (!r.ok) return { ok: false, error: r.error || 'server' };
    await this.remember(c.phone, { name: r.profile?.name || '', classLevel: r.profile?.classLevel || '', pin: c.pin, token: r.token, remote: true });
    return { ok: true, save: r.save || '' };
  }

  /** Tools (?autostart=1) play as a local test player so they never wait on the sign-in screen. */
  async useTestAccount() {
    const t = this.cfg.testAccount || { phone: '01700000000', name: 'Test', classLevel: 'HSC' };
    if (!this.store.list[t.phone]) await this.remember(t.phone, { ...t, pin: '0000' });
    this.store.current = t.phone;
    writeStore(this.store);
  }

  signOut() {
    this.stopSync();
    this.store.current = null;
    writeStore(this.store);
  }

  /** What the Players tab shows in its plain columns. */
  summary(data, game) {
    const lessons = Object.values(data.lessons || {});
    return {
      cash: data.cash,
      health: game?.player?.health?.value ?? null,
      vehicles: (data.owned?.vehicles || []).map((v) => v.type || v),
      weapons: data.owned?.weapons || [],
      homes: data.owned?.homes || [],
      lessonsDone: lessons.filter((l) => (l.paid?.length || 0) > 0).length,
    };
  }

  async syncNow(beacon = false) {
    const me = this.current;
    if (!me || !this.online || !me.token || !this.saveRef) return;
    const body = JSON.stringify({ action: 'save', phone: me.phone, token: me.token, save: JSON.stringify(this.saveRef.data), summary: this.summary(this.saveRef.data, this.game) });
    this.lastSyncAt = Date.now();
    if (beacon && navigator.sendBeacon) {
      navigator.sendBeacon(this.sheet.apiUrl, new Blob([body], { type: 'text/plain;charset=utf-8' }));
      return;
    }
    const r = await this.post(JSON.parse(body));
    this.syncState = r.ok ? 'ok' : r.error === 'badToken' ? 'elsewhere' : 'failed';
    if (!r.ok) log.warn('account: progress not sent to the sheet', r.error);
  }

  /** Send progress every sheet.syncSeconds and when the page is hidden. */
  startSync(save, game) {
    this.saveRef = save;
    this.game = game;
    if (!this.online || !this.current?.token) return;
    this.syncState = 'ok';
    const every = Math.max(20, this.sheet.syncSeconds || 60) * 1000;
    this.syncTimer = setInterval(() => this.syncNow(), every);
    this._hide = () => { if (document.visibilityState === 'hidden') this.syncNow(true); };
    document.addEventListener('visibilitychange', this._hide);
    setTimeout(() => this.syncNow(), 5000);
  }

  stopSync() {
    clearInterval(this.syncTimer);
    this.syncTimer = null;
    if (this._hide) document.removeEventListener('visibilitychange', this._hide);
  }
}

export const account = new AccountStore();
