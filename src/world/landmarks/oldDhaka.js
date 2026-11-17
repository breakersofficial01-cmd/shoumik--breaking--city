// Old Dhaka: Ahsan Manzil, Lalbagh Fort, Sadarghat launch terminal (with boats on the
// Buriganga) and the Nilkhet book market.
// Local space: +z = front, the plot is 76 m square (−38…38). No crests or logos.

import { FACADE } from '../../assets/proceduralTextures.js';

const PI = Math.PI;

/** Ahsan Manzil: the pink palace — arched verandas, the big dome, the grand stair to the river side. */
export function ahsanManzil(k, { C, sign }) {
  const f = 5.4, h = 2 * f;
  k.ground(-36, 6, 36, 36, C.lawn);
  k.ground(-6, 22, 6, 36, C.path, 0.05);
  k.box(-33, 0, -12, 33, h, 4, C.pink, { floors: 2, top: C.roof });
  for (let fl = 0; fl < 2; fl++) {
    k.arcade(-33, 4, -9, 4, 7, fl * f + 0.5, fl * f + f - 0.8, C.shadow);
    k.arcade(9, 4, 33, 4, 7, fl * f + 0.5, fl * f + f - 0.8, C.shadow);
    k.box(-33.3, (fl + 1) * f - 0.45, -12.3, 33.3, (fl + 1) * f, 4.3, C.trim, { flat: true, faces: 'nsew' });
  }
  // Centre block, octagonal drum and the dome.
  k.box(-9, 0, -14, 9, h + 2, 8, C.pink, { floors: 2, top: C.roof });
  k.box(-9.3, h + 1.5, -14.3, 9.3, h + 2, 8.3, C.trim, { flat: true, faces: 'nsew' });
  for (const t of [1.2, 7, 12.8]) k.arch(-9, 8, 9, 8, t, t + 4, f + 0.5, h + 0.6, C.shadow);
  k.prism(0, -3, h + 2, h + 6, 6.4, 6.4, 8, C.pink, { rot: PI / 8, grad: 0.85 });
  k.prism(0, -3, h + 6, h + 6.5, 6.8, 6.8, 8, C.trim, { rot: PI / 8, cap: true });
  k.dome(0, -3, h + 6.5, 6.2, 6.6, 10, 3, C.dome);
  k.prism(0, -3, h + 13.1, h + 15.4, 0.3, 0.03, 4, C.trim);
  for (const s of [-1, 1]) {
    k.prism(s * 9, 8, 0, h + 4, 1.1, 1.1, 6, C.pink, { grad: 0.85 });
    k.dome(s * 9, 8, h + 4, 1.25, 1.5, 6, 2, C.dome);
    k.prism(s * 33, 4, 0, h + 2.5, 1.2, 1.2, 6, C.pink, { grad: 0.85 });
    k.dome(s * 33, 4, h + 2.5, 1.35, 1.5, 6, 2, C.dome);
  }
  // The great open staircase climbing to the first floor.
  k.steps(-6, 6, 22, 8, f, 9, C.stair);
  for (const s of [-1, 1]) k.box(s * 6 - 0.35, 0, 8, s * 6 + 0.35, f + 1, 22, C.trim, { flat: true });
  k.solid(-33, -12, 33, 4);
  k.solid(-9, -14, 9, 8);
  k.solid(-6.4, 8, 6.4, 22, false);
  k.nameBoard(sign('ahsan-manzil'), 20, 33, 8);
  for (const x of [-28, 28]) k.lamp(x, 30, 4.5, C.lampPost, C.lamp);
}

/** Lalbagh Fort: red Mughal walls and gate, the white tomb with its dome, the mosque and the audience hall. */
export function lalbaghFort(k, { C, sign }) {
  const W = 35, wh = C.wallHeight;
  k.ground(-W, -W, W, W, C.lawn);
  k.ground(-1.6, -W, 1.6, 30, C.water, 0.06);
  k.ground(-W, -2.6, W, 0.6, C.path, 0.05);
  // Outer wall with a gap for the gate, and eight-sided bastions on the corners.
  const wall = (x0, z0, x1, z1) => {
    k.box(x0, 0, z0, x1, wh, z1, C.red, { floors: 1, top: C.redDark });
    k.solid(x0, z0, x1, z1);
  };
  wall(-W, -W, W, -W + 1.2);
  wall(-W, -W, -W + 1.2, W);
  wall(W - 1.2, -W, W, W);
  wall(-W, W - 1.2, -8, W);
  wall(8, W - 1.2, W, W);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    k.prism(sx * (W - 0.6), sz * (W - 0.6), 0, wh + 1.4, 3, 3, 8, C.red, { grad: 0.8, cap: true, top: C.redDark });
    k.dome(sx * (W - 0.6), sz * (W - 0.6), wh + 1.4, 1.6, 1.5, 8, 2, C.redDark);
  }
  // South gate: three storeys, a tall pointed arch, slim towers on the corners.
  const gz0 = W - 5, gz1 = W + 1, gh = C.gateHeight;
  for (const s of [-1, 1]) k.box(s > 0 ? 3 : -8, 0, gz0, s > 0 ? 8 : -3, gh, gz1, C.red, { floors: 3, top: C.redDark });
  k.box(-3, 6.5, gz0, 3, gh, gz1, C.red, { flat: true, faces: 'nstb' });
  k.arch(-8, gz1, 8, gz1, 4.6, 11.4, 0, 9.4, C.shadow, { pointed: true, depth: 0.08 });
  k.arch(-8, gz1, 8, gz1, 5, 11, 0, 6.5, '#0d0b0a', { pointed: true, depth: 0.12 });
  for (const t of [0.8, 12.4]) for (const y of [1, 5, 9]) k.arch(-8, gz1, 8, gz1, t, t + 2.8, y, y + 3.2, C.shadow, { pointed: true });
  for (const sx of [-1, 1]) for (const z of [gz0, gz1]) {
    k.prism(sx * 8, z, 0, gh + 2.5, 0.75, 0.75, 6, C.red, { grad: 0.8 });
    k.dome(sx * 8, z, gh + 2.5, 0.95, 1.1, 6, 2, C.marble);
  }
  for (const s of [-1, 1]) k.solid(s > 0 ? 3 : -8, gz0, s > 0 ? 8 : -3, gz1);
  // Tomb in the middle: white, square, a dark dome and four little ones.
  k.frustum(-9.5, -12.5, 9.5, 6.5, 0, 0.7, 1, C.plinth);
  k.box(-8, 0.7, -11, 8, 7.2, 5, C.marble, { flat: true, top: C.plinth });
  k.arcade(-8, 5, 8, 5, 3, 1.2, 6, C.shadow, { pointed: true });
  k.arcade(8, -11, -8, -11, 3, 1.2, 6, C.shadow, { pointed: true });
  k.arcade(8, 5, 8, -11, 3, 1.2, 6, C.shadow, { pointed: true });
  k.arcade(-8, -11, -8, 5, 3, 1.2, 6, C.shadow, { pointed: true });
  k.prism(0, -3, 7.2, 8.6, 3.6, 3.6, 8, C.marble, { rot: PI / 8 });
  k.dome(0, -3, 8.6, 3.5, 3.9, 10, 3, C.tombDome);
  k.prism(0, -3, 12.5, 14, 0.2, 0.02, 4, C.tombDome);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    k.prism(sx * 7, -3 + sz * 7, 7.2, 8.4, 0.8, 0.8, 6, C.marble);
    k.dome(sx * 7, -3 + sz * 7, 8.4, 0.95, 1, 6, 2, C.marble);
  }
  k.solid(-8, -11, 8, 5);
  // Three-domed mosque on the west, audience hall with a curved roof on the east.
  k.box(-31, 0, -12, -21, 6, 6, C.red, { flat: true, top: C.redDark });
  k.arcade(-21, 6, -21, -12, 3, 0.5, 4.8, C.shadow, { pointed: true });
  for (const z of [-8.5, -3, 2.5]) k.dome(-26, z, 6, z === -3 ? 2.7 : 2.1, z === -3 ? 2.9 : 2.2, 8, 2, C.redDark);
  k.solid(-31, -12, -21, 6);
  k.box(21, 0, -12, 31, 7, 6, C.plaster, { floors: 2, top: C.redDark });
  k.vault(20.4, -12.6, 31.6, 6.6, 7, 2.2, C.redDark, 'z', 5, C.plaster);
  k.arcade(21, -12, 21, 6, 3, 0.5, 3.2, C.shadow, { pointed: true });
  k.solid(21, -12, 31, 6);
  k.nameBoard(sign('lalbagh-fort'), -19, W + 1.6, 7.5);
}

/** One moored launch: dark hull, white decks stacked up, wheelhouse and funnel. Bow towards +z. */
function launch(k, x, z0, len, C, decks, hull) {
  const hw = 4.2, w = C.waterY;
  k.frustum(x - hw, z0, x + hw, z0 + len, w + 1.9, w - 0.5, 1.1, hull, { top: hull });
  k.ground(x - hw, z0, x + hw, z0 + len, C.deck, w + 1.9);
  k.tri([x - hw, w + 1.9, z0 + len], [x + hw, w + 1.9, z0 + len], [x, w + 2.2, z0 + len + 6], C.deck, { inside: [x, w - 5, z0 + len] });
  k.tri([x - hw, w + 1.9, z0 + len], [x, w - 0.4, z0 + len + 1], [x, w + 2.2, z0 + len + 6], hull, { inside: [x, w, z0 + len] });
  k.tri([x + hw, w + 1.9, z0 + len], [x, w - 0.4, z0 + len + 1], [x, w + 2.2, z0 + len + 6], hull, { inside: [x, w, z0 + len] });
  let y = w + 1.9;
  for (let d = 0; d < decks; d++) {
    const inset = d * 0.25, front = z0 + len - 2 - d * 2.5;
    k.box(x - hw + inset, y, z0 + 0.6, x + hw - inset, y + 2.3, front, C.cabin, { tile: FACADE.RAIL, floors: 1, top: C.deck, bay: 2.6 });
    k.box(x - hw + inset - 0.15, y + 2.3, z0 + 0.3, x + hw - inset + 0.15, y + 2.5, front + 0.8, C.deck, { flat: true, faces: 'nsew' });
    y += 2.5;
  }
  k.box(x - 2.2, y, z0 + len * 0.45, x + 2.2, y + 2.2, z0 + len * 0.62, C.cabin, { tile: FACADE.GLASS, floors: 1, top: C.deck });
  k.prism(x, z0 + len * 0.3, y, y + 3.2, 0.9, 0.75, 6, C.funnel, { cap: true });
  k.box(x - 0.95, y + 2.2, z0 + len * 0.3 - 0.95, x + 0.95, y + 2.6, z0 + len * 0.3 + 0.95, C.funnelBand, { flat: true, faces: 'nsew' });
}

/** A small wooden country boat with a bamboo canopy. */
function nouka(k, x, z, turn, C) {
  const q = new k.constructor(k.b, { cx: k.P([x, 0, z])[0], cz: k.P([x, 0, z])[2], y: k.site.y, angle: k.site.angle + turn });
  const w = C.waterY;
  q.frustum(-0.9, -3.4, 0.9, 3.4, w + 0.55, w - 0.25, 0.4, C.wood, { top: C.wood });
  q.ground(-0.9, -3.4, 0.9, 3.4, C.woodLight, w + 0.5);
  q.tri([-0.9, w + 0.55, 3.4], [0.9, w + 0.55, 3.4], [0, w + 1.15, 5.2], C.wood, { inside: [0, w - 3, 3.4] });
  q.tri([-0.9, w + 0.55, -3.4], [0.9, w + 0.55, -3.4], [0, w + 1.15, -5.2], C.wood, { inside: [0, w - 3, -3.4] });
  q.vault(-0.85, -1.6, 0.85, 1.2, w + 0.55, 1.05, C.thatch, 'z', 4, C.wood);
}

/** Sadarghat: the long launch terminal on the bund, pontoons, big river launches and country boats. */
export function sadarghat(k, { C: colours, sign, site, waterY }) {
  const C = { ...colours, waterY }; // local height of the river surface
  // Terminal building along the river side of the block.
  k.box(-35, 0, 12, 35, 8.4, 30, C.wall, { tile: FACADE.OFFICE, floors: 2, top: C.roof });
  k.box(-35.3, 3.9, 11.7, 35.3, 4.5, 30.3, C.band, { flat: true, faces: 'nsew' });
  k.gable(-36, 11, 36, 31, 8.4, 3.4, C.roof, 'x', C.wall);
  k.arcade(35, 12, -35, 12, 9, 0.4, 3.6, C.shadow);
  k.arcade(-35, 30, 35, 30, 9, 0.4, 3.6, C.shadow);
  k.solid(-35, 12, 35, 30);
  const uv = sign('sadarghat');
  if (uv) k.sign(uv, 6, 12, -6, 12, 4.8, 4.8 + 12 * uv.aspect);
  if (uv) k.sign(uv, -6, 30, 6, 30, 4.8, 4.8 + 12 * uv.aspect);
  // Ticket counters in the yard.
  for (const x of [-24, -8, 8, 24]) {
    k.box(x - 3, 0, -4, x + 3, 2.8, 0, C.counter, { tile: FACADE.SHUTTER, floors: 1, top: C.band });
    k.solid(x - 3, -4, x + 3, 0, false);
  }
  // Out on the river (past the road along the bund): pontoons, gangways, launches, boats.
  const edge = site.half + 3 + site.roadWidth; // local z of the river bank
  const w = C.waterY;
  k.box(-34, w - 0.3, edge + 3, 34, w + 0.5, edge + 9, C.pontoon, { flat: true, top: C.pontoonTop });
  for (const x of [-22, 0, 22]) {
    k.box(x - 1.1, w + 0.5, edge - 0.4, x + 1.1, w + 0.62, edge + 3.2, C.gangway, { flat: true, faces: 'sewtb' });
    k.quad([x - 1.1, 0.75, edge - 0.6], [x + 1.1, 0.75, edge - 0.6], [x + 1.1, w + 0.6, edge + 0.6], [x - 1.1, w + 0.6, edge + 0.6], C.gangway, { inside: [x, -5, edge] });
  }
  launch(k, -22, edge + 9.5, 36, C, 3, C.hullA);
  launch(k, 0, edge + 9.5, 42, C, 4, C.hullB);
  launch(k, 22, edge + 9.5, 33, C, 3, C.hullC);
  for (const [x, z, t] of [[-48, 22, 0.5], [-58, 44, 1.9], [44, 30, -0.7], [58, 58, 1.2], [-10, 74, 1.6], [26, 82, 0.3], [-36, 66, -1.1]]) nouka(k, x, edge + z, t, C);
}

/** Nilkhet: rows of tin-roofed book stalls with stacks of colourful books out front. */
export function nilkhet(k, { C, sign }) {
  const rows = [-30, -19, -8, 3, 14];
  rows.forEach((z, r) => {
    const roof = C.roofs[r % C.roofs.length];
    k.box(-34, 0, z, 34, 2.7, z + 6, C.wall, { tile: FACADE.SHUTTER, floors: 1, bay: 4, faces: 'nsew' });
    k.gable(-34.6, z - 0.9, 34.6, z + 6.9, 2.7, 1.1, roof, 'x', C.wall);
    k.solid(-34, z, 34, z + 6);
    // Book tables on both sides of the row: every stall its own colours.
    for (let i = 0; i < 17; i++) {
      const x = -33 + i * 4;
      const a = C.books[(i * 3 + r) % C.books.length], b = C.books[(i * 5 + r * 2 + 1) % C.books.length];
      k.box(x, 0, z + 6, x + 3.2, 0.9, z + 7.1, a, { flat: true, faces: 'sewt', top: b, grad: 0.7 });
      k.box(x + 0.3, 0, z - 1.1, x + 3.5, 0.9, z, b, { flat: true, faces: 'newt', top: a, grad: 0.7 });
      k.box(x + 0.2, 2.0, z + 6.02, x + 3, 2.6, z + 6.1, b, { flat: true, faces: 's' });
    }
  });
  k.nameBoard(sign('nilkhet'), 0, 33, 8);
  for (const x of [-30, -10, 10, 30]) k.lamp(x, 27, 4.5, C.lampPost, C.lamp);
}
