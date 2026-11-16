// Feature: touch controls (mobile). Left side = floating joystick, right side drag =
// camera, plus the action buttons. Everything writes into game.input, exactly like the
// keyboard does. Layout + sensitivity: data/controls.json → touch.
// Shown on touch devices (or with ?touch=1 for testing on a computer).

import { debug } from '../../core/debug.js';
import { t } from '../../ui/i18n.js';

let game = null;
let cfg = null;
let root = null;
let offs = [];
let stick = null; // { id, cx, cy } while a finger is on the joystick
let lookId = null;
let lookX = 0;
let lookY = 0;

function setKnob(dx, dy) {
  root.querySelector('.joy-knob').style.transform = `translate(${dx}px, ${dy}px)`;
}

function placeBase(x, y) {
  const base = root.querySelector('.joy-base');
  if (x == null) {
    base.style.left = base.style.top = '';
    base.classList.remove('active');
  } else {
    base.style.left = `${x}px`;
    base.style.top = `${y}px`;
    base.classList.add('active');
  }
}

function bindJoystick(zone) {
  const j = cfg.joystick;
  zone.addEventListener('pointerdown', (e) => {
    if (stick) return;
    zone.setPointerCapture(e.pointerId);
    stick = { id: e.pointerId, cx: e.clientX, cy: e.clientY };
    placeBase(e.clientX, e.clientY);
    game.input.setTouchMove(0, 0, true);
  });
  zone.addEventListener('pointermove', (e) => {
    if (!stick || e.pointerId !== stick.id) return;
    const dx0 = e.clientX - stick.cx;
    const dy0 = e.clientY - stick.cy;
    let dx = dx0;
    let dy = dy0;
    const len = Math.hypot(dx, dy);
    if (len > j.radius) { dx *= j.radius / len; dy *= j.radius / len; }
    setKnob(dx, dy);
    let mag = Math.min(1, len / j.radius);
    mag = mag < j.deadzone ? 0 : (mag - j.deadzone) / (1 - j.deadzone);
    // direction * strength; screen-up means forward
    const n = len || 1;
    game.input.setTouchMove((dx0 / n) * mag, (-dy0 / n) * mag, true);
  });
  const end = (e) => {
    if (!stick || e.pointerId !== stick.id) return;
    stick = null;
    setKnob(0, 0);
    placeBase(null);
    game.input.setTouchMove(0, 0, false);
  };
  zone.addEventListener('pointerup', end);
  zone.addEventListener('pointercancel', end);
}

function bindLook(zone) {
  zone.addEventListener('pointerdown', (e) => {
    if (lookId !== null) return;
    zone.setPointerCapture(e.pointerId);
    lookId = e.pointerId;
    lookX = e.clientX;
    lookY = e.clientY;
  });
  zone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== lookId) return;
    game.input.addLook((e.clientX - lookX) * cfg.lookSensitivity, (e.clientY - lookY) * cfg.lookSensitivity);
    lookX = e.clientX;
    lookY = e.clientY;
  });
  const end = (e) => { if (e.pointerId === lookId) lookId = null; };
  zone.addEventListener('pointerup', end);
  zone.addEventListener('pointercancel', end);
}

function makeButtons() {
  for (const b of cfg.buttons) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `touch-btn touch-${b.action}`;
    el.dataset.label = b.label;
    el.dataset.onFoot = b.label;
    el.dataset.driving = b.drivingLabel || b.label;
    el.textContent = t(b.label);
    el.style.width = el.style.height = `${b.size}px`;
    el.style.right = `calc(env(safe-area-inset-right, 0px) + ${b.right}px)`;
    el.style.bottom = `calc(env(safe-area-inset-bottom, 0px) + ${b.bottom}px)`;
    const set = (down) => (e) => {
      e.preventDefault();
      if (down) el.setPointerCapture(e.pointerId);
      el.classList.toggle('down', down);
      game.input.setButton(b.action, down);
    };
    el.addEventListener('pointerdown', set(true));
    el.addEventListener('pointerup', set(false));
    el.addEventListener('pointercancel', set(false));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    root.appendChild(el);
  }
}

function show() {
  root.hidden = false;
}

export default {
  id: 'touchControls',

  init(g) {
    game = g;
    cfg = g.config.get('controls').touch;
    const j = cfg.joystick;
    root = document.createElement('div');
    root.id = 'touch';
    root.hidden = true;
    root.innerHTML = `
      <div class="touch-zone touch-move"></div>
      <div class="touch-zone touch-look"></div>
      <div class="joy-base"><div class="joy-knob"></div></div>`;
    root.style.setProperty('--joy-size', `${j.radius * 2}px`);
    root.style.setProperty('--joy-knob', `${j.knob * 2}px`);
    root.style.setProperty('--joy-left', `${j.left}px`);
    root.style.setProperty('--joy-bottom', `${j.bottom}px`);
    g.ui.appendChild(root);
    bindJoystick(root.querySelector('.touch-move'));
    bindLook(root.querySelector('.touch-look'));
    makeButtons();

    const isTouch = window.matchMedia('(pointer: coarse)').matches || debug.flag('touch') === '1';
    if (isTouch) show();
    else window.addEventListener('touchstart', show, { once: true, passive: true }); // hybrid laptops
    const relabel = () => root.querySelectorAll('.touch-btn').forEach((el) => { el.textContent = t(el.dataset.label); });
    offs = [
      g.events.on('language:changed', relabel),
      // In a vehicle the same buttons mean Exit / Gas / Handbrake (data/controls.json → drivingLabel).
      g.events.on('controls:mode', ({ mode }) => {
        root.classList.toggle('driving', mode === 'driving');
        root.querySelectorAll('.touch-btn').forEach((el) => { el.dataset.label = mode === 'driving' ? el.dataset.driving : el.dataset.onFoot; });
        relabel();
      }),
    ];
  },

  update() {},

  dispose() {
    offs.forEach((off) => off());
    offs = [];
    window.removeEventListener('touchstart', show);
    root?.remove();
    root = null;
  },
};
