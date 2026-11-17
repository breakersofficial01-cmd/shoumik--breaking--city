// Input: one shared state that both desktop (keyboard + mouse) and the touch controls write
// into, so gameplay code never cares where input came from.
//
//   input.move      { x, y }   -1..1, y = forward
//   input.held      { sprint, jump, action, attack, weapon, horn, open }  (true while down)
//   input.pressed   same names, true only on the frame the button went down
//   input.look      { x, y }   camera turn collected this frame (radians)
// Each press also emits an event: `input:jump`, `input:action`, `input:attack`, ...
// Key bindings and sensitivities: data/controls.json.

import { events } from './events.js';

const ACTIONS = ['sprint', 'jump', 'action', 'attack', 'weapon', 'horn', 'open'];

export class Input {
  constructor(controlsCfg, canvas) {
    this.cfg = controlsCfg;
    this.canvas = canvas;
    this.move = { x: 0, y: 0 };
    this.look = { x: 0, y: 0 };
    this.held = {};
    this.pressed = {};
    for (const a of ACTIONS) this.held[a] = this.pressed[a] = false;
    this.keys = new Set();
    this.touchMove = { x: 0, y: 0, active: false };
    this.pointerLocked = false;
    this.dragging = false;
    this.usingTouch = false;

    // code -> action name lookup
    this.keyMap = new Map();
    for (const [action, codes] of Object.entries(controlsCfg.keyboard)) {
      for (const code of codes) this.keyMap.set(code, action);
    }
    this.bind();
  }

  bind() {
    const onKey = (down) => (e) => {
      const action = this.keyMap.get(e.code);
      if (!action || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target?.closest?.('input, textarea, select')) return;
      e.preventDefault();
      if (down && e.repeat) return;
      if (down) this.keys.add(e.code); else this.keys.delete(e.code);
      if (ACTIONS.includes(action)) this.setButton(action, this.anyKeyDown(action));
    };
    this._keydown = onKey(true);
    this._keyup = onKey(false);
    window.addEventListener('keydown', this._keydown);
    window.addEventListener('keyup', this._keyup);
    this._blur = () => {
      this.keys.clear();
      for (const a of ACTIONS) this.held[a] = false;
    };
    window.addEventListener('blur', this._blur);

    // Mouse: click the game to capture the mouse (Esc frees it); then mouse = camera,
    // click = attack. Without capture, hold the button and drag to look around.
    const c = this.canvas;
    const sens = this.cfg.mouse.sensitivity;
    const inv = this.cfg.mouse.invertY ? -1 : 1;
    this._mousedown = (e) => {
      if (e.pointerType !== 'mouse') return;
      if (this.pointerLocked) {
        if (e.button === 0) this.setButton('attack', true);
      } else {
        this.dragging = true;
        c.requestPointerLock?.()?.catch?.(() => {});
      }
    };
    this._mouseup = (e) => {
      if (e.pointerType !== 'mouse') return;
      this.dragging = false;
      if (e.button === 0) this.setButton('attack', false);
    };
    this._mousemove = (e) => {
      if (e.pointerType !== 'mouse' || (!this.pointerLocked && !this.dragging)) return;
      this.addLook(e.movementX * sens, e.movementY * sens * inv);
    };
    this._lockchange = () => { this.pointerLocked = document.pointerLockElement === c; };
    c.addEventListener('pointerdown', this._mousedown);
    window.addEventListener('pointerup', this._mouseup);
    window.addEventListener('pointermove', this._mousemove);
    document.addEventListener('pointerlockchange', this._lockchange);
    c.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  anyKeyDown(action) {
    return this.cfg.keyboard[action].some((code) => this.keys.has(code));
  }

  /** Touch joystick writes here. */
  setTouchMove(x, y, active) {
    this.touchMove.x = x;
    this.touchMove.y = y;
    this.touchMove.active = active;
    if (active) this.usingTouch = true;
  }

  /** Buttons (keyboard, mouse or touch). */
  setButton(action, down) {
    if (down && !this.held[action]) {
      this.pressed[action] = true;
      events.emit(`input:${action}`, {});
    }
    this.held[action] = down;
  }

  addLook(dx, dy) {
    this.look.x += dx;
    this.look.y += dy;
  }

  /** Call at the start of each frame. */
  update() {
    let x = 0, y = 0;
    if (this.anyKeyDown('forward')) y += 1;
    if (this.anyKeyDown('back')) y -= 1;
    if (this.anyKeyDown('right')) x += 1;
    if (this.anyKeyDown('left')) x -= 1;
    if (x !== 0 || y !== 0) {
      const len = Math.hypot(x, y);
      this.move.x = x / len;
      this.move.y = y / len;
    } else if (this.touchMove.active) {
      this.move.x = this.touchMove.x;
      this.move.y = this.touchMove.y;
    } else {
      this.move.x = this.move.y = 0;
    }
  }

  /** Call at the end of each frame. */
  endFrame() {
    for (const a of ACTIONS) this.pressed[a] = false;
    this.look.x = this.look.y = 0;
  }

  dispose() {
    window.removeEventListener('keydown', this._keydown);
    window.removeEventListener('keyup', this._keyup);
    window.removeEventListener('blur', this._blur);
    this.canvas.removeEventListener('pointerdown', this._mousedown);
    window.removeEventListener('pointerup', this._mouseup);
    window.removeEventListener('pointermove', this._mousemove);
    document.removeEventListener('pointerlockchange', this._lockchange);
  }
}
