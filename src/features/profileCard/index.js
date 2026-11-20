// Feature: profileCard (Session 7, Session 9: the PLAYER'S profile). Tap the name in the HUD
// (profile:open) → the signed-in player's card: name, phone (partly hidden), class, sync state,
// health / armour / cash, the vehicles, weapons (+ bullets), homes and clothes they own, the
// lessons they completed, stats from the save (data/profile.json → stats) and the reward codes,
// each with a Copy button (codes come from the rewardCodes feature via game.rewards).
// "Sign out" (asks twice) saves, signs out and reloads → the sign-in screen.
// It also counts the time played (save.data.playSeconds).
//
// Listens: profile:open, stats:changed, reward:unlocked, language:changed, cash/health/armour changes

import { createOverlay, esc } from '../../ui/overlay.js';
import { formatMoney, formatNumber, pickName, t, getLanguage } from '../../ui/i18n.js';

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

/** One "chips" row: a heading + the names of owned things (or "none"). */
function chips(titleKey, names) {
  const list = names.length ? names.map((n) => `<span class="chip">${esc(n)}</span>`).join('') : `<span class="chip none">${esc(t('profile.none'))}</span>`;
  return `<div class="profile-owned"><h4>${esc(t(titleKey))} <small>${esc(formatNumber(names.length))}</small></h4><div>${list}</div></div>`;
}

function ownedHtml() {
  const c = game.config;
  const d = game.save.data;
  const vt = c.get('vehicles').types;
  const weapons = c.get('weapons').weapons;
  const shops = c.get('shops');
  const vehicles = (d.owned.vehicles || []).map((v) => pickName(vt[v.type || v]?.name) || v.type || v);
  const guns = (d.owned.weapons || []).map((id) => {
    const w = weapons.find((x) => x.id === id);
    const ammo = d.ammo?.[id];
    return `${w?.icon || ''} ${pickName(w?.name) || id}${Number.isFinite(ammo) ? ` (${formatNumber(ammo)})` : ''}`.trim();
  });
  const homes = (d.owned.homes || []).map((id) => pickName(shops.homes[id]?.name) || id);
  const outfits = (d.owned.outfits || []).map((id) => pickName(c.get('outfits').outfits.find((o) => o.id === id)?.name) || id);
  const lessons = game.content.get('lessons');
  const done = Object.entries(d.lessons || {}).filter(([, l]) => (l.paid?.length || 0) > 0).map(([id]) => lessons.find((l) => l.id === id)?.title || id);
  return chips('profile.ownVehicles', vehicles) + chips('profile.ownWeapons', guns) + chips('profile.ownHomes', homes)
    + chips('profile.ownOutfits', outfits) + chips('profile.lessonsList', done);
}

function headHtml() {
  const me = game.account?.current;
  const cls = game.config.get('accounts')?.classes?.find((x) => x.id === me?.classLevel);
  const L = getLanguage();
  const phone = me?.phone ? `${me.phone.slice(0, 3)}•••••${me.phone.slice(-3)}` : '';
  const sync = game.account?.online ? t(`profile.sync.${game.account.syncState || 'off'}`) : t('profile.sync.local');
  const name = me?.name || t('hud.player');
  return `
    <div class="profile-head">
      <span class="profile-badge">${esc([...name.trim()][0]?.toUpperCase() || '?')}</span>
      <div>
        <p class="profile-tag">${esc(t('profile.title'))}</p>
        <h2>${esc(name)}</h2>
        ${phone ? `<p class="profile-fact">📱 ${esc(phone)}</p>` : ''}
        ${me?.classLevel ? `<p class="profile-fact">🎓 ${esc(cls ? cls[L] || cls.en : me.classLevel)}</p>` : ''}
        <p class="profile-fact small">☁ ${esc(sync)}</p>
      </div>
    </div>`;
}

function vitalsHtml() {
  const h = game.player?.health || { value: 0, max: 100 };
  const a = game.player?.armour || { value: 0, max: 100 };
  const bar = (cls, v, m) => `<i class="bar ${cls}"><b style="width:${Math.round((m > 0 ? v / m : 0) * 100)}%"></b></i>`;
  return `<div class="profile-vitals">
      <div><span>❤ ${esc(t('hud.health'))}</span>${bar('hp', h.value, h.max)}<em>${esc(formatNumber(h.value))}/${esc(formatNumber(h.max))}</em></div>
      <div><span>🛡 ${esc(t('profile.armour'))}</span>${bar('ar', a.value, a.max)}<em>${esc(formatNumber(a.value))}/${esc(formatNumber(a.max))}</em></div>
      <div><span>💰 ${esc(t('profile.stat.cash'))}</span><em class="cash">${esc(formatMoney(game.economy.getCash()))}</em></div>
    </div>`;
}

let confirmOut = false;
function render() {
  ov.panel.innerHTML = `
    ${headHtml()}
    ${vitalsHtml()}
    ${ownedHtml()}
    <h3>${esc(t('profile.statsTitle'))}</h3>
    <dl class="profile-stats">
      ${cfg.stats.map((id) => `<div><dt>${esc(t(`profile.stat.${id}`))}</dt><dd>${esc(statValue(id))}</dd></div>`).join('')}
    </dl>
    ${rewardsHtml()}
    <div class="profile-actions">
      <button type="button" class="profile-out" data-signout>${esc(t(confirmOut ? 'profile.signOutSure' : 'profile.signOut'))}</button>
      <button type="button" class="panel-close" data-close>${esc(t('settings.close'))}</button>
    </div>`;
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
      } else if (e.target.closest('[data-signout]')) {
        if (!confirmOut) { confirmOut = true; render(); return; }
        g.save.flush();
        g.account?.syncNow(true);
        g.account?.signOut();
        setTimeout(() => location.reload(), 300);
      } else if (e.target.closest('[data-close]') || e.target === ov.root) {
        ov.close();
      }
    });
    offs = [
      g.events.on('profile:open', () => { confirmOut = false; render(); ov.open(); }),
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
