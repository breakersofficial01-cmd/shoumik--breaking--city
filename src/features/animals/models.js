// Code-built low-poly animals (Roadmap 2 S5): stray dog, cat, Deshi cow (with the hump),
// Black Bengal goat (floppy ears, small horns), house crow (grey neck) and duck.
//
// Every kind is split into parts that move separately, each ONE InstancedMesh for all animals
// of that kind (index.js): body (+ tail), head (pivot at the neck), legs (one leg shape, 2 or 4
// instances per animal, pivot at the hip) and wings for birds (pivot at the shoulder).
// Model space: metres, facing +z, its left = +x, feet on y = 0. Vertex colours hold the pattern
// (eyes, beak, horns, the crow's grey neck); the instance colour tints the whole animal
// (data/animals.json → kinds.<kind>.colours), so white-ish parts take the coat colour.

import { GeoBuilder } from '../../world/geoBuilder.js';
import { ellipsoid, loft, cube, rod } from '../../entities/people/shapes.js';

const W = [1, 1, 1];
const g = (v) => [v, v, v];
const EYE = g(0.04);
const all = (c) => () => c;

/** A leg hanging from its hip (y = 0) to the ground (y = -len), w = half thickness. */
function leg(len, w, hoof = null) {
  const gb = new GeoBuilder();
  loft(gb, [
    { c: [0, 0, 0], rx: w * 1.25, rz: w * 1.35, col: W },
    { c: [0, -len * 0.55, 0], rx: w, rz: w, col: g(0.94) },
    { c: [0, -len, 0.01], rx: w * 0.8, rz: w * 0.85, col: hoof || g(0.85) },
  ], 6, { capStart: true, capEnd: true });
  return gb.build();
}

/** A wing from the shoulder (origin) out along +x (left wing; the right one is mirrored). */
function wing(span, chord, col) {
  const gb = new GeoBuilder();
  cube(gb, span / 2, 0, -chord * 0.15, span / 2, 0.012, chord / 2, col);
  cube(gb, span * 0.85, 0, -chord * 0.35, span * 0.2, 0.01, chord * 0.32, col.map((v) => v * 0.8));
  return gb.build();
}

function dog() {
  const body = new GeoBuilder(), head = new GeoBuilder();
  ellipsoid(body, [0, 0.42, 0], [0.13, 0.13, 0.3], 8, 6, all(W));
  ellipsoid(body, [0, 0.45, 0.17], [0.135, 0.14, 0.14], 8, 6, all(W));           // chest
  rod(body, [0, 0.46, -0.27], [0, 0.6, -0.42], 0.025, g(0.9));                    // tail up
  ellipsoid(head, [0, 0.07, 0.06], [0.085, 0.085, 0.1], 8, 6, all(W));
  cube(head, 0, 0.04, 0.17, 0.045, 0.04, 0.06, g(0.92));                            // snout
  cube(head, 0, 0.065, 0.235, 0.02, 0.018, 0.008, EYE);                             // nose
  for (const s of [1, -1]) {
    cube(head, s * 0.04, 0.1, 0.135, 0.012, 0.012, 0.006, EYE);                    // eyes
    cube(head, s * 0.055, 0.155, 0.03, 0.02, 0.05, 0.012, g(0.85));                 // ears up
  }
  return {
    body: body.build(), head: head.build(), headPivot: [0, 0.5, 0.3],
    leg: leg(0.36, 0.032), hips: [[0.075, 0.38, 0.19], [-0.075, 0.38, 0.19], [0.075, 0.38, -0.2], [-0.075, 0.38, -0.2]],
    legLen: 0.36, lieDrop: 0.27, swing: 0.6,
  };
}

function cat() {
  const body = new GeoBuilder(), head = new GeoBuilder();
  ellipsoid(body, [0, 0.2, 0], [0.072, 0.075, 0.17], 8, 6, all(W));
  rod(body, [0, 0.22, -0.16], [0, 0.42, -0.24], 0.014, g(0.92));                   // tail up
  ellipsoid(head, [0, 0.05, 0.03], [0.062, 0.058, 0.058], 8, 6, all(W));
  for (const s of [1, -1]) {
    cube(head, s * 0.024, 0.06, 0.084, 0.011, 0.009, 0.004, [0.55, 0.62, 0.18]);  // green-yellow eyes
    cube(head, s * 0.035, 0.105, 0.02, 0.016, 0.026, 0.008, g(0.9));                // ears
  }
  cube(head, 0, 0.035, 0.087, 0.008, 0.006, 0.004, [0.85, 0.5, 0.5]);              // nose
  return {
    body: body.build(), head: head.build(), headPivot: [0, 0.24, 0.17],
    leg: leg(0.17, 0.017), hips: [[0.04, 0.17, 0.11], [-0.04, 0.17, 0.11], [0.04, 0.17, -0.11], [-0.04, 0.17, -0.11]],
    legLen: 0.17, lieDrop: 0.13, swing: 0.55,
  };
}

function cow() {
  const body = new GeoBuilder(), head = new GeoBuilder();
  ellipsoid(body, [0, 0.98, 0], [0.3, 0.33, 0.72], 10, 7, all(W));
  ellipsoid(body, [0, 1.27, 0.42], [0.15, 0.13, 0.18], 8, 5, all(W));             // the hump of a Deshi cow
  ellipsoid(body, [0, 0.78, 0.5], [0.12, 0.2, 0.12], 6, 5, all(g(0.93)));           // dewlap
  rod(body, [0, 1.15, -0.68], [0, 0.55, -0.8], 0.03, g(0.9));                       // tail hanging
  ellipsoid(body, [0, 0.5, -0.8], [0.04, 0.08, 0.04], 5, 4, all(g(0.2)));          // tail tip
  ellipsoid(head, [0, -0.06, 0.16], [0.13, 0.15, 0.22], 8, 6, all(W));
  cube(head, 0, -0.14, 0.36, 0.1, 0.07, 0.04, [1.0, 0.78, 0.72]);                  // muzzle
  for (const s of [1, -1]) {
    cube(head, s * 0.11, 0.0, 0.25, 0.012, 0.016, 0.012, EYE);
    rod(head, [s * 0.08, 0.06, 0.06], [s * 0.2, 0.17, 0.02], 0.022, [1.15, 1.1, 0.95]); // horns
    cube(head, s * 0.16, -0.01, 0.06, 0.07, 0.025, 0.04, g(0.9));                   // ears
  }
  return {
    body: body.build(), head: head.build(), headPivot: [0, 1.12, 0.72],
    leg: leg(0.74, 0.06, g(0.25)), hips: [[0.18, 0.78, 0.45], [-0.18, 0.78, 0.45], [0.18, 0.78, -0.45], [-0.18, 0.78, -0.45]],
    legLen: 0.74, lieDrop: 0.55, swing: 0.4, graze: 0.95,
  };
}

function goat() {
  const body = new GeoBuilder(), head = new GeoBuilder();
  ellipsoid(body, [0, 0.5, 0], [0.12, 0.15, 0.3], 8, 6, all(W));
  rod(body, [0, 0.58, -0.28], [0, 0.68, -0.33], 0.02, g(0.9));                      // short tail up
  ellipsoid(head, [0, 0.02, 0.1], [0.065, 0.075, 0.13], 8, 6, all(W));
  cube(head, 0, -0.08, 0.16, 0.02, 0.04, 0.015, g(0.8));                            // beard
  for (const s of [1, -1]) {
    cube(head, s * 0.055, 0.04, 0.16, 0.01, 0.01, 0.008, [0.6, 0.45, 0.1]);         // amber eyes
    cube(head, s * 0.085, 0.0, 0.05, 0.015, 0.06, 0.035, g(0.88));                  // floppy ears
    rod(head, [s * 0.03, 0.08, 0.06], [s * 0.05, 0.15, -0.02], 0.012, [0.9, 0.85, 0.75]); // horns
  }
  return {
    body: body.build(), head: head.build(), headPivot: [0, 0.66, 0.27],
    leg: leg(0.4, 0.026, g(0.3)), hips: [[0.07, 0.42, 0.2], [-0.07, 0.42, 0.2], [0.07, 0.42, -0.2], [-0.07, 0.42, -0.2]],
    legLen: 0.4, lieDrop: 0.3, swing: 0.5, graze: 0.9,
  };
}

function crow() {
  const body = new GeoBuilder(), head = new GeoBuilder();
  const black = g(0.07), grey = g(0.38);
  ellipsoid(body, [0, 0.12, 0], [0.065, 0.068, 0.14], 8, 6, all(black));
  ellipsoid(body, [0, 0.17, 0.09], [0.06, 0.062, 0.06], 8, 5, all(grey));         // grey neck of the house crow
  cube(body, 0, 0.11, -0.17, 0.035, 0.01, 0.06, black);                             // tail
  ellipsoid(head, [0, 0.03, 0.02], [0.045, 0.045, 0.05], 8, 5, all(black));
  cube(head, 0, 0.02, 0.085, 0.012, 0.012, 0.035, g(0.05));                         // beak
  for (const s of [1, -1]) cube(head, s * 0.03, 0.04, 0.045, 0.006, 0.006, 0.004, g(0.5));
  return {
    body: body.build(), head: head.build(), headPivot: [0, 0.19, 0.12],
    leg: leg(0.065, 0.006, g(0.05)), hips: [[0.02, 0.065, 0.01], [-0.02, 0.065, 0.01]],
    legLen: 0.065, lieDrop: 0, swing: 0.3, bird: true,
    wing: wing(0.24, 0.13, black), shoulders: [[0.05, 0.15, 0.04], [-0.05, 0.15, 0.04]],
  };
}

function duck() {
  const body = new GeoBuilder(), head = new GeoBuilder();
  ellipsoid(body, [0, 0.11, 0], [0.11, 0.085, 0.19], 8, 6, all(W));
  cube(body, 0, 0.17, -0.18, 0.04, 0.03, 0.04, g(0.95));                           // tail tuft up
  rod(body, [0, 0.15, 0.13], [0, 0.26, 0.16], 0.035, W);                           // neck
  ellipsoid(head, [0, 0.03, 0.02], [0.05, 0.05, 0.06], 8, 5, all(W));
  cube(head, 0, 0.015, 0.1, 0.025, 0.01, 0.04, [1.25, 0.62, 0.1]);                 // orange bill
  for (const s of [1, -1]) cube(head, s * 0.035, 0.045, 0.05, 0.006, 0.006, 0.004, EYE);
  return {
    body: body.build(), head: head.build(), headPivot: [0, 0.27, 0.16],
    leg: leg(0.06, 0.008, [1.2, 0.6, 0.1]), hips: [[0.04, 0.06, 0], [-0.04, 0.06, 0]],
    legLen: 0.06, lieDrop: 0, swing: 0.3, bird: true, swims: true,
    wing: wing(0.26, 0.15, W), shoulders: [[0.08, 0.15, 0.03], [-0.08, 0.15, 0.03]],
  };
}

export const MODELS = { dog, cat, cow, goat, crow, duck };
