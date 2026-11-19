// Bangla shop signboards (Session 7). The blank signboards above shop shutters
// (buildingMesher.js) get a face with a shop name painted in Bangla (some with a small English
// line), like real Dhaka streets. All names are painted ONCE into one picture (atlas) after the
// Bangla font has loaded, so every sign in a chunk is part of one merged mesh = 1 draw call.
// At night the letters glow (emissive map; strength set by world.cityShading.setSigns()).
// Names, colours and atlas size: data/signboards.json.

import * as THREE from 'three';
import { fontStack } from '../ui/fonts.js';
import { hexToLinear } from './geoBuilder.js';

export class SignAtlas {
  /** @param {object} cfg  data/signboards.json */
  constructor(cfg) {
    this.cfg = cfg;
    const A = cfg.atlas;
    this.cols = A.cols;
    this.rows = A.rows;
    this.names = (cfg.names || []).slice(0, A.cols * A.rows);
    this.count = this.names.length;
    // Board colour per name (linear, for vertex colours) — the board box uses the same colour.
    this.cells = this.names.map((n, i) => {
      const [bg, fg] = cfg.styles[i % cfg.styles.length];
      const cx = i % A.cols, cy = Math.floor(i / A.cols);
      return {
        bg, fg, bgLinear: hexToLinear(bg),
        u0: cx / A.cols, u1: (cx + 1) / A.cols,
        v1: 1 - cy / A.rows, v0: 1 - (cy + 1) / A.rows,
      };
    });
    this.map = this.makeCanvas(false);
    this.glow = this.makeCanvas(true);
    this.material = new THREE.MeshLambertMaterial({
      map: this.map.texture, emissiveMap: this.glow.texture, emissive: new THREE.Color(1, 1, 1).multiplyScalar(cfg.nightGlow ?? 1.3),
    });
    this.material.name = 'shop-signs';
  }

  makeCanvas(glow) {
    const A = this.cfg.atlas;
    const canvas = document.createElement('canvas');
    canvas.width = A.width;
    canvas.height = A.height;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    this.paint(canvas, glow);
    return { canvas, texture };
  }

  /** Paint every name. glow = only the letters, on black (the emissive picture). */
  paint(canvas, glow) {
    const A = this.cfg.atlas;
    const ctx = canvas.getContext('2d');
    const cw = A.width / A.cols, ch = A.height / A.rows;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, A.width, A.height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    this.names.forEach((n, i) => {
      const c = this.cells[i];
      const x = (i % A.cols) * cw, y = Math.floor(i / A.cols) * ch;
      if (!glow) {
        ctx.fillStyle = c.bg;
        ctx.fillRect(x, y, cw, ch);
        ctx.strokeStyle = 'rgba(0,0,0,0.25)';
        ctx.lineWidth = 3;
        ctx.strokeRect(x + 2, y + 2, cw - 4, ch - 4);
      }
      ctx.fillStyle = c.fg;
      const two = !!n.en;
      const fit = (text, font, size, maxW) => {
        let s = size;
        ctx.font = `700 ${s}px ${font}`;
        while (ctx.measureText(text).width > maxW && s > 10) { s -= 2; ctx.font = `700 ${s}px ${font}`; }
      };
      fit(n.bn, fontStack('bn'), Math.round(ch * (two ? 0.5 : 0.62)), cw * 0.9);
      ctx.fillText(n.bn, x + cw / 2, y + ch * (two ? 0.38 : 0.53));
      if (two) {
        fit(n.en.toUpperCase(), fontStack('en'), Math.round(ch * 0.24), cw * 0.8);
        ctx.fillText(n.en.toUpperCase(), x + cw / 2, y + ch * 0.8);
      }
    });
  }

  /** Repaint once the Bangla font is ready (the first paint may have used a fallback font). */
  repaint() {
    this.paint(this.map.canvas, false);
    this.paint(this.glow.canvas, true);
    this.map.texture.needsUpdate = true;
    this.glow.texture.needsUpdate = true;
  }

  /** Which name a sign shows: fixed per building, side and position (no Rng calls). */
  pick(seed, k, bit) {
    if (!this.count) return null;
    const h = Math.imul((seed | 0) ^ 0x9e3779b9, 31) + k * 7919 + bit * 104729;
    return this.cells[(h >>> 0) % this.count];
  }

  /**
   * Add the sign's front face (a quad `out` metres in front of the wall) to the signs GeoBuilder.
   * (ax,az)->(bx,bz) runs left to right seen from the street; (nx,nz) = unit vector to the street.
   */
  face(gb, cell, ax, az, bx, bz, nx, nz, out, y0, y1) {
    const white = [1, 1, 1];
    const ox = nx * out, oz = nz * out;
    const a = gb.vertex(ax + ox, y0, az + oz, nx, 0, nz, white, cell.u0, cell.v0);
    const b = gb.vertex(bx + ox, y0, bz + oz, nx, 0, nz, white, cell.u1, cell.v0);
    const c = gb.vertex(bx + ox, y1, bz + oz, nx, 0, nz, white, cell.u1, cell.v1);
    const d = gb.vertex(ax + ox, y1, az + oz, nx, 0, nz, white, cell.u0, cell.v1);
    gb.idx.push(a, b, c, a, c, d);
  }
}
