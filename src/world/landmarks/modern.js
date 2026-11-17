// The two home buildings of the game — Breaking School and Breaking Biology Institution —
// plus Gulshan's glass towers, Karwan Bazar market, lake boats and bridge lights.
// Local space: +z = front, the plot is 76 m square (−38…38).

import { FACADE } from '../../assets/proceduralTextures.js';

const PI = Math.PI;

/**
 * Breaking School / Breaking Biology Institution: a big glowing campus building. Neon
 * outlines, the name in English and Bangla on every side, a lit entrance with the marker.
 * Colours and the sign id come from data/landmarks.json → types.
 */
export function breakingCampus(k, { C, sign, site }) {
  const uv = sign(site.id);
  const floors = C.floors, h = floors * 3.5;
  const x0 = -27, x1 = 27, z0 = -28, z1 = 4;
  k.ground(-36, 4, 36, 36, C.forecourt);
  // Forecourt: glowing guide lines leading to the door.
  for (const x of [-9, 9]) k.ground(x - 0.18, 9, x + 0.18, 36, C.neonA, 0.06, { glow: true });
  for (let z = 12; z <= 33; z += 7) k.ground(-9, z - 0.12, 9, z + 0.12, C.neonB, 0.06, { glow: true });
  // Main block: dark glass with glowing floor lines.
  k.box(x0, 0, z0, x1, h, z1, C.glass, { tile: FACADE.GLASS, floors, top: C.roof });
  for (let f = 1; f < floors; f += 2) k.box(x0 - 0.06, f * 3.5 - 0.12, z0 - 0.06, x1 + 0.06, f * 3.5 + 0.12, z1 + 0.06, f % 4 === 1 ? C.neonA : C.neonB, { glow: true, faces: 'nsew' });
  // Neon outline: the four corners and the roof edge.
  for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) k.box(x - 0.3, 0, z - 0.3, x + 0.3, h + 0.6, z + 0.3, C.neonA, { glow: true });
  k.box(x0 - 0.3, h, z0 - 0.3, x1 + 0.3, h + 0.6, z1 + 0.3, C.neonA, { glow: true, faces: 'nsew' });
  // Podium and entrance: canopy, glass doors, lit steps.
  k.box(-14, 0, z1, 14, 7, z1 + 5, C.podium, { flat: true, top: C.roof });
  k.box(-15, 7, z1, 15, 7.5, z1 + 8, C.neonB, { glow: true, faces: 'nsewb' });
  k.box(-15, 7.5, z1, 15, 7.7, z1 + 8, C.roof, { flat: true, faces: 't' });
  k.box(-5, 0.3, z1 + 5, 5, 5.6, z1 + 5.1, C.door, { glow: true, faces: 's' });
  for (const x of [-5, 0, 5]) k.box(x - 0.1, 0.3, z1 + 5.1, x + 0.1, 5.6, z1 + 5.16, C.podium, { flat: true, faces: 'sew' });
  for (const s of [-1, 1]) k.prism(s * 13.5, z1 + 7.2, 0, 7, 0.35, 0.35, 6, C.podium);
  k.steps(-8, 8, z1 + 7.4, z1 + 5.1, 0.3, 2, C.step);
  // The name: big sign across the top of the front, and on the other three sides.
  if (uv) {
    const w = 46, sh = w * uv.aspect, y = h - sh - 1.2;
    k.box(-w / 2 - 0.5, y - 0.5, z1, w / 2 + 0.5, y + sh + 0.5, z1 + 0.6, C.signBack, { flat: true, faces: 'sewtb' });
    k.sign(uv, -w / 2, z1 + 0.6, w / 2, z1 + 0.6, y, y + sh);
    k.sign(uv, w / 2, z0, -w / 2, z0, y, y + sh, 0.15);
    const ws = 28, hs = ws * uv.aspect;
    k.sign(uv, x1, -12 + ws / 2, x1, -12 - ws / 2, h - hs - 1.2, h - 1.2, 0.15);
    k.sign(uv, x0, -12 - ws / 2, x0, -12 + ws / 2, h - hs - 1.2, h - 1.2, 0.15);
    // A smaller board over the door.
    const wd = 12;
    k.sign(uv, -wd / 2, z1 + 8, wd / 2, z1 + 8, 7.6, 7.6 + wd * uv.aspect, 0.05);
  }
  // Roof: a lit crown and a beacon mast.
  k.box(-10, h, -20, 10, h + 3, -6, C.podium, { flat: true, top: C.roof });
  k.box(-10.1, h + 2.6, -20.1, 10.1, h + 3, -5.9, C.neonB, { glow: true, faces: 'nsew' });
  k.prism(0, -13, h + 3, h + 12, 0.25, 0.1, 4, C.podium);
  k.box(-0.4, h + 12, -13.4, 0.4, h + 12.8, -12.6, C.beacon, { glow: true, faces: 'nsewtb' });
  for (const x of [-30, -18, 18, 30]) k.lamp(x, 30, 5, C.podium, C.neonB);
  k.solid(x0, z0, x1, z1);
  k.solid(-14, z1, -5.2, z1 + 5);
  k.solid(5.2, z1, 14, z1 + 5);
  k.solid(-5.2, z1, 5.2, z1 + 4.4);
  k.marker(0, z1 + 13);
}

/** Gulshan: a cluster of tall glass towers on a shopping podium. */
export function gulshanTowers(k, { C, sign }) {
  k.box(-36, 0, -36, 36, 7.5, 20, C.podium, { tile: FACADE.SHUTTER, floors: 2, top: C.roof, bay: 4 });
  k.box(-36.2, 3.4, -36.2, 36.2, 3.9, 20.2, C.neon, { glow: true, faces: 'nsew' });
  k.solid(-36, -36, 36, 20);
  const tower = (x0, z0, x1, z1, h, hex, crown) => {
    const floors = Math.round(h / 3.4);
    k.box(x0, 7.5, z0, x1, h, z1, hex, { tile: FACADE.GLASS, floors, top: C.roof });
    for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) k.box(x - 0.25, 7.5, z - 0.25, x + 0.25, h, z + 0.25, C.fin, { flat: true });
    if (crown === 'slant') {
      k.quad([x0, h, z0], [x0, h, z1], [x1, h + 9, z1], [x1, h + 9, z0], C.fin, { inside: [x0, h - 9, z0] });
      k.quad([x1, h, z0], [x1, h, z1], [x1, h + 9, z1], [x1, h + 9, z0], hex, { inside: [x0, h, z0] });
      k.tri([x0, h, z0], [x1, h, z0], [x1, h + 9, z0], hex, { inside: [x0, h, z1] });
      k.tri([x0, h, z1], [x1, h, z1], [x1, h + 9, z1], hex, { inside: [x0, h, z0] });
    } else if (crown === 'spire') {
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      k.frustum(x0 + 2, z0 + 2, x1 - 2, z1 - 2, h, h + 6, 3, C.fin);
      k.prism(cx, cz, h + 6, h + 24, 0.5, 0.05, 4, C.fin);
      k.box(cx - 0.35, h + 24, cz - 0.35, cx + 0.35, h + 24.7, cz + 0.35, C.beacon, { glow: true, faces: 'nsewtb' });
    } else {
      k.box(x0 + 1.5, h, z0 + 1.5, x1 - 1.5, h + 3.5, z1 - 1.5, C.fin, { flat: true, top: C.roof });
      k.box(x0 + 1.4, h + 3, z0 + 1.4, x1 - 1.4, h + 3.5, z1 - 1.4, C.neon, { glow: true, faces: 'nsew' });
    }
  };
  const [a, b, c2] = C.heights;
  tower(-32, -32, -10, -10, a, C.glassA, 'slant');
  tower(8, -34, 30, -12, b, C.glassB, 'spire');
  tower(-30, -4, -8, 16, c2, C.glassC, 'box');
  // Round tower.
  const rh = C.heights[3];
  k.prism(20, 5, 7.5, rh, 11, 11, 12, C.glassA, { tile: FACADE.GLASS, floors: Math.round(rh / 3.4), cap: true, top: C.roof });
  k.prism(20, 5, rh, rh + 1, 11.3, 11.3, 12, C.neon, { glow: true });
  // Plaza in front with the board.
  k.ground(-36, 20, 36, 36, C.plaza);
  k.nameBoard(sign('gulshan'), 0, 33, 8);
  for (const x of [-28, -14, 14, 28]) k.lamp(x, 27, 5, C.fin, C.neon);
}

/** Karwan Bazar: big open tin sheds stacked with crates and sacks, a media tower behind. */
export function karwanBazar(k, { C, sign }) {
  const shed = (x0, z0, x1, z1, roof) => {
    for (let x = x0; x <= x1 + 0.01; x += (x1 - x0) / 4) for (const z of [z0, z1]) k.prism(x, z, 0, 5, 0.22, 0.22, 4, C.post);
    k.gable(x0 - 1.5, z0 - 1.5, x1 + 1.5, z1 + 1.5, 5, 2.6, roof, 'x', C.post);
    // Stacks of crates and sacks in rows under the roof.
    let i = 0;
    for (let x = x0 + 2; x < x1 - 3; x += 5.2) {
      for (const z of [z0 + 2, (z0 + z1) / 2 - 1.2, z1 - 4.4]) {
        const hex = C.goods[i++ % C.goods.length];
        const h = 0.9 + (i % 3) * 0.55;
        k.box(x, 0, z, x + 3.4, h, z + 2.4, hex, { flat: true, grad: 0.7 });
        k.solid(x, z, x + 3.4, z + 2.4, false);
      }
    }
  };
  shed(-33, 8, 33, 24, C.roofA);
  shed(-33, -14, 6, 2, C.roofB);
  // Media tower and a lower office block.
  k.box(12, 0, -34, 34, C.towerHeight, -6, C.glass, { tile: FACADE.GLASS, floors: Math.round(C.towerHeight / 3.4), top: C.roof });
  k.box(18, C.towerHeight, -28, 28, C.towerHeight + 4, -12, C.post, { flat: true, top: C.roof });
  k.prism(23, -20, C.towerHeight + 4, C.towerHeight + 16, 0.4, 0.08, 4, C.post);
  k.box(22.6, C.towerHeight + 16, -20.4, 23.4, C.towerHeight + 16.8, -19.6, C.beacon, { glow: true, faces: 'nsewtb' });
  k.box(-33, 0, -34, 6, 14, -20, C.office, { tile: FACADE.OFFICE, floors: 4, top: C.roof });
  k.solid(12, -34, 34, -6);
  k.solid(-33, -34, 6, -20);
  k.nameBoard(sign('karwan-bazar'), 0, 33, 8);
}

/** A swan-ish paddle boat for the lake. */
function paddleBoat(k, x, z, turn, hex, C, w) {
  const p = k.P([x, 0, z]);
  const q = new k.constructor(k.b, { cx: p[0], cz: p[2], y: k.site.y, angle: k.site.angle + turn });
  q.frustum(-0.8, -1.3, 0.8, 1.3, w + 0.45, w - 0.2, 0.3, hex, { top: hex });
  q.ground(-0.8, -1.3, 0.8, 1.3, C.boatDeck, w + 0.42);
  q.box(-0.7, w + 0.45, -1.1, 0.7, w + 0.95, -0.5, hex, { flat: true });
  for (const s of [-1, 1]) q.prism(s * 0.7, 0.9, w + 0.45, w + 1.9, 0.04, 0.04, 4, C.boatDeck);
  q.box(-0.85, w + 1.9, -1.2, 0.85, w + 1.98, 1.1, C.canopy, { flat: true, faces: 'nsewtb' });
}

/**
 * Water dressing for a lake: paddle boats, and lights + arches on every bridge.
 * ctx.water = { rects:[{x0,z0,x1,z1}], bridges:[{x0,z0,x1,z1, alongX}] } in world metres
 * (this builder's "local" space is the world itself). style 'arches' = Hatirjheel's white arches.
 */
export function lakeDecor(k, { C, water, waterY, rng }) {
  const boats = C.boats || 0;
  for (let i = 0; i < boats && water.rects.length; i++) {
    const r = water.rects[i % water.rects.length];
    const x = rng.range(r.x0 + 8, r.x1 - 8), z = rng.range(r.z0 + 8, r.z1 - 8);
    paddleBoat(k, x, z, rng.range(0, PI * 2), C.boatColors[i % C.boatColors.length], C, waterY);
  }
  for (const b of water.bridges) {
    const len = b.alongX ? b.x1 - b.x0 : b.z1 - b.z0;
    // Local helper: u = metres along the bridge, s = -1 / +1 for its two sides.
    const pt = (u, s, y) => (b.alongX ? [b.x0 + u, y, s < 0 ? b.z0 + 0.14 : b.z1 - 0.14] : [s < 0 ? b.x0 + 0.14 : b.x1 - 0.14, y, b.z0 + u]);
    for (const s of [-1, 1]) {
      // Lamp posts with a line of coloured lights hung between them.
      const posts = Math.max(2, Math.round(len / C.lampSpacing));
      let prev = null;
      for (let i = 0; i <= posts; i++) {
        const u = (len * i) / posts;
        const base = pt(u, s, 0), top = pt(u, s, C.lampHeight);
        k.beam(base, top, 0.14, C.lampPost);
        k.box(top[0] - 0.25, top[1], top[2] - 0.25, top[0] + 0.25, top[1] + 0.32, top[2] + 0.25, C.lamp, { glow: true, faces: 'nsewtb' });
        if (prev) {
          for (let j = 1; j < 6; j++) {
            const t = j / 6, sag = 1.1 * 4 * t * (1 - t);
            const x = prev[0] + (top[0] - prev[0]) * t, z = prev[2] + (top[2] - prev[2]) * t, y = C.lampHeight - 0.2 - sag;
            k.box(x - 0.11, y, z - 0.11, x + 0.11, y + 0.22, z + 0.11, C.lights[(i + j) % C.lights.length], { glow: true, faces: 'nsewb' });
          }
        }
        prev = top;
      }
      if (C.style !== 'arches') continue;
      // Hatirjheel: a white steel arch springing over each side of the deck.
      const n = 10;
      let last = null;
      for (let i = 0; i <= n; i++) {
        const t = i / n, p = pt(len * t, s * 1, 0.4 + Math.sin(t * PI) * C.archHeight);
        if (last) k.beam(last, p, 0.5, C.arch);
        if (i > 0 && i < n) k.beam(p, pt(len * t, s, 0.5), 0.09, C.cable);
        last = p;
      }
    }
  }
}
