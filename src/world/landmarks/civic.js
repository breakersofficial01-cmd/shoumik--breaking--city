// National monuments: Jatiya Sangsad Bhaban, Shaheed Minar, Shapla Chattar.
// Recognisable low-poly shapes only — no emblems, crests or logos (CLAUDE.md).
// Every builder gets  k (Kit, local space: +z = front) and ctx { C (colours from
// data/landmarks.json), sign(id) → name-board UVs, site }.

import { FACADE } from '../../assets/proceduralTextures.js';

const PI = Math.PI;

/** Jatiya Sangsad Bhaban: the concrete octagon ringed by blocks with huge geometric openings, in its lake. */
export function sangsad(k, { C, sign }) {
  const H = C.height, R = C.lakeHalf;
  k.ground(-R, -R, R, R, C.water, 0.04);
  k.ground(-31, -31, 31, 31, C.plinth, 0.1);
  // Central assembly chamber.
  k.prism(0, 0, 0, H, 16, 16, 8, C.concrete, { rot: PI / 8, tile: FACADE.PLAIN, floors: 7, cap: true, grad: 0.72 });
  k.prism(0, 0, H, H + 3.5, 11.5, 9, 8, C.concreteLight, { rot: PI / 8, cap: true });
  for (let d = 0; d < 4; d++) {
    const q = k.turned(d);
    // Office block on each side with a great round opening, triangles on its flanks.
    const h = H - 6;
    q.box(-9.5, 0, 19, 9.5, h, 29, C.concrete, { floors: 6, grad: 0.72 });
    q.disc(-9.5, 29, 9.5, 29, 9.5, h * 0.55, 6, C.hole, { segments: 12 });
    q.shape(9.5, 29, 9.5, 19, [[1.5, 3], [8.5, 3], [5, h - 4]], C.hole);
    q.shape(-9.5, 19, -9.5, 29, [[1.5, 3], [8.5, 3], [5, h - 4]], C.hole);
    // Round tower on each corner with tall slots.
    q.prism(21, 21, 0, H - 3, 7.5, 7.5, 10, C.concrete, { tile: FACADE.PLAIN, floors: 6, cap: true, grad: 0.72 });
    for (const a of [PI / 4 - 0.75, PI / 4 + 0.4]) q.prism(21, 21, 3, H - 8, 7.75, 7.75, 1, C.hole, { rot: a, arc: 0.055 });
  }
  // Red-brick south plaza with broad steps, and the name board.
  k.ground(-40, R, 40, R + 26, C.brick, 0.06);
  k.frustum(-22, R + 2, 22, R + 14, 0, 0.9, 2.5, C.brickDark, { top: C.brick });
  k.platform(-19.5, R + 4.5, 19.5, R + 11.5, 0.9, 2.5);
  k.nameBoard(sign('sangsad-bhaban'), 0, R + 22, 11);
  for (const x of [-34, -17, 17, 34]) k.lamp(x, R + 24, 5, C.lampPost, C.lamp);
  // The building is solid; the lake keeps you out but lets the camera through.
  k.solid(-30, -30, 30, 30);
  k.solid(-R, -R, R, -30, false);
  k.solid(-R, 30, R, R, false);
  k.solid(-R, -30, -30, 30, false);
  k.solid(30, -30, R, 30, false);
}

/** One marble frame of the Shaheed Minar: upright bars with a bar across the top. */
function minarFrame(k, x, z, width, height, bars, bend, C) {
  const t = 0.36;
  const top = [];
  for (let i = 0; i < bars; i++) {
    const bx = x - width / 2 + (width * i) / (bars - 1);
    if (bend > 0) {
      // The tall middle frame bows its head forward.
      const knee = height * 0.72;
      k.beam([bx, 0, z], [bx, knee, z], t, C.marble);
      k.beam([bx, knee, z], [bx, height, z + bend], t, C.marble);
      top.push([bx, height, z + bend]);
    } else {
      k.beam([bx, 0, z], [bx, height, z], t, C.marble);
      top.push([bx, height, z]);
    }
  }
  k.beam(top[0], top[top.length - 1], t, C.marble);
  k.beam([x - width / 2, 0.2, z], [x + width / 2, 0.2, z], t, C.marble);
}

/** Central Shaheed Minar: five white frames on a red stepped platform, the red sun behind. */
export function shaheedMinar(k, { C, sign }) {
  const h = C.platformHeight;
  k.ground(-36, -36, 36, 36, C.lawn);
  k.ground(-5, 14, 5, 36, C.path, 0.05);
  k.frustum(-26, -17, 26, 16, 0, h, 3.5, C.brickDark, { top: C.brick });
  k.platform(-22.5, -13.5, 22.5, 12.5, h, 3.5);
  const kk = k; // frames stand on the platform
  const lift = (fn) => { const y = kk.site.y; kk.site.y += h; fn(); kk.site.y = y; };
  lift(() => {
    minarFrame(k, 0, -6, 7.5, C.frameHeight, 5, 3.6, C);
    for (const s of [-1, 1]) {
      minarFrame(k, s * 8.6, -5, 4.2, C.frameHeight * 0.62, 3, 0, C);
      minarFrame(k, s * 14.6, -4, 3.6, C.frameHeight * 0.48, 3, 0, C);
    }
    // The red sun behind the middle frame (seen from both sides).
    k.disc(-6, -8.2, 6, -8.2, 6, C.frameHeight * 0.5, C.sunRadius, C.sun, { segments: 16, depth: 0 });
    k.disc(6, -8.25, -6, -8.25, 6, C.frameHeight * 0.5, C.sunRadius, C.sun, { segments: 16, depth: 0 });
    k.beam([0, 0, -8.22], [0, C.frameHeight * 0.5, -8.22], 0.3, C.sun);
  });
  k.solid(-17, -8.6, 17, -3.6, false);
  k.nameBoard(sign('shaheed-minar'), 0, 30, 8);
  for (const x of [-30, 30]) for (const z of [-28, 28]) k.lamp(x, z, 4.5, C.lampPost, C.lamp);
}

/** Shapla Chattar: the white water-lily in its round fountain, office towers behind. */
export function shaplaChattar(k, { C, sign }) {
  const R = C.basinRadius;
  k.prism(0, 8, 0, 0.9, R, R, 16, C.basin, { cap: true, top: C.water, grad: 0.8 });
  k.prism(0, 8, 0.9, 1.05, R, R - 0.6, 16, C.basin);
  k.prism(0, 8, 0, 4.6, 1.1, 0.7, 8, C.stem);
  // Petals: two rings of pointed leaves opening upwards.
  const petal = (a, r0, y0, r1, y1, w, hex) => {
    const cx = Math.cos(a), cz = Math.sin(a);
    const base = [cx * r0, y0, 8 + cz * r0], tip = [cx * r1, y1, 8 + cz * r1];
    const l = [cx * (r0 + r1) * 0.45 - cz * w, (y0 + y1) / 2 - 0.3, 8 + cz * (r0 + r1) * 0.45 + cx * w];
    const r = [cx * (r0 + r1) * 0.45 + cz * w, (y0 + y1) / 2 - 0.3, 8 + cz * (r0 + r1) * 0.45 - cx * w];
    const inside = [0, y1 + 6, 8];
    k.quad(base, l, tip, tip, hex, { inside });
    k.quad(base, r, tip, tip, hex, { inside });
    const under = [0, y0 - 6, 8];
    k.quad(base, l, tip, tip, C.petalShade, { inside: under });
    k.quad(base, r, tip, tip, C.petalShade, { inside: under });
  };
  for (let i = 0; i < 8; i++) petal((i / 8) * PI * 2, 0.8, 4.4, 6.4, 7.2, 1.5, C.petal);
  for (let i = 0; i < 6; i++) petal(((i + 0.5) / 6) * PI * 2, 0.5, 4.8, 3.4, 10.2, 1.2, C.petalInner);
  k.prism(0, 8, 4.6, 7.4, 0.9, 0.1, 6, C.bud);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * PI * 2;
    k.box(Math.cos(a) * (R - 2) - 0.12, 1, 8 + Math.sin(a) * (R - 2) - 0.12, Math.cos(a) * (R - 2) + 0.12, 2.6, 8 + Math.sin(a) * (R - 2) + 0.12, C.jet, { glow: true });
  }
  k.solid(-R * 0.72, 8 - R * 0.72, R * 0.72, 8 + R * 0.72, false);
  // Two bank towers at the back of the square.
  k.box(-34, 0, -34, -8, C.towerHeight, -14, C.towerA, { tile: FACADE.OFFICE, floors: Math.round(C.towerHeight / 3.4), top: C.roof });
  k.box(4, 0, -34, 34, C.towerHeight * 0.74, -12, C.towerB, { tile: FACADE.GLASS, floors: Math.round((C.towerHeight * 0.74) / 3.4), top: C.roof });
  k.box(-30, C.towerHeight, -30, -12, C.towerHeight + 3, -18, C.roof, { flat: true });
  k.solid(-34, -34, -8, -14);
  k.solid(4, -34, 34, -12);
  k.nameBoard(sign('shapla-chattar'), 0, 33, 8);
  for (const x of [-30, 30]) k.lamp(x, 30, 5, C.lampPost, C.lamp);
}
