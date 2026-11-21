// Roadmap 2 S4: the three big hotels — Breaking Hotel (glass neon tower, Gulshan),
// Shoumik's Culinary (cream and gold, Hatirjheel) and Bengali Heritage (red brick with white
// arches, Old Dhaka). One builder, three styles (data/landmarks.json → types.<type>.style).
//
// Local space like every landmark: +z = front, plot −38…38. The GROUND FLOOR is a real,
// hollow room: the podium walls are thin colliders with a door gap in the middle of the front,
// so Shoumik can walk in. What is inside (lobby, restaurant, bar, people, food) is built by the
// hotels feature (src/features/hotels/) when its streamed files are ready; the sliding glass
// doors are part of that feature too (they stay shut until the inside is ready).
//
// The shell numbers are shared with the feature: HOTEL_SHELL (do not change one without the other).

import { FACADE } from '../../assets/proceduralTextures.js';

/** The ground-floor room every hotel has (local metres). Read by src/features/hotels/. */
export const HOTEL_SHELL = { x0: -30, x1: 30, z0: -32, z1: 16, height: 7, wall: 0.5, door: 2.6 };

const TOWER = { x0: -22, x1: 22, z0: -28, z1: 6 };
const FLOOR_H = 3.4;

function podium(k, C) {
  const { x0, x1, z0, z1, height: H, wall, door } = HOTEL_SHELL;
  const tile = C.style === 'glass' ? FACADE.GLASS : C.style === 'heritage' ? FACADE.OLD : FACADE.OFFICE;
  // Back and sides: one box without its front; the front is cut around the door.
  k.box(x0, 0, z0, x1, H, z1, C.wall, { faces: 'newt', tile, floors: 2, top: C.roof, bay: 4 });
  k.facade(x0, z1, -door - 3, z1, 0, H, C.wall, tile, 2, 4);
  k.facade(door + 3, z1, x1, z1, 0, H, C.wall, tile, 2, 4);
  k.wall(-door - 3, z1, -door, z1, 0, H, C.trim);
  k.wall(door, z1, door + 3, z1, 0, H, C.trim);
  k.wall(-door, z1, door, z1, 4.2, H, C.trim);
  // Door jambs and lintel (the wall's thickness, seen while walking through).
  k.quad([-door, 0, z1], [-door, 0, z1 - wall], [-door, 4.2, z1 - wall], [-door, 4.2, z1], C.trim, { inside: [-door - 1, 2, z1 - 0.25] });
  k.quad([door, 0, z1 - wall], [door, 0, z1], [door, 4.2, z1], [door, 4.2, z1 - wall], C.trim, { inside: [door + 1, 2, z1 - 0.25] });
  k.quad([-door, 4.2, z1], [door, 4.2, z1], [door, 4.2, z1 - wall], [-door, 4.2, z1 - wall], C.trim, { inside: [0, 5, z1 - 0.25] });
  // Colliders: four thin walls, gap in the front.
  k.solid(x0, z0, x1, z0 + wall);
  k.solid(x0, z0, x0 + wall, z1);
  k.solid(x1 - wall, z0, x1, z1);
  k.solid(x0, z1 - wall, -door, z1);
  k.solid(door, z1 - wall, x1, z1);
  // A glowing band along the top of the podium.
  k.box(x0 - 0.08, H - 0.5, z0 - 0.08, x1 + 0.08, H - 0.2, z1 + 0.08, C.neonA, { glow: true, faces: 'nsew' });
}

function canopy(k, C) {
  const z1 = HOTEL_SHELL.z1;
  k.box(-9, 4.6, z1, 9, 5.1, z1 + 7, C.canopy, { flat: true, faces: 'nsewt' });
  k.box(-9, 4.45, z1, 9, 4.6, z1 + 7, C.door, { glow: true, faces: 'b' });
  k.box(-9.05, 4.6, z1 + 6.95, 9.05, 5.1, z1 + 7.05, C.neonB, { glow: true, faces: 's' });
  for (const s of [-1, 1]) k.prism(s * 8.4, z1 + 6.4, 0, 4.6, 0.22, 0.22, 8, C.trim);
  // Red carpet and steps.
  k.ground(-2.4, z1, 2.4, z1 + 9, '#9a1a24', 0.05);
  k.steps(-6, 6, z1 + 7.6, z1 + 6.2, 0.25, 2, C.step);
  // A row of short posts: people walk between them, cars cannot drive in through the door.
  for (let x = -12; x <= 12.01; x += 1.9) {
    k.prism(x, z1 + 9.2, 0, 0.9, 0.13, 0.11, 6, C.trim, { cap: true });
    k.solid(x - 0.15, z1 + 9.05, x + 0.15, z1 + 9.35, false);
  }
  for (const s of [-1, 1]) k.solid(s * 8.4 - 0.25, z1 + 6.15, s * 8.4 + 0.25, z1 + 6.65, false);
}

function forecourt(k, C, sign, site) {
  const z1 = HOTEL_SHELL.z1;
  k.ground(-36, z1, 36, 36, C.forecourt);
  // Plants in big pots along the front, lamps at the edge.
  for (const x of [-26, -18, 18, 26]) {
    k.prism(x, z1 + 3, 0, 0.8, 0.7, 0.55, 8, C.pot, { cap: true });
    k.prism(x, z1 + 3, 0.8, 2.6, 0.75, 0.05, 6, C.plant);
    k.solid(x - 0.7, z1 + 2.3, x + 0.7, z1 + 3.7, false);
  }
  for (const x of [-32, -12, 12, 32]) k.lamp(x, 33, 5, C.trim, C.lamp);
  const uv = sign(site.id);
  if (uv) k.nameBoard(uv, 22, 32, 9, C.signBack);
}

/** The tall part above the podium, by style. */
function tower(k, C, sign, site) {
  const H = HOTEL_SHELL.height;
  const { x0, x1, z0, z1 } = TOWER;
  const floors = C.towerFloors, top = H + floors * FLOOR_H;
  const uv = sign(site.id);
  if (C.style === 'glass') {
    k.box(x0, H, z0, x1, top, z1, C.glass, { tile: FACADE.GLASS, floors, top: C.roof });
    for (let f = 2; f < floors; f += 3) k.box(x0 - 0.06, H + f * FLOOR_H - 0.1, z0 - 0.06, x1 + 0.06, H + f * FLOOR_H + 0.1, z1 + 0.06, f % 2 ? C.neonA : C.neonB, { glow: true, faces: 'nsew' });
    for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) k.box(x - 0.35, H, z - 0.35, x + 0.35, top + 1, z + 0.35, C.neonB, { glow: true });
    // Slanted crown with a beacon mast.
    k.quad([x0, top, z0], [x0, top, z1], [x1, top + 8, z1], [x1, top + 8, z0], C.trim, { inside: [x0, top - 8, z0] });
    k.quad([x1, top, z0], [x1, top, z1], [x1, top + 8, z1], [x1, top + 8, z0], C.glass, { inside: [x0, top, z0] });
    k.tri([x0, top, z0], [x1, top, z0], [x1, top + 8, z0], C.glass, { inside: [x0, top, z1] });
    k.tri([x0, top, z1], [x1, top, z1], [x1, top + 8, z1], C.glass, { inside: [x0, top, z0] });
    k.prism(x1 - 3, (z0 + z1) / 2, top + 8, top + 20, 0.3, 0.08, 4, C.trim);
    k.box(x1 - 3.4, top + 20, (z0 + z1) / 2 - 0.4, x1 - 2.6, top + 20.8, (z0 + z1) / 2 + 0.4, C.beacon, { glow: true, faces: 'nsewtb' });
  } else if (C.style === 'grand') {
    k.box(x0, H, z0, x1, top, z1, C.wall, { tile: FACADE.OFFICE, floors, top: C.roof, bay: 3.6 });
    for (const x of [x0 + 7, -3.5, 3.5, x1 - 7]) k.box(x - 0.45, H, z1, x + 0.45, top, z1 + 0.5, C.trim, { flat: true, faces: 'sewt' });
    k.box(x0 - 0.3, top, z0 - 0.3, x1 + 0.3, top + 1.2, z1 + 0.3, C.trim, { flat: true, faces: 'nsewt' });
    // Golden crown: a stepped top with a lit rim.
    k.frustum(x0 + 6, z0 + 6, x1 - 6, z1 - 6, top + 1.2, top + 7, 5, C.trim, { top: C.roof });
    k.box(x0 + 5.9, top + 1.2, z0 + 5.9, x1 - 5.9, top + 1.6, z1 - 5.9, C.neonA, { glow: true, faces: 'nsew' });
    k.prism(0, (z0 + z1) / 2, top + 7, top + 16, 0.35, 0.05, 6, C.trim);
  } else {
    // Heritage: red brick block with white arches on every floor and domed corner kiosks.
    k.box(x0, H, z0, x1, top, z1, C.wall, { flat: true, top: C.roof });
    for (let f = 0; f < floors; f++) {
      const y0 = H + f * FLOOR_H + 0.5, y1 = H + (f + 1) * FLOOR_H - 0.3;
      k.arcade(x0, z1, x1, z1, 11, y0, y1, C.glass, { pointed: true });
      k.arcade(x1, z0, x0, z0, 11, y0, y1, C.glass, { pointed: true });
      k.arcade(x1, z1, x1, z0, 8, y0, y1, C.glass, { pointed: true });
      k.arcade(x0, z0, x0, z1, 8, y0, y1, C.glass, { pointed: true });
      k.box(x0 - 0.15, H + (f + 1) * FLOOR_H - 0.25, z0 - 0.15, x1 + 0.15, H + (f + 1) * FLOOR_H, z1 + 0.15, C.trim, { flat: true, faces: 'nsew' });
    }
    k.box(x0 - 0.4, top, z0 - 0.4, x1 + 0.4, top + 1, z1 + 0.4, C.trim, { flat: true, faces: 'nsewt' });
    for (const [x, z] of [[x0 + 2, z0 + 2], [x1 - 2, z0 + 2], [x0 + 2, z1 - 2], [x1 - 2, z1 - 2]]) {
      k.columns(x - 1.4, z, x + 1.4, z, 2, top + 1, top + 4, 0.22, C.dome);
      k.prism(x, z, top + 4, top + 4.4, 2, 2, 8, C.dome);
      k.dome(x, z, top + 4.4, 1.8, 2.2, 8, 3, C.dome);
    }
    k.dome(0, (z0 + z1) / 2, top + 1, 6, 6, 12, 4, C.dome);
    // Arches on the podium front, either side of the door.
    k.arcade(HOTEL_SHELL.x0, HOTEL_SHELL.z1, -HOTEL_SHELL.door - 3, HOTEL_SHELL.z1, 5, 0.6, 4, C.glass, { pointed: true });
    k.arcade(HOTEL_SHELL.door + 3, HOTEL_SHELL.z1, HOTEL_SHELL.x1, HOTEL_SHELL.z1, 5, 0.6, 4, C.glass, { pointed: true });
  }
  // The name: big board on the podium front above the canopy, smaller on the tower top.
  if (uv) {
    const w = 26, sh = w * uv.aspect, z = HOTEL_SHELL.z1;
    k.box(-w / 2 - 0.4, 5.25, z, w / 2 + 0.4, 5.25 + sh + 0.5, z + 0.4, C.signBack, { flat: true, faces: 'sewtb' });
    k.sign(uv, -w / 2, z + 0.4, w / 2, z + 0.4, 5.5, 5.5 + sh);
    const wt = 30, ht = wt * uv.aspect;
    k.sign(uv, -wt / 2, z1, wt / 2, z1, top - ht - 1.5, top - 1.5, 0.15);
    k.sign(uv, wt / 2, z0, -wt / 2, z0, top - ht - 1.5, top - 1.5, 0.15);
  }
}

/** Builder used for breakingHotel, shoumikCulinary and bengaliHeritage (data/landmarks.json). */
export function hotel(k, { C, sign, site }) {
  podium(k, C);
  canopy(k, C);
  forecourt(k, C, sign, site);
  tower(k, C, sign, site);
}
