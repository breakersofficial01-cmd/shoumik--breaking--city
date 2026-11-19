// Privacy and Credits pages (Session 8): privacy.html / credits.html load this module.
// <body data-page="privacy|credits">. Text: data/pages.json (page bodies) + data/strings.json
// (buttons); social buttons: data/links.json. Fonts come from the same loader as the game
// (src/ui/fonts.js, CLAUDE.md rule 7). Language: ?lang=bn|en  >  saved game language  >  default.
// No 3D, no game code: these pages load fast and work offline once the service worker saved them.

import { config } from '../core/config.js';
import { save } from '../core/save.js';
import { loadFonts } from '../ui/fonts.js';
import { initI18n, setLanguage, getLanguage, t, pickName, numIn } from '../ui/i18n.js';
import { esc } from '../ui/overlay.js';

const pageId = document.body.dataset.page;

/** "2026-11-19" → "19 November 2026" / "১৯ নভেম্বর ২০২৬" */
function formatDate(iso) {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const lang = getLanguage();
  const month = d.toLocaleString(lang === 'bn' ? 'bn-BD' : 'en-GB', { month: 'long' });
  return `${numIn(lang, d.getDate())} ${month} ${numIn(lang, d.getFullYear()).replace(/,/g, '')}`;
}

const paragraphs = (body) => {
  const list = body?.[getLanguage()] ?? body?.en ?? [];
  return (Array.isArray(list) ? list : [list]).map((p) => `<p>${esc(p)}</p>`).join('');
};

function followBlock(follow, links) {
  if (!follow) return '';
  const groups = follow.groups.map((g) => {
    const buttons = g.links.filter((l) => links[l.key]).map((l) => `<a class="social" href="${esc(links[l.key])}" target="_blank" rel="noopener">${esc(l.label)}</a>`).join('');
    return buttons ? `<div class="follow-group"><h3>${esc(pickName(g.name))}</h3><div class="follow-links">${buttons}</div></div>` : '';
  }).join('');
  return groups ? `<section><h2>${esc(pickName(follow.heading))}</h2>${groups}</section>` : '';
}

function render(pages, links) {
  const page = pages[pageId];
  document.title = `${pickName(page.title)} — Breaking City`;
  document.getElementById('page').innerHTML = `
    <header>
      <a class="back" href="./">← ${esc(t('page.back'))}</a>
      <button type="button" class="lang">${esc(t('page.switch'))}</button>
    </header>
    <h1>${esc(pickName(page.title))}</h1>
    <p class="updated">${esc(t('page.updated', { date: formatDate(pages.updated) }))}</p>
    <p class="intro">${esc(pickName(page.intro))}</p>
    ${page.sections.map((s) => `<section><h2>${esc(pickName(s.heading))}</h2>${paragraphs(s.body)}</section>`).join('')}
    ${followBlock(page.follow, links)}`;
  document.querySelector('.lang').addEventListener('click', () => {
    setLanguage(getLanguage() === 'bn' ? 'en' : 'bn');
    render(pages, links);
  });
}

async function boot() {
  await config.loadSome(['ui', 'strings', 'game', 'economy', 'links', 'pages']);
  const ui = config.get('ui');
  save.load(config.get('game'), config.get('economy')); // read only: these pages never write the save
  const wanted = new URLSearchParams(location.search).get('lang');
  initI18n({ stringsCfg: config.get('strings'), uiCfg: ui, economyCfg: config.get('economy'), savedLanguage: wanted || save.data.settings.language });
  await loadFonts(ui);
  setLanguage(getLanguage(), true); // re-apply so the loaded font is used
  render(config.get('pages'), config.get('links'));
}

boot().catch((err) => {
  document.getElementById('page').textContent = 'Could not load this page. Please reload.';
  console.error('[BC] page failed', err);
});
