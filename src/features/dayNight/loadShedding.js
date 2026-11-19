// Load-shedding (part of the dayNight feature, Session 7): now and then one district loses
// power for a while — its lit windows and shop signs go dark (world.cityShading.setCut), the
// posters feature switches off its LED screens and billboards there, and the sound feature
// starts generators. Numbers: data/dayNight.json → loadShedding.
//
// Sends:  power:cut { district, rect: {x0,z0,x1,z1}, on }   (on = false when power is back)
//         toast:show { key, vars }
// Debug:  BC.events.emit('power:cutNow', { district: 'old-dhaka' })

import { pickName } from '../../ui/i18n.js';

export class LoadShedding {
  constructor(game, cfg) {
    this.game = game;
    this.cfg = cfg;
    this.active = null;          // { district, rect, left }
    this.wait = cfg.firstAfterSeconds;
    this.off = game.events.on('power:cutNow', ({ district } = {}) => this.start(district));
  }

  /** World rectangle of a district (data/districts.json rect in block units). */
  rectOf(d) {
    const L = this.game.world.layout;
    const r = d.rect;
    return { x0: L.minX + r.col * L.P, z0: L.minZ + r.row * L.P, x1: L.minX + (r.col + r.cols) * L.P + L.W, z1: L.minZ + (r.row + r.rows) * L.P + L.W };
  }

  start(districtId) {
    if (this.active) this.stop();
    const L = this.game.world.layout;
    let d = districtId ? L.districts.find((x) => x.id === districtId) : null;
    if (!d) {
      // Half the time it is the district Shoumik is in, so players notice it.
      const p = this.game.player?.position;
      const here = p ? this.game.world.districtAt(p.x, p.z) : null;
      d = here && Math.random() < 0.5 ? here : L.districts[Math.floor(Math.random() * L.districts.length)];
    }
    const rect = this.rectOf(d);
    this.active = { district: d.id, rect, left: this.cfg.seconds };
    this.game.world.cityShading.setCut(rect);
    this.game.events.emit('power:cut', { district: d.id, rect, on: true });
    this.game.events.emit('toast:show', { key: 'power.cut', vars: { district: pickName(d.name) } });
  }

  stop() {
    const a = this.active;
    if (!a) return;
    this.active = null;
    this.game.world.cityShading.setCut(null);
    this.game.events.emit('power:cut', { district: a.district, rect: a.rect, on: false });
    const p = this.game.player?.position;
    if (p && p.x >= a.rect.x0 && p.x <= a.rect.x1 && p.z >= a.rect.z0 && p.z <= a.rect.z1) {
      this.game.events.emit('toast:show', { key: 'power.back' });
    }
  }

  update(dt, night) {
    if (!this.cfg.enabled) return;
    if (this.active) {
      this.active.left -= dt;
      if (this.active.left <= 0) this.stop();
      return;
    }
    if (this.cfg.nightOnly && !night) return;
    this.wait -= dt;
    if (this.wait <= 0) {
      const [a, b] = this.cfg.everyMinutes;
      this.wait = (a + Math.random() * (b - a)) * 60;
      this.start(null);
    }
  }

  dispose() {
    this.stop();
    this.off();
  }
}
