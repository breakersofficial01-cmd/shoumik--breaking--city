// Feature: screenshot (Session 7). A camera button (under the settings gear) or the P key takes
// a picture of the game view (no HUD) with a "Breaking City" watermark, then shows it with
// Save and Share buttons (Share uses the phone's share sheet when the browser supports it —
// good for posting on Facebook / Instagram / TikTok). Watermark text: data/strings.json
// (screenshot.watermark*), colours in the CSS-like constants below come from the logo.
//
// Listens: input:photo   Sends: screenshot:taken { width, height }

import { createOverlay, esc } from '../../ui/overlay.js';
import { fontStack } from '../../ui/fonts.js';
import { t } from '../../ui/i18n.js';

let game = null;
let button = null;
let ov = null;
let offs = [];
let lastBlob = null;
let lastUrl = null;

const CAMERA = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M4 8h3l1.6-2.4h6.8L17 8h3v11H4z"/><circle cx="12" cy="13.2" r="3.6"/></g></svg>';

/** Draw the watermark in the bottom-right corner (logo style: gold "BREAKING", pink "CITY"). */
function watermark(ctx, w, h) {
  const s = Math.max(14, Math.round(h * 0.055));
  const pad = Math.round(s * 0.7);
  ctx.save();
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `italic 900 ${s}px ${fontStack('en')}`;
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, s * 0.16);
  ctx.strokeStyle = '#1b1238';
  const cityW = ctx.measureText(' CITY').width;
  const y = h - pad - s * 0.55;
  ctx.strokeText(' CITY', w - pad, y);
  ctx.fillStyle = '#ff5fa2';
  ctx.fillText(' CITY', w - pad, y);
  ctx.strokeText('BREAKING', w - pad - cityW, y);
  ctx.fillStyle = '#ffd34d';
  ctx.fillText('BREAKING', w - pad - cityW, y);
  ctx.font = `700 ${Math.round(s * 0.42)}px ${fontStack('bn')}`;
  ctx.lineWidth = Math.max(2, s * 0.08);
  const sub = t('screenshot.watermarkSub');
  ctx.strokeText(sub, w - pad, h - pad * 0.7);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(sub, w - pad, h - pad * 0.7);
  ctx.restore();
}

/** Render one frame and copy it (plus the watermark) into a new canvas. */
function capture() {
  game.graphics.render(0); // the drawing buffer is only readable right after rendering
  const src = game.canvas;
  const out = document.createElement('canvas');
  out.width = src.width;
  out.height = src.height;
  const ctx = out.getContext('2d');
  ctx.drawImage(src, 0, 0);
  watermark(ctx, out.width, out.height);
  return out;
}

async function take() {
  if (ov.isOpen || game.paused) return;
  const canvas = capture();
  game.audio?.play('camera');
  const flash = document.createElement('div');
  flash.className = 'photo-flash';
  game.ui.appendChild(flash);
  setTimeout(() => flash.remove(), 450);
  lastBlob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.9));
  if (lastUrl) URL.revokeObjectURL(lastUrl);
  lastUrl = lastBlob ? URL.createObjectURL(lastBlob) : canvas.toDataURL('image/jpeg', 0.9);
  game.events.emit('screenshot:taken', { width: canvas.width, height: canvas.height });
  const file = lastBlob ? new File([lastBlob], fileName(), { type: 'image/jpeg' }) : null;
  const canShare = !!(file && navigator.canShare?.({ files: [file] }));
  ov.panel.innerHTML = `
    <h2>${esc(t('screenshot.title'))}</h2>
    <img class="photo-preview" src="${esc(lastUrl)}" alt="">
    <div class="photo-actions">
      <button type="button" data-save>${esc(t('screenshot.save'))}</button>
      ${canShare ? `<button type="button" data-share>${esc(t('screenshot.share'))}</button>` : ''}
      <button type="button" data-close>${esc(t('settings.close'))}</button>
    </div>`;
  ov.open();
}

function fileName() {
  const d = new Date();
  const two = (n) => String(n).padStart(2, '0');
  return `breaking-city-${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}.jpg`;
}

function save() {
  const a = document.createElement('a');
  a.href = lastUrl;
  a.download = fileName();
  document.body.appendChild(a);
  a.click();
  a.remove();
  game.events.emit('toast:show', { key: 'screenshot.saved' });
}

async function share() {
  try {
    await navigator.share({ files: [new File([lastBlob], fileName(), { type: 'image/jpeg' })], title: 'Breaking City', text: t('screenshot.shareText') });
  } catch { /* cancelled */ }
}

export default {
  id: 'screenshot',

  init(g) {
    game = g;
    button = document.createElement('button');
    button.id = 'photo-button';
    button.type = 'button';
    button.innerHTML = CAMERA;
    button.setAttribute('aria-label', t('screenshot.title'));
    button.addEventListener('click', take);
    g.ui.appendChild(button);
    ov = createOverlay(g, { id: 'photo-panel', reason: 'photo', className: 'photo-panel' });
    ov.root.addEventListener('click', (e) => {
      if (e.target.closest('[data-save]')) save();
      else if (e.target.closest('[data-share]')) share();
      else if (e.target.closest('[data-close]') || e.target === ov.root) ov.close();
    });
    offs = [
      g.events.on('input:photo', take),
      g.events.on('language:changed', () => button.setAttribute('aria-label', t('screenshot.title'))),
    ];
  },

  update() {},

  dispose() {
    offs.forEach((off) => off());
    offs = [];
    button?.remove();
    ov?.dispose();
    if (lastUrl?.startsWith('blob:')) URL.revokeObjectURL(lastUrl);
  },
};
