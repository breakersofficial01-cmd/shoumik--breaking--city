// The small set of shared low-poly shapes every pedestrian is assembled from. Each shape is
// ONE geometry drawn with ONE InstancedMesh for the whole crowd (see crowd.js), scaled and
// coloured per person. Shapes are white (the instance colour tints them) with a little
// built-in shading; dark details (eyes, shoe soles) stay dark under any tint.
//
// Sizes are "unit" sizes: looks.js scales them to real body measurements.

import { GeoBuilder } from '../../world/geoBuilder.js';
import { loft, ellipsoid, cube } from './shapes.js';

const W = [1, 1, 1];
const g = (v) => [v, v, v];

/** Limb: hangs from y=0 down to y=-1, radius 1 at the top, a bit thinner at the bottom. */
function tube() {
  const gb = new GeoBuilder();
  loft(gb, [
    { c: [0, 0, 0], rx: 1, rz: 1, col: W },
    { c: [0, -1, 0], rx: 0.8, rz: 0.8, col: g(0.82) },
  ], 6, { capStart: true, capEnd: true });
  return gb.build();
}

/** Torso: y=0 (waist) up to y=1 (neck), half-width 1, half-depth 1. */
function torso() {
  const gb = new GeoBuilder();
  loft(gb, [
    { c: [0, 0, 0], rx: 0.9, rz: 0.92, col: g(0.8) },
    { c: [0, 0.3, 0.04], rx: 0.94, rz: 1, col: g(0.92) },
    { c: [0, 0.68, 0.02], rx: 1, rz: 0.92, col: W },
    { c: [0, 0.86, 0], rx: 1.02, rz: 0.78, col: W },
    { c: [0, 0.95, 0], rx: 0.8, rz: 0.6, col: W },
    { c: [0, 1, 0], rx: 0.32, rz: 0.36, col: g(0.9) },
  ], 8, { capStart: true, capEnd: true });
  return gb.build();
}

/** Skirt / lungi / saree / long kurta: y=0 (waist) down to y=-1 (hem), open cone. */
function skirt() {
  const gb = new GeoBuilder();
  loft(gb, [
    { c: [0, 0, 0], rx: 0.78, rz: 0.78, col: W },
    { c: [0, -0.5, 0], rx: 0.92, rz: 0.92, col: g(0.93) },
    { c: [0, -1, 0], rx: 1, rz: 1, col: g(0.78) },
  ], 8, { capEnd: true });
  return gb.build();
}

/** Head: unit ball with two dark eyes on the front (+z). */
function head() {
  const gb = new GeoBuilder();
  ellipsoid(gb, [0, 0, 0], [1, 1, 1], 8, 6, (dx, dy, dz) => (dz < -0.2 ? g(0.85) : W));
  for (const s of [1, -1]) cube(gb, s * 0.36, 0.1, 0.93, 0.13, 0.07, 0.03, g(0.08));
  cube(gb, 0, -0.42, 0.9, 0.2, 0.035, 0.03, g(0.35)); // mouth line
  return gb.build();
}

const top = (dx, dy) => (dy > 0.6 ? g(1.25) : W);

function hairShort() {
  const gb = new GeoBuilder();
  ellipsoid(gb, [0, 0.08, -0.04], [1.08, 1.04, 1.1], 8, 6, top, (dx, dy, dz) => dy > 0.38 || (dz < -0.25 && dy > -0.45));
  return gb.build();
}

function hairLong() {
  const gb = new GeoBuilder();
  ellipsoid(gb, [0, 0.08, -0.04], [1.1, 1.06, 1.12], 8, 6, top, (dx, dy, dz) => dy > 0.38 || (dz < 0.1 && dy > -0.7));
  // Falls down the back to below the shoulders.
  loft(gb, [
    { c: [0, -0.3, -0.5], rx: 0.95, rz: 0.55, col: W },
    { c: [0, -1.5, -0.62], rx: 0.9, rz: 0.4, col: g(0.85) },
    { c: [0, -2.5, -0.6], rx: 0.6, rz: 0.25, col: g(0.75) },
  ], 6, { capEnd: true });
  return gb.build();
}

function hairBun() {
  const gb = new GeoBuilder();
  ellipsoid(gb, [0, 0.08, -0.04], [1.08, 1.04, 1.1], 8, 6, top, (dx, dy, dz) => dy > 0.38 || (dz < -0.2 && dy > -0.55));
  ellipsoid(gb, [0, -0.1, -1.05], [0.48, 0.48, 0.42], 6, 4, () => g(0.9));
  return gb.build();
}

/** Headscarf: covers the hair and neck, open at the face, draped over the shoulders. */
function hijab() {
  const gb = new GeoBuilder();
  ellipsoid(gb, [0, 0.04, -0.03], [1.14, 1.12, 1.14], 8, 6, top, (dx, dy, dz) => !(dz > 0.45 && dy < 0.5 && dy > -0.75));
  loft(gb, [
    { c: [0, -0.7, 0], rx: 0.95, rz: 0.95, col: W },
    { c: [0, -1.35, 0.05], rx: 1.7, rz: 1.25, col: g(0.9) },
    { c: [0, -2.3, 0.1], rx: 1.95, rz: 1.35, col: g(0.8) },
  ], 8, { capEnd: true });
  return gb.build();
}

function cap() {
  const gb = new GeoBuilder();
  ellipsoid(gb, [0, 0.12, -0.02], [1.1, 1.02, 1.12], 8, 6, top, (dx, dy) => dy > 0.25);
  cube(gb, 0, 0.42, 1.3, 0.8, 0.05, 0.5, g(0.8)); // visor
  return gb.build();
}

function bucket() {
  const gb = new GeoBuilder();
  ellipsoid(gb, [0, 0.15, -0.02], [1.08, 0.98, 1.1], 8, 6, top, (dx, dy) => dy > 0.2);
  loft(gb, [
    { c: [0, 0.42, -0.02], rx: 1.08, rz: 1.1, col: W },
    { c: [0, 0.12, -0.02], rx: 1.65, rz: 1.68, col: g(0.82) },
  ], 8);
  return gb.build();
}

function box() {
  const gb = new GeoBuilder();
  cube(gb, 0, 0, 0, 0.5, 0.5, 0.5, W);
  return gb.build();
}

const MAKERS = { tube, torso, skirt, head, hairShort, hairLong, hairBun, hijab, cap, bucket, box };

/** Most instances of each shape one person can use (sets the InstancedMesh sizes). */
export const PER_PERSON = { tube: 10, torso: 2, skirt: 1, head: 1, hairShort: 1, hairLong: 1, hairBun: 1, hijab: 1, cap: 1, bucket: 1, box: 10 };

export const PART_KINDS = Object.keys(MAKERS);

export function makePartGeometry(kind) {
  return MAKERS[kind]();
}
