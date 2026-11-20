// What a shop sells and what happens when you buy. Prices: data/economy.json → prices.<kind>.
// Names come from the data file of each thing (vehicles.json, outfits.json, shops.json).
//
//   items(shop)        -> [{ id, name, price, state, note }]   state: 'buy' | 'owned' | 'wear' | 'wearing' | 'home' | 'live' | 'eat'
//   buy(shop, id)      -> { ok, msg }      pays and gives the item (or { ok:false, msg } if not)
//   use(shop, id)      -> { ok, msg }      wear an owned outfit / move into an owned home
//
// Effects are sent as events so other features do the work (no imports between features):
//   vehicles → vehicle:grant { type }            outfits → outfit:owned { id } + outfit:set { id }
//   weapons  → weapon:owned { id }               homes   → home:owned { id }, home:changed, garage:changed
//   ammo-<w> → weapon:ammo { id: w }  (needs the gun)   armour → player:armour { full: true }
//   molotov  → weapon:owned { id } every time (each buy = data/weapons.json ammoPack bottles)
//   food     → player:heal { amount }
//   health   → player:heal { share }  (clinics / hospitals, Session 9; data/shops.json → health)
// Every purchase also sends shop:purchased { shop, kind, item, price }.
//
// Session 9: the Products tab of the Google Sheet (content type 'products') can override the
// name, price and picture of any item, or stop selling it (active = FALSE). price(kind, id) and
// nameOf() read those overrides first, then data/economy.json / the item's data file.

import { pickName, t, formatNumber, getLanguage } from '../../ui/i18n.js';

export class Catalog {
  constructor(game, shopsCfg) {
    this.game = game;
    this.cfg = shopsCfg;
    this.prices = game.config.get('economy').prices;
  }

  get owned() { return this.game.save.data.owned; }

  /** Products-tab row for an item (or null). */
  product(kind, id) {
    return this.game.content.get('products').find((p) => p.kind === kind && p.id === id) || null;
  }

  /** Price in Taka, or NaN when it is not sold (no price, or switched off in the sheet). */
  price(kind, id) {
    const p = this.product(kind, id);
    if (p && !p.active) return NaN;
    if (p && Number.isFinite(p.price)) return p.price;
    const v = this.prices[kind]?.[id];
    return Number.isFinite(v) ? v : NaN;
  }

  nameOf(kind, id) {
    const over = this.product(kind, id)?.name;
    const L = getLanguage();
    if (over && (over[L] || over.en)) return over[L] || over.en;
    const c = this.game.config;
    if (kind === 'vehicles') return pickName(c.get('vehicles').types[id]?.name) || id;
    if (kind === 'outfits') return pickName(c.get('outfits').outfits.find((o) => o.id === id)?.name) || id;
    if (kind === 'homes') return pickName(this.cfg.homes[id]?.name) || id;
    if (kind === 'food') return pickName(this.cfg.food[id]?.name) || id;
    if (kind === 'health') return pickName(this.cfg.health?.[id]?.name) || id;
    if (kind === 'weapons') {
      if (id === 'armour') return t('shop.armour');
      const ammo = id.startsWith('ammo-') ? id.slice(5) : null;
      const w = c.get('weapons').weapons.find((x) => x.id === (ammo || id));
      const name = pickName(w?.name) || id;
      return ammo ? t('shop.ammoOf', { weapon: name, n: formatNumber(w?.ammoPack || 0) }) : `${w?.icon || ''} ${name}`.trim();
    }
    return id;
  }

  stateOf(kind, id) {
    const o = this.owned;
    if (kind === 'food' || kind === 'health') return 'eat';
    if (kind === 'outfits') {
      if (!o.outfits.includes(id)) return 'buy';
      return this.game.player?.outfit === id ? 'wearing' : 'wear';
    }
    if (kind === 'homes') {
      if (!o.homes.includes(id)) return 'buy';
      return this.game.save.data.home?.id === id ? 'home' : 'live';
    }
    if (kind === 'weapons') {
      if (id === 'armour') { const a = this.game.player?.armour; return a && a.value >= a.max ? 'full' : 'buy'; }
      if (id.startsWith('ammo-')) return o.weapons.includes(id.slice(5)) ? 'buy' : 'locked';
      const w = this.game.config.get('weapons').weapons.find((x) => x.id === id);
      if (w?.type === 'throw') return 'buy';
      return o.weapons.includes(id) ? 'owned' : 'buy';
    }
    return 'buy'; // vehicles: you can own several
  }

  items(shop) {
    return shop.stock.filter((id) => Number.isFinite(this.price(shop.kind, id))).map((id) => ({
      id,
      name: this.nameOf(shop.kind, id),
      price: this.price(shop.kind, id),
      state: this.stateOf(shop.kind, id),
      heal: shop.kind === 'food' ? this.cfg.food[id]?.heal || 0 : 0,
      healShare: shop.kind === 'health' ? this.cfg.health?.[id]?.share || 0 : 0,
      image: this.product(shop.kind, id)?.image || '',
    }));
  }

  buy(shop, id) {
    const g = this.game;
    const price = this.price(shop.kind, id);
    if (!Number.isFinite(price) || !shop.stock.includes(id)) return { ok: false, msg: null };
    const state = this.stateOf(shop.kind, id);
    if (state !== 'buy' && state !== 'eat') return { ok: false, msg: null };
    if (shop.kind === 'food' || shop.kind === 'health') {
      const h = g.player?.health;
      if (h && h.value >= h.max) return { ok: false, msg: 'shop.fullHealth' };
    }
    if (!g.economy.spend(price, `shop:${shop.id}:${id}`)) return { ok: false, msg: 'shop.noMoney', need: price - g.economy.getCash(), price, name: this.nameOf(shop.kind, id) };

    switch (shop.kind) {
      case 'vehicles':
        g.events.emit('vehicle:grant', { type: id });
        break;
      case 'outfits':
        this.owned.outfits.push(id);
        g.events.emit('outfit:owned', { id });
        g.events.emit('outfit:set', { id });
        break;
      case 'weapons':
        if (id === 'armour') g.events.emit('player:armour', { full: true });
        else if (id.startsWith('ammo-')) g.events.emit('weapon:ammo', { id: id.slice(5) });
        else {
          if (!this.owned.weapons.includes(id)) this.owned.weapons.push(id);
          g.events.emit('weapon:owned', { id });
        }
        break;
      case 'homes':
        this.owned.homes.push(id);
        g.events.emit('home:owned', { id });
        if (!g.save.data.home) this.moveInto(id);
        break;
      case 'food':
        g.events.emit('player:heal', { amount: this.cfg.food[id]?.heal || 0 });
        break;
      case 'health':
        g.events.emit('player:heal', { share: this.cfg.health?.[id]?.share || 0 });
        break;
      default:
    }
    g.events.emit('shop:purchased', { shop: shop.id, kind: shop.kind, item: id, price });
    g.save.flush();
    return { ok: true, msg: 'shop.bought', name: this.nameOf(shop.kind, id) };
  }

  use(shop, id) {
    const state = this.stateOf(shop.kind, id);
    if (shop.kind === 'outfits' && state === 'wear') {
      this.game.events.emit('outfit:set', { id });
      return { ok: true };
    }
    if (shop.kind === 'homes' && state === 'live') {
      this.moveInto(id);
      return { ok: true };
    }
    return { ok: false };
  }

  /** Make an owned home THE home: spawn point + garage (save.data.home / save.data.garage). */
  moveInto(id, spot = null) {
    const h = this.cfg.homes[id];
    if (!h) return;
    const s = this.game.save.data;
    s.home = { id, x: spot?.x ?? null, z: spot?.z ?? null, heading: 0 };
    s.garage = { ...h.garage };
    this.game.events.emit('home:changed', { id });
    this.game.events.emit('garage:changed', { ...s.garage });
  }
}
