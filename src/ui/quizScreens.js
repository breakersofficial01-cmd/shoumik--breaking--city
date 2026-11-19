// Quiz screens shared by Class Mode (features/classes) and the jail (features/jail): one
// question with its 4 options in shuffled order, and the feedback after an answer. HTML strings
// with data-act buttons. Drawn in ONE fixed language L (Bangla by default — CLAUDE.md
// "Quiz language"): text with tl(L, ...), numbers with Bangla digits via numIn.

import { tl, numIn } from './i18n.js';
import { esc } from './overlay.js';
import { screenLetter } from './quiz.js';

const T = (L, key, vars) => esc(tl(L, key, vars));

/** One question with its 4 options in shuffled order. */
export function questionScreen(L, { run, title, streak }) {
  const cur = run.current;
  return `
    <div class="class-top">
      <span class="class-count">${T(L, 'class.questionOf', { n: numIn(L, cur.index + 1), total: numIn(L, run.total) })}</span>
      ${streak != null ? `<span class="class-streak">🔥 ${T(L, 'class.streak', { n: numIn(L, streak) })}</span>` : ''}
      <span class="class-timer" data-timer>${T(L, 'class.seconds', { n: numIn(L, run.seconds) })}</span>
    </div>
    <div class="class-timebar"><i data-timebar></i></div>
    ${title ? `<p class="class-sub">${esc(title)}</p>` : ''}
    <p class="class-question">${esc(cur.q.question)}</p>
    <div class="class-options">
      ${cur.order.map((letter, i) => `<button type="button" class="class-option" data-act="answer" data-id="${letter}">
        <b>${screenLetter(i, L)}</b><span>${esc(cur.q.options[letter])}</span></button>`).join('')}
    </div>
    <div class="class-feedback" data-feedback hidden></div>
    <button type="button" class="panel-close" data-act="next" hidden></button>
    <button type="button" class="class-quit" data-act="quit">${T(L, 'class.quit')}</button>`;
}

/** Fill in the feedback part of the question screen after an answer (or time-out). */
export function feedbackHtml(L, { cur, chosen, correct, extras }) {
  const pos = cur.order.indexOf(cur.q.answer);
  const head = correct ? `✔ ${T(L, 'class.correct')}` : chosen == null ? `⏰ ${T(L, 'class.timeUp')}` : `✘ ${T(L, 'class.wrong')}`;
  return `<b class="${correct ? 'ok' : 'bad'}">${head}</b>
    ${correct ? '' : `<p>${T(L, 'class.rightAnswer', { letter: screenLetter(pos, L), text: cur.q.options[cur.q.answer] })}</p>`}
    ${cur.q.explanation ? `<p>${esc(cur.q.explanation)}</p>` : ''}
    ${(extras || []).map((x) => `<p class="class-bonus">${esc(x)}</p>`).join('')}`;
}
