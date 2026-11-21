// Code-built street props (Roadmap 2, Session 1): things no free pack has in a Dhaka look,
// plus simple stand-ins for the Kenney models in case assets/street/street-props.glb fails.
// Every shape is ONE BufferGeometry with linear vertex colours (shared prop material,
// InstancedMesh). Local space: +z = the front (faces the road), y = up, origin = foot point.
// Colours come from data/street.json.

import * as THREE from 'three';
import { GeoBuilder, hexToLinear, shade, WHITE } from '../geoBuilder.js';

/** A square bar between two points (bamboo, frames, arms). */
export function bar(gb, a, b, t, c) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz) || 1;
  let sx = dz / len, sz = -dx / len;
  if (Math.hypot(sx, sz) < 0.05) { sx = 1; sz = 0; }
  const sl = Math.hypot(sx, sz); sx /= sl; sz /= sl;
  const ux = (-sz * dy) / len, uy = (sz * dx - sx * dz) / len, uz = (sx * dy) / len;
  const h = t / 2;
  const P = (p, i, j) => [p[0] + (sx * i + ux * j) * h, p[1] + uy * j * h, p[2] + (sz * i + uz * j) * h];
  const ring = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (let k = 0; k < 4; k++) {
    const [i0, j0] = ring[k], [i1, j1] = ring[(k + 1) % 4];
    const p0 = P(a, i0, j0), p1 = P(a, i1, j1), p2 = P(b, i1, j1), p3 = P(b, i0, j0);
    // Face normal = the middle of the two corner directions.
    const mi = (i0 + i1) / 2, mj = (j0 + j1) / 2;
    const nx = sx * mi + ux * mj, ny = uy * mj, nz = sz * mi + uz * mj;
    const nl = Math.hypot(nx, ny, nz) || 1;
    const col = k === 2 ? shade(c, 1.08) : k === 0 ? shade(c, 0.75) : c;
    const v = [p0, p1, p2, p3].map((p) => gb.vertex(p[0], p[1], p[2], nx / nl, ny / nl, nz / nl, col, 0, 0));
    gb.idx.push(v[0], v[2], v[1], v[0], v[3], v[2]);
  }
}

/** Park / sidewalk bench: 1.7 m long, seat facing +z. */
export function makeBench(cfg) {
  const gb = new GeoBuilder();
  const wood = hexToLinear(cfg.color), leg = hexToLinear(cfg.legColor);
  for (const x of [-0.7, 0.7]) {
    gb.box(x - 0.05, 0, -0.22, x + 0.05, 0.44, 0.22, shade(leg, 0.7), leg, 0, 'nswe');
    gb.box(x - 0.05, 0.44, -0.27, x + 0.05, 0.86, -0.19, shade(leg, 0.8), leg, 0, 'nswe');
  }
  gb.box(-0.85, 0.44, -0.24, 0.85, 0.5, 0.24, shade(wood, 0.7), wood, 0, 'nswetb');
  gb.box(-0.85, 0.6, -0.27, 0.85, 0.84, -0.21, shade(wood, 0.8), wood, 0, 'nswet');
  return gb.build();
}

/** Round dustbin (white: tinted per instance). */
export function makeBin() {
  const gb = new GeoBuilder();
  gb.prism(0, 0, 0, 0.82, 0.22, 0.25, 8, shade(WHITE, 0.7), WHITE);
  gb.prism(0, 0, 0.82, 0.9, 0.27, 0.24, 8, shade(WHITE, 0.45), shade(WHITE, 0.5), true);
  return gb.build();
}

/** Pole-mounted transformer: a 2nd pole `gap` along +x, platform, grey tank with fins. */
export function makeTransformer(cfg, poleHeight) {
  const gb = new GeoBuilder();
  const grey = hexToLinear(cfg.color), frame = hexToLinear(cfg.frame), pole = hexToLinear('#8f8a80');
  const g = cfg.gap, y = cfg.platformY;
  gb.prism(g, 0, 0, poleHeight * 0.9, 0.13, 0.09, 4, shade(pole, 0.7), pole);
  gb.box(-0.35, y, -0.55, g + 0.35, y + 0.12, 0.55, shade(frame, 0.7), frame, 0, 'nswetb');
  bar(gb, [-0.1, y - 0.9, 0], [0.9, y, 0], 0.08, frame);
  bar(gb, [g + 0.1, y - 0.9, 0], [g - 0.9, y, 0], 0.08, frame);
  const x0 = 0.3, x1 = g - 0.3;
  gb.box(x0, y + 0.12, -0.38, x1, y + 1.25, 0.38, shade(grey, 0.75), grey, 0, 'nswet');
  for (let k = 0; k < 5; k++) { // cooling fins front and back
    const x = x0 + 0.12 + (k * (x1 - x0 - 0.24)) / 4;
    for (const z of [-1, 1]) gb.box(x - 0.03, y + 0.2, z < 0 ? -0.52 : 0.38, x + 0.03, y + 1.1, z < 0 ? -0.38 : 0.52, shade(grey, 0.6), shade(grey, 0.9), 0, 'nswet');
  }
  const white = hexToLinear('#d9d4c8');
  for (let k = 0; k < 3; k++) gb.prism(x0 + 0.2 + k * ((x1 - x0 - 0.4) / 2), 0, y + 1.25, y + 1.6, 0.06, 0.04, 5, white, white, true);
  bar(gb, [0, y + 2.3, 0], [g, y + 2.3, 0], 0.1, frame);
  return gb.build();
}

/**
 * One bamboo scaffold cell: `w` wide (x, stretched per wall), `h` tall, from the wall (z=0) out.
 * Kept to ~50 triangles (a site has a few hundred cells): one vertical (the next cell gives the
 * other), two rails, a diagonal, two ties back to the wall and a plank.
 */
export function makeScaffoldCell(cfg) {
  const gb = new GeoBuilder();
  const [w, h] = cfg.bay;
  const bam = hexToLinear(cfg.bamboo), plank = hexToLinear(cfg.plank);
  const zi = 0.05, zo = 0.85, x0 = -w / 2, x1 = w / 2, t = 0.07;
  bar(gb, [x0, 0, zo], [x0, h, zo], t, bam);
  bar(gb, [x0 - 0.1, h - 0.05, zo], [x1 + 0.1, h - 0.05, zo], t * 0.85, bam);
  bar(gb, [x0, h * 0.5, zo], [x1, h * 0.5, zo], t * 0.7, shade(bam, 0.92));
  bar(gb, [x0, 0.1, zo], [x1, h - 0.1, zo], t * 0.8, shade(bam, 0.9)); // diagonal brace
  bar(gb, [x0, h - 0.12, zi], [x0, h - 0.12, zo + 0.05], t * 0.8, bam);  // tie to the wall
  gb.box(x0, h - 0.04, zi, x1, h, zo, shade(plank, 0.7), plank, 0, 'tb'); // walking plank
  return gb.build();
}

/** Construction net: a 1 × 1 sheet (scaled per wall); its material is see-through, double-sided. */
export function makeNet(cfg) {
  const gb = new GeoBuilder();
  const c = hexToLinear(cfg.netColor);
  gb.wall(-0.5, 0, 0.5, 0, 0, 1, shade(c, 0.85), c, 0);
  return gb.build();
}

/** Flat square (1 × 1, facing up) for the light pools under the lamps. */
export function makePoolQuad() {
  const g = new THREE.PlaneGeometry(1, 1);
  g.rotateX(-Math.PI / 2);
  return g;
}

/**
 * Stand-ins for the Kenney models (only used when the GLB cannot load). Returns a Group of
 * meshes named like in the GLB: lamp, lamp.glow, lampDouble, lampDouble.glow, cone, barrier,
 * fence, dumpster.
 */
export function makeFallbackKit() {
  const group = new THREE.Group();
  const add = (name, gb) => {
    const m = new THREE.Mesh(gb.build(), new THREE.MeshLambertMaterial({ vertexColors: true }));
    m.name = name; group.add(m);
  };
  const steel = hexToLinear('#6f7782'), glow = hexToLinear('#ffffff');
  const lamp = (arms) => {
    const gb = new GeoBuilder(), g = new GeoBuilder();
    gb.prism(0, 0, 0, 7.4, 0.14, 0.08, 6, shade(steel, 0.7), steel);
    for (const s of arms) {
      bar(gb, [0, 7.2, 0], [0, 7.45, 1.9 * s], 0.12, steel);
      gb.box(-0.2, 7.3, 1.75 * s - 0.35, 0.2, 7.5, 1.75 * s + 0.35, steel, steel, 0, 'nswet');
      g.box(-0.18, 7.28, 1.75 * s - 0.32, 0.18, 7.3, 1.75 * s + 0.32, glow, glow, 0, 'b');
    }
    return [gb, g];
  };
  const [l1, g1] = lamp([1]); add('lamp', l1); add('lamp.glow', g1);
  const [l2, g2] = lamp([1, -1]); add('lampDouble', l2); add('lampDouble.glow', g2);
  const orange = hexToLinear('#e8641c'), white = hexToLinear('#f2f2f2');
  let gb = new GeoBuilder(); gb.prism(0, 0, 0, 0.75, 0.28, 0.03, 8, orange, white, true); add('cone', gb);
  gb = new GeoBuilder(); gb.box(-0.9, 0, -0.3, 0.9, 1.05, 0.3, shade(white, 0.7), white, 0, 'nswet'); add('barrier', gb);
  gb = new GeoBuilder(); bar(gb, [-1.6, 1.0, 0], [1.6, 1.0, 0], 0.1, white); for (const x of [-1.6, 1.6]) bar(gb, [x, 0, 0], [x, 1.1, 0], 0.08, white); add('fence', gb);
  const green = hexToLinear('#2f7d4b');
  gb = new GeoBuilder(); gb.box(-1, 0, -1.35, 1, 1.5, 1.35, shade(green, 0.7), green, 0, 'nswet'); add('dumpster', gb);
  return group;
}
