// Feature: earn (Session 9). Helps a player who has no money (or no bullets) get back on track:
//   earn:offer { reason: 'money'|'ammo', need?, price?, item?, target? }  (sent by shops)
//     → a panel: "not enough Taka" / "out of bullets", the way to the nearest weapon shop
//       (target), and two ways to earn: 📺 YouTube classes and 📝 quizzes, plus the way to
//       Breaking School and Breaking Biology on the map (route:set).
//   earn:landing { mode?: 'watch'|'quiz' }  → the class landing page (./landing.js).
// From the landing page a class's quiz starts with class:start { lesson } (classes feature).
// Class text is Bangla (CLAUDE.md quiz rule). YouTube only opens outside (YouTube rule).
//
// Listens earn:offer, earn:landing   Sends route:set { x, z, label, icon }, class:start { lesson }

import { t, tl, moneyIn, pickName, formatMoney } from '../../ui/i18n.js';
import { createOverlay, esc } from '../../ui/overlay.js';
import { landingHtml } from './landing.js';

let game = null;
let offerOv = null;
let landOv = null;
let offs = [];
let offer = null;
let land = { filter: 'all', mode: 'watch', need: 0 };

const L = () => game.config.get('ui').questionLanguage || 'bn';
const places = () => game.content.get('places');
const lessons = () => game.content.get('lessons').filter((l) => l.active);

/** Route to an institute's entrance (its place junction). */
function routeTo(id) {
  const p = places().find((x) => x.id === id);
  if (!p) return;
  const c = game.world.layout.crossingCentre(p.col, p.row);
  const marker = game.world.landmarks?.markers?.find?.((m) => m.id === id || m.place === id);
  game.events.emit('route:set', { x: marker?.x ?? c.x, z: marker?.z ?? c.z, label: p.name, icon: '🎓' });
}

function renderOffer() {
  const o = offer;
  const cash = game.economy.getCash();
  const broke = o.reason === 'money' || (Number.isFinite(o.price) && o.price > cash);
  const title = o.reason === 'ammo' ? 'earn.ammoTitle' : 'earn.moneyTitle';
  const lines = [];
  if (o.reason === 'ammo' && o.target) lines.push(`<p class="earn-line">🧭 ${esc(t('earn.toGunShop', { shop: pickName(o.target.label) }))}</p>`);
  if (o.reason === 'ammo' && Number.isFinite(o.price)) lines.push(`<p class="earn-line">${esc(t('earn.ammoPrice', { item: o.item || '', money: formatMoney(o.price) }))}</p>`);
  if (o.need > 0) lines.push(`<p class="earn-need">${esc(t('earn.need', { money: formatMoney(o.need), item: o.item || '' }))}</p>`);
  offerOv.panel.innerHTML = `
    <h2>${esc(t(title))}</h2>
    ${lines.join('')}
    ${broke ? `
      <p class="earn-sub">${esc(t('earn.studyIntro'))}</p>
      <button type="button" class="earn-big yt" data-act="watch"><b>📺 ${esc(tl(L(), 'earn.youtube'))}</b><small>${esc(tl(L(), 'earn.youtubeNote'))}</small></button>
      <button type="button" class="earn-big quiz" data-act="quiz"><b>📝 ${esc(tl(L(), 'earn.quiz'))}</b><small>${esc(tl(L(), 'earn.quizNote', { money: moneyIn(L(), game.content.getDefaults('lessons').rewardPerCorrect || 150) }))}</small></button>
      <div class="earn-ways">
        <button type="button" data-route="breaking-school">🧭 ${esc(t('earn.wayTo', { place: pickName(places().find((p) => p.id === 'breaking-school')?.name) }))}</button>
        <button type="button" data-route="breaking-biology">🧭 ${esc(t('earn.wayTo', { place: pickName(places().find((p) => p.id === 'breaking-biology')?.name) }))}</button>
      </div>` : ''}
    <div class="earn-row">
      ${o.target ? `<button type="button" data-act="map">🗺 ${esc(t('earn.showMap'))}</button>` : ''}
      <button type="button" class="panel-close" data-act="close">${esc(t('settings.close'))}</button>
    </div>`;
}

function openOffer(o = {}) {
  offer = { reason: 'money', need: 0, ...o };
  renderOffer();
  offerOv.open();
}

function renderLanding() {
  landOv.panel.innerHTML = landingHtml(L(), { lessons: lessons(), save: game.save.data, places: places(), ...land });
}

function openLanding({ mode = 'watch', need = 0 } = {}) {
  land = { ...land, mode, need };
  renderLanding();
  landOv.open();
  landOv.panel.scrollTop = 0;
}

function onOfferClick(e) {
  const b = e.target.closest('[data-act], [data-route]');
  if (!b) return;
  if (b.dataset.route) { routeTo(b.dataset.route); offerOv.close(); game.events.emit('toast:show', { key: 'earn.routeSet' }); return; }
  switch (b.dataset.act) {
    case 'watch': offerOv.close(); return openLanding({ mode: 'watch', need: offer.need });
    case 'quiz': offerOv.close(); return openLanding({ mode: 'quiz', need: offer.need });
    case 'map': offerOv.close(); return game.events.emit('map:open', {});
    case 'close': return offerOv.close();
    default:
  }
}

function onLandingClick(e) {
  const f = e.target.closest('[data-filter]');
  const q = e.target.closest('[data-quiz]');
  if (f) { land.filter = f.dataset.filter; renderLanding(); return; }
  if (q) { landOv.close(); game.events.emit('class:start', { lesson: q.dataset.quiz }); return; }
  if (e.target.closest('[data-close]')) landOv.close();
  // The YouTube <a target=_blank> opens outside the game by itself.
}

export default {
  id: 'earn',

  init(g) {
    game = g;
    offerOv = createOverlay(g, { id: 'earn-offer', reason: 'earn', className: 'earn-offer' });
    landOv = createOverlay(g, { id: 'class-landing', reason: 'landing', className: 'class-landing' });
    offerOv.panel.addEventListener('click', onOfferClick);
    landOv.panel.addEventListener('click', onLandingClick);
    offs = [
      g.events.on('earn:offer', (o) => { if (!offerOv.isOpen && !g.paused) openOffer(o); }),
      g.events.on('earn:landing', (o) => openLanding(o || {})),
      g.events.on('language:changed', () => { if (offerOv.isOpen) renderOffer(); }),
      // A brand-new player: say what they start with and where to go.
      g.events.on('game:started', () => {
        if (!g.save.isNew) return;
        const eco = g.config.get('economy');
        g.events.emit('toast:show', { key: 'tutorial.welcome', seconds: 9, vars: { name: g.account?.current?.name || '', money: formatMoney(eco.startCash) } });
      }),
    ];
  },

  /** For tools / the console. */
  openOffer,
  openLanding,
  routeTo,

  update() {},

  dispose() {
    offs.forEach((off) => off());
    offs = [];
    offerOv?.dispose();
    landOv?.dispose();
    offerOv = landOv = null;
  },
};
