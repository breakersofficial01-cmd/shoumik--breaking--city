// Which poster shows in which slot. Pure functions, no Three.js.
//   - A poster is shown only from startDate to endDate (both days included, the player's
//     local date), only in its districts, and only in slots of its shape.
//   - Normal slots pick one poster per day (weighted, the same all day on every device).
//   - LED screens step through every poster that fits, one every ledRotateSeconds (with fewer
//     than two, the default poster takes turns too, so a screen always changes).
//   - Nothing fits → the default poster of that shape (settings.defaults in data/posters.json).

import { hashInts } from '../../core/rng.js';

/** Today's date as 'YYYY-MM-DD' in local time (string compare works for these). */
export function todayString(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** Day number (changes at local midnight) — seeds the daily pick. */
export const dayNumber = (now = new Date()) => Math.floor((now.getTime() - now.getTimezoneOffset() * 60000) / 86400000);

export function isLive(poster, today) {
  if (!poster.active) return false;
  if (poster.startDate && today < poster.startDate) return false;
  if (poster.endDate && today > poster.endDate) return false;
  return true;
}

/** Live posters that may appear in a slot of this shape and district. */
export function eligible(posters, shape, district) {
  return posters.filter((p) => p.shape === shape && (p.districts === 'all' || p.districts.includes(district)));
}

/** Weighted pick from a list using a fixed seed. */
export function weightedPick(list, seed) {
  if (!list.length) return null;
  const total = list.reduce((s, p) => s + p.weight, 0);
  let r = (hashInts(seed) / 4294967296) * total;
  for (const p of list) {
    r -= p.weight;
    if (r <= 0) return p;
  }
  return list[list.length - 1];
}

/** LED playlist: each poster repeated by its (rounded) weight, so heavier ones come up more often. */
export function playlist(list) {
  const out = [];
  for (const p of list) for (let i = 0; i < Math.max(1, Math.round(p.weight)); i++) out.push(p);
  return out;
}
