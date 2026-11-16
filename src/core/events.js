// Event bus. Features talk to each other ONLY through this (CLAUDE.md rule 4).
//
// Usage:
//   import { events } from '../core/events.js';
//   const off = events.on('cash:changed', ({ cash }) => ...);
//   events.emit('cash:changed', { cash: 500, delta: 0 });
//   off();                       // stop listening
//
// Known events are listed in docs/HANDOFF.md ("Events"). Add new ones there.

class EventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this.listeners = new Map();
  }

  /** Listen to an event. Returns a function that removes the listener. */
  on(name, fn) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name).add(fn);
    return () => this.off(name, fn);
  }

  /** Listen once. */
  once(name, fn) {
    const off = this.on(name, (payload) => {
      off();
      fn(payload);
    });
    return off;
  }

  off(name, fn) {
    const set = this.listeners.get(name);
    if (set) set.delete(fn);
  }

  /** Send an event. A listener that throws never breaks the others. */
  emit(name, payload) {
    const set = this.listeners.get(name);
    if (!set || set.size === 0) return;
    for (const fn of [...set]) {
      try {
        fn(payload);
      } catch (err) {
        console.error(`[events] listener for "${name}" failed`, err);
      }
    }
  }
}

export const events = new EventBus();
