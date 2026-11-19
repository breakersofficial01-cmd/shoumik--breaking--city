// Feature: profileCard (Session 7). Tap Shoumik's portrait in the HUD (profile:open) → his
// "hidden" profile card: portrait, name, college lines (data/profile.json), stats from the save
// (lessons, Taka earned, time played, vehicles, homes, kills, chases…) and the reward codes he
// unlocked, each with a Copy button (codes come from the rewardCodes feature via game.rewards).
// It also counts the time played (save.data.playSeconds).
//
// Listens: profile:open, stats:changed, reward:unlocked, language:changed

import { createOverlay, esc } from '../../ui/overlay.js';
import { formatMoney, formatNumber, pickName, t } from '../../ui/i18n.js';

let game = null;
let cfg = null;
let ov = null;
let offs = [];

/** "1:05:09" / "12:04" style time from seconds, in the game's digits. */
function duration(sec) {
  const s = Math.floor(sec || 0);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const two = (n) => String(n).padStart(2, '0');
  const text = h > 0 ? `${h}:${two(m)}:${two(r)}` : `${m}:${two(r)}`;
  return text.replace(/\d+/g, (d) => formatNumber(Number(d)).padStart(d.length, formatNumber(0)));
}

/** Value of one stat id (data/profile.json → stats). */
function statValue(id) {
  const d = game.save.data;
  const st = d.stats || {};
  const lessons = Object.values(d.lessons || {});
  switch (id) {
    case 'cash': return formatMoney(game.economy.getCash());
    case 'lessonsDone': return formatNumber(lessons.filter((l) => (l.paid?.length || 0) > 0).length);
    case 'lessonEarned': return formatMoney(lessons.reduce((a, l) => a + (l.earned || 0), 0));
    case 'quizEarned': return formatMoney(d.classes?.earned || 0);
    case 'playTime': return duration(d.playSeconds);
    case 'vehicles': return formatNumber(d.owned?.vehicles?.length || 0);
    case 'homes': return formatNumber(d.owned?.homes?.length || 0);
    case 'longestChase': return duration(st.longestChase || 0);
    default: return formatNumber(st[id] || 0);
  }
}

function rewardsHtml() {
  const list = game.rewards?.list() || [];
  if (!list.length) return '';
  const done = game.rewards.lessonsDone();
  const rows = list.map(({ reward: r, unlocked }) => unlocked
    ? `<li class="reward open"><div><b>${esc(pickName(r.title))}</b><small>${esc(pickName(r.note))}</small></div>
         <code>${esc(r.code)}</code><button type="button" data-copy="${esc(r.code)}">${esc(t('profile.copy'))}</button>
         ${r.link ? `<button type="button" data-link="${esc(r.link)}">↗</button>` : ''}</li>`
    : `<li class="reward locked"><div><b>🔒 ${esc(pickName(r.title))}</b><small>${esc(t('profile.rewardNeed', { n: formatNumber(r.lessonsRequired), done: formatNumber(done) }))}</small></div></li>`).join('');
  return `<h3>${esc(t('profile.rewards'))}</h3><ul class="profile-rewards">${rows}</ul>`;
}

function render() {
  const portrait = game.assets.url('image.shoumik.portrait');
  ov.panel.innerHTML = `
    <div class="profile-head">
      ${portrait ? `<img src="${esc(portrait)}" alt="" draggable="false">` : ''}
      <div>
        <p class="profile-tag">${esc(t('profile.title'))}</p>
        <h2>${esc(pickName(cfg.name))}</h2>
        ${cfg.facts.map((f) => `<p class="profile-fact">${esc(pickName(f))}</p>`).join('')}
      </div>
    </div>
    <dl class="profile-stats">
      ${cfg.stats.map((id) => `<div><dt>${esc(t(`profile.stat.${id}`))}</dt><dd>${esc(statValue(id))}</dd></div>`).join('')}
    </dl>
    ${rewardsHtml()}
    <button type="button" class="panel-close" data-close>${esc(t('settings.close'))}</button>`;
}

export default {
  id: 'profileCard',

  init(g) {
    game = g;
    cfg = g.config.get('profile');
    ov = createOverlay(g, { id: 'profile-card', reason: 'profile', className: 'profile-card' });
    ov.root.addEventListener('click', async (e) => {
      const copy = e.target.closest('[data-copy]');
      const link = e.target.closest('[data-link]');
      if (copy) {
        const ok = await (g.rewards?.copy(copy.dataset.copy) ?? Promise.resolve(false));
        copy.textContent = t(ok ? 'profile.copied' : 'profile.copyFailed');
        g.audio?.play('click');
      } else if (link) {
        window.open(link.dataset.link, '_blank', 'noopener');
      } else if (e.target.closest('[data-close]') || e.target === ov.root) {
        ov.close();
      }
    });
    offs = [
      g.events.on('profile:open', () => { render(); ov.open(); }),
      g.events.on('stats:changed', () => { if (ov.isOpen) render(); }),
      g.events.on('reward:unlocked', () => { if (ov.isOpen) render(); }),
      g.events.on('language:changed', () => { if (ov.isOpen) render(); }),
    ];
  },

  update(dt) {
    // Feature updates only run while the game is not paused, so this is real play time.
    game.save.data.playSeconds = (game.save.data.playSeconds || 0) + dt;
  },

  dispose() {
    offs.forEach((off) => off());
    offs = [];
    ov?.dispose();
    ov = null;
  },
};
