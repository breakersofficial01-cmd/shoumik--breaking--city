// Busted / jail / wasted screens as HTML strings (buttons carry data-act). Like Class Mode,
// every screen is drawn in ONE fixed language L (Bangla by default, CLAUDE.md "Quiz language"):
// text with tl(L, ...), numbers and Taka with Bangla digits via numIn / moneyIn.

import { tl, numIn, moneyIn } from '../../ui/i18n.js';
import { esc } from '../../ui/overlay.js';

const T = (L, key, vars) => esc(tl(L, key, vars));

export function bailScreen(L, { stars, bail, cash, perStar }) {
  const enough = cash >= bail;
  return `
    <h2>🚓 ${T(L, 'jail.bustedTitle')}</h2>
    <p class="jail-line jail-big">${T(L, 'jail.bail', { money: moneyIn(L, bail) })}</p>
    <p class="class-note">${T(L, 'jail.bailWhy', { stars: numIn(L, stars), per: moneyIn(L, perStar) })}</p>
    <p class="jail-line">${T(L, 'jail.yourCash', { money: moneyIn(L, cash) })}</p>
    ${enough
      ? `<button type="button" class="panel-close" data-act="pay">${T(L, 'jail.pay', { money: moneyIn(L, bail) })}</button>`
      : `<p class="class-note">${T(L, 'jail.notEnough', { owed: moneyIn(L, bail - cash) })}</p>
         <button type="button" class="panel-close" data-act="jail">${T(L, 'jail.goToJail')}</button>`}`;
}

export function jailScreen(L, { owed, paid, perCorrect, hasQuestions }) {
  const share = owed > 0 ? Math.min(1, paid / owed) : 1;
  return `
    <h2>🔒 ${T(L, 'jail.title')}</h2>
    <p class="class-sub">${T(L, 'jail.studyNote', { per: moneyIn(L, perCorrect) })}</p>
    <div class="jail-bar"><i style="width:${Math.round(share * 100)}%"></i></div>
    <p class="jail-line">${T(L, 'jail.progress', { paid: moneyIn(L, Math.min(paid, owed)), owed: moneyIn(L, owed) })}</p>
    ${hasQuestions
      ? `<button type="button" class="class-big" data-act="study"><b>📘 ${T(L, 'jail.study')}</b></button>`
      : `<p class="class-note">${T(L, 'jail.noQuestions')}</p><button type="button" class="panel-close" data-act="free">${T(L, 'jail.leave')}</button>`}`;
}

export function roundEndScreen(L, { correct, total, earned }) {
  return `
    <h2>${T(L, 'class.result')}</h2>
    <p class="class-score">${T(L, 'class.score', { correct: numIn(L, correct), total: numIn(L, total) })}</p>
    <p class="class-earned ${earned > 0 ? 'ok' : ''}">${T(L, 'jail.roundEarned', { money: moneyIn(L, earned) })}</p>
    <button type="button" class="panel-close" data-act="cell">${T(L, 'class.next')}</button>`;
}

export function releasedScreen(L) {
  return `
    <h2>🔓 ${T(L, 'jail.releasedTitle')}</h2>
    <p class="class-sub">${T(L, 'jail.releasedNote')}</p>
    <button type="button" class="panel-close" data-act="leave">${T(L, 'jail.leave')}</button>`;
}

export function hospitalScreen(L, { fee, lostWeapons }) {
  return `
    <h2>🔄 ${T(L, 'jail.newSessionTitle')}</h2>
    <p class="class-sub">${T(L, 'jail.newSessionNote')}</p>
    <p class="jail-line">${T(L, 'jail.deathFee', { money: moneyIn(L, fee) })}</p>
    <p class="jail-line">${T(L, 'jail.keptAll')}</p>
    ${lostWeapons ? `<p class="jail-line">${T(L, 'jail.lostWeapons')}</p>` : ''}
    <button type="button" class="panel-close" data-act="leave">${T(L, 'jail.ok')}</button>`;
}
