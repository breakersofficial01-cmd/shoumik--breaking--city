// The class landing page (Session 9): a small "website" inside the game, in a neon
// sunset style (original — no logos or fonts of other games). The player picks a class:
//   ▶ watch it on YouTube  — a plain link that opens OUTSIDE the game (CLAUDE.md YouTube rule:
//                            never embedded, never autoplayed, never tracked, never paid for)
//   📝 answer its questions — starts that class's Lesson Check (class:start), which pays Taka
// Everything here is Class Mode text → fixed Bangla (CLAUDE.md quiz rule) with Bangla digits.
// Classes come from the Content Service ('lessons' = the Classes + Questions tabs of the sheet).

import { tl, numIn, moneyIn } from '../../ui/i18n.js';
import { esc } from '../../ui/overlay.js';

const T = (L, key, vars) => esc(tl(L, key, vars));

/** Status of a class for the badge: new | started | done (same rules as Class Mode). */
function status(save, lesson) {
  const r = save.lessons?.[lesson.id];
  if (!r) return 'new';
  return (r.paid?.length || 0) >= lesson.questions.length ? 'done' : 'started';
}

function card(L, lesson, save, places, quizFirst) {
  const st = status(save, lesson);
  const inst = places.find((p) => p.id === lesson.institute);
  const thumb = lesson.thumbnail
    ? `<img src="${esc(lesson.thumbnail)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
    : `<div class="lp-thumb-fallback"><b>${esc(lesson.subject || '')}</b><small>${esc(lesson.chapter || '')}</small></div>`;
  const watch = `<a class="lp-watch" href="${esc(lesson.youtubeUrl)}" target="_blank" rel="noopener noreferrer">▶ ${T(L, 'landing.watch')}</a>`;
  const quiz = `<button type="button" class="lp-quiz" data-quiz="${esc(lesson.id)}">📝 ${T(L, 'landing.quiz')}</button>`;
  return `
    <article class="lp-card" data-inst="${esc(lesson.institute)}">
      <div class="lp-thumb">${thumb}<i class="lp-badge ${st}">${T(L, `class.status.${st}`)}</i></div>
      <div class="lp-body">
        <p class="lp-meta">${esc(inst ? inst.name[L] || inst.name.en : lesson.institute)}${lesson.chapter ? ` · ${esc(lesson.chapter)}` : ''}</p>
        <h3>${esc(lesson.title)}</h3>
        ${lesson.description ? `<p class="lp-desc">${esc(lesson.description)}</p>` : ''}
        <p class="lp-reward">💰 ${T(L, 'landing.reward', { money: moneyIn(L, lesson.rewardPerCorrect), n: numIn(L, lesson.questions.length) })}</p>
        <div class="lp-actions">${quizFirst ? quiz + watch : watch + quiz}</div>
      </div>
    </article>`;
}

/**
 * @param {string} L  language (Bangla)
 * @param {{lessons:object[], save:object, places:object[], filter:string, mode:'watch'|'quiz', need:number}} o
 */
export function landingHtml(L, { lessons, save, places, filter, mode, need }) {
  const shown = lessons.filter((l) => filter === 'all' || l.institute === filter);
  const tab = (id, key) => `<button type="button" data-filter="${id}" class="${filter === id ? 'on' : ''}">${T(L, key)}</button>`;
  return `
    <header class="lp-nav">
      <div class="lp-logo">BREAKING<span>CLASSES</span></div>
      <nav>${tab('all', 'landing.all')}${tab('breaking-school', 'landing.school')}${tab('breaking-biology', 'landing.biology')}</nav>
      <button type="button" class="lp-close" data-close aria-label="close">✕</button>
    </header>
    <section class="lp-hero">
      <div class="lp-sun"></div><div class="lp-palms"></div>
      <h1>${T(L, mode === 'quiz' ? 'landing.heroQuiz' : 'landing.hero')}</h1>
      <p>${T(L, 'landing.steps')}</p>
      ${need > 0 ? `<p class="lp-need">${T(L, 'landing.need', { money: moneyIn(L, need) })}</p>` : ''}
    </section>
    <section class="lp-grid">
      ${shown.length ? shown.map((l) => card(L, l, save, places, mode === 'quiz')).join('') : `<p class="lp-empty">${T(L, 'landing.empty')}</p>`}
    </section>
    <footer class="lp-foot">${T(L, 'landing.footer')}</footer>`;
}
