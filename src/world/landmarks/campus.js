// Campuses and colleges: TSC, Dhaka University, Curzon Hall, Dhaka Medical College, BUET,
// Notre Dame College, Sir Salimullah Medical College.
// Low-poly look-alikes built from the Kit — no crests, logos or emblems (CLAUDE.md).
// Local space: +z = front, the plot is 76 m square (−38…38).

import { FACADE } from '../../assets/proceduralTextures.js';

const FLOOR = 3.6;

/** A plain building wing with window bays, a parapet and a collider. Returns its height. */
function wing(k, x0, z0, x1, z1, floors, hex, o = {}) {
  const h = floors * (o.floorHeight || FLOOR);
  k.box(x0, 0, z0, x1, h, z1, hex, { tile: o.tile ?? FACADE.RESIDENTIAL, floors, top: o.roof || '#6f6a64', bay: o.bay });
  if (o.trim) k.box(x0 - 0.25, h, z0 - 0.25, x1 + 0.25, h + 0.6, z1 + 0.25, o.trim, { flat: true });
  k.solid(x0, z0, x1, z1);
  return h;
}

/** Small domed kiosk (chhatri) on four thin posts. */
function chhatri(k, x, z, y, r, C) {
  k.box(x - r, y, z - r, x + r, y + 0.25, z + r, C.trim, { flat: true });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.prism(x + sx * r * 0.75, z + sz * r * 0.75, y + 0.25, y + 1.9, 0.13, 0.13, 4, C.trim);
  k.box(x - r, y + 1.9, z - r, x + r, y + 2.15, z + r, C.trim, { flat: true });
  k.dome(x, z, y + 2.15, r * 0.85, r * 0.95, 8, 2, C.dome);
  k.prism(x, z, y + 2.15 + r * 0.95, y + 2.9 + r * 0.95, 0.09, 0.02, 4, C.trim);
}

/** Curzon Hall: long red two-storey hall, rows of pointed arches, domed kiosks on the roofline. */
export function curzonHall(k, { C, sign }) {
  const f = 4.7, h = 2 * f;
  k.ground(-36, 8, 36, 36, C.lawn);
  k.ground(-4, 13, 4, 36, C.path, 0.05);
  k.box(-32, 0, -12, 32, h, 6, C.brick, { floors: 2, top: C.roof });
  k.box(-10, 0, 6, 10, h + 1.6, 12.5, C.brick, { floors: 2, top: C.roof });
  for (const s of [-1, 1]) {
    // End pavilion stepping forward, then the arcade between it and the centre bay.
    const px0 = s > 0 ? 24 : -32, px1 = s > 0 ? 32 : -24;
    k.box(px0, 0, 6, px1, h, 9, C.brick, { floors: 2, top: C.roof, faces: 'sewt' });
    k.solid(px0, 6, px1, 9);
    const xa = s > 0 ? 10 : -24, xb = s > 0 ? 24 : -10;
    for (let fl = 0; fl < 2; fl++) {
      k.arcade(xa, 6, xb, 6, 5, fl * f + 0.5, fl * f + f - 0.7, C.shadow, { pointed: true });
      k.arcade(px0, 9, px1, 9, 2, fl * f + 0.5, fl * f + f - 0.7, C.shadow, { pointed: true });
    }
    chhatri(k, s * 27.5, 4.5, h, 1.5, C);
    chhatri(k, s * 8.3, 10.8, h + 1.6, 1.4, C);
  }
  k.arch(-10, 12.5, 10, 12.5, 6.4, 13.6, 0, 7.6, C.shadow, { pointed: true });
  for (const t of [1.5, 15]) k.arch(-10, 12.5, 10, 12.5, t, t + 3.5, 0.6, f - 0.6, C.shadow, { pointed: true });
  for (let i = 0; i < 4; i++) k.arch(-10, 12.5, 10, 12.5, 1 + i * 4.6, 4.2 + i * 4.6, f + 2.9, h + 0.9, C.shadow, { pointed: true });
  k.box(-32.3, h, -12.3, 32.3, h + 0.5, 6.3, C.trim, { flat: true, faces: 'nsew' });
  k.box(-32.2, f - 0.3, 6, 32.2, f, 6.25, C.trim, { flat: true, faces: 'sewt' });
  k.solid(-32, -12, 32, 6);
  k.solid(-10, 6, 10, 12.5);
  k.nameBoard(sign('curzon-hall'), 18, 31, 8);
}

/** Dhaka University: the long white arts building with the three-figure sculpture in front. */
export function dhakaUniversity(k, { C, sign }) {
  k.ground(-36, 2, 36, 36, C.lawn);
  k.ground(-6, 2, 6, 36, C.path, 0.05);
  const h = wing(k, -33, -16, 33, 0, 4, C.wall, { tile: FACADE.OFFICE, trim: C.trim });
  for (let x = -33; x <= 33.01; x += 6.6) k.box(x - 0.3, 0, 0, x + 0.3, h + 0.6, 1.1, C.trim, { flat: true, faces: 'sew' });
  k.box(-8, 3.4, 0, 8, 3.8, 5, C.trim, { flat: true, faces: 'sewtb' });
  k.columns(-7.5, 4.6, 7.5, 4.6, 4, 0, 3.4, 0.25, C.trim);
  wing(k, -33, -34, -19, -16, 3, C.wall, { tile: FACADE.OFFICE, trim: C.trim });
  // Sculpture: three standing figures on a tall plinth (plain blocks — not a likeness).
  k.frustum(-3.4, 15, 3.4, 20, 0, 3.2, 0.5, C.plinth);
  for (const [x, lean] of [[-1.5, -0.2], [0, 0], [1.5, 0.2]]) {
    k.beam([x, 3.2, 17.5], [x + lean, 6.1, 17.5], 0.85, C.statue);
    k.box(x + lean - 0.3, 6.1, 17.2, x + lean + 0.3, 6.75, 17.8, C.statue, { flat: true });
  }
  k.solid(-3.4, 15, 3.4, 20, false);
  k.nameBoard(sign('dhaka-university'), 19, 32, 8.5);
}

/** TSC: the white auditorium under its barrel vault, the long low students' centre and the lawn. */
export function tsc(k, { C, sign }) {
  k.ground(-36, -4, 36, 36, C.lawn);
  k.ground(-36, 20, 36, 26, C.path, 0.05);
  // Auditorium with the curved shell roof.
  k.box(-33, 0, -34, -7, 6, -6, C.wall, { floors: 2, faces: 'nsew' });
  k.vault(-34, -35, -6, -5, 6, 6.5, C.shell, 'z', 7, C.wall);
  k.arcade(-33, -6, -7, -6, 5, 0.4, 4.4, C.shadow);
  k.solid(-33, -34, -7, -6);
  // Students' centre: two low floors behind a row of thin columns, flat roof sailing out.
  const h = wing(k, 0, -30, 33, -10, 2, C.wall, { tile: FACADE.OFFICE });
  k.box(-2, h, -32, 35, h + 0.45, -4.5, C.trim, { flat: true, faces: 'nsewtb' });
  k.columns(1, -5.5, 32, -5.5, 8, 0, h, 0.2, C.trim);
  // Cafeteria with a folded roof, and the small old shrine on the lawn.
  k.box(8, 0, 4, 30, 3.6, 16, C.wallWarm, { tile: FACADE.RESIDENTIAL, floors: 1, faces: 'nsew' });
  for (let i = 0; i < 4; i++) k.gable(8 + i * 5.5, 3.5, 13.5 + i * 5.5, 16.5, 3.6, 1.5, C.shell, 'z', C.wallWarm);
  k.solid(8, 4, 30, 16);
  k.box(-24, 0, 8, -20, 3.4, 12, C.shrine, { flat: true });
  k.frustum(-24.4, 7.6, -19.6, 12.4, 3.4, 5.4, 2.4, C.shrine);
  k.solid(-24, 8, -20, 12, false);
  k.nameBoard(sign('tsc'), -2, 32, 7);
}

/** Dhaka Medical College: cream colonial hospital, verandas on every floor, a columned porch. */
export function dhakaMedical(k, { C, sign }) {
  const f = 4.1;
  k.ground(-36, 9, 36, 36, C.forecourt);
  const h = wing(k, -34, -14, 34, 2, 3, C.wall, { floorHeight: f, tile: FACADE.PLAIN, trim: C.trim });
  for (let fl = 0; fl < 3; fl++) {
    k.arcade(-34, 2, -8, 2, 8, fl * f + 0.4, fl * f + f - 0.6, C.shadow);
    k.arcade(8, 2, 34, 2, 8, fl * f + 0.4, fl * f + f - 0.6, C.shadow);
  }
  for (const s of [-1, 1]) wing(k, s > 0 ? 22 : -34, -34, s > 0 ? 34 : -22, -14, 3, C.wall, { floorHeight: f, tile: FACADE.RESIDENTIAL, trim: C.trim });
  // Porch: four tall columns under a triangular pediment.
  k.box(-8, 0, 2, 8, h, 3.2, C.wall, { flat: true, faces: 'sew' });
  k.arch(-8, 3.2, 8, 3.2, 5.6, 10.4, 0, 5.4, C.shadow);
  k.columns(-7, 8.4, 7, 8.4, 4, 0, h - 1.2, 0.5, C.trim, 8);
  k.box(-8.4, h - 1.2, 2, 8.4, h, 9.2, C.trim, { flat: true, faces: 'sewb' });
  k.gable(-8.4, 2, 8.4, 9.2, h, 2.6, C.roof, 'z', C.trim);
  k.steps(-8, 8, 11.4, 9.2, 0.6, 3, C.trim);
  k.solid(-8, 2, 8, 9);
  // Emergency entrance: a red canopy on posts at the right-hand end.
  k.box(20, 3.3, 2, 33, 3.7, 9, C.emergency, { flat: true, faces: 'nsewtb' });
  k.columns(21, 8.4, 32, 8.4, 3, 0, 3.3, 0.16, C.trim);
  k.box(20, 3.7, 8.7, 33, 4.5, 9, C.emergencyGlow, { glow: true, faces: 'nsewt' });
  k.nameBoard(sign('dhaka-medical'), -19, 32, 9);
}

/** BUET: red-brick engineering blocks with white floor bands and a gate. */
export function buet(k, { C, sign }) {
  k.ground(-36, 4, 36, 36, C.lawn);
  k.ground(-5, 4, 5, 36, C.path, 0.05);
  const band = (x0, z0, x1, z1, floors) => {
    for (let fl = 1; fl <= floors; fl++) k.box(x0 - 0.3, fl * FLOOR - 0.35, z0 - 0.3, x1 + 0.3, fl * FLOOR + 0.1, z1 + 0.3, C.band, { flat: true, faces: 'nsew' });
  };
  wing(k, -33, -14, 12, 2, 4, C.brick, { tile: FACADE.OFFICE, roof: C.roof });
  band(-33, -14, 12, 2, 4);
  wing(k, 16, -34, 33, 10, 5, C.brick, { tile: FACADE.OFFICE, roof: C.roof });
  band(16, -34, 33, 10, 5);
  wing(k, -33, -34, -14, -18, 3, C.brick, { tile: FACADE.OFFICE, roof: C.roof });
  band(-33, -34, -14, -18, 3);
  // Stair tower with a water tank box, and the covered walkway joining the blocks.
  k.box(11, 0, -12, 17, 5.6 * FLOOR, -4, C.concrete, { floors: 5 });
  k.box(-12, 3.2, 2, 16, 3.5, 5, C.band, { flat: true, faces: 'nsewtb' });
  k.columns(-11, 4.6, 15, 4.6, 6, 0, 3.2, 0.18, C.concrete);
  // Gate: two brick pylons and a beam carrying the name.
  for (const s of [-1, 1]) k.box(s * 6.5 - 0.9, 0, 31, s * 6.5 + 0.9, 5.4, 33, C.brick, { flat: true });
  k.box(-7.4, 4.2, 31.3, 7.4, 5.4, 32.7, C.band, { flat: true, faces: 'nsewtb' });
  const uv = sign('buet');
  if (uv) k.sign(uv, -2.4, 32.7, 2.4, 32.7, 4.2, 4.2 + 4.8 * uv.aspect);
  for (const s of [-1, 1]) k.solid(s * 6.5 - 0.9, 31, s * 6.5 + 0.9, 33, false);
}

/** Notre Dame College: cream three-storey college round a playing field, arcaded corridors, a gabled centre. */
export function notreDame(k, { C, sign }) {
  k.ground(-24, 2, 24, 32, C.field);
  k.ground(-24, 16.8, 24, 17.2, C.line, 0.05);
  k.prism(0, 17, 0.05, 0.06, 5, 5, 14, C.line, { cap: true });
  k.prism(0, 17, 0.06, 0.07, 4.6, 4.6, 14, C.field, { cap: true });
  const h = wing(k, -34, -16, 34, -2, 3, C.wall, { tile: FACADE.PLAIN, trim: C.trim, roof: C.roof });
  for (let fl = 0; fl < 3; fl++) {
    k.arcade(-34, -2, -6, -2, 9, fl * FLOOR + 0.5, fl * FLOOR + FLOOR - 0.5, C.shadow);
    k.arcade(6, -2, 34, -2, 9, fl * FLOOR + 0.5, fl * FLOOR + FLOOR - 0.5, C.shadow);
  }
  // Centre bay rising above the roof with a gable and a tall arched door.
  k.box(-6, 0, -2, 6, h + 3, 1.5, C.wall, { flat: true, faces: 'sew' });
  k.gable(-6.3, -16, 6.3, 1.8, h + 3, 3, C.roof, 'z', C.wall);
  k.arch(-6, 1.5, 6, 1.5, 3.6, 8.4, 0, 6.5, C.shadow);
  k.disc(-6, 1.5, 6, 1.5, 6, h + 0.9, 1.5, C.shadow, { segments: 10 });
  k.solid(-6, -2, 6, 1.5);
  for (const s of [-1, 1]) wing(k, s > 0 ? 26 : -34, -2, s > 0 ? 34 : -26, 22, 3, C.wall, { tile: FACADE.RESIDENTIAL, trim: C.trim, roof: C.roof });
  // Goal posts.
  for (const z of [3.5, 30.5]) {
    k.beam([-3, 0, z], [-3, 2.4, z], 0.14, C.line);
    k.beam([3, 0, z], [3, 2.4, z], 0.14, C.line);
    k.beam([-3, 2.4, z], [3, 2.4, z], 0.14, C.line);
  }
  k.nameBoard(sign('notre-dame'), 0, 35.5, 9);
}

/** Sir Salimullah Medical College (Mitford): old ochre riverside hospital with red tiled roofs + a newer ward block. */
export function ssmc(k, { C, sign }) {
  const f = 4.4;
  k.ground(-36, 8, 36, 36, C.forecourt);
  k.ground(-14, 12, 14, 30, C.lawn, 0.05);
  const h = 2 * f;
  k.box(-32, 0, -8, 32, h, 6, C.wall, { floors: 2, faces: 'nsew' });
  for (let fl = 0; fl < 2; fl++) {
    k.arcade(-32, 6, -7, 6, 7, fl * f + 0.4, fl * f + f - 0.6, C.shadow);
    k.arcade(7, 6, 32, 6, 7, fl * f + 0.4, fl * f + f - 0.6, C.shadow);
  }
  k.frustum(-33, -9, 33, 7, h, h + 3.2, 6, C.tile, { top: C.tileDark });
  // Centre pavilion.
  k.box(-7, 0, 6, 7, h + 1.5, 10, C.wall, { flat: true, faces: 'sew' });
  k.frustum(-7.6, -2, 7.6, 10.6, h + 1.5, h + 5.5, 6.5, C.tile, { top: C.tileDark });
  k.arch(-7, 10, 7, 10, 4.5, 9.5, 0, 5.2, C.shadow);
  for (const t of [1.6, 5.6, 9.6]) k.arch(-7, 10, 7, 10, t, t + 2.8, f + 0.6, h + 0.6, C.shadow);
  k.box(-32.2, f - 0.25, 6, 32.2, f, 6.3, C.trim, { flat: true, faces: 'sewt' });
  k.solid(-32, -8, 32, 6);
  k.solid(-7, 6, 7, 10);
  // Newer six-storey ward block behind.
  wing(k, -30, -34, 30, -14, 6, C.newWall, { tile: FACADE.RESIDENTIAL, trim: C.trim });
  k.box(-30.2, 0, -14, 30.2, 0.9, -13.8, C.band, { flat: true, faces: 's' });
  k.nameBoard(sign('ssmc'), 22, 32, 10);
}
