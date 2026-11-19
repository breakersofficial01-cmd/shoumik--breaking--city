// Weapons HUD: the badge left of the minimap (icon, name, ammo), the desktop crosshair, the red
// lock-on ring on phones and the hit marker. Used only by ./index.js.

import * as THREE from 'three';
import { pickName, formatNumber } from '../../ui/i18n.js';

const _v = new THREE.Vector3();

export class WeaponHud {
  constructor(game) {
    this.game = game;
    const ui = game.ui;
    this.badge = document.createElement('div');
    this.badge.id = 'weapon-hud';
    this.badge.innerHTML = '<span class="w-icon"></span><span class="w-name"></span><span class="w-ammo"></span>';
    this.badge.style.setProperty('--weapon-right', `${(game.config.get('ui').minimap?.size || 132) + 24}px`);
    this.cross = document.createElement('div');
    this.cross.id = 'crosshair';
    this.lock = document.createElement('div');
    this.lock.id = 'lock-marker';
    this.hit = document.createElement('div');
    this.hit.id = 'hit-marker';
    this.cross.hidden = this.lock.hidden = this.hit.hidden = true;
    ui.append(this.badge, this.cross, this.lock, this.hit);
    this.hitTimer = 0;
    this.last = '';
  }

  /** w = weapon entry, ammo = number or null (melee), show = false hides the badge. */
  setWeapon(w, ammo, show = true) {
    const key = `${w?.id}|${ammo}|${show}|${this.game.save.data.settings.language}`;
    if (key === this.last) return;
    this.last = key;
    this.badge.hidden = !show || !w;
    if (!w) return;
    this.badge.querySelector('.w-icon').textContent = w.icon || '';
    this.badge.querySelector('.w-name').textContent = pickName(w.name) || w.id;
    const a = this.badge.querySelector('.w-ammo');
    a.textContent = ammo == null ? '' : formatNumber(ammo);
    a.classList.toggle('empty', ammo === 0);
  }

  refresh() { this.last = ''; }

  showCrosshair(on) {
    if (this.cross.hidden === !on) return;
    this.cross.hidden = !on;
  }

  /** Put the lock-on ring over a target (or hide it with null). */
  showLock(t) {
    if (!t) { this.lock.hidden = true; return; }
    const cam = this.game.camera;
    _v.set(t.x, t.y + t.h * 0.6, t.z).project(cam);
    if (_v.z > 1) { this.lock.hidden = true; return; }
    const r = this.game.ui.getBoundingClientRect();
    this.lock.style.left = `${((_v.x + 1) / 2) * r.width}px`;
    this.lock.style.top = `${((1 - _v.y) / 2) * r.height}px`;
    this.lock.hidden = false;
  }

  flashHit(seconds) {
    this.hitTimer = seconds;
    this.hit.hidden = false;
  }

  update(dt) {
    if (this.hitTimer > 0) {
      this.hitTimer -= dt;
      if (this.hitTimer <= 0) this.hit.hidden = true;
    }
  }

  dispose() {
    for (const el of [this.badge, this.cross, this.lock, this.hit]) el.remove();
  }
}
