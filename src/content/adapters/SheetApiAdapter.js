// Adapter (Session 9): content from the shared Google Sheet "Breaking City — Game Data"
// through its Apps Script web app (tools/sheets/Code.gs). The sheet itself stays PRIVATE
// (the Players tab holds phone numbers), so the game never reads it directly: the script
// answers  GET <apiUrl>?action=content  with the Products, Classes and Questions tabs only.
//
// Used when a content file says  "source": { "type": "sheetApi" }  AND data/sheet.json → apiUrl
// is filled in. One request serves every content type (memoised per URL).
// Returns the same shape as the local JSON file, so the same validator checks it.

const cache = new Map(); // url -> Promise<payload>

async function fetchPayload(url, timeoutMs) {
  if (!cache.has(url)) {
    const p = (async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs || 9000);
      try {
        const sep = url.includes('?') ? '&' : '?';
        const res = await fetch(`${url}${sep}action=content`, { signal: ctrl.signal, cache: 'no-store', redirect: 'follow' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!json || json.ok === false) throw new Error(json?.error || 'bad answer');
        return json;
      } finally {
        clearTimeout(timer);
      }
    })();
    p.catch(() => cache.delete(url)); // a failed request may be tried again later
    cache.set(url, p);
  }
  return cache.get(url);
}

const truthy = (v) => v === true || (v !== false && !/^(false|0|no|n|off)$/i.test(String(v ?? '').trim()));
const str = (v) => (v == null ? '' : String(v).trim());

/** Classes + Questions tab rows → the lessons.json shape. */
export function mapClassRows(classRows, questionRows) {
  const byId = new Map();
  const lessons = [];
  const orphans = [];
  for (const r of classRows || []) {
    const id = str(r.class_id);
    if (!id && !str(r.title)) continue; // empty row
    const lesson = {
      id,
      institute: str(r.institute).toLowerCase(),
      language: str(r.language) || undefined,
      subject: str(r.subject),
      chapter: str(r.chapter),
      title: str(r.title),
      youtubeUrl: str(r.youtube_link),
      thumbnail: str(r.thumbnail_url),
      description: str(r.description),
      rewardPerCorrect: str(r.reward_per_correct) === '' ? undefined : Number(r.reward_per_correct),
      active: str(r.active) === '' ? true : truthy(r.active),
      questions: [],
    };
    lessons.push(lesson);
    if (id && !byId.has(id)) byId.set(id, lesson);
  }
  (questionRows || []).forEach((q, i) => {
    if (!str(q.question)) return;
    if (str(q.active) !== '' && !truthy(q.active)) return;
    const lesson = byId.get(str(q.class_id));
    if (!lesson) { orphans.push({ id: `Questions row ${i + 2}`, reason: `class_id "${str(q.class_id)}" is not in the Classes tab` }); return; }
    lesson.questions.push({
      id: str(q.question_id) || `r${i + 2}`,
      topic: str(q.topic),
      question: str(q.question),
      options: { A: str(q.option_a), B: str(q.option_b), C: str(q.option_c), D: str(q.option_d) },
      answer: str(q.answer).toUpperCase(),
      explanation: str(q.explanation),
    });
  });
  return { lessons, orphans };
}

/** Products tab rows → the products.json shape. */
export function mapProductRows(rows) {
  return (rows || []).filter((r) => str(r.product_id)).map((r) => ({
    id: str(r.product_id), kind: str(r.kind).toLowerCase(), price: str(r.price),
    name_en: str(r.name_en), name_bn: str(r.name_bn), image_url: str(r.image_url),
    model_url: str(r.model_url), description: str(r.description), active: str(r.active) === '' ? true : truthy(r.active),
  }));
}

export class SheetApiAdapter {
  constructor() {
    this.id = 'sheetApi';
  }

  /** @param {{name:string}} typeDef  @param {{url:string, timeoutMs?:number}} cfg */
  async load(typeDef, cfg) {
    if (!cfg?.url) throw new Error('data/sheet.json → apiUrl is empty');
    const data = await fetchPayload(cfg.url, cfg.timeoutMs);
    if (typeDef.name === 'lessons') {
      const { lessons, orphans } = mapClassRows(data.classes, data.questions);
      return { lessons, extraSkipped: orphans };
    }
    if (typeDef.name === 'products') return { products: mapProductRows(data.products) };
    throw new Error(`the sheet has no tab for "${typeDef.name}"`);
  }
}
