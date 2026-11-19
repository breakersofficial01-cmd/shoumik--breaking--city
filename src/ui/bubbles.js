// Speech bubbles: short Bangla/English shouts floating over a pedestrian's head
// ("বাঁচাও!"). Plain HTML labels placed over the 3D view; a few at a time. Shared by the
// pedestrians and police features (anything with x, y, z can talk).
// Text comes from data/strings.json and uses the UI font (var(--font-ui)).

import * as THREE from 'three';
import { t } from './i18n.js';

const _v = new THREE.Vector3();

export class Bubbles {
  constructor(game, max, seconds) {
    this.game = game;
    this.seconds = seconds;
    this.root = document.createElement('div');
    this.root.id = 'ped-bubbles';
    game.ui.appendChild(this.root);
    this.items = [];
    for (let i = 0; i < max; i++) {
      const el = document.createElement('div');
      el.className = 'ped-bubble';
      el.hidden = true;
      this.root.appendChild(el);
      this.items.push({ el, ped: null, time: 0 });
    }
  }

  /** Show a shout over a pedestrian (ignored if all bubbles are busy or he already has one). */
  say(ped, key) {
    if (this.items.some((b) => b.ped === ped)) return;
    const free = this.items.find((b) => !b.ped);
    if (!free) return;
    free.ped = ped;
    free.time = this.seconds;
    free.el.textContent = t(key);
    free.el.hidden = false;
  }

  update(dt) {
    const cam = this.game.camera;
    const w = window.innerWidth, h = window.innerHeight;
    for (const b of this.items) {
      if (!b.ped) continue;
      b.time -= dt;
      if (b.time <= 0 || !b.ped.active) { b.ped = null; b.el.hidden = true; continue; }
      _v.set(b.ped.x, b.ped.y + (b.ped.state === 'down' ? 0.9 : 1.95), b.ped.z).project(cam);
      const behind = _v.z > 1 || Math.abs(_v.x) > 1.1 || Math.abs(_v.y) > 1.1;
      b.el.style.visibility = behind ? 'hidden' : 'visible';
      b.el.style.transform = `translate(-50%, -100%) translate(${((_v.x + 1) / 2) * w}px, ${((1 - _v.y) / 2) * h}px)`;
      b.el.style.opacity = Math.min(1, b.time * 3);
    }
  }

  dispose() {
    this.root.remove();
  }
}
