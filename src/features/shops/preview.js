// Shop price card (Session 9). While Shoumik stands in a shop ring a small card shows what the
// shop sells and the prices — red when the player cannot pay — with a hint to earn Taka at
// Breaking School / Breaking Biology when nothing is affordable. Look: src/ui/session9.css.

import { t, pickName, formatMoney } from '../../ui/i18n.js';
import { esc } from '../../ui/overlay.js';

const MAX_ROWS = 4; // small enough to stay clear of the joystick on a landscape phone

export class PricePreview {
  constructor(game) {
    this.game = game;
    this.el = document.createElement('div');
    this.el.className = 'shop-preview';
    this.el.hidden = true;
    game.ui.appendChild(this.el);
    this.spot = null;
  }

  /** @param {object|null} spot  a shop spot (null hides the card)  @param {Catalog} catalog */
  show(spot, catalog, look) {
    this.spot = spot;
    if (!spot?.shop) { this.el.hidden = true; return; }
    const cash = this.game.economy.getCash();
    const items = catalog.items(spot.shop).filter((i) => i.state === 'buy' || i.state === 'eat');
    const rows = items.slice(0, MAX_ROWS).map((i) => `<li class="${i.price > cash ? 'dear' : ''}"><span>${esc(i.name)}</span><b>${esc(formatMoney(i.price))}</b></li>`).join('');
    const more = items.length > MAX_ROWS ? `<li class="more">${esc(t('shop.more', { n: items.length - MAX_ROWS }))}</li>` : '';
    const broke = items.length > 0 && items.every((i) => i.price > cash);
    this.el.innerHTML = `
      <h4>${esc(spot.icon || look.icon)} ${esc(pickName(spot.name))}</h4>
      <ul>${rows}${more}</ul>
      <p class="hint">${esc(t(broke ? 'shop.previewBroke' : 'shop.previewHint'))}</p>
      ${broke ? `<button type="button" data-earn>${esc(t('earn.button'))}</button>` : ''}`;
    this.el.hidden = false;
  }

  refresh(catalog, look) {
    if (this.spot) this.show(this.spot, catalog, look);
  }

  dispose() {
    this.el.remove();
  }
}
