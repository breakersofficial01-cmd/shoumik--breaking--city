// Poster pictures: one unlit material per poster, loaded LAZILY (only when a slot showing it
// comes near the player) through the asset registry, so a poster image can be swapped in
// data/assets.json like any other asset (id: texture.poster.<poster id>).
// Until a picture has loaded — or if it fails — the slot shows the default poster of its shape.

import * as THREE from 'three';
import { log } from '../../core/debug.js';

function loadTexture(url) {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(url, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 2;
      resolve(tex);
    }, undefined, () => reject(new Error(`poster image failed: ${url}`)));
  });
}

export class PosterLibrary {
  /** @param {object} assets the asset registry  @param {object} defaults { shape: image path } */
  constructor(assets, defaults) {
    this.assets = assets;
    this.entries = new Map(); // id -> { material, state: 'idle'|'loading'|'ready'|'failed', image }
    this.defaults = {};
    this.defaultPaths = defaults;
    this.cropped = new Map(); // `${id}|${aspect}` -> material showing the middle of the picture
  }

  /** Load the three default pictures now (they are small). */
  async init() {
    await Promise.all(Object.entries(this.defaultPaths).map(async ([shape, path]) => {
      const id = `default-${shape}`;
      this.register(id, path);
      await this.request(id);
      this.defaults[shape] = this.entries.get(id);
    }));
  }

  register(id, image) {
    if (this.entries.has(id)) return;
    const assetId = `texture.poster.${id}`;
    this.assets.registerDefault(assetId, () => loadTexture(image));
    this.entries.set(id, { id, assetId, image, state: 'idle', material: null });
  }

  /** Start loading (once). Resolves when ready or failed. */
  request(id) {
    const e = this.entries.get(id);
    if (!e || e.state !== 'idle') return e?.task || Promise.resolve();
    e.state = 'loading';
    e.task = this.assets.load(e.assetId).then((tex) => {
      e.material = new THREE.MeshBasicMaterial({ map: tex });
      e.state = 'ready';
    }).catch((err) => {
      e.state = 'failed';
      log.warn(`poster "${id}": ${err.message} — showing the default poster`);
    });
    return e.task;
  }

  /** Material for a poster (or the default of `shape` while it is not loaded). */
  material(id, shape) {
    const e = id && this.entries.get(id);
    if (e && e.state === 'ready') return e.material;
    return this.defaults[shape]?.material || null;
  }

  isReady(id) {
    return this.entries.get(id)?.state === 'ready';
  }

  /** Same picture, cut to a narrower frame (rickshaw panels are not exactly 2:1). */
  croppedMaterial(id, shape, keep) {
    const base = this.material(id, shape);
    if (!base || keep >= 1) return base;
    const key = `${base.uuid}|${keep.toFixed(3)}`;
    let m = this.cropped.get(key);
    if (!m) {
      const tex = base.map.clone();
      tex.repeat.set(keep, 1);
      tex.offset.set((1 - keep) / 2, 0);
      m = new THREE.MeshBasicMaterial({ map: tex });
      this.cropped.set(key, m);
    }
    return m;
  }

  get loadedCount() {
    let n = 0;
    for (const e of this.entries.values()) if (e.state === 'ready') n++;
    return n;
  }

  dispose() {
    for (const e of this.entries.values()) e.material?.dispose();
    for (const m of this.cropped.values()) { m.map.dispose(); m.dispose(); }
    this.cropped.clear();
  }
}
