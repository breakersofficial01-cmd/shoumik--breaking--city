// Feature: ageGate (Session 7). On the very first launch a 17+ screen explains that the game
// has Vice-City-level violence (guns, blood) and asks for the player's age. "17 or older" saves
// save.data.flags.ageOk = true and never asks again (a Settings → reset keeps it). "Under 17"
// keeps the game locked and shows a friendly message with links to the lessons instead.
// The game stays paused while the screen is open, so no gun can be used before it.
// Links: data/links.json (breakingSchoolYoutube / breakingBiologyYoutube, shown when filled in).

import { createOverlay, esc } from '../../ui/overlay.js';
import { getLanguage, setLanguage, t } from '../../ui/i18n.js';
import { debug } from '../../core/debug.js';

let game = null;
let ov = null;
let offs = [];
let declined = false;

function render() {
  const links = game.config.get('links') || {};
  const linkButtons = ['breakingSchoolYoutube', 'breakingBiologyYoutube']
    .filter((k) => typeof links[k] === 'string' && links[k].startsWith('http'))
    .map((k) => `<button type="button" data-link="${esc(links[k])}">${esc(t(`age.${k}`))} ↗</button>`).join('');
  ov.panel.innerHTML = declined
    ? `<div class="age-badge">17+</div>
       <h2>${esc(t('age.sorryTitle'))}</h2>
       <p>${esc(t('age.sorry'))}</p>
       <div class="age-actions">${linkButtons}<button type="button" data-back>${esc(t('age.back'))}</button></div>`
    : `<button type="button" class="age-lang" data-lang>${getLanguage() === 'bn' ? 'English' : 'বাংলা'}</button>
       <div class="age-badge">17+</div>
       <h2>${esc(t('age.title'))}</h2>
       <p>${esc(t('age.text'))}</p>
       <p class="age-small">${esc(t('age.small'))}</p>
       <div class="age-actions">
         <button type="button" class="age-yes" data-yes>${esc(t('age.yes'))}</button>
         <button type="button" data-no>${esc(t('age.no'))}</button>
       </div>`;
}

function show() {
  if (game.save.data.flags?.ageOk) return;
  // Automated tests start with ?autostart=1 and skip it (add &agegate=1 to test the screen itself).
  if (debug.flag('autostart') === '1' && debug.flag('agegate') !== '1') return;
  render();
  ov.open();
}

export default {
  id: 'ageGate',

  init(g) {
    game = g;
    ov = createOverlay(g, { id: 'age-gate', reason: 'ageGate', className: 'age-gate', escape: false });
    ov.root.addEventListener('click', (e) => {
      if (e.target.closest('[data-yes]')) {
        g.save.data.flags = { ...g.save.data.flags, ageOk: true };
        ov.close(); // closing saves
      } else if (e.target.closest('[data-no]')) {
        declined = true;
        render();
      } else if (e.target.closest('[data-back]')) {
        declined = false;
        render();
      } else if (e.target.closest('[data-lang]')) {
        setLanguage(getLanguage() === 'bn' ? 'en' : 'bn');
        g.save.data.settings.language = getLanguage();
      } else if (e.target.closest('[data-link]')) {
        window.open(e.target.closest('[data-link]').dataset.link, '_blank', 'noopener');
      }
    });
    offs = [
      g.events.on('game:started', show),
      g.events.on('language:changed', () => { if (ov.isOpen) render(); }),
    ];
    if (g.running) show();
  },

  update() {},

  dispose() {
    offs.forEach((off) => off());
    offs = [];
    ov?.dispose();
  },
};
