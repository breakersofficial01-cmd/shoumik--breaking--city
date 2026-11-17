// Feature: HUD. Cash + wanted stars + Shoumik's portrait (top-left) and the district name
// toast. Listens to events only:
//   cash:changed { cash }      wanted:changed { stars }      district:entered { district }
//   language:changed
//   prompt:show { id, key, vars? }  /  prompt:hide { id }   a one-line hint at the bottom (e.g. "press to dance")
// Sends:  profile:open  when the portrait is tapped (the profile card comes in Session 7).

import { formatMoney, pickName, t } from '../../ui/i18n.js';

let game = null;
let root = null;
let offs = [];
let toastTimer = null;
let stars = 0;
let lastDistrict = null;
const prompts = new Map(); // id -> { key, vars }; the newest one is shown

function renderPrompt() {
  const el = root.querySelector('.hud-prompt');
  const top = [...prompts.values()].pop();
  el.hidden = !top;
  if (top) el.textContent = t(top.key, top.vars);
}

function renderCash() {
  root.querySelector('.hud-cash').textContent = formatMoney(game.economy.getCash());
}

function renderStars() {
  const max = game.config.get('game').wantedStarsMax;
  const box = root.querySelector('.hud-stars');
  box.innerHTML = '';
  for (let i = 0; i < max; i++) {
    const s = document.createElement('span');
    s.textContent = '★';
    if (i < stars) s.className = 'on';
    box.appendChild(s);
  }
}

function showDistrict(district) {
  lastDistrict = district;
  const el = root.querySelector('.hud-district');
  el.textContent = pickName(district.name);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), game.config.get('ui').hud.districtToastSeconds * 1000);
}

export default {
  id: 'hud',

  init(g) {
    game = g;
    root = document.createElement('div');
    root.id = 'hud';
    root.innerHTML = `
      <div class="hud-topleft">
        <button class="hud-portrait" type="button" aria-label="Shoumik"><img alt="" draggable="false"></button>
        <div class="hud-stats">
          <div class="hud-cash"></div>
          <div class="hud-stars"></div>
        </div>
      </div>
      <div class="hud-district"></div>
      <div class="hud-prompt" hidden></div>`;
    g.ui.appendChild(root);

    const img = root.querySelector('.hud-portrait img');
    const url = g.assets.url('image.shoumik.portrait');
    if (url) img.src = url;
    root.querySelector('.hud-portrait').addEventListener('click', () => g.events.emit('profile:open', {}));

    renderCash();
    renderStars();
    offs = [
      g.events.on('cash:changed', renderCash),
      g.events.on('wanted:changed', ({ stars: n }) => { stars = n || 0; renderStars(); }),
      g.events.on('district:entered', ({ district }) => showDistrict(district)),
      g.events.on('language:changed', () => { renderCash(); renderPrompt(); if (lastDistrict) showDistrict(lastDistrict); }),
      g.events.on('prompt:show', ({ id, key, vars }) => { prompts.delete(id); prompts.set(id, { key, vars }); renderPrompt(); }),
      g.events.on('prompt:hide', ({ id }) => { prompts.delete(id); renderPrompt(); }),
      g.events.on('save:reset', renderCash),
    ];
  },

  update() {},

  dispose() {
    offs.forEach((off) => off());
    offs = [];
    clearTimeout(toastTimer);
    prompts.clear();
    root?.remove();
    root = null;
  },
};
