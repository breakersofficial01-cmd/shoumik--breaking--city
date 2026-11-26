// Paints the clothing texture of a real 3D person (Roadmap 2 S5).
//
// assets/people/skins.png (made by tools/people-kit) holds the Kenney body texture twice in grey
// (left half = man, right half = woman: R channel = shading) and a REGION id per texel
// (G channel / 16): 1 face skin, 2 hair, 3 shirt body, 4 upper arm, 5 forearm, 6 hands,
// 7 upper leg, 8 lower leg, 9 shoes. A person's texture = grey × the colour of its region, so
// one small file gives every look of data/pedestrians.json (panjabi, lungi, saree, kameez,
// shirt-pant, uniforms...). Textures are cached by look (LRU, data/people.json → textures).

import * as THREE from 'three';

const LONG_SLEEVE = new Set(['shirt_long', 'panjabi', 'kameez', 'crop_jacket']);
const SLEEVELESS = new Set(['vest']);
const BARE_SHINS = new Set(['lungi']);

const rgb = (hex) => {
  const n = parseInt(String(hex).replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

export class SkinPainter {
  /**
   * @param {HTMLImageElement} image  assets/people/skins.png
   * @param {object} cfg  data/people.json
   */
  constructor(image, cfg) {
    this.cfg = cfg;
    this.size = image.height;
    const c = document.createElement('canvas');
    c.width = image.width; c.height = image.height;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(image, 0, 0);
    this.src = x.getImageData(0, 0, c.width, c.height).data;
    this.cache = new Map(); // key -> { tex, users }
  }

  /** The colour of each region (index = region id) for a look's desc (looks.js). */
  colours(d) {
    const skin = rgb(d.skin), hair = rgb(d.hair);
    const vest = !!d.extras?.vest;
    const top = rgb(vest ? this.cfg.colours.vest : d.topC);
    const bottom = rgb(d.bottomC);
    const shoe = d.shoes === 'sandal' ? mix(skin, rgb(d.shoeC), 0.55) : rgb(d.shoeC);
    const c = [];
    c[0] = [128, 128, 128];
    c[1] = skin;
    c[2] = hair;
    c[3] = top;
    c[4] = SLEEVELESS.has(d.top) && !vest ? skin : rgb(d.topC);
    c[5] = LONG_SLEEVE.has(d.top) ? rgb(d.topC) : skin;
    c[6] = skin;
    c[7] = bottom;
    c[8] = BARE_SHINS.has(d.bottom) ? skin : bottom;
    c[9] = shoe;
    return c;
  }

  /** Only what changes the texture (several people may share one). */
  keyOf(d) {
    return [d.sex, d.top, d.bottom, d.shoes, d.skin, d.hair, d.topC, d.bottomC, d.shoeC, d.extras?.vest ? 1 : 0].join('|');
  }

  has(d) { return this.cache.has(this.keyOf(d)); }

  /** Texture for this look (painted now if new). Call release() when the person stops using it. */
  get(d) {
    const key = this.keyOf(d);
    let e = this.cache.get(key);
    if (!e) {
      e = { tex: this.paint(d), users: 0 };
      this.cache.set(key, e);
      this.trim();
    } else {
      this.cache.delete(key); // move to the end = most recently used
      this.cache.set(key, e);
    }
    e.users++;
    return e.tex;
  }

  release(d) {
    const e = this.cache.get(this.keyOf(d));
    if (e) e.users = Math.max(0, e.users - 1);
  }

  /** Drop the oldest unused textures above the limit. */
  trim() {
    for (const [k, e] of this.cache) {
      if (this.cache.size <= this.cfg.textures) break;
      if (e.users > 0) continue;
      e.tex.dispose();
      this.cache.delete(k);
    }
  }

  paint(d) {
    const S = this.size;
    const W = S * 2;
    const half = d.sex === 'f' ? S : 0;
    const col = this.colours(d);
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const x = c.getContext('2d');
    const img = x.createImageData(S, S);
    const o = img.data, src = this.src;
    for (let y = 0; y < S; y++) {
      for (let i = 0; i < S; i++) {
        const s = (y * W + i + half) * 4;
        const k = (src[s] / 255) * 1.18;           // shading (mean ≈ 0.78 → ≈ 0.92 of the colour)
        const cc = col[(src[s + 1] + 8) >> 4] || col[0];
        const t = (y * S + i) * 4;
        o[t] = Math.min(255, cc[0] * k);
        o[t + 1] = Math.min(255, cc[1] * k);
        o[t + 2] = Math.min(255, cc[2] * k);
        o[t + 3] = 255;
      }
    }
    x.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    // flipY stays true: the packed GLB keeps the FBX's UVs (three's own convention).
    tex.anisotropy = 2;
    return tex;
  }

  dispose() {
    for (const e of this.cache.values()) e.tex.dispose();
    this.cache.clear();
  }
}
