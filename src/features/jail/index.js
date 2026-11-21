// Feature: jail (Session 6). What happens after BUSTED and WASTED.
//
// BUSTED (player:busted { stars } from the police feature): he is taken out of any vehicle,
// puts his hands up, the banner shows, the wanted level is cleared. Then the bail screen:
//   bail = data/economy.json → bail.perStar × stars
//   enough cash → pay it and walk out at Police HQ (bail.releasePlace)
//   not enough  → JAIL: the cash he has goes towards the bail and he "studies his way out":
//                 rounds of Lesson Check questions (all institutes) in Bangla, each right answer
//                 pays bail.perCorrect towards the bail (a progress bar) until it is paid.
//                 The jail is saved (save.data.jail) — closing the game does not get him out.
// After the penalty (bail paid / jail finished) he is FREE (Update 9b): police:standDown sends every
// unit away and wanted:amnesty { bail.freeSeconds } stops new stars for a while (e.g. a car he set
// on fire that explodes later).
// WASTED (player:died, health 0 = dead) — Update 9b: a NEW SESSION starts: he stands up again at the
// game's start point (data/player.json → spawn) with full health; only wasted.fee Taka (৳500) is
// taken; everything else (vehicles, weapons, homes, clothes, lessons) stays. Police stand down.
//
// Events  listens player:busted, player:died
//         sends   vehicle:forceExit, player:freeze, player:action, wanted:clear, player:teleport,
//                 player:revive, weapons:lose, jail:entered { owed }, jail:released { paid },
//                 police:standDown, wanted:amnesty { seconds }
// Screens: ./screens.js (fixed language, Bangla digits). Quiz engine: src/ui/quiz.js.

import { tl, moneyIn, numIn, t } from '../../ui/i18n.js';
import { createOverlay } from '../../ui/overlay.js';
import { questionScreen, feedbackHtml } from '../../ui/quizScreens.js';
import { QuizRun } from '../../ui/quiz.js';
import { log } from '../../core/debug.js';
import { bailScreen, jailScreen, roundEndScreen, releasedScreen, hospitalScreen } from './screens.js';

let game = null;
let ov = null;
let banner = null;
let offs = [];
let L = 'bn';
let pending = null;       // { kind: 'busted'|'wasted', t, stars } waiting for the banner to finish
let run = null;           // QuizRun while studying
let earned = 0;           // bail earned this round
let timer = null;
let deadline = 0;
let afterClose = null;    // what to do when the overlay closes

const B = () => game.config.get('economy').bail;
const lang = () => game.config.get('ui').questionLanguage || 'bn';

/** Every active Lesson Check question (ids made unique per lesson). */
const questions = () => game.content.get('lessons').filter((l) => l.active)
  .flatMap((l) => l.questions.map((q) => ({ ...q, id: `${l.id}/${q.id}` })));

/** A free sidewalk corner next to a place's junction (data/places.json). */
function placeSpot(id) {
  const place = game.content.get('places').find((p) => p.id === id);
  const L0 = game.world.layout;
  const c = place ? L0.crossingCentre(place.col, place.row) : game.player.position;
  const off = L0.W / 2 + 1.6;
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const x = c.x + sx * off, z = c.z + sz * off;
    if (!game.world.collision.isBlocked(x, z, 0.5)) return { x, z, heading: Math.atan2(-sx, -sz) };
  }
  return { x: c.x, z: c.z, heading: 0 };
}

function showBanner(kind) {
  banner.className = kind;
  banner.firstChild.textContent = t(kind === 'busted' ? 'jail.busted' : 'jail.wasted');
  banner.hidden = false;
}

function show(html) {
  stopTimer();
  ov.panel.innerHTML = html;
  ov.panel.scrollTop = 0;
}

// ---- BUSTED
function onBusted({ stars = 1 }) {
  if (pending || ov.isOpen || game.player.dead) return;
  game.events.emit('vehicle:forceExit', {});
  game.events.emit('player:freeze', { on: true });
  game.events.emit('player:action', { name: 'cower' });
  game.events.emit('wanted:clear', {});
  showBanner('busted');
  pending = { kind: 'busted', t: game.config.get('combat').player.bustedSeconds, stars };
}

function openBail(stars) {
  const bail = B().perStar * stars;
  L = lang();
  ov.panel.dataset.bail = bail;
  ov.open();
  show(bailScreen(L, { stars, bail, cash: game.economy.getCash(), perStar: B().perStar }));
}

function payBail() {
  const bail = +ov.panel.dataset.bail;
  if (!game.economy.spend(bail, 'bail')) return;
  release();
}

function goToJail() {
  const bail = +ov.panel.dataset.bail;
  const cash = game.economy.getCash();
  if (cash > 0) game.economy.spend(cash, 'bail:part');
  game.save.data.jail = { owed: bail - cash, paid: 0 };
  game.save.flush();
  game.events.emit('jail:entered', { owed: bail - cash });
  cell();
}

function cell() {
  const j = game.save.data.jail;
  if (!j) return release();
  if (j.paid >= j.owed) return show(releasedScreen(L));
  show(jailScreen(L, { owed: j.owed, paid: j.paid, perCorrect: B().perCorrect, hasQuestions: questions().length > 0 }));
}

// ---- studying in jail
function study() {
  const pool = questions();
  if (!pool.length) return cell();
  const d = game.content.getDefaults('lessons');
  run = new QuizRun(pool, { count: B().questionsPerRound, shuffleOptions: d.shuffleOptions, seconds: B().timePerQuestionSec });
  earned = 0;
  showQuestion();
}

function showQuestion() {
  show(questionScreen(L, { run, title: tl(L, 'jail.title'), streak: null }));
  ov.panel.querySelector('[data-act="quit"]')?.remove(); // in jail the only way out is to finish
  startTimer(run.seconds);
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

function answer(letter) {
  if (!run || run.answered) return;
  stopTimer();
  const cur = run.current;
  const res = run.answer(letter);
  const j = game.save.data.jail;
  const extras = [];
  if (res.correct && j) {
    const pay = Math.min(B().perCorrect, Math.max(0, j.owed - j.paid));
    j.paid += pay;
    earned += pay;
    if (pay) extras.push(tl(L, 'jail.paidOff', { money: moneyIn(L, pay) }));
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
  const last = run.index + 1 >= run.total || (j && j.paid >= j.owed);
  next.textContent = tl(L, last ? 'class.finish' : 'class.next');
  next.hidden = false;
  game.save.flush();
}

function nextQuestion() {
  if (!run) return;
  const j = game.save.data.jail;
  if (j && j.paid >= j.owed) { run = null; return show(releasedScreen(L)); }
  if (run.next()) return showQuestion();
  const r = { correct: run.correctCount, total: run.total, earned };
  run = null;
  show(roundEndScreen(L, r));
}

/** The penalty is paid: no unit keeps chasing and nothing that happened before counts any more. */
function setFree() {
  game.events.emit('police:standDown', {});
  game.events.emit('wanted:amnesty', { seconds: B().freeSeconds || 0 });
}

/** Out of jail (or bail paid): walk out at Police HQ, free. */
function release() {
  const j = game.save.data.jail;
  game.save.data.jail = null;
  if (j) game.events.emit('jail:released', { paid: j.paid });
  setFree();
  afterClose = () => {
    setFree(); // again on leaving the screen: something may have burned out while he read it
    game.events.emit('toast:show', { key: 'jail.freeNow' });
    game.events.emit('player:teleport', placeSpot(B().releasePlace));
    game.events.emit('player:freeze', { on: false });
    game.events.emit('player:action', { name: 'cower', on: false });
  };
  ov.close();
}

// ---- WASTED
function onDied() {
  if (pending) return;
  game.events.emit('vehicle:forceExit', {});
  game.events.emit('player:action', { name: 'down' }); // again: getting out of a vehicle replaces it
  game.events.emit('wanted:clear', {});
  showBanner('wasted');
  pending = { kind: 'wasted', t: game.config.get('combat').player.deadSeconds };
}

/** The game's start point: a free sidewalk corner of data/player.json → spawn (col, row). */
function startSpot() {
  const sp = game.config.get('player').spawn;
  const L0 = game.world.layout;
  const c = L0.crossingCentre(sp.col, sp.row);
  const off = L0.W / 2 + 1.6;
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const x = c.x + sx * off, z = c.z + sz * off;
    if (!game.world.collision.isBlocked(x, z, 0.5)) return { x, z, heading: sp.heading ?? 0 };
  }
  return { x: c.x, z: c.z, heading: sp.heading ?? 0 };
}

/** Dead (health 0) → a new session: back at the start, full health, only wasted.fee is taken. */
function newSession() {
  const W = game.config.get('economy').wasted;
  const fee = Math.min(game.economy.getCash(), W.fee ?? 500);
  if (fee > 0) game.economy.spend(fee, 'death');
  const lost = W.loseWeapons && game.save.data.owned.weapons.length > 0;
  if (W.loseWeapons) game.events.emit('weapons:lose', {});
  setFree();
  game.events.emit('player:teleport', W.respawn === 'hospital' ? placeSpot(W.hospitalPlace) : startSpot());
  game.events.emit('player:revive', {});
  game.save.flush();
  L = lang();
  afterClose = () => setFree();
  ov.open();
  show(hospitalScreen(L, { fee, lostWeapons: lost }));
}

function onClick(e) {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  switch (el.dataset.act) {
    case 'pay': return payBail();
    case 'jail': return goToJail();
    case 'study': return study();
    case 'answer': return answer(el.dataset.id);
    case 'next': return nextQuestion();
    case 'cell': return cell();
    case 'free': game.save.data.jail = { owed: 0, paid: 0 }; return release();
    case 'leave': return game.save.data.jail ? release() : ov.close();
    default:
  }
}

export default {
  id: 'jail',

  init(g) {
    game = g;
    ov = createOverlay(g, {
      id: 'jail-mode', reason: 'jail', className: 'class-mode jail-mode', escape: false,
      onClose: () => { stopTimer(); const fn = afterClose; afterClose = null; fn?.(); },
    });
    ov.panel.addEventListener('click', onClick);
    banner = document.createElement('div');
    banner.id = 'big-banner';
    banner.hidden = true;
    banner.appendChild(document.createElement('b'));
    g.ui.appendChild(banner);
    offs = [
      g.events.on('player:busted', onBusted),
      g.events.on('player:died', onDied),
      // Closed the game while in jail: back in the cell on the next start.
      g.events.on('game:started', () => {
        if (!g.save.data.jail) return;
        L = lang();
        g.events.emit('player:teleport', placeSpot(B().releasePlace));
        ov.open();
        cell();
      }),
    ];
    log.info('jail ready');
  },

  update(dt) {
    if (!pending) return;
    pending.t -= dt;
    if (pending.t > 0) return;
    const p = pending;
    pending = null;
    banner.hidden = true;
    if (p.kind === 'busted') openBail(p.stars);
    else newSession();
  },

  dispose() {
    offs.forEach((off) => off());
    offs = [];
    stopTimer();
    ov?.dispose();
    banner?.remove();
    ov = banner = null;
  },
};
