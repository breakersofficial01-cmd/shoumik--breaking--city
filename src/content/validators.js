// Schema validators. One per content type. A validator takes the raw file/sheet data and
// returns { items, defaults, skipped } — bad rows are SKIPPED and reported, never thrown,
// so one typo in a sheet can't crash the game (CLAUDE.md rule 2).

const INSTITUTES = ['breaking-school', 'breaking-biology'];
const LETTERS = ['A', 'B', 'C', 'D'];

const isText = (v) => typeof v === 'string' && v.trim().length > 0;

function isHttpUrl(v) {
  if (!isText(v)) return false;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

const LESSON_DEFAULTS = {
  language: 'bn',
  rewardPerCorrect: 150,
  questionsPerAttempt: 3,
  maxAttempts: 2,
  timePerQuestionSec: 30,
  shuffleOptions: true,
};

/** Check one question. Returns a clean question or { error }. */
function cleanQuestion(q, index) {
  if (!q || typeof q !== 'object') return { error: 'question is not an object' };
  const id = isText(q.id) ? q.id.trim() : `q${index + 1}`;
  if (!isText(q.question)) return { error: `${id}: question text is empty` };
  const options = {};
  for (const letter of LETTERS) {
    const text = q.options?.[letter];
    if (!isText(text)) return { error: `${id}: option ${letter} is empty` };
    options[letter] = text.trim();
  }
  const answer = isText(q.answer) ? q.answer.trim().toUpperCase() : '';
  if (!LETTERS.includes(answer)) return { error: `${id}: answer must be A, B, C or D (got "${q.answer ?? ''}")` };
  return {
    value: {
      id,
      question: q.question.trim(),
      options,
      answer,
      explanation: isText(q.explanation) ? q.explanation.trim() : '',
    },
  };
}

/**
 * Validate lessons (shape of data/lessons.json → lessons[]).
 * @param {{defaults?:object, lessons?:any[]}} raw
 */
export function validateLessons(raw) {
  const skipped = [];
  const items = [];
  const defaults = { ...LESSON_DEFAULTS, ...(raw?.defaults || {}) };
  const list = Array.isArray(raw?.lessons) ? raw.lessons : [];
  if (!Array.isArray(raw?.lessons)) skipped.push({ id: '(file)', reason: '"lessons" list is missing' });
  const seen = new Set();

  list.forEach((lesson, i) => {
    const label = isText(lesson?.id) ? lesson.id : `lesson #${i + 1}`;
    const skip = (reason) => skipped.push({ id: label, reason });

    if (!lesson || typeof lesson !== 'object') return skip('not an object');
    if (!isText(lesson.id)) return skip('id is empty');
    if (seen.has(lesson.id)) return skip('duplicate id');
    if (!INSTITUTES.includes(lesson.institute)) return skip(`institute must be one of ${INSTITUTES.join(', ')}`);
    if (!isText(lesson.title)) return skip('title is empty');
    if (!isHttpUrl(lesson.youtubeUrl)) return skip('youtubeUrl is not a valid link');

    const questions = [];
    const qIds = new Set();
    (Array.isArray(lesson.questions) ? lesson.questions : []).forEach((q, qi) => {
      const res = cleanQuestion(q, qi);
      if (res.error) return skipped.push({ id: `${label} / ${res.error.split(':')[0]}`, reason: res.error });
      if (qIds.has(res.value.id)) return skipped.push({ id: `${label} / ${res.value.id}`, reason: 'duplicate question id' });
      qIds.add(res.value.id);
      questions.push(res.value);
    });
    if (questions.length === 0) return skip('no valid questions');

    const reward = Number(lesson.rewardPerCorrect);
    seen.add(lesson.id);
    items.push({
      id: lesson.id.trim(),
      institute: lesson.institute,
      language: isText(lesson.language) ? lesson.language : defaults.language,
      subject: isText(lesson.subject) ? lesson.subject.trim() : '',
      chapter: isText(lesson.chapter) ? lesson.chapter.trim() : '',
      title: lesson.title.trim(),
      youtubeUrl: lesson.youtubeUrl.trim(),
      rewardPerCorrect: Number.isFinite(reward) && reward >= 0 ? reward : defaults.rewardPerCorrect,
      active: lesson.active !== false,
      questions,
    });
  });

  return { items, defaults, skipped };
}

const SIDES = ['N', 'S', 'E', 'W'];

/**
 * Validate hangout spots (shape of data/hotspots.json).
 * @param {{settings?:object, hotspots?:any[]}} raw
 */
export function validateHotspots(raw) {
  const skipped = [];
  const items = [];
  const list = Array.isArray(raw?.hotspots) ? raw.hotspots : [];
  if (!Array.isArray(raw?.hotspots)) skipped.push({ id: '(file)', reason: '"hotspots" list is missing' });
  const seen = new Set();
  const num = (v, fallback, min, max) => (Number.isFinite(Number(v)) ? Math.min(max, Math.max(min, Number(v))) : fallback);

  list.forEach((h, i) => {
    const label = isText(h?.id) ? h.id : `hotspot #${i + 1}`;
    const skip = (reason) => skipped.push({ id: label, reason });
    if (!h || typeof h !== 'object') return skip('not an object');
    if (!isText(h.id)) return skip('id is empty');
    if (seen.has(h.id)) return skip('duplicate id');
    if (!Number.isInteger(h.col) || !Number.isInteger(h.row) || h.col < 0 || h.row < 0) return skip('col and row must be whole numbers');
    const side = isText(h.side) ? h.side.trim().toUpperCase() : '';
    if (!SIDES.includes(side)) return skip('side must be N, S, E or W');
    seen.add(h.id);
    items.push({
      id: h.id.trim(),
      name: h.name && typeof h.name === 'object' ? h.name : { en: h.id, bn: h.id },
      col: h.col,
      row: h.row,
      side,
      along: num(h.along, 0.5, 0.05, 0.95),
      inset: num(h.inset, 0.75, 0.4, 30),
      rows: Math.round(num(h.rows, 1, 1, 3)),
      dancers: Math.round(num(h.dancers, 6, 1, 12)),
      bpm: num(h.bpm, 112, 70, 150),
      active: h.active !== false,
    });
  });
  return { items, defaults: raw?.settings || {}, skipped };
}

/**
 * Validate named places (shape of data/places.json). col/row = road junction next to it.
 * @param {{places?:any[]}} raw
 */
export function validatePlaces(raw) {
  const skipped = [];
  const items = [];
  const list = Array.isArray(raw?.places) ? raw.places : [];
  if (!Array.isArray(raw?.places)) skipped.push({ id: '(file)', reason: '"places" list is missing' });
  const seen = new Set();
  list.forEach((p, i) => {
    const label = isText(p?.id) ? p.id : `place #${i + 1}`;
    const skip = (reason) => skipped.push({ id: label, reason });
    if (!p || typeof p !== 'object') return skip('not an object');
    if (!isText(p.id)) return skip('id is empty');
    if (seen.has(p.id)) return skip('duplicate id');
    if (!Number.isInteger(p.col) || !Number.isInteger(p.row) || p.col < 0 || p.row < 0) return skip('col and row must be whole numbers');
    seen.add(p.id);
    items.push({ ...p, id: p.id.trim(), name: p.name && typeof p.name === 'object' ? p.name : { en: p.id, bn: p.id }, ride: p.ride !== false });
  });
  return { items, defaults: {}, skipped };
}
