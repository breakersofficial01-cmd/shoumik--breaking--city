// Real 3D vehicle bodies (GLB through the asset registry), used instead of the code-built
// bodies on the quality levels in data/vehicles.json → realModels.useOn.
//
// A type opts in with  types.<id>.model = {
//   assets: ["model.vehicle.normalCar1", ...]   one is picked per paint colour (variety)
//   up: "z"            the file is Z-up (default "y")
//   noseAt: "-z"       force the nose direction (default: found from the 'Headlights' material)
//   paint: ["White"]   materials painted with the vehicle's paint colour
//   second: ["Bottom"] materials painted with its second colour (falls back to paint)
//   colors: { "Windows": "glass", "Red": "#d0202a" }   palette key or hex, per material
// }
// The body is merged into ONE geometry with vertex colours (same draw cost and material as the
// code-built bodies). The model's own wheels are dropped: their positions become the wheel
// layout, and the fleet draws its usual spinning wheels there. The body is scaled uniformly so
// its length and width match types.<id>.size (physics keeps using the type's numbers).

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const WHEEL = /wheel/i;

/** Load every model the active quality level needs. @returns {Promise<Map<string, THREE.Object3D[]>>} */
export async function loadVehicleModels(game, cfg) {
  const out = new Map();
  const R = cfg.realModels;
  if (!R?.useOn?.includes(game.qualityName)) return out;
  const jobs = [];
  for (const [typeId, T] of Object.entries(cfg.types)) {
    const ids = (T.model?.assets || []).filter((id) => game.assets.url(id));
    if (!ids.length) continue;
    jobs.push(game.assets.loadMany(ids).then((models) => out.set(typeId, models), () => null));
  }
  await Promise.all(jobs);
  return out;
}

/** Colour for one material of the model. */
function materialColor(m, M, palette, paint, second, out) {
  const n = m.name || '';
  if (M.paint?.includes(n)) return out.set(paint);
  if (M.second?.includes(n)) return out.set(second || paint);
  const c = M.colors?.[n];
  if (c) return out.set(palette[c] || c);
  return m.color ? out.copy(m.color) : out.set('#888888');
}

/**
 * Same rotate / scale / move steps for body, wheels and headlight points:
 * up axis fix, length along z, nose towards +z (from the headlights, or M.noseAt), then fit the
 * type's size: width and length exactly, height by the average of the two (keeps the shape).
 */
function orient(geos, M, T, head) {
  const list = [...geos, head].filter(Boolean);
  const apply = (fn) => list.forEach(fn);
  const bounds = () => {
    const box = new THREE.Box3();
    geos.forEach((g) => { if (g) { g.computeBoundingBox(); box.union(g.boundingBox); } });
    return box;
  };
  if (M.up === 'z') apply((g) => g.rotateX(-Math.PI / 2));
  let size = bounds().getSize(new THREE.Vector3());
  if (size.x > size.z) apply((g) => g.rotateY(Math.PI / 2));
  if (M.noseAt === '-z') apply((g) => g.rotateY(Math.PI));
  else if (!M.noseAt && head) {
    head.computeBoundingBox();
    const c = bounds().getCenter(new THREE.Vector3());
    if (head.boundingBox.getCenter(new THREE.Vector3()).z < c.z) apply((g) => g.rotateY(Math.PI));
  }
  const box = bounds();
  size = box.getSize(new THREE.Vector3());
  const c = box.getCenter(new THREE.Vector3());
  const kx = T.size[1] / size.x, kz = T.size[0] / size.z, ky = (kx + kz) / 2;
  apply((g) => { g.translate(-c.x, -box.min.y, -c.z); g.scale(kx, ky, kz); });
}

/** Wheels from the model's wheel geometry: split by side (x sign), one wheel per cluster. */
function wheelsFrom(geo, T) {
  if (!geo) return null;
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  // Group by axle too: front (z > 0) and back.
  const boxes = new Map();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const key = `${v.x >= 0 ? 'r' : 'l'}${v.z >= 0 ? 'f' : 'b'}`;
    if (!boxes.has(key)) boxes.set(key, new THREE.Box3());
    boxes.get(key).expandByPoint(v);
  }
  const wheels = [];
  for (const [key, b] of boxes) {
    const c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3());
    const r = Math.max(s.y, s.z) / 2;
    if (r < 0.05) continue;
    wheels.push({ x: c.x, y: r, z: c.z, r, w: Math.max(0.08, s.x), front: key.endsWith('f') });
  }
  // Fall back to the type's layout if the model's wheels could not be read.
  return wheels.length >= 2 ? wheels : null;
}

/**
 * Body geometry + wheel layout for one vehicle from a loaded model template.
 * @returns {{geometry:THREE.BufferGeometry, wheels:Array|null, triangles:number}}
 */
export function buildRealVehicle(template, T, palette, paint, second) {
  const M = T.model;
  const body = [], wheel = [], head = [];
  const col = new THREE.Color();
  template.updateMatrixWorld(true);
  template.traverse((o) => {
    if (!o.isMesh) return;
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    const clean = new THREE.BufferGeometry();
    clean.setAttribute('position', g.attributes.position);
    if (WHEEL.test(o.name)) { wheel.push(clean); return; }
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const groups = g.groups.length ? g.groups : [{ start: 0, count: g.attributes.position.count, materialIndex: 0 }];
    const colors = new Float32Array(g.attributes.position.count * 3);
    for (const gr of groups) {
      const m = mats[gr.materialIndex] || mats[0];
      materialColor(m, M, palette, paint, second, col);
      for (let i = gr.start; i < gr.start + gr.count; i++) col.toArray(colors, i * 3);
      if (/headlight/i.test(m.name || '')) {
        const pts = new THREE.BufferGeometry();
        pts.setAttribute('position', new THREE.BufferAttribute(g.attributes.position.array.slice(gr.start * 3, (gr.start + gr.count) * 3), 3));
        head.push(pts);
      }
    }
    clean.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    body.push(clean);
  });
  const geometry = mergeGeometries(body, false);
  const wheelGeo = wheel.length ? mergeGeometries(wheel, false) : null;
  const headGeo = head.length ? mergeGeometries(head, false) : null;
  orient([geometry, wheelGeo], M, T, headGeo);
  headGeo?.dispose();
  geometry.computeVertexNormals();
  const wheels = wheelsFrom(wheelGeo, T);
  wheelGeo?.dispose();
  return { geometry, wheels, triangles: geometry.attributes.position.count / 3 };
}
