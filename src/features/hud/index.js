// Feature: HUD. Cash + wanted stars + Shoumik's portrait (top-left) and the district name
// toast. Listens to events only:
//   cash:changed { cash }      wanted:changed { stars, seen }  (stars blink while seen is false)
//   health:changed { value, max }   armour:changed { value, max }   district:entered { district }
//   language:changed
//   prompt:show { id, key, vars? }  /  prompt:hide { id }   a one-line hint at the bottom (e.g. "press to dance")
//   toast:show { key, vars?, text?, seconds? }   a short message under the district name (Session 7:
//              load-shedding, reward codes, radio station, screenshot saved…)
// Sends:  profile:open  when the portrait is tapped (the profile card comes in Session 7).

import { formatMoney, pickName, t } from '../../ui/i18n.js';

let game = null;
let root = null;
let offs = [];
let toastTimer = null;
let stars = 0;
let seen = true;
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
  box.classList.toggle('unseen', stars > 0 && !seen);
}

function renderArmour(a) {
  const box = root.querySelector('.hud-armour');
  if (!a) return;
  box.hidden = !(a.value > 0);
  box.firstChild.style.width = `${Math.round((a.max > 0 ? a.value / a.max : 0) * 100)}%`;
}

function renderHealth(h) {
  const box = root.querySelector('.hud-health');
  if (!h) return;
  const share = h.max > 0 ? h.value / h.max : 1;
  box.firstChild.style.width = `${Math.round(share * 100)}%`;
  box.classList.toggle('low', share < 0.3);
  box.title = t('hud.health');
}

let toastQueue = [];
let toastBusy = false;
function showToast(msg) {
  toastQueue.push(msg);
  if (toastBusy) return;
  const next = () => {
    const m = toastQueue.shift();
    const el = root?.querySelector('.hud-toast');
    if (!m || !el) { toastBusy = false; return; }
    toastBusy = true;
    el.textContent = m.text || t(m.key, m.vars);
    el.classList.add('show');
    setTimeout(() => {
      el?.classList.remove('show');
      setTimeout(next, 350);
    }, (m.seconds || game.config.get('ui').hud.toastSeconds || 3.5) * 1000);
  };
  next();
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
          <div class="hud-health"><i></i></div>
          <div class="hud-armour" hidden><i></i></div>
        </div>
      </div>
      <div class="hud-district"></div>
      <div class="hud-toast"></div>
      <div class="hud-prompt" hidden></div>`;
    g.ui.appendChild(root);

    const img = root.querySelector('.hud-portrait img');
    const url = g.assets.url('image.shoumik.portrait');
    if (url) img.src = url;
    root.querySelector('.hud-portrait').addEventListener('click', () => g.events.emit('profile:open', {}));

    renderCash();
    renderStars();
    renderHealth(g.player?.health);
    renderArmour(g.player?.armour);
    offs = [
      g.events.on('cash:changed', renderCash),
      g.events.on('wanted:changed', ({ stars: n, seen: s = true }) => { stars = n || 0; seen = s !== false; renderStars(); }),
      g.events.on('armour:changed', renderArmour),
      g.events.on('district:entered', ({ district }) => showDistrict(district)),
      g.events.on('language:changed', () => { renderCash(); renderPrompt(); if (lastDistrict) showDistrict(lastDistrict); }),
      g.events.on('prompt:show', ({ id, key, vars }) => { prompts.delete(id); prompts.set(id, { key, vars }); renderPrompt(); }),
      g.events.on('prompt:hide', ({ id }) => { prompts.delete(id); renderPrompt(); }),
      g.events.on('save:reset', renderCash),
      g.events.on('health:changed', renderHealth),
      g.events.on('toast:show', showToast),
    ];
  },

  update() {},

  dispose() {
    offs.forEach((off) => off());
    offs = [];
    clearTimeout(toastTimer);
    prompts.clear();
    toastQueue = [];
    root?.remove();
    root = null;
  },
};
