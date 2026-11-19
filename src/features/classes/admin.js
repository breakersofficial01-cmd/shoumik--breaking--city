// Hidden admin check, only with ?admin=1 in the address. A small "Admin" button (under the
// settings gear) opens a panel that shows:
//   - how many lessons / questions loaded (all, active, per institute),
//   - from which source each content type came (local, googleSheet, cached, fallback),
//   - every skipped row with the reason (from the Content Service validators).
// Owner use: after editing data/lessons.json or the Google Sheet, open the game with ?admin=1.

import { t } from '../../ui/i18n.js';
import { createOverlay, esc } from '../../ui/overlay.js';

export class AdminCheck {
  constructor(game) {
    this.game = game;
    this.button = document.createElement('button');
    this.button.id = 'admin-button';
    this.button.type = 'button';
    this.button.textContent = t('admin.button');
    this.button.addEventListener('click', () => this.open());
    game.ui.appendChild(this.button);
    this.ov = createOverlay(game, { id: 'admin-panel', reason: 'admin', className: 'admin-panel' });
    this.ov.panel.addEventListener('click', (e) => { if (e.target.closest('.panel-close')) this.ov.close(); });
  }

  html() {
    const c = this.game.content;
    const lessons = c.get('lessons');
    const qCount = (list) => list.reduce((n, l) => n + l.questions.length, 0);
    const institutes = [...new Set(lessons.map((l) => l.institute))];
    const types = [...c.loaded.keys()];
    const skipped = types.flatMap((type) => (c.getReport(type)?.skipped || []).map((s) => ({ type, ...s })));
    return `
      <h2>${esc(t('admin.title'))}</h2>
      <p class="admin-line"><b>${esc(t('admin.lessons', { lessons: lessons.length, active: lessons.filter((l) => l.active).length, questions: qCount(lessons) }))}</b></p>
      ${institutes.map((id) => {
        const list = lessons.filter((l) => l.institute === id);
        return `<p class="admin-line">${esc(t('admin.byInstitute', { institute: id, lessons: list.length, questions: qCount(list) }))}</p>`;
      }).join('')}
      <hr>
      ${types.map((type) => {
        const r = c.getReport(type);
        return `<p class="admin-line">${esc(t('admin.source', { type, count: r?.count ?? 0, source: r?.source ?? '-' }))}</p>`;
      }).join('')}
      <hr>
      <p class="admin-line"><b>${esc(t('admin.skipped'))} (${skipped.length})</b></p>
      ${skipped.length ? `<ul class="admin-skipped">${skipped.map((s) => `<li><code>${esc(s.type)} · ${esc(s.id)}</code> — ${esc(s.reason)}</li>`).join('')}</ul>`
        : `<p class="admin-line">${esc(t('admin.noSkipped'))}</p>`}
      <button type="button" class="panel-close">${esc(t('settings.close'))}</button>`;
  }

  open() {
    this.ov.panel.innerHTML = this.html();
    this.ov.open();
  }

  dispose() {
    this.button.remove();
    this.ov.dispose();
  }
}
