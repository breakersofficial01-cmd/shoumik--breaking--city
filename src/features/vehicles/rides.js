// Hired rides: walk up to a waiting rickshaw (৳20) or CNG (৳100), press Enter, pick a place
// and the driver takes you there. Used only by ./index.js.
//
// The ride is really driven (entities/vehicles/driver.js follows the shortest route), but a
// trip across town by rickshaw would take minutes, so there is a "take me there" button and
// after rides.autoSkipSeconds the screen fades and you arrive.
// Fares: data/economy.json → rides. Places: data/places.json (through the Content Service).
// The menu also lets the player take the vehicle instead (carjack).
//
// Events sent:  ride:started { type, place, fare }   ride:ended { type, place, arrived }
//               traffic:adopt { id }  (afterwards the driver goes back to wandering traffic)

import { t, pickName, formatMoney } from '../../ui/i18n.js';
import { DIRS, opposite } from '../../world/roads.js';
import { Driver } from '../../entities/vehicles/driver.js';

export class Rides {
  /** @param {{enter:(v:object, passenger:boolean)=>void}} hooks */
  constructor(game, fleet, cfg, boarding, rng, hooks) {
    this.game = game;
    this.fleet = fleet;
    this.cfg = cfg;
    this.R = cfg.rides;
    this.boarding = boarding;
    this.hooks = hooks;
    this.roads = game.world.roads;
    this.driver = new Driver(game, game.config.get('traffic'), rng);
    this.active = null; // { v, place, final:{c,r,d,stopU}, time, skipping }
    this.buildDom();
  }

  fareOf(v) {
    return this.game.config.get('economy').rides?.[v.type] ?? 0;
  }

  /** Can this vehicle be hired right now? */
  canHire(v) {
    return !!v.T.ride && !!v.tags.stand && !v.driver && v.state === 'ok';
  }

  buildDom() {
    const el = document.createElement('div');
    el.id = 'ride-menu';
    el.className = 'overlay';
    el.hidden = true;
    el.innerHTML = `
      <div class="panel">
        <h2 class="ride-title"></h2>
        <p class="panel-note ride-fare"></p>
        <div class="choices ride-places"></div>
        <p class="ride-msg"></p>
        <div class="ride-actions">
          <button type="button" class="ride-take"></button>
          <button type="button" class="panel-close ride-cancel"></button>
        </div>
      </div>`;
    this.game.ui.appendChild(el);
    this.menu = el;
    el.querySelector('.ride-cancel').addEventListener('click', () => this.close());
    el.querySelector('.ride-take').addEventListener('click', () => {
      const v = this.menuVehicle;
      this.close();
      if (v && !v.removed) this.hooks.enter(v, false);
    });
    // Skip button + fade used during the ride.
    this.skipBtn = document.createElement('button');
    this.skipBtn.id = 'ride-skip';
    this.skipBtn.type = 'button';
    this.skipBtn.hidden = true;
    this.skipBtn.addEventListener('click', () => this.skip());
    this.fade = document.createElement('div');
    this.fade.id = 'ride-fade';
    this.game.ui.append(this.skipBtn, this.fade);
  }

  open(v) {
    const el = this.menu;
    this.menuVehicle = v;
    const fare = this.fareOf(v);
    el.querySelector('.ride-title').textContent = t('ride.title', { vehicle: pickName(v.T.name) });
    el.querySelector('.ride-fare').textContent = t('ride.fare', { fare: formatMoney(fare) });
    el.querySelector('.ride-take').textContent = t('ride.take');
    el.querySelector('.ride-cancel').textContent = t('ride.cancel');
    el.querySelector('.ride-msg').textContent = '';
    const here = this.roads.nearestJunction(v.x, v.z);
    const box = el.querySelector('.ride-places');
    box.innerHTML = '';
    for (const place of this.game.content.get('places')) {
      if (!place.ride || !this.roads.isJunction(place.col, place.row)) continue;
      if (here && here.c === place.col && here.r === place.row) continue;
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = pickName(place.name);
      b.addEventListener('click', () => this.choose(place));
      box.appendChild(b);
    }
    el.hidden = false;
    this.game.setPaused('rideMenu', true);
    document.exitPointerLock?.();
  }

  close() {
    this.menu.hidden = true;
    this.menuVehicle = null;
    this.game.setPaused('rideMenu', false);
  }

  choose(place) {
    const v = this.menuVehicle;
    if (!v || v.removed || !this.canHire(v)) return this.close();
    const plan = this.planRoute(v, place);
    if (!plan) { this.menu.querySelector('.ride-msg').textContent = t('ride.noRoute'); return; }
    const fare = this.fareOf(v);
    if (!this.game.economy.spend(fare, 'ride')) { this.menu.querySelector('.ride-msg').textContent = t('ride.noMoney'); return; }
    this.close();
    // The driver keeps his vehicle; Shoumik climbs into the passenger seat.
    if (v.tags.slot) { v.tags.slot.spent = true; v.tags.slot.vehicle = null; v.tags.slot = null; }
    v.tags.stand = false;
    v.driver = 'ride';
    this.driver.attach(v, plan.c, plan.r, plan.d, { route: plan.route, stopU: plan.stopU, cruise: v.T.cruise * this.R.speedFactor });
    v.input.handbrake = true;
    this.active = { v, place, final: plan.final, time: 0, skipping: 0, skipped: false, fare };
    this.hooks.enter(v, true);
    this.skipBtn.textContent = t('ride.skip');
    this.skipBtn.hidden = false;
    this.game.events.emit('ride:started', { type: v.type, place: place.id, fare });
  }

  /** Segment the vehicle stands on + the junction-by-junction route to the place. */
  planRoute(v, place) {
    const R = this.roads;
    let seg = v.tags.seg;
    if (!seg) {
      const n = R.nearestSegment(v.x, v.z);
      if (!n) return null;
      seg = { c: n.c, r: n.r, d: n.d };
      const D = DIRS[seg.d];
      if (Math.sin(v.heading) * D.fx + Math.cos(v.heading) * D.fz < 0) seg = { c: seg.c + D.dc, r: seg.r + D.dr, d: opposite(seg.d) };
    }
    const D = DIRS[seg.d];
    const route = R.route(seg.c + D.dc, seg.r + D.dr, place.col, place.row);
    if (!route) return null;
    // The last segment driven is the one that arrives at the place's junction.
    let c = seg.c, r = seg.r, d = seg.d;
    for (const step of route) { c += DIRS[d].dc; r += DIRS[d].dr; d = step; }
    const last = R.segment(c, r, d, 0);
    const stopU = Math.max(v.T.size[0], last.len - this.R.dropBack);
    return { c: seg.c, r: seg.r, d: seg.d, route, stopU, final: { c, r, d, stopU } };
  }

  /** Fade out, jump to just before the destination, fade in. */
  skip() {
    const a = this.active;
    if (!a || a.skipped || a.skipping > 0) return;
    a.skipping = this.R.fadeSeconds;
    this.fade.classList.add('on');
    this.skipBtn.hidden = true;
  }

  teleport() {
    const a = this.active;
    const v = a.v;
    const f = a.final;
    const lane = this.game.config.get('traffic').lanes[v.T.lane];
    const seg = this.roads.segment(f.c, f.r, f.d, lane);
    const u = Math.max(v.T.size[0], f.stopU - 22);
    const x = seg.ax + seg.fx * u, z = seg.az + seg.fz * u;
    for (const o of [...this.fleet.vehicles]) {
      if (o !== v && o.driver !== 'player' && !o.tags.owned && Math.hypot(o.x - x, o.z - z) < 7) this.fleet.remove(o);
    }
    v.place(x, z, seg.heading, 0);
    v.launch(v.T.cruise * 0.6);
    this.driver.attach(v, f.c, f.r, f.d, { route: [], stopU: f.stopU, cruise: v.T.cruise });
    v.brain.final = true;
    this.game.cameraRig.setTarget(v, 'driving', true, v.T.camera || 1);
    a.skipped = true;
  }

  finish(arrived) {
    const a = this.active;
    if (!a) return;
    this.active = null;
    this.skipBtn.hidden = true;
    this.fade.classList.remove('on');
    const v = a.v;
    this.game.events.emit('ride:ended', { type: v.type, place: a.place.id, arrived });
    if (v.removed || v.state !== 'ok') return;
    // The driver waits where he stopped (can be hired again) unless traffic takes him over.
    v.driver = null;
    v.brain = null;
    v.tags.stand = true;
    v.tags.seg = null;
    v.input.throttle = 0;
    v.input.handbrake = true;
    this.game.events.emit('traffic:adopt', { id: v.id });
    if (v.driver) v.tags.stand = false;
  }

  /** Called every frame before physics. */
  update(dt) {
    const a = this.active;
    if (!a) return;
    const v = a.v;
    const b = this.boarding;
    if (v.removed || v.state !== 'ok') { b.exitNow(v.removed); return this.finish(false); }
    if (b.state === 'foot') return this.finish(!!a.arrived);    // he stepped out (arrived, or got off early)
    if (b.state !== 'riding') { v.input.handbrake = true; return; } // still climbing in / out
    a.time += dt;
    if (a.skipping > 0) {
      a.skipping -= dt;
      if (a.skipping <= 0) {
        if (!a.skipped) { this.teleport(); a.skipping = this.R.fadeSeconds; }
        else this.fade.classList.remove('on');
      }
    } else if (!a.skipped && this.R.autoSkipSeconds > 0 && a.time > this.R.autoSkipSeconds) {
      this.skip();
    }
    if (b.exitQueued) return; // boarding is braking for an early stop
    if (this.driver.update(v, dt) === 'arrived') {
      a.arrived = true;
      b.requestExit();
    }
  }

  dispose() {
    this.menu.remove();
    this.skipBtn.remove();
    this.fade.remove();
    this.game.setPaused('rideMenu', false);
  }
}
