// Class Mode progress + money rules. All results live in the save:
//   save.data.lessons[lessonId] = { attempts, paid: [questionIds], earned, best, lastAt }
//   save.data.classes           = { lastDay, dayEarned, rounds, earned, bestStreak }
//
// Lesson Check rules (docs/SESSIONS.md, Session 5):
//   - every correct answer pays the lesson's rewardPerCorrect — but each QUESTION pays only once
//     per player, so a lesson can never pay more than (questions × reward) in total;
//   - maxAttempts (data/lessons.json defaults) limits how often the check can be taken;
//   - a lesson is "done" when every question has been paid or no attempts are left.
// Quiz Class rules (data/economy.json → quizClass): reward per correct answer, a bonus each time
// the streak reaches a multiple of streakLength, a bonus for the first finished round of the day,
// and an optional daily cap.

export class ClassProgress {
  constructor(game) {
    this.game = game;
    this.defaults = game.content.getDefaults('lessons');
    this.quiz = game.config.get('economy').quizClass;
  }

  get save() { return this.game.save.data; }

  lesson(id) {
    return this.save.lessons[id] || { attempts: 0, paid: [], earned: 0, best: 0, lastAt: 0 };
  }

  maxAttempts() { return Math.max(1, this.defaults.maxAttempts || 1); }

  /** 'new' | 'retry' | 'done' */
  status(lesson) {
    const r = this.lesson(lesson.id);
    if (r.attempts === 0) return 'new';
    if (r.paid.length >= lesson.questions.length || r.attempts >= this.maxAttempts()) return 'done';
    return 'retry';
  }

  attemptsLeft(lesson) { return Math.max(0, this.maxAttempts() - this.lesson(lesson.id).attempts); }

  maxEarn(lesson) { return lesson.questions.length * lesson.rewardPerCorrect; }

  canStart(lesson) { return this.status(lesson) !== 'done'; }

  /** A check starts: the attempt is used now, so closing half-way cannot be used to peek. */
  beginLesson(lesson) {
    const r = this.lesson(lesson.id);
    this.save.lessons[lesson.id] = { ...r, paid: [...r.paid], attempts: r.attempts + 1, lastAt: Date.now() };
    this.game.save.flush();
  }

  /**
   * Store a finished Lesson Check (beginLesson was called when it started) and pay for questions answered right for the first time.
   * @returns {{ earned:number, correct:number, total:number, repeats:number }}
   */
  finishLesson(lesson, results) {
    const r = this.lesson(lesson.id);
    const paid = new Set(r.paid);
    let fresh = 0;
    let repeats = 0;
    for (const res of results) {
      if (!res.correct) continue;
      if (paid.has(res.id)) repeats++;
      else { paid.add(res.id); fresh++; }
    }
    const correct = results.filter((x) => x.correct).length;
    const earned = fresh * lesson.rewardPerCorrect;
    this.save.lessons[lesson.id] = {
      attempts: Math.max(1, r.attempts),
      paid: [...paid],
      earned: r.earned + earned,
      best: Math.max(r.best, correct),
      lastAt: Date.now(),
    };
    if (earned > 0) this.game.economy.addCash(earned, `lesson:${lesson.id}`);
    this.game.events.emit('lesson:completed', {
      id: lesson.id, institute: lesson.institute, correct, total: results.length, earned, attempt: Math.max(1, r.attempts),
    });
    this.game.save.flush();
    return { earned, correct, total: results.length, repeats };
  }

  // ---- Quiz Class

  /** Today's date as YYYY-MM-DD on the player's phone. */
  today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  quizState() {
    const c = this.save.classes || (this.save.classes = {});
    // capDay = the day dayEarned belongs to (lastDay is only set when a round ends).
    if (c.capDay !== this.today()) { c.capDay = this.today(); c.dayEarned = 0; }
    return c;
  }

  /** Pay Quiz Class money, respecting the daily cap. Returns what was really paid. */
  payQuiz(amount, reason) {
    const c = this.quizState();
    let pay = amount;
    if (this.quiz.dailyCap > 0) pay = Math.max(0, Math.min(amount, this.quiz.dailyCap - (c.dayEarned || 0)));
    if (pay <= 0) return 0;
    c.dayEarned = (c.dayEarned || 0) + pay;
    c.earned = (c.earned || 0) + pay;
    this.game.economy.addCash(pay, reason);
    return pay;
  }

  /** One Quiz Class answer. Returns { paid, bonus, streak }. */
  quizAnswer(correct, streakBefore) {
    if (!correct) return { paid: 0, bonus: 0, streak: 0 };
    const streak = streakBefore + 1;
    const paid = this.payQuiz(this.quiz.rewardPerCorrect, 'quiz:correct');
    const bonus = streak % this.quiz.streakLength === 0 ? this.payQuiz(this.quiz.streakBonus, 'quiz:streak') : 0;
    const c = this.quizState();
    c.bestStreak = Math.max(c.bestStreak || 0, streak);
    return { paid, bonus, streak };
  }

  /** A Quiz Class round ended. Pays the first-round-of-the-day bonus once per day. */
  finishQuizRound() {
    const c = this.quizState();
    const first = c.lastDay !== this.today();
    c.lastDay = this.today();
    c.rounds = (c.rounds || 0) + 1;
    const daily = first ? this.payQuiz(this.quiz.firstOfDayBonus, 'quiz:daily') : 0;
    this.game.save.flush();
    return { daily, capReached: this.quiz.dailyCap > 0 && (c.dayEarned || 0) >= this.quiz.dailyCap };
  }
}
