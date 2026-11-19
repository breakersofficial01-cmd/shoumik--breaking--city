// Quiz engine for Class Mode — pure logic, no DOM, so it is easy to test.
//
//   const run = new QuizRun(questions, { count: 3, shuffleOptions: true, seconds: 30, rng })
//   run.current        -> { q, order: ['C','A','D','B'], index }   (order = real letters in screen order)
//   run.answer(letter) -> { correct, answer }   letter = REAL letter (A–D in the data), or null on time-out
//   run.next()         -> false when the run is over
//   run.results        -> [{ id, chosen, correct }]
//
// Options are shuffled for the screen, but every answer is recorded with the real letter from
// the data, so `answer` in data/lessons.json never has to change.

const LETTERS = ['A', 'B', 'C', 'D'];

export function shuffle(list, rng = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class QuizRun {
  /**
   * @param {Array<{id:string, question:string, options:Object, answer:string, explanation:string}>} questions
   * @param {{count:number, shuffleOptions?:boolean, seconds:number, rng?:()=>number}} opts
   */
  constructor(questions, { count, shuffleOptions = true, seconds, rng = Math.random }) {
    this.seconds = seconds;
    this.items = shuffle(questions, rng).slice(0, Math.max(1, Math.min(count, questions.length))).map((q) => ({
      q,
      order: shuffleOptions ? shuffle(LETTERS, rng) : [...LETTERS],
    }));
    this.index = 0;
    this.results = [];
    this.answered = false;
  }

  get total() { return this.items.length; }
  get current() { return this.items[this.index] ? { ...this.items[this.index], index: this.index } : null; }
  get done() { return this.index >= this.items.length; }
  get correctCount() { return this.results.filter((r) => r.correct).length; }

  /** Record the answer for the current question (null = time ran out). Only the first counts. */
  answer(letter) {
    const cur = this.items[this.index];
    if (!cur || this.answered) return null;
    this.answered = true;
    const correct = letter === cur.q.answer;
    this.results.push({ id: cur.q.id, chosen: letter, correct });
    return { correct, answer: cur.q.answer };
  }

  /** Go to the next question. Returns false when the run is finished. */
  next() {
    if (!this.answered) this.answer(null);
    this.index++;
    this.answered = false;
    return !this.done;
  }
}

/** Screen letter (ক খ গ ঘ in Bangla, A B C D in English) for position i. */
export function screenLetter(i, language) {
  return language === 'en' ? LETTERS[i] : ['ক', 'খ', 'গ', 'ঘ'][i];
}
