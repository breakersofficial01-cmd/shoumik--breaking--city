// The hotel menu card (Roadmap 2 S4): opens when the waiter reaches Shoumik's table. Tabs for
// Bangladeshi food / fast food / sweets / drinks, a price and "+health" on every line, up to
// order.maxItems things in the order, then "Order ৳X" (pays) or "Not now".
// Prices and names: data/menu.json + data/economy.json, overridden by the Products tab of the
// Google Sheet (kind food / drink) through the content type 'products'.
// The game is paused while the card is open (createOverlay).

import { t, pickName, getLanguage, formatMoney } from '../../ui/i18n.js';
import { createOverlay, esc } from '../../ui/overlay.js';

const TABS = ['bd', 'fast', 'sweet', 'drink'];

export class MenuCard {
  /**
   * @param {object} game
   * @param {{ price(id):number, heal(id):number, name(id):string, item(id):object }} menu
   * @param {number} maxItems
   */
  constructor(game, menu, maxItems) {
    this.game = game;
    this.menu = menu;
    this.maxItems = maxItems;
    this.ov = createOverlay(game, { id: 'hotel-menu', reason: 'hotelMenu', className: 'shop-panel hotel-menu', onClose: () => this.finish(null) });
    this.ov.panel.addEventListener('click', (e) => this.onClick(e));
    this.cb = null;
  }

  get isOpen() { return this.ov.isOpen; }

  /**
   * Show the card. ids = what this table can order. done(order | null) — order = [ids].
   * `title` = hotel name, `bar` = the bar card (drinks first).
   */
  open(ids, title, done, bar = false) {
    this.ids = ids.filter((id) => Number.isFinite(this.menu.price(id)));
    this.title = title;
    this.cart = [];
    this.message = null;
    const has = (tab) => this.ids.some((id) => this.menu.item(id).cat === tab);
    this.tabs = TABS.filter(has);
    this.tab = bar && has('drink') ? 'drink' : this.tabs[0];
    this.cb = done;
    this.render();
    this.ov.open();
  }

  total() { return this.cart.reduce((s, id) => s + this.menu.price(id), 0); }

  render() {
    const cash = this.game.economy.getCash();
    const total = this.total();
    const list = this.ids.filter((id) => this.menu.item(id).cat === this.tab);
    const count = (id) => this.cart.filter((x) => x === id).length;
    const full = this.cart.length >= this.maxItems;
    this.ov.panel.innerHTML = `
      <h2>${esc(this.title)}</h2>
      <p class="shop-cash">${esc(t('shop.cash', { money: formatMoney(cash) }))}</p>
      <div class="menu-tabs">${this.tabs.map((tab) => `<button type="button" data-tab="${tab}" class="${tab === this.tab ? 'on' : ''}">${esc(t(`hotel.tab.${tab}`))}</button>`).join('')}</div>
      ${this.message ? `<p class="shop-msg bad">${esc(this.message)}</p>` : ''}
      <div class="shop-list menu-list">
        ${list.map((id) => {
          const it = this.menu.item(id);
          const n = count(id);
          return `<div class="shop-item menu-item${n ? ' picked' : ''}">
            <span class="menu-icon">${esc(it.icon || '')}</span>
            <span class="shop-name">${esc(this.menu.name(id))}<small>${esc(t('shop.heal', { n: this.menu.heal(id) }))}</small></span>
            <span class="menu-price">${esc(formatMoney(this.menu.price(id)))}</span>
            ${n ? `<button type="button" class="menu-minus" data-minus="${esc(id)}">−</button><b class="menu-count">${n}</b>` : ''}
            <button type="button" class="menu-plus" data-plus="${esc(id)}" ${full ? 'disabled' : ''}>+</button>
          </div>`;
        }).join('')}
      </div>
      <p class="panel-note">${esc(t('hotel.cartNote', { n: this.cart.length, max: this.maxItems }))}</p>
      <div class="menu-actions">
        <button type="button" class="shop-buy menu-order" data-order ${this.cart.length ? '' : 'disabled'}>${esc(t('hotel.order', { money: formatMoney(total) }))}</button>
        <button type="button" class="panel-close">${esc(t('hotel.notNow'))}</button>
      </div>`;
  }

  onClick(e) {
    const btn = (sel) => e.target.closest(sel);
    let b;
    if ((b = btn('[data-tab]'))) { this.tab = b.dataset.tab; this.render(); return; }
    if ((b = btn('[data-plus]'))) { if (this.cart.length < this.maxItems) this.cart.push(b.dataset.plus); this.message = null; this.render(); return; }
    if ((b = btn('[data-minus]'))) { const i = this.cart.lastIndexOf(b.dataset.minus); if (i >= 0) this.cart.splice(i, 1); this.render(); return; }
    if (btn('[data-order]')) {
      const total = this.total();
      if (!this.cart.length) return;
      if (total > this.game.economy.getCash()) {
        const need = total - this.game.economy.getCash();
        this.message = t('shop.needMore', { money: formatMoney(need) });
        this.render();
        this.ov.close();
        this.game.events.emit('earn:offer', { reason: 'money', need, price: total, item: this.title });
        return;
      }
      const order = this.cart.slice();
      this.cart = [];
      this.finish(order);
      this.ov.close();
      return;
    }
    if (btn('.panel-close')) this.ov.close();
  }

  finish(order) {
    const cb = this.cb;
    this.cb = null;
    cb?.(order);
  }

  dispose() { this.ov.dispose(); }
}

/** Names / prices / heal of menu items with the Products-sheet overrides applied. */
export function menuBook(game) {
  const items = game.config.get('menu').items;
  const prices = game.config.get('economy').prices;
  const product = (id) => {
    const kind = items[id]?.kind;
    return game.content.get('products').find((p) => p.kind === kind && p.id === id) || null;
  };
  return {
    items,
    item: (id) => items[id] || { cat: 'bd', name: { en: id, bn: id }, heal: 0 },
    price(id) {
      const it = items[id];
      if (!it) return NaN;
      const p = product(id);
      if (p && !p.active) return NaN;
      if (p && Number.isFinite(p.price)) return p.price;
      const v = prices[it.kind]?.[id];
      return Number.isFinite(v) ? v : NaN;
    },
    heal(id) {
      const p = product(id);
      return p && Number.isFinite(p.heal) ? p.heal : items[id]?.heal || 0;
    },
    name(id) {
      const over = product(id)?.name;
      const L = getLanguage();
      if (over && (over[L] || over.en)) return over[L] || over.en;
      return pickName(items[id]?.name) || id;
    },
  };
}
