// Friendly screen for "WebGL context lost" (Session 8): the phone took the graphics chip away
// (low memory, a call, switching apps). The game has already been saved by game.js; a reload
// brings it back exactly where the player was. Texts: data/strings.json → contextLost.*

import { t } from './i18n.js';

/** @param {number} autoReloadSeconds 0 = wait for the button */
export function showContextLost(autoReloadSeconds = 0) {
  if (document.getElementById('context-lost')) return;
  const box = document.createElement('div');
  box.id = 'context-lost';
  box.className = 'overlay';
  box.innerHTML = `
    <div class="panel">
      <h2>${t('contextLost.title')}</h2>
      <p>${t('contextLost.message')}</p>
      <button type="button" class="panel-close">${t('contextLost.reload')}</button>
    </div>`;
  box.querySelector('button').addEventListener('click', () => window.location.reload());
  document.body.appendChild(box);
  if (autoReloadSeconds > 0) setTimeout(() => window.location.reload(), autoReloadSeconds * 1000);
}
