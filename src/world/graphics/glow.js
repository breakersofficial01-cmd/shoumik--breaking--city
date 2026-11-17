// Glow helper: unlit "neon" materials are made brighter than white so that the bloom effect
// (src/world/graphics/postfx.js) picks them up, and so filmic tone mapping keeps them vivid.
// Boost factors live in data/graphics.json → neon.
//
// Usage when creating a material:   markGlow(new THREE.MeshBasicMaterial({...}), 'glow')

import { config } from '../../core/config.js';

/**
 * @param {import('three').Material & {color: import('three').Color}} material
 * @param {'glow'|'sign'|'marker'} kind  which boost from data/graphics.json → neon
 * @returns the same material (so it can wrap a constructor call)
 */
export function markGlow(material, kind = 'glow') {
  const boost = config.has('graphics') ? config.get('graphics').neon?.[kind] : null;
  if (boost && material.color) material.color.multiplyScalar(boost);
  material.userData.glow = kind;
  return material;
}
