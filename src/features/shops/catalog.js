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
// Every purchase also sends shop:purchased { shop, kind, item, price }.

import { pickName, t, formatNumber } from '../../ui/i18n.js';

export class Catalog {
  constructor(game, shopsCfg) {
    this.game = game;
    this.cfg = shopsCfg;
    this.prices = game.config.get('economy').prices;
  }

  get owned() { return this.game.save.data.owned; }

  nameOf(kind, id) {
    const c = this.game.config;
    if (kind === 'vehicles') return pickName(c.get('vehicles').types[id]?.name) || id;
    if (kind === 'outfits') return pickName(c.get('outfits').outfits.find((o) => o.id === id)?.name) || id;
    if (kind === 'homes') return pickName(this.cfg.homes[id]?.name) || id;
    if (kind === 'food') return pickName(this.cfg.food[id]?.name) || id;
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
    if (kind === 'food') return 'eat';
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
    const prices = this.prices[shop.kind] || {};
    return shop.stock.filter((id) => Number.isFinite(prices[id])).map((id) => ({
      id,
      name: this.nameOf(shop.kind, id),
      price: prices[id],
      state: this.stateOf(shop.kind, id),
      heal: shop.kind === 'food' ? this.cfg.food[id]?.heal || 0 : 0,
    }));
  }

  buy(shop, id) {
    const g = this.game;
    const price = this.prices[shop.kind]?.[id];
    if (!Number.isFinite(price) || !shop.stock.includes(id)) return { ok: false, msg: null };
    const state = this.stateOf(shop.kind, id);
    if (state !== 'buy' && state !== 'eat') return { ok: false, msg: null };
    if (shop.kind === 'food') {
      const h = g.player?.health;
      if (h && h.value >= h.max) return { ok: false, msg: 'shop.fullHealth' };
    }
    if (!g.economy.spend(price, `shop:${shop.id}:${id}`)) return { ok: false, msg: 'shop.noMoney' };

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
