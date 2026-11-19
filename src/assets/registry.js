// Asset registry (CLAUDE.md rule 5). Every model / texture / image / sound has an id.
//
//   assets.registerDefault('texture.facades', () => makeFacadeAtlas())   // placeholder built in code
//   const tex = await assets.load('texture.facades')                     // or assets.get(id) once loaded
//
// To replace a placeholder with real art, add the id to data/assets.json:
//   "model.player": { "type": "model", "url": "assets/shoumik/shoumik.glb" }
// The registry then loads the file instead of calling the placeholder factory — no code change.
// If the file fails to load, the placeholder is used and a warning is logged.
//
// Types: image (HTMLImageElement) | texture (THREE.Texture) | model (THREE.Object3D, .glb)
//        | sound (ArrayBuffer for now; the audio feature decodes it in Session 7).
//
// Models are *templates*: call assets.instance(id) to get a fresh copy for the scene.

import * as THREE from 'three';
import { log } from '../core/debug.js';

class AssetRegistry {
  constructor() {
    this.defaults = new Map();   // id -> factory()
    this.overrides = {};         // id -> { type, url } from data/assets.json
    this.cache = new Map();      // id -> loaded asset
    this.pending = new Map();    // id -> Promise
  }

  /** @param {{assets:object}} assetsCfg data/assets.json */
  configure(assetsCfg) {
    this.overrides = assetsCfg?.assets || {};
  }

  /** Register the built-in placeholder for an id. The factory may be async. */
  registerDefault(id, factory) {
    this.defaults.set(id, factory);
  }

  /** URL of a file-based asset (for <img> tags), or null. */
  url(id) {
    return this.overrides[id]?.url || null;
  }

  async loadFile({ type, url, wrapS, wrapT, anisotropy }) {
    switch (type) {
      case 'image':
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error(`image failed: ${url}`));
          img.src = url;
        });
      case 'texture': {
        const tex = await new THREE.TextureLoader().loadAsync(url);
        tex.colorSpace = THREE.SRGBColorSpace;
        // Optional per-file settings in data/assets.json: "wrapS"/"wrapT": "repeat" | "clamp",
        // "anisotropy": sharper on walls/roads seen at an angle (capped by the GPU).
        const wrap = { repeat: THREE.RepeatWrapping, clamp: THREE.ClampToEdgeWrapping };
        if (wrap[wrapS]) tex.wrapS = wrap[wrapS];
        if (wrap[wrapT]) tex.wrapT = wrap[wrapT];
        if (anisotropy) tex.anisotropy = anisotropy;
        return tex;
      }
      case 'model': {
        // Loaded only when a real model is configured, so the loader costs nothing until then.
        const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
        const gltf = await new GLTFLoader().loadAsync(url);
        gltf.scene.userData.animations = gltf.animations;
        return gltf.scene;
      }
      case 'sound': {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`sound failed: ${url}`);
        return res.arrayBuffer();
      }
      default:
        throw new Error(`unknown asset type "${type}"`);
    }
  }

  /** Load (once) and return an asset. */
  load(id) {
    if (this.cache.has(id)) return Promise.resolve(this.cache.get(id));
    if (this.pending.has(id)) return this.pending.get(id);
    const task = (async () => {
      const override = this.overrides[id];
      const factory = this.defaults.get(id);
      let asset = null;
      if (override) {
        try {
          asset = await this.loadFile(override);
        } catch (err) {
          log.warn(`asset "${id}": ${err.message}${factory ? ' — using the placeholder' : ''}`);
        }
      }
      if (!asset) {
        if (!factory) throw new Error(`asset "${id}" has no file and no placeholder`);
        asset = await factory();
      }
      this.cache.set(id, asset);
      this.pending.delete(id);
      return asset;
    })();
    this.pending.set(id, task);
    return task;
  }

  /** Load several ids at once. */
  loadMany(ids) {
    return Promise.all(ids.map((id) => this.load(id)));
  }

  /** Get an already-loaded asset (throws if it was never loaded). */
  get(id) {
    if (!this.cache.has(id)) throw new Error(`asset "${id}" is not loaded yet`);
    return this.cache.get(id);
  }

  /** A fresh copy of a loaded model for placing in the scene. */
  instance(id) {
    const template = this.get(id);
    const copy = template.clone(true);
    copy.userData = { ...template.userData };
    return copy;
  }
}

export const assets = new AssetRegistry();
