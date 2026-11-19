// Feature: shops (Session 5). Places from data/shops.json, prices from data/economy.json → prices.
//   - car showroom (Gulshan), bike shop, property office, weapon shop (Old Dhaka back lane),
//     clothes shop, tea and fuchka stalls (they heal).
//   - every shop is a glowing ring with a floating name sign on a junction corner; stand in it
//     and press ঢোকো / E to open its panel (the game pauses).
//   - homes bought at the property office get their own white ring: "sleep" there = full health,
//     the game is saved and it becomes the spawn point; owned vehicles park at its garage.
// What buying does: ./catalog.js. Markers: ./markers.js.
//
// Events  listens input:action, shop:open { id } (tools/console), home:owned, language:changed
//         sends   prompt:show / prompt:hide, map:blips { id, points }, player:heal, home:slept,
//                 and the purchase events listed in catalog.js

import { t, pickName, formatMoney } from '../../ui/i18n.js';
import { createOverlay, esc } from '../../ui/overlay.js';
import { log } from '../../core/debug.js';
import { Catalog } from './catalog.js';
import { cornerPoint, makeMarker } from './markers.js';

let game = null;
let cfg = null;
let catalog = null;
let ov = null;
let spots = [];          // { id, kind, name, x, z, shop?, homeId?, marker }
let inside = null;
let current = null;      // shop open in the panel
let message = null;      // { key, vars, ok }
let offs = [];
let time = 0;

function placeSpot(def, kind, extra) {
  const p = cornerPoint(game.world, def.col, def.row, def.corner, game.config.get('player').radius + 0.2);
  if (!p) { log.warn(`shops: no free corner for "${extra.id}" at junction ${def.col},${def.row}`); return null; }
  const spot = { ...extra, kind, name: def.name, x: p.x, z: p.z };
  spot.marker = makeMarker(game, spot, cfg.marker, cfg.kinds[kind]);
  spots.push(spot);
  return spot;
}

function addHomeSpot(id) {
  if (spots.some((s) => s.homeId === id)) return;
  const h = cfg.homes[id];
  if (h) placeSpot(h, 'home', { id: `home-${id}`, homeId: id });
}

function sendBlips() {
  game.events.emit('map:blips', {
    id: 'shops',
    points: spots.map((s) => ({ x: s.x, z: s.z, color: cfg.kinds[s.kind].minimap })),
  });
}

// ---- the shop panel

function itemButton(item) {
  const s = item.state;
  if (s === 'buy' || s === 'eat') return `<button type="button" class="shop-buy" data-buy="${esc(item.id)}">${esc(t('shop.buy', { price: formatMoney(item.price) }))}</button>`;
  if (s === 'wear' || s === 'live') return `<button type="button" class="shop-use" data-use="${esc(item.id)}">${esc(t(s === 'wear' ? 'shop.wear' : 'shop.liveHere'))}</button>`;
  const key = { owned: 'shop.owned', wearing: 'shop.wearing', home: 'shop.livingHere' }[s];
  return `<span class="shop-owned">✓ ${esc(t(key))}</span>`;
}

function render() {
  const shop = current;
  const note = { vehicles: 'shop.vehicleNote', weapons: 'shop.weaponNote', homes: 'shop.homeNote', outfits: 'shop.outfitNote' }[shop.kind];
  const look = cfg.kinds[shop.kind];
  ov.panel.innerHTML = `
    <h2>${look.icon} ${esc(pickName(shop.name))}</h2>
    <p class="shop-cash">${esc(t('shop.cash', { money: formatMoney(game.economy.getCash()) }))}</p>
    ${message ? `<p class="shop-msg ${message.ok ? 'ok' : 'bad'}">${esc(t(message.key, message.vars))}</p>` : ''}
    <div class="shop-list">
      ${catalog.items(shop).map((item) => `
        <div class="shop-item">
          <span class="shop-name">${esc(item.name)}${item.heal ? `<small>${esc(t('shop.heal', { n: item.heal }))}</small>` : ''}</span>
          ${itemButton(item)}
        </div>`).join('')}
    </div>
    ${note ? `<p class="panel-note">${esc(t(note))}</p>` : ''}
    <button type="button" class="panel-close">${esc(t('shop.close'))}</button>`;
  ov.panel.scrollTop = 0;
}

function openShop(shop) {
  current = shop;
  message = null;
  render();
  ov.open();
  game.events.emit('shop:opened', { id: shop.id, kind: shop.kind });
}

function onPanelClick(e) {
  const buy = e.target.closest('[data-buy]');
  const use = e.target.closest('[data-use]');
  if (buy) {
    const r = catalog.buy(current, buy.dataset.buy);
    message = r.msg ? { key: r.msg, vars: { item: r.name }, ok: r.ok } : null;
    render();
  } else if (use) {
    catalog.use(current, use.dataset.use);
    message = null;
    render();
  } else if (e.target.closest('.panel-close')) {
    ov.close();
  }
}

// ---- homes

function sleepAt(spot) {
  const s = game.save.data;
  catalog.moveInto(spot.homeId, { x: spot.x, z: spot.z });
  s.home.x = +spot.x.toFixed(2);
  s.home.z = +spot.z.toFixed(2);
  game.events.emit('player:heal', { full: true });
  game.events.emit('home:slept', { id: spot.homeId });
  game.save.flush();
  current = { id: spot.id, kind: 'homes', name: spot.name, stock: [] };
  ov.panel.innerHTML = `<h2>${cfg.kinds.home.icon} ${esc(pickName(spot.name))}</h2>
    <p class="shop-msg ok">${esc(t('shop.slept'))}</p>
    <button type="button" class="panel-close">${esc(t('shop.close'))}</button>`;
  ov.open();
}

function onAction() {
  if (!inside || game.paused || game.player?.mode !== 'onFoot') return;
  if (inside.kind === 'home') sleepAt(inside);
  else openShop(inside.shop);
}

export default {
  id: 'shops',

  init(g) {
    game = g;
    cfg = g.config.get('shops');
    catalog = new Catalog(g, cfg);
    ov = createOverlay(g, { id: 'shop-panel', reason: 'shops', className: 'shop-panel', onClose: () => { current = null; } });
    ov.panel.addEventListener('click', onPanelClick);
    for (const shop of cfg.shops) placeSpot(shop, shop.kind, { id: shop.id, shop });
    for (const id of g.save.data.owned.homes) addHomeSpot(id);
    offs = [
      g.events.on('input:action', onAction),
      g.events.on('shop:open', ({ id }) => { const s = spots.find((x) => x.id === id); if (s?.shop) openShop(s.shop); }),
      g.events.on('home:owned', ({ id }) => { addHomeSpot(id); sendBlips(); }),
      g.events.on('cash:changed', () => { if (current && ov.isOpen && current.stock.length) render(); }),
      g.events.on('language:changed', () => spots.forEach((s) => s.marker.redraw())),
      g.events.on('game:ready', sendBlips),
    ];
    sendBlips();
    log.info(`shops: ${spots.length} shops / homes placed`);
  },

  /** For tools / the console (BC.features.get('shops').spots). */
  get spots() { return spots; },
  get inside() { return inside; },

  update(dt) {
    const p = game.player?.position;
    if (!p) return;
    time += dt;
    const mc = cfg.marker;
    let here = null;
    for (const s of spots) {
      const d = Math.hypot(s.x - p.x, s.z - p.z);
      s.marker.group.visible = d < mc.visibleDistance;
      if (!s.marker.group.visible) continue;
      s.marker.ring.rotation.z = time * mc.spin * Math.PI * 2;
      if (d < mc.enterRadius && game.player.mode === 'onFoot') here = s;
    }
    if (here !== inside) {
      inside = here;
      if (!inside) game.events.emit('prompt:hide', { id: 'shop' });
      else if (inside.kind === 'home') game.events.emit('prompt:show', { id: 'shop', key: 'shop.homePrompt', vars: { home: pickName(inside.name) } });
      else game.events.emit('prompt:show', { id: 'shop', key: 'shop.prompt', vars: { shop: pickName(inside.name) } });
    }
  },

  dispose() {
    offs.forEach((off) => off());
    offs = [];
    for (const s of spots) s.marker.dispose();
    spots = [];
    ov?.dispose();
    game.events.emit('prompt:hide', { id: 'shop' });
    game.events.emit('map:blips', { id: 'shops', points: [] });
  },
};

