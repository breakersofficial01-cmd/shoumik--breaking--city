// Glow helper: unlit "neon" materials are made brighter than white so that the bloom effect
// (src/world/graphics/postfx.js) picks them up, and so filmic tone mapping keeps them vivid.
// Boost factors live in data/graphics.json → neon.
//
// Usage when creating a material:   markGlow(new THREE.MeshBasicMaterial({...}), 'glow')
// Session 7: setGlowLevel(k) makes every glow material k times brighter (day/night: neon
// shines stronger after dark). Materials are remembered weakly-ish: disposed ones are dropped.

import { config } from '../../core/config.js';

const marked = new Set(); // { material, base: Color }
let level = 1;

/**
 * @param {import('three').Material & {color: import('three').Color}} material
 * @param {'glow'|'sign'|'marker'} kind  which boost from data/graphics.json → neon
 * @returns the same material (so it can wrap a constructor call)
 */
export function markGlow(material, kind = 'glow') {
  const boost = config.has('graphics') ? config.get('graphics').neon?.[kind] : null;
  if (boost && material.color) material.color.multiplyScalar(boost);
  material.userData.glow = kind;
  if (material.color) {
    const entry = { material, base: material.color.clone() };
    marked.add(entry);
    material.addEventListener?.('dispose', () => marked.delete(entry));
    if (level !== 1) material.color.copy(entry.base).multiplyScalar(level);
  }
  return material;
}

/** Brightness of all neon at once (1 = as in data/graphics.json). Cheap; call when it changes. */
export function setGlowLevel(k) {
  if (Math.abs(k - level) < 0.005) return;
  level = k;
  for (const { material, base } of marked) material.color.copy(base).multiplyScalar(k);
}
