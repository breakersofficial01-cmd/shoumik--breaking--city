// Sign atlas: every landmark name board is painted once, with the game's fonts, onto ONE
// canvas texture (one material, one draw call per landmark for its boards).
//   big signs   the glowing Breaking School / Breaking Biology roof signs (name in English + Bangla)
//   name boards small two-line boards (Bangla on top, English below) for the other landmarks
// Text only — never a logo or crest of a real institution (CLAUDE.md).
// Canvas text must wait for the fonts, so buildSignAtlas() is async (CLAUDE.md rule 7).

import * as THREE from 'three';
import { fontStack, fontsReady } from '../../ui/fonts.js';

/** Shrink the font until the text fits the width. */
function fitText(ctx, text, weight, size, family, maxWidth) {
  let px = size;
  do {
    ctx.font = `${weight} ${px}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    px -= 2;
  } while (px > 10);
  return px;
}

/**
 * @param {Array<{id:string, name:{en:string, bn:string}, big?:object}>} entries
 *        big = { background:[top, bottom], text, accent } makes a large glowing sign
 * @param {object} cfg  data/landmarks.json → signs
 * @returns {Promise<{texture:THREE.Texture, uv:Map<string, {u0:number,v0:number,u1:number,v1:number,aspect:number}>}>}
 */
export async function buildSignAtlas(entries, cfg) {
  await fontsReady();
  const size = cfg.atlasSize;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = cfg.board.background;
  ctx.fillRect(0, 0, size, size);
  const uv = new Map();
  const put = (id, x, y, w, h) => {
    // Canvas y runs down, texture v runs up; inset half a pixel so neighbours never bleed in.
    uv.set(id, { u0: (x + 0.5) / size, u1: (x + w - 0.5) / size, v0: 1 - (y + h - 0.5) / size, v1: 1 - (y + 0.5) / size, aspect: h / w });
  };
  const bn = fontStack('bn'), en = fontStack('en');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Big glowing signs, stacked from the top.
  const bigs = entries.filter((e) => e.big);
  const bigH = Math.round(size * cfg.big.heightShare);
  let y = 0;
  for (const e of bigs) {
    const g = ctx.createLinearGradient(0, y, 0, y + bigH);
    g.addColorStop(0, e.big.background[0]);
    g.addColorStop(1, e.big.background[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, y, size, bigH);
    ctx.strokeStyle = e.big.accent;
    ctx.lineWidth = Math.max(4, bigH * 0.04);
    ctx.strokeRect(ctx.lineWidth, y + ctx.lineWidth, size - 2 * ctx.lineWidth, bigH - 2 * ctx.lineWidth);
    ctx.fillStyle = e.big.text;
    ctx.shadowColor = e.big.accent;
    ctx.shadowBlur = bigH * 0.12;
    fitText(ctx, e.name.en.toUpperCase(), 800, bigH * 0.4, en, size * 0.9);
    ctx.fillText(e.name.en.toUpperCase(), size / 2, y + bigH * 0.33);
    fitText(ctx, e.name.bn, 700, bigH * 0.34, bn, size * 0.88);
    ctx.fillText(e.name.bn, size / 2, y + bigH * 0.72);
    ctx.shadowBlur = 0;
    put(e.id, 0, y, size, bigH);
    y += bigH;
  }

  // Small name boards in a grid under them.
  const small = entries.filter((e) => !e.big);
  const cols = cfg.board.columns;
  const rows = Math.max(1, Math.ceil(small.length / cols));
  const w = Math.floor(size / cols);
  const h = Math.min(Math.floor((size - y) / rows), Math.round(w * cfg.board.maxAspect));
  small.forEach((e, i) => {
    const x = (i % cols) * w, top = y + Math.floor(i / cols) * h;
    ctx.fillStyle = cfg.board.background;
    ctx.fillRect(x, top, w, h);
    ctx.strokeStyle = cfg.board.border;
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 3.5, top + 3.5, w - 7, h - 7);
    ctx.fillStyle = cfg.board.text;
    fitText(ctx, e.name.bn, 700, h * 0.46, bn, w - 22);
    ctx.fillText(e.name.bn, x + w / 2, top + h * 0.36);
    ctx.fillStyle = cfg.board.subText;
    fitText(ctx, e.name.en, 600, h * 0.24, en, w - 22);
    ctx.fillText(e.name.en, x + w / 2, top + h * 0.76);
    put(e.id, x, top, w, h);
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 2;
  return { texture, uv };
}
