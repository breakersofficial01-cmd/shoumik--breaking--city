// Feature: rewardCodes (Session 7). Codes (e.g. course discounts) from data/rewards.json —
// loaded through the Content Service, so they can later come from a Google Sheet — unlock when
// the player has finished enough lessons (a lesson counts once one of its questions was paid).
// Unlocked codes are saved (save.data.rewards[id] = time) and shown in the profile card with a
// Copy button (copyText below, shared through game.rewards).
//
// Shares:  game.rewards = { list(), lessonsDone(), copy(code) }   (read-only for others)
// Listens: lesson:completed
// Sends:   reward:unlocked { id }, toast:show

import { validateRewards } from '../../content/validators.js';
import { pickName } from '../../ui/i18n.js';
import { log } from '../../core/debug.js';

let game = null;
let offs = [];

const today = () => new Date().toISOString().slice(0, 10);

/** Codes that are switched on and inside their dates. */
function live() {
  const d = today();
  return (game.content.get('rewards') || []).filter((r) => r.active && (!r.startDate || d >= r.startDate) && (!r.endDate || d <= r.endDate));
}

/** Lessons with at least one question paid (save.data.lessons, see classes/progress.js). */
function lessonsDone() {
  return Object.values(game.save.data.lessons || {}).filter((l) => (l.paid?.length || 0) > 0).length;
}

function check(announce) {
  const done = lessonsDone();
  const got = game.save.data.rewards || (game.save.data.rewards = {});
  for (const r of live()) {
    if (got[r.id] || done < r.lessonsRequired) continue;
    got[r.id] = Date.now();
    log.info(`reward unlocked: ${r.id}`);
    game.events.emit('reward:unlocked', { id: r.id });
    if (announce) {
      game.audio?.play('reward');
      game.events.emit('toast:show', { key: 'reward.unlocked', vars: { title: pickName(r.title) }, seconds: 5 });
    }
  }
}

/** Copy text to the clipboard (with an old-browser fallback). Resolves true when it worked. */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

export default {
  id: 'rewardCodes',

  async init(g) {
    game = g;
    g.content.registerType('rewards', { localPath: 'data/rewards.json', validate: validateRewards });
    await g.content.load('rewards');
    g.rewards = {
      /** [{ reward, unlocked: bool, at }] in order of lessons needed */
      list: () => live().map((r) => ({ reward: r, unlocked: !!g.save.data.rewards?.[r.id], at: g.save.data.rewards?.[r.id] || 0 })),
      lessonsDone,
      copy: copyText,
    };
    check(false); // codes earned before this feature existed unlock quietly
    offs = [g.events.on('lesson:completed', () => check(true))];
  },

  update() {},

  dispose() {
    offs.forEach((off) => off());
    offs = [];
    game.rewards = null;
  },
};
