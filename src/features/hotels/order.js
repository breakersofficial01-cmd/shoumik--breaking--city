// One meal (Roadmap 2 S4): Shoumik sits → the waiter walks over → menu card → he pays → the
// waiter goes to the kitchen and comes back with the dishes on his tray → he puts them on the
// table → Shoumik eats them one by one (each finished dish heals `heal` points) → plates stay
// until he stands up. At the bar the bartender serves across the counter the same way.
//
//   state: calling → choosing → cooking → serving → eating → done   (idle = seated, no order)
//
// The owner (index.js) gives: seat { kind: 'table'|'stool', table|stool, chair }, the hotel
// runtime { hotel, place, people }, and helpers { menu, card, dishes, materials, cfg, game }.

import { formatMoney } from '../../ui/i18n.js';
import { makeDish } from './dishes.js';
import { dishSpot, stoolDishSpot } from './staff.js';

export class Meal {
  constructor(rt, seat, h) {
    this.rt = rt;
    this.seat = seat;
    this.h = h;
    this.state = 'idle';
    this.dishes = [];     // { id, group, food, eaten, heal }
    this.timer = 0;
    this.eating = -1;
  }

  get server() { return this.seat.kind === 'stool' ? this.rt.people.servers.bar : this.rt.people.servers.waiter; }

  // ---- waypoints (world x/z) between the kitchen / bar and this seat
  toSeat() {
    const P = this.rt.place, c = this.h.cfg.waiter;
    if (this.seat.kind === 'stool') return [this.seat.stool.server];
    const tb = this.seat.table, ch = this.seat.chair;
    const L = P.toLocal(tb.x, tb.z), Lc = P.toLocal(ch.x, ch.z), K = P.toLocal(P.kitchen.x, P.kitchen.z);
    // Stand at the table corner on the player's side (between two chairs).
    const sx = Lc.x >= L.x ? 1 : -1;
    const corner = P.toWorld(L.x + sx * c.standOff, L.z + c.standOff);
    const lane = L.z + c.laneOffset;
    const s = this.server;
    const here = P.toLocal(s.x, s.z);
    const pts = [];
    if (Math.abs(here.z - lane) > 0.2) pts.push(P.toWorld(here.x, Math.max(here.z, K.z)), P.toWorld(here.x, lane));
    pts.push(P.toWorld(L.x + sx * c.standOff, lane), corner);
    return pts;
  }

  toHome() {
    const P = this.rt.place, c = this.h.cfg.waiter;
    if (this.seat.kind === 'stool') return [P.barServer];
    const L = P.toLocal(this.seat.table.x, this.seat.table.z), K = P.toLocal(P.kitchen.x, P.kitchen.z);
    const s = this.server, here = P.toLocal(s.x, s.z);
    const lane = L.z + c.laneOffset;
    return [P.toWorld(here.x, lane), P.toWorld(K.x, lane), P.kitchen];
  }

  facing() {
    const s = this.server, target = this.seat.kind === 'stool' ? this.seat.stool : this.seat.table;
    return Math.atan2(target.x - s.x, target.z - s.z);
  }

  // ---- steps
  call() {
    const s = this.server;
    if (!s) return;
    this.state = 'calling';
    this.h.prompt('hotel.waiting');
    s.walk(this.toSeat(), () => this.arrived(), null);
  }

  arrived() {
    if (this.state !== 'calling') return;
    this.server.faceTo = this.facing();
    this.state = 'choosing';
    const menuIds = this.seat.kind === 'stool' ? this.rt.hotel.bar.menu : this.rt.hotel.menu;
    this.h.card.open(menuIds, this.h.hotelName(this.rt), (order) => this.ordered(order), this.seat.kind === 'stool');
  }

  ordered(order) {
    if (this.state !== 'choosing') return;
    const g = this.h.game;
    if (!order || !order.length) { this.state = 'idle'; this.goHome(); this.h.prompt('hotel.idle'); return; }
    const total = order.reduce((s, id) => s + this.h.menu.price(id), 0);
    if (!g.economy.spend(total, `hotel:${this.rt.hotel.id}`)) { this.state = 'idle'; this.goHome(); this.h.prompt('hotel.idle'); return; }
    for (const id of order) g.events.emit('shop:purchased', { shop: this.rt.hotel.id, kind: this.h.menu.item(id).kind, item: id, price: this.h.menu.price(id) });
    g.events.emit('toast:show', { key: 'hotel.paid', vars: { money: formatMoney(total) } });
    g.save.flush();
    // Dishes ride on the tray from now on.
    const s = this.server;
    this.clearDishes();
    order.forEach((id, i) => {
      const d = makeDish(this.h.dishes, id, this.h.materials, this.h.cfg.dishScale);
      d.heal = this.h.menu.heal(id);
      d.group.position.set((i - (order.length - 1) / 2) * 0.2, 0.02, 0);
      s.tray.add(d.group);
      this.dishes.push(d);
    });
    s.tray.visible = false; // the food is cooked first
    this.state = 'cooking';
    this.h.prompt('hotel.cooking');
    s.faceTo = null;
    s.walk(this.toHome(), () => { this.timer = this.h.cfg.waiter.kitchenSeconds; });
  }

  update(dt) {
    if (this.state === 'cooking' && !this.server.busy && this.timer > 0) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.state = 'serving';
        this.server.tray.visible = true;
        this.server.walk(this.toSeat(), () => this.served());
      }
    } else if (this.state === 'eating') {
      const d = this.dishes[this.eating];
      if (!d) { this.finishMeal(); return; }
      d.eaten = Math.min(1, d.eaten + dt / this.h.cfg.order.eatSeconds);
      if (d.food) { d.food.scale.setScalar(Math.max(0.001, 1 - d.eaten * 0.92)); d.food.visible = d.eaten < 1; }
      if (d.eaten >= 1) {
        this.h.game.events.emit('player:heal', { amount: d.heal });
        this.eating++;
      }
    }
  }

  served() {
    if (this.state !== 'serving') return;
    const s = this.server, n = this.dishes.length;
    s.faceTo = this.facing();
    this.dishes.forEach((d, j) => {
      const spot = this.seat.kind === 'stool'
        ? stoolDishSpot(this.seat.stool, this.h.cfg, this.rt.place.y, j, n)
        : dishSpot(this.seat.table, this.seat.chair, j, n, this.h.cfg, this.rt.place.y);
      d.group.removeFromParent();
      d.group.position.set(spot.x, spot.y, spot.z);
      d.group.rotation.y = spot.heading;
      this.h.root.add(d.group);
    });
    this.state = 'eating';
    this.eating = 0;
    this.h.prompt('hotel.eating');
    this.h.game.events.emit('toast:show', { key: 'hotel.served' });
    setTimeout(() => { if (this.state === 'eating' || this.state === 'done') { s.faceTo = null; s.walk(this.toHome()); } }, 1200);
  }

  finishMeal() {
    this.state = 'done';
    this.h.prompt('hotel.again');
    this.h.game.events.emit('hotel:ate', { hotel: this.rt.hotel.id, items: this.dishes.map((d) => d.id) });
  }

  goHome() {
    const s = this.server;
    if (!s) return;
    s.faceTo = null;
    s.walk(this.toHome());
  }

  /** Shoumik stands up (or is taken away). Paid food not eaten yet is eaten at once if `eatRest`. */
  end(eatRest = true) {
    if (eatRest && ['cooking', 'serving', 'eating'].includes(this.state)) {
      const rest = this.dishes.filter((d) => d.eaten < 1).reduce((s, d) => s + d.heal, 0);
      if (rest > 0) {
        this.h.game.events.emit('player:heal', { amount: rest });
        this.h.game.events.emit('toast:show', { key: 'hotel.toGo' });
      }
    }
    if (this.h.card.isOpen) this.h.card.ov.close();
    if (this.state !== 'idle' && this.state !== 'done') this.goHome();
    this.state = 'gone';
    this.clearDishes();
  }

  clearDishes() {
    for (const d of this.dishes) d.group.removeFromParent();
    this.dishes = [];
  }
}

export const mealHint = (state) => ({ idle: 'hotel.idle', calling: 'hotel.waiting', cooking: 'hotel.cooking', serving: 'hotel.cooking', eating: 'hotel.eating', done: 'hotel.again' }[state] || null);
