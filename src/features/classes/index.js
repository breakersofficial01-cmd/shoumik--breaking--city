// Feature: classes — Class Mode at Breaking School and Breaking Biology Institution (Session 5).
//
// Opens when Shoumik presses ঢোকো in the entrance ring (event entrance:enter { id, place } from
// the entrances feature; id = the institute: 'breaking-school' | 'breaking-biology').
// A full-screen HTML overlay with three choices:
//   1. Lesson Check — lessons of this institute (ContentService 'lessons', active only), grouped
//      by subject/chapter with a done badge. Lesson screen: Watch on YouTube (opens OUTSIDE the
//      game — never embedded or tracked, CLAUDE.md "YouTube rule"), Start Check: random
//      questionsPerAttempt questions, shuffled options, a timer each, instant feedback.
//   2. Quiz Class — free practice from every active question of the institute (data/economy.json
//      → quizClass for the money).
//   3. Enroll — opens data/links.json → enroll<Institute> (e.g. enrollBreakingBiology).
// Money rules: ./progress.js. Screens: ./screens.js. Engine: ./quiz.js. ?admin=1 check: ./admin.js.
// Everything in Class Mode is in Bangla (lesson.language for a lesson; data/ui.json →
// questionLanguage elsewhere) with the Bangla font and Bangla digits.
//
// Events  listens entrance:enter      sends cash:changed (via economy), lesson:completed,
//         class:opened { institute }, class:closed { institute }

import { tl, moneyIn, numIn } from '../../ui/i18n.js';
import { createOverlay } from '../../ui/overlay.js';
import { debug, log } from '../../core/debug.js';
import { QuizRun } from './quiz.js';
import { ClassProgress } from './progress.js';
import { homeScreen, lessonListScreen, lessonScreen, questionScreen, feedbackHtml, resultScreen } from './screens.js';
import { AdminCheck } from './admin.js';

let game = null;
let ov = null;
let progress = null;
let admin = null;
let offs = [];
let institute = null;    // 'breaking-school' | 'breaking-biology'
let place = null;        // the place row from data/places.json
let L = 'bn';            // language of the current screen
let run = null;          // { kind: 'lesson'|'quiz', quiz: QuizRun, lesson?, streak, earned, extras }
let timer = null;
let deadline = 0;

const lessonsHere = () => game.content.get('lessons').filter((l) => l.institute === institute && l.active);
const questionsHere = () => lessonsHere().flatMap((l) => l.questions.map((q) => ({ ...q, id: `${l.id}/${q.id}` })));
const baseLanguage = () => game.config.get('ui').questionLanguage || 'bn';

/** data/links.json key for this institute: 'breaking-biology' → 'enrollBreakingBiology'. */
const enrollLink = () => game.config.get('links')['enroll' + institute.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join('')] || '';

function show(html) {
  stopTimer();
  ov.panel.innerHTML = html;
  ov.panel.scrollTop = 0;
}

function home() {
  run = null;
  L = baseLanguage();
  const name = place?.name ? (place.name[L] ?? place.name.en) : institute;
  show(homeScreen(L, {
    placeName: name, quiz: game.config.get('economy').quizClass,
    hasLessons: lessonsHere().length > 0, hasQuestions: questionsHere().length > 0, enrollReady: !!enrollLink(),
  }));
}

function lessonList() {
  run = null;
  L = baseLanguage();
  show(lessonListScreen(L, { lessons: lessonsHere(), progress }));
}

function openLesson(id) {
  const lesson = lessonsHere().find((l) => l.id === id);
  if (!lesson) return lessonList();
  run = null;
  L = lesson.language || baseLanguage();
  show(lessonScreen(L, { lesson, progress }));
  ov.panel.dataset.lesson = id;
}

// ---- running a check / quiz

function startLesson(id) {
  const lesson = lessonsHere().find((l) => l.id === id);
  if (!lesson || !progress.canStart(lesson)) return;
  const d = game.content.getDefaults('lessons');
  L = lesson.language || baseLanguage();
  progress.beginLesson(lesson);
  run = { kind: 'lesson', lesson, extras: [], quiz: new QuizRun(lesson.questions, { count: d.questionsPerAttempt, shuffleOptions: d.shuffleOptions, seconds: d.timePerQuestionSec }) };
  showQuestion();
}

function startQuiz() {
  const pool = questionsHere();
  if (!pool.length) return;
  const q = game.config.get('economy').quizClass;
  const d = game.content.getDefaults('lessons');
  L = baseLanguage();
  run = { kind: 'quiz', streak: 0, earned: 0, extras: [], quiz: new QuizRun(pool, { count: q.questionsPerRound, shuffleOptions: d.shuffleOptions, seconds: q.timePerQuestionSec }) };
  game.events.emit('class:quizStarted', { institute });
  showQuestion();
}

function showQuestion() {
  show(questionScreen(L, { run: run.quiz, title: run.lesson?.title, streak: run.kind === 'quiz' ? run.streak : null }));
  startTimer(run.quiz.seconds);
}

function startTimer(seconds) {
  deadline = performance.now() + seconds * 1000;
  const label = ov.panel.querySelector('[data-timer]');
  const bar = ov.panel.querySelector('[data-timebar]');
  const tick = () => {
    const left = Math.max(0, (deadline - performance.now()) / 1000);
    label.textContent = tl(L, 'class.seconds', { n: numIn(L, Math.ceil(left)) });
    label.classList.toggle('low', left <= 5);
    bar.style.width = `${(left / seconds) * 100}%`;
    if (left <= 0) answer(null);
  };
  tick();
  timer = setInterval(tick, 200);
}

function stopTimer() {
  clearInterval(timer);
  timer = null;
}

/** Player tapped an option (real letter) or the timer ran out (null). */
function answer(letter) {
  if (!run || run.quiz.answered) return;
  stopTimer();
  const cur = run.quiz.current;
  const res = run.quiz.answer(letter);
  const extras = [];
  if (run.kind === 'quiz') {
    const pay = progress.quizAnswer(res.correct, run.streak);
    run.streak = pay.streak;
    run.earned += pay.paid + pay.bonus;
    if (pay.paid) extras.push(`+${moneyIn(L, pay.paid)}`);
    if (pay.bonus) extras.push(tl(L, 'class.streakBonus', { n: numIn(L, pay.streak), money: moneyIn(L, pay.bonus) }));
  }
  ov.panel.querySelectorAll('.class-option').forEach((b) => {
    b.disabled = true;
    if (b.dataset.id === cur.q.answer) b.classList.add('right');
    else if (b.dataset.id === letter) b.classList.add('wrong');
  });
  const fb = ov.panel.querySelector('[data-feedback]');
  fb.innerHTML = feedbackHtml(L, { cur, chosen: letter, correct: res.correct, extras });
  fb.hidden = false;
  const next = ov.panel.querySelector('[data-act="next"]');
  next.textContent = tl(L, run.quiz.index + 1 >= run.quiz.total ? 'class.finish' : 'class.next');
  next.hidden = false;
  ov.panel.querySelector('.class-streak')?.replaceChildren(`🔥 ${tl(L, 'class.streak', { n: numIn(L, run.streak || 0) })}`);
  next.scrollIntoView?.({ block: 'nearest' });
}

function nextQuestion() {
  if (!run) return;
  if (run.quiz.next()) return showQuestion();
  finishRun();
}

function finishRun() {
  const q = run.quiz;
  if (run.kind === 'lesson') {
    const lesson = run.lesson;
    const r = progress.finishLesson(lesson, q.results);
    const lines = r.repeats > 0 ? [tl(L, 'class.alreadyPaid')] : [];
    run = null;
    show(resultScreen(L, { correct: r.correct, total: r.total, earned: r.earned, lines, back: { act: 'lessons', key: 'class.toLessons' } }));
    ov.panel.dataset.lesson = lesson.id;
  } else {
    const end = progress.finishQuizRound();
    const lines = [];
    if (end.daily) lines.push(tl(L, 'class.dailyBonus', { money: moneyIn(L, end.daily) }));
    if (end.capReached) lines.push(tl(L, 'class.capReached'));
    const earned = run.earned + end.daily;
    const res = { correct: q.correctCount, total: q.total };
    run = null;
    show(resultScreen(L, { ...res, earned, lines, again: 'quiz', back: { act: 'home', key: 'class.back' } }));
  }
}

function onClick(e) {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const { act, id } = el.dataset;
  switch (act) {
    case 'close': return ov.close();
    case 'home': return home();
    case 'lessons': return lessonList();
    case 'lesson': return openLesson(id);
    case 'start': return startLesson(ov.panel.dataset.lesson);
    case 'quiz': return startQuiz();
    case 'answer': return answer(id);
    case 'next': return nextQuestion();
    case 'quit': run = null; return home();
    case 'youtube': return; // the <a target=_blank> opens YouTube outside the game by itself
    case 'enroll': {
      const url = enrollLink();
      if (url) window.open(url, '_blank', 'noopener');
      return;
    }
    default:
  }
}

function open({ id, place: p }) {
  if (ov.isOpen) return;
  institute = id;
  place = p || game.content.get('places').find((x) => x.id === id) || null;
  ov.open();
  home();
  game.events.emit('class:opened', { institute });
}

export default {
  id: 'classes',

  init(g) {
    game = g;
    progress = new ClassProgress(g);
    ov = createOverlay(g, {
      id: 'class-mode', reason: 'classes', className: 'class-mode',
      onClose: () => { stopTimer(); run = null; game.events.emit('class:closed', { institute }); },
    });
    ov.panel.addEventListener('click', onClick);
    offs = [g.events.on('entrance:enter', (p) => open(p || {}))];
    if (debug.flag('admin') === '1') admin = new AdminCheck(g);
    log.info(`classes: ${g.content.get('lessons').length} lessons loaded`);
  },

  /** For tools / the console: open Class Mode without walking there. */
  open,

  update() {},

  dispose() {
    offs.forEach((off) => off());
    offs = [];
    stopTimer();
    admin?.dispose();
    ov?.dispose();
    ov = admin = progress = null;
  },
};
