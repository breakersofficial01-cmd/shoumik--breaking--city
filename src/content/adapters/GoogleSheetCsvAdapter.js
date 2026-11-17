// Adapter: lessons + questions from a published Google Sheet (two CSV links).
// SWITCHED OFF by default. It is used only when data/lessons.json has
//   "source": { "type": "googleSheet", "googleSheet": { "lessonsCsvUrl": "...", "questionsCsvUrl": "..." } }
// Sheet format: docs/CONTENT_GUIDE.md.
//
// It returns the same shape as data/lessons.json ({ lessons: [...] }), so the same
// validator checks it. ContentService handles caching and falling back to local JSON.

import { csvToObjects } from '../csv.js';

const FETCH_TIMEOUT_MS = 8000;

async function fetchText(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

const truthy = (v) => !/^(false|0|no|n|off)$/i.test(String(v ?? '').trim());

/** Map sheet rows (see CONTENT_GUIDE.md column names) to the lessons.json shape. */
export function mapSheetRowsToLessons(lessonRows, questionRows) {
  const byId = new Map();
  const lessons = [];
  for (const r of lessonRows) {
    const lesson = {
      id: r.lesson_id || '',
      institute: (r.institute || '').toLowerCase(),
      language: r.language || undefined,
      subject: r.subject || '',
      chapter: r.chapter || '',
      title: r.title || '',
      youtubeUrl: r.youtube_link || r.youtube_url || '',
      rewardPerCorrect: r.reward_per_correct === '' || r.reward_per_correct == null ? undefined : Number(r.reward_per_correct),
      active: r.active === undefined || r.active === '' ? true : truthy(r.active),
      questions: [],
    };
    lessons.push(lesson);
    if (lesson.id && !byId.has(lesson.id)) byId.set(lesson.id, lesson);
  }
  const orphans = [];
  for (const q of questionRows) {
    const lesson = byId.get(q.lesson_id);
    if (!lesson) {
      orphans.push({ id: `Questions row ${q.__row}`, reason: `lesson_id "${q.lesson_id || ''}" is not in the Lessons tab` });
      continue;
    }
    lesson.questions.push({
      id: q.question_id || '',
      question: q.question || '',
      options: { A: q.option_a || '', B: q.option_b || '', C: q.option_c || '', D: q.option_d || '' },
      answer: q.answer || '',
      explanation: q.explanation || '',
    });
  }
  return { lessons, orphans };
}

export class GoogleSheetCsvAdapter {
  constructor() {
    this.id = 'googleSheet';
  }

  /**
   * @param {object} typeDef  (unused, kept for the common adapter interface)
   * @param {{lessonsCsvUrl:string, questionsCsvUrl:string}} sourceConfig
   */
  async load(typeDef, sourceConfig) {
    const { lessonsCsvUrl, questionsCsvUrl } = sourceConfig || {};
    if (!lessonsCsvUrl || !questionsCsvUrl) throw new Error('Google Sheet CSV links are not set');
    const [lessonsCsv, questionsCsv] = await Promise.all([fetchText(lessonsCsvUrl), fetchText(questionsCsvUrl)]);
    const { lessons, orphans } = mapSheetRowsToLessons(csvToObjects(lessonsCsv), csvToObjects(questionsCsv));
    if (lessons.length === 0) throw new Error('the Lessons tab has no rows');
    return { lessons, extraSkipped: orphans };
  }
}
