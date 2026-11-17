// The wallet. Cash lives in the save; every change emits `cash:changed`
// so the HUD (and later shops, classes, police) stay in sync without importing each other.

import { events } from './events.js';
import { save } from './save.js';

export const economy = {
  getCash: () => save.data.cash,

  /** Add (or with a negative number, remove) Taka. `reason` is for logs/stats. */
  addCash(amount, reason = '') {
    if (!Number.isFinite(amount) || amount === 0) return save.data.cash;
    save.data.cash = Math.max(0, Math.round(save.data.cash + amount));
    events.emit('cash:changed', { cash: save.data.cash, delta: amount, reason });
    return save.data.cash;
  },

  /** Try to pay. Returns false (and changes nothing) when there is not enough cash. */
  spend(amount, reason = '') {
    if (amount > save.data.cash) return false;
    this.addCash(-amount, reason);
    return true;
  },
};
