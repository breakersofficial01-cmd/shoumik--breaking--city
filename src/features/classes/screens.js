// Class Mode screens as HTML strings. Buttons carry data-act="..." (+ data-id) and are handled
// by index.js. Every screen is drawn in ONE fixed language `L` (Bangla by default — CLAUDE.md
// "Quiz language"): text with tl(L, ...), numbers with Bangla digits via numIn/moneyIn.
// Content text (titles, questions) is escaped because it will come from a Google Sheet later.

import { tl, numIn, moneyIn } from '../../ui/i18n.js';
import { esc } from '../../ui/overlay.js';

const T = (L, key, vars) => esc(tl(L, key, vars));

export function homeScreen(L, { placeName, quiz, hasLessons, hasQuestions, enrollReady }) {
  return `
    <h2>${T(L, 'class.title', { place: placeName })}</h2>
    <p class="class-sub">${T(L, 'class.welcome')}</p>
    <button type="button" class="class-big" data-act="lessons">
      <b>📘 ${T(L, 'class.lessonCheck')}</b><small>${hasLessons ? T(L, 'class.lessonCheckNote') : T(L, 'class.noLessons')}</small>
    </button>
    <button type="button" class="class-big" data-act="quiz" ${hasQuestions ? '' : 'disabled'}>
      <b>⚡ ${T(L, 'class.quizClass')}</b><small>${hasQuestions ? T(L, 'class.quizClassNote', {
        reward: moneyIn(L, quiz.rewardPerCorrect), bonus: moneyIn(L, quiz.streakBonus),
        streak: numIn(L, quiz.streakLength), daily: moneyIn(L, quiz.firstOfDayBonus),
      }) : T(L, 'class.noQuestions')}</small>
    </button>
    <button type="button" class="class-big class-enroll" data-act="enroll">
      <b>${T(L, 'class.enroll')}</b>${enrollReady ? '' : `<small>${T(L, 'class.enrollSoon')}</small>`}
    </button>
    <button type="button" class="panel-close" data-act="close">${T(L, 'class.leave')}</button>`;
}

/** Lessons grouped by subject → chapter, each with its done / not done badge. */
export function lessonListScreen(L, { lessons, progress }) {
  if (!lessons.length) {
    return `<h2>${T(L, 'class.lessonCheck')}</h2><p class="class-sub">${T(L, 'class.noLessons')}</p>
      <button type="button" class="panel-close" data-act="home">${T(L, 'class.back')}</button>`;
  }
  const groups = new Map();
  for (const l of lessons) {
    const key = `${l.subject}\u0000${l.chapter}`;
    if (!groups.has(key)) groups.set(key, { subject: l.subject, chapter: l.chapter, list: [] });
    groups.get(key).list.push(l);
  }
  const rows = [...groups.values()].map((g) => `
    <div class="class-group">
      <div class="class-group-title">${esc(g.subject)}${g.chapter ? ` · ${esc(g.chapter)}` : ''}</div>
      ${g.list.map((l) => {
        const st = progress.status(l);
        return `<button type="button" class="class-lesson" data-act="lesson" data-id="${esc(l.id)}">
          <span>${esc(l.title)}</span><i class="badge badge-${st}">${T(L, `class.status.${st}`)}</i></button>`;
      }).join('')}
    </div>`).join('');
  return `<div class="class-top"><button type="button" class="class-back" data-act="home">${T(L, 'class.back')}</button>
    <h2>${T(L, 'class.lessonCheck')}</h2></div>${rows}`;
}

export function lessonScreen(L, { lesson, progress }) {
  const r = progress.lesson(lesson.id);
  const st = progress.status(lesson);
  const allPaid = r.paid.length >= lesson.questions.length;
  let note = T(L, 'class.attemptsLeft', { n: numIn(L, progress.attemptsLeft(lesson)) });
  if (allPaid) note = T(L, 'class.allPaid');
  else if (st === 'done') note = T(L, 'class.noAttempts');
  return `
    <div class="class-top"><button type="button" class="class-back" data-act="lessons">${T(L, 'class.back')}</button>
      <i class="badge badge-${st}">${T(L, `class.status.${st}`)}</i></div>
    <h2>${esc(lesson.title)}</h2>
    <p class="class-sub">${esc(lesson.subject)}${lesson.chapter ? ` · ${esc(lesson.chapter)}` : ''}</p>
    <p class="class-line">💰 ${T(L, 'class.reward', { reward: moneyIn(L, lesson.rewardPerCorrect) })}</p>
    <p class="class-line">${T(L, 'class.earnedOf', { earned: moneyIn(L, r.earned), max: moneyIn(L, progress.maxEarn(lesson)) })}</p>
    <a class="class-youtube" href="${esc(lesson.youtubeUrl)}" target="_blank" rel="noopener noreferrer" data-act="youtube">${T(L, 'class.watch')}</a>
    <p class="class-note">${T(L, 'class.watchNote')}</p>
    <p class="class-line">${note}</p>
    <button type="button" class="panel-close" data-act="start" ${progress.canStart(lesson) ? '' : 'disabled'}>${T(L, 'class.startCheck')}</button>`;
}

// The question and feedback screens are shared with the jail: src/ui/quizScreens.js.
export { questionScreen, feedbackHtml } from '../../ui/quizScreens.js';

export function resultScreen(L, { correct, total, earned, lines, again, back }) {
  return `
    <h2>${T(L, 'class.result')}</h2>
    <p class="class-score">${T(L, 'class.score', { correct: numIn(L, correct), total: numIn(L, total) })}</p>
    <p class="class-earned ${earned > 0 ? 'ok' : ''}">${earned > 0 ? T(L, 'class.earned', { money: moneyIn(L, earned) }) : T(L, 'class.earnedNone')}</p>
    ${(lines || []).map((x) => `<p class="class-note">${esc(x)}</p>`).join('')}
    ${again ? `<button type="button" class="class-big" data-act="${again}"><b>${T(L, 'class.again')}</b></button>` : ''}
    <button type="button" class="panel-close" data-act="${back.act}">${T(L, back.key)}</button>`;
}
