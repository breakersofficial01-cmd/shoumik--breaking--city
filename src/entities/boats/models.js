// Boat models (Roadmap 2 S7), shared by the boats and ferry features.
//   buildBoatGeometry(type, T)  a code-built boat (hull + deck + cabin / sail / canopy by type) —
//                               shown until assets/boats/boats.glb arrives, and if it fails
//   buildLaunchGeometry(L)      a code-built Dhaka river launch (two decks, funnel)
//   loadBoatKit(game)           → Map name → { geometry, material } from boats.glb (or null)
//   kitMesh(kit, name, …)       a mesh of one kit boat, turned / sunk for the game
// Local frame like vehicles: x = LEFT, y = up, z = forward (bow), keel at y = 0.
// Colours / sizes: data/boats.json → types.<id> (colors, length, width) and ferry.launch.

import * as THREE from 'three';
import { VBuilder } from '../vehicles/shapes.js';

let kitPromise = null;

/** A simple hull: wider deck than keel, pointed bow, then a canopy, cabin + sail or windscreen. */
export function buildBoatGeometry(type, T) {
  const vb = new VBuilder();
  const [hull, deck, trim] = T.colors;
  const hl = T.length / 2, hw = T.width / 2;
  const h = type === 'nouka' ? 0.6 : type === 'yacht' ? 1.3 : 0.9;
  vb.box({ w: hw * 0.55, tw: hw, y0: -0.25, y1: h, z0: -hl, z1: hl * 0.55, c: { side: hull, top: deck, back: hull }, skip: 'b' });
  vb.box({ w: hw * 0.55, wf: 0.05, tw: hw, twf: 0.08, y0: -0.25, y1: h, z0: hl * 0.55, z1: hl, c: { side: hull, top: deck }, skip: 'bk' });
  vb.box({ w: hw + 0.02, y0: h - 0.18, y1: h - 0.06, z0: -hl, z1: hl * 0.5, c: trim, skip: 'b' });
  if (type === 'nouka') {
    vb.box({ w: hw * 0.8, tw: hw * 0.3, y0: h, y1: h + 0.9, z0: -0.9, z1: 0.9, c: trim, skip: 'b' }); // bamboo canopy
  } else if (type === 'yacht') {
    vb.box({ w: hw * 0.7, y0: h, y1: h + 1.4, z0: -hl * 0.5, z1: hl * 0.25, c: { side: deck, top: hull }, skip: 'b' });
    vb.box({ w: hw * 0.72, y0: h + 0.6, y1: h + 1.1, z0: -hl * 0.48, z1: hl * 0.26, c: '#1d2a36', skip: 'bt' });
    vb.beam([0, h + 1.4, hl * 0.1], [0, h + 9, hl * 0.1], 0.18, '#d8d8d8');
    for (const s of [1, -1]) vb.quad([0, h + 1.8, hl * 0.12], [0, h + 8.6, hl * 0.12], [0, h + 1.8, hl * 0.85], [0, h + 1.8, hl * 0.85], '#fbfbf8', [-s, h + 3, hl * 0.4]);
  } else {
    vb.box({ w: hw * 0.8, tw: hw * 0.7, y0: h, y1: h + 0.55, z0: 0, z1: hl * 0.15, tz0: -0.2, c: '#9fd8f0', skip: 'b' }); // windscreen
    vb.box({ w: hw * 0.7, y0: h - 0.1, y1: h + 0.35, z0: -hl * 0.8, z1: -hl * 0.2, c: trim, skip: 'b' });               // seats
  }
  return vb.build();
}

/** A Dhaka river launch: dark hull with a red band, two white decks, a green roof and a funnel. */
export function buildLaunchGeometry(L) {
  const vb = new VBuilder();
  const C = L.colors;
  const hl = L.carLength / 2, hw = L.carWidth / 2;
  vb.box({ w: hw * 0.8, tw: hw, y0: -1.2, y1: 2.2, z0: -hl, z1: hl * 0.7, c: { side: C.hull, top: C.deck, back: C.hull }, skip: 'b' });
  vb.box({ w: hw * 0.8, wf: 0.1, tw: hw, twf: 0.2, y0: -1.2, y1: 2.2, z0: hl * 0.7, z1: hl, c: { side: C.hull, top: C.deck }, skip: 'bk' });
  vb.box({ w: hw + 0.03, y0: 1.6, y1: 2.0, z0: -hl, z1: hl * 0.7, c: C.band, skip: 'b' });
  for (const [y0, y1, s] of [[2.2, 4.8, 0.96], [4.8, 7.2, 0.8]]) {
    const w = hw * s;
    vb.box({ w, y0, y1, z0: -hl * 0.92, z1: hl * 0.55, c: { side: C.upper, top: C.deck }, skip: 'b' });
    vb.box({ w: w + 0.02, y0: y0 + 0.9, y1: y1 - 0.5, z0: -hl * 0.9, z1: hl * 0.53, c: C.window, skip: 'bt' });
  }
  vb.box({ w: hw * 0.85, y0: 7.2, y1: 7.5, z0: -hl * 0.95, z1: hl * 0.58, c: C.roof, skip: 'b' });
  vb.box({ w: hw * 0.4, y0: 7.5, y1: 9.3, z0: hl * 0.25, z1: hl * 0.5, c: { side: C.upper, top: C.roof }, skip: 'b' }); // wheelhouse
  vb.box({ w: 0.9, y0: 7.5, y1: 11, z0: -hl * 0.2, z1: -hl * 0.2 + 1.8, c: C.funnel, skip: 'b' });
  return vb.build();
}

/** Load boats.glb once: child meshes by name → { geometry, material }. Null if it fails. */
export function loadBoatKit(game) {
  if (!kitPromise) {
    kitPromise = game.assets.load('model.boats').then((root) => {
      const kit = new Map();
      root.updateMatrixWorld(true);
      const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05 });
      root.traverse((o) => { if (o.isMesh) kit.set(o.name, { geometry: o.geometry.clone().applyMatrix4(o.matrixWorld), material }); });
      return kit;
    }).catch(() => null);
  }
  return kitPromise;
}

/** One kit boat as a mesh, turned so its bow points +z and sunk by `draft` metres. */
export function kitMesh(kit, name, rotY = 0, draft = 0.3, scaleY = 1) {
  const k = kit?.get(name);
  if (!k) return null;
  const m = new THREE.Mesh(k.geometry, k.material);
  m.rotation.y = (rotY * Math.PI) / 180;
  m.position.y = -draft;
  m.scale.y = scaleY;
  m.castShadow = true;
  return m;
}
