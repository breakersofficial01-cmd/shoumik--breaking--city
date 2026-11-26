// Real 3D train cars from the Quaternius Train Pack (assets/trains/*.glb, CC0), used on Medium/High.
// Shared by the MRT (features/metro) and the railway (features/railway) — moved here from
// features/metro/model.js in Roadmap 2 S6.
// Config: data/landmarks.json → viaducts[].train.model and railways[].train.model
//   { useOn, front, wagon, noseAt, heightScale, roughness, metalness, recolor: { <material>: <train colour key> } }
// Each model is merged into ONE geometry with vertex colours (one draw call per car, like the
// code-built car). Materials are recoloured to the Dhaka MRT livery using the train's own colours
// (body / stripeA / stripeB / window ...), so the look stays in data.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Merge every mesh of a model into one non-indexed geometry with a colour attribute. */
function mergeModel(root, M, T) {
  const parts = [];
  const col = new THREE.Color();
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    const groups = g.groups.length ? g.groups : [{ start: 0, count: g.attributes.position.count, materialIndex: 0 }];
    const colors = new Float32Array(g.attributes.position.count * 3);
    for (const gr of groups) {
      const m = mats[gr.materialIndex] || mats[0];
      const key = M.recolor?.[m.name];
      if (key && T[key]) col.set(T[key]); else col.copy(m.color || col.set('#888888'));
      for (let i = gr.start; i < gr.start + gr.count; i++) col.toArray(colors, i * 3);
    }
    const clean = new THREE.BufferGeometry();
    clean.setAttribute('position', g.attributes.position);
    clean.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    parts.push(clean);
  });
  const geo = mergeGeometries(parts, false);
  // Length along +z with the nose forward, centred, wheels on y = 0, then fit the car size.
  geo.rotateY(M.noseAt === '-x' ? Math.PI / 2 : -Math.PI / 2);
  geo.computeBoundingBox();
  const b = geo.boundingBox, c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3());
  geo.translate(-c.x, -b.min.y, -c.z);
  const sx = T.carWidth / s.x, sz = T.carLength / s.z;
  geo.scale(sx, sx * (M.heightScale ?? 1), sz);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Load the front and wagon models for one train config.
 * @returns {Promise<{front:THREE.BufferGeometry, wagon:THREE.BufferGeometry, material:THREE.Material}|null>}
 */
export async function loadTrainModels(game, T) {
  const M = T.model;
  if (!M || !M.useOn?.includes(game.qualityName)) return null;
  if (!game.assets.url(M.front) || !game.assets.url(M.wagon)) return null;
  const [front, wagon] = await game.assets.loadMany([M.front, M.wagon]);
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: M.roughness ?? 0.45, metalness: M.metalness ?? 0.25,
  });
  return { front: mergeModel(front, M, T), wagon: mergeModel(wagon, M, T), material };
}

/** Old name (Roadmap 2 G1). */
export const loadMetroModels = loadTrainModels;
