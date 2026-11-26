// Fares for buses, the MRT and trains (Roadmap 2 S6). Default prices: data/economy.json → fares
// ({ bus, metro, train } in Taka). The Products tab of the Google Sheet can change them: a row
// with kind 'fare' and product_id bus / metro / train (price, active).

import { formatMoney } from '../../ui/i18n.js';

/** Price in Taka of one ride of `id` ('bus' | 'metro' | 'train'). */
export function fareFor(game, id) {
  const row = (game.content?.get('products') || []).find((p) => p.kind === 'fare' && p.id === id);
  if (row && row.active !== false && Number.isFinite(row.price)) return row.price;
  return game.config.get('economy').fares?.[id] ?? 0;
}

/** Pay a fare. Returns false (and shows a message) when Shoumik has too little cash. */
export function payFare(game, id) {
  const fare = fareFor(game, id);
  if (!game.economy.spend(fare, `fare:${id}`)) {
    game.events.emit('toast:show', { key: 'transit.noMoney', vars: { fare: formatMoney(fare) } });
    return false;
  }
  game.events.emit('ride:paid', { id, fare });
  return true;
}
