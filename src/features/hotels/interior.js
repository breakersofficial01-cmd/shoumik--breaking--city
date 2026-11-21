// The inside of one hotel's ground floor (Roadmap 2 S4): lobby with a reception desk and sofas,
// the restaurant (tables + chairs, kitchen door, serving counter) and — in hotels with `bar` —
// a bar counter with stools and a dance lounge with a glowing floor and a DJ booth.
//
// Built with the landmark Kit (src/world/landmarks/kit.js) in the hotel's LOCAL space
// (+z = the front door, room x −30…30, z −32…16 = HOTEL_SHELL) into three geometries:
// lit (indoor material: lit by the room itself, so it looks the same by day and by night),
// glow (neon, chandeliers, dance floor) and sign (the hotel name board over the lobby arch).
// Colliders (desk, sofas, tables, partitions, bar) are added once to world.collision.
//
// Returns the places the feature needs, all in WORLD metres:
//   tables  [{ x, z, chairs: [{ x, z, heading }], lane: { z }, corner: { x, z } }]
//   stools  [{ x, z, heading, server: { x, z } }]   (bar seats; served across the counter)
//   kitchen { x, z, heading }   reception { x, z, heading }   barServer { x, z, heading }
//   dance   { x0, z0, x1, z1 } (local rectangle) + danceSpots [{ x, z, heading }]
//   toLocal(x, z) / toWorld(x, z) helpers and `room` (local inside rectangle).

import { Kit } from '../../world/landmarks/kit.js';
import { GeoBuilder } from '../../world/geoBuilder.js';
import { HOTEL_SHELL } from '../../world/landmarks/hotels.js';

const S = HOTEL_SHELL;

/** Draw a vertical panel facing `towards` (a local [x, z] point on the side that should see it). */
function face(k, ax, az, bx, bz, y0, y1, hex, towards, o = {}) {
  k.quad([ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az], hex, { inside: [2 * (ax + bx) / 2 - towards[0], (y0 + y1) / 2, 2 * (az + bz) / 2 - towards[1]], glow: o.glow });
}

/** A wall seen from both sides (partitions). */
function panel(k, ax, az, bx, bz, y0, y1, hex) {
  const mx = (ax + bx) / 2, mz = (az + bz) / 2;
  const nx = -(bz - az), nz = bx - ax; // a normal
  const l = Math.hypot(nx, nz) || 1;
  face(k, ax, az, bx, bz, y0, y1, hex, [mx + (nx / l) * 3, mz + (nz / l) * 3]);
  face(k, ax, az, bx, bz, y0, y1, hex, [mx - (nx / l) * 3, mz - (nz / l) * 3]);
}

/** Floor rectangle seen from above. */
function floor(k, x0, z0, x1, z1, hex, y = 0.02, glow = false) {
  k.quad([x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0], hex, { glow, inside: [(x0 + x1) / 2, y - 1, (z0 + z1) / 2] });
}

function chandelier(k, x, z, ceil, C) {
  k.prism(x, z, ceil - 1.2, ceil, 0.03, 0.03, 4, C.wall2);
  k.prism(x, z, ceil - 1.6, ceil - 1.2, 0.55, 0.25, 8, C.accent, { cap: true });
  k.box(x - 0.12, ceil - 1.8, z - 0.12, x + 0.12, ceil - 1.6, z + 0.12, C.lamp, { glow: true, faces: 'nsewb' });
}

function plant(k, x, z, C, solid = true) {
  k.prism(x, z, 0, 0.6, 0.38, 0.3, 8, C.pot, { cap: true });
  k.prism(x, z, 0.6, 1.9, 0.5, 0.04, 6, C.plant);
  if (solid) k.solid(x - 0.4, z - 0.4, x + 0.4, z + 0.4, false);
}

function table(k, x, z, T, C) {
  const h = T.height, s = T.size / 2;
  k.box(x - s, h - 0.05, z - s, x + s, h, z + s, C.cloth, { flat: true, faces: 'nsewtb' });
  k.prism(x, z, 0, h - 0.05, 0.08, 0.06, 6, C.wood);
  k.prism(x, z, 0, 0.04, 0.35, 0.35, 8, C.wood, { cap: true });
  k.prism(x, z, h, h + 0.07, 0.035, 0.03, 6, C.lamp, { cap: true }); // a little candle lamp
  k.solid(x - s + 0.05, z - s + 0.05, x + s - 0.05, z + s - 0.05, false);
}

/** Chair at (x, z) facing `dir` (local unit vector towards the table). */
function chair(k, x, z, dx, dz, C) {
  k.box(x - 0.24, 0.43, z - 0.24, x + 0.24, 0.49, z + 0.24, C.chair, { flat: true, faces: 'nsewt' });
  for (const [ox, oz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) k.prism(x + ox, z + oz, 0, 0.43, 0.025, 0.025, 4, C.wood);
  const bx = x - dx * 0.24, bz = z - dz * 0.24; // the back is on the far side from the table
  const px = dz * 0.24, pz = -dx * 0.24;
  k.quad([bx - px, 0.49, bz - pz], [bx + px, 0.49, bz + pz], [bx + px, 1.0, bz + pz], [bx - px, 1.0, bz - pz], C.chair, { inside: [x, 0.7, z] });
  k.quad([bx + px, 0.49, bz + pz], [bx - px, 0.49, bz - pz], [bx - px, 1.0, bz - pz], [bx + px, 1.0, bz + pz], C.wood, { inside: [bx - dx, 0.7, bz - dz] });
}

/**
 * @param {object} site   world.landmarks site of the hotel ({ cx, cz, y, angle })
 * @param {object} hotel  data/hotels.json → hotels[i]
 * @param {object} cfg    data/hotels.json
 * @param {object|null} signUv  name-board uv in the landmark sign atlas
 */
export function buildInterior(site, hotel, cfg, signUv) {
  const b = { lit: new GeoBuilder(), glow: new GeoBuilder(), sign: new GeoBuilder() };
  const k = new Kit(b, site);
  const C = hotel.colors;
  const R = cfg.room, T = cfg.table;
  const ceil = R.ceiling;
  const x0 = S.x0 + S.wall, x1 = S.x1 - S.wall, z0 = S.z0 + S.wall, z1 = S.z1 - S.wall;
  const bar = hotel.bar || null;
  const restX1 = bar ? bar.x0 : x1;
  const LZ = R.lobbyWall, LO = R.lobbyOpening;

  // ---- shell: floors, inner walls, ceiling, a lit cornice
  floor(k, x0, LZ, x1, z1, C.lobbyFloor);
  const tile = 4;
  for (let x = x0; x < restX1 - 0.01; x += tile) {
    for (let z = z0; z < LZ - 0.01; z += tile) floor(k, x, z, Math.min(x + tile, restX1), Math.min(z + tile, LZ), (Math.round((x - x0) / tile) + Math.round((z - z0) / tile)) % 2 ? C.floor : C.floor2);
  }
  const centre = [0, -8];
  const inner = (ax, az, bx, bz) => {
    face(k, ax, az, bx, bz, 0, 1.2, C.wall2, centre);
    face(k, ax, az, bx, bz, 1.2, ceil, C.wall, centre);
    face(k, ax, az, bx, bz, ceil - 0.35, ceil - 0.2, C.accent, centre, { glow: true });
  };
  inner(x0, z0, x1, z0);
  inner(x0, z0, x0, z1);
  inner(x1, z0, x1, z1);
  inner(x0, z1, -S.door, z1);
  inner(S.door, z1, x1, z1);
  face(k, -S.door, z1, S.door, z1, cfg.doors.height, ceil, C.wall, centre);
  k.quad([x0, ceil, z0], [x1, ceil, z0], [x1, ceil, z1], [x0, ceil, z1], C.ceiling, { inside: [0, ceil + 1, -8] });

  // ---- lobby: partition with a wide arch, reception desk, sofas, plants, chandeliers
  panel(k, x0, LZ, -LO, LZ, 0, ceil, C.wall);
  panel(k, LO, LZ, x1, LZ, 0, ceil, C.wall);
  panel(k, -LO, LZ, LO, LZ, 4.4, ceil, C.wall);
  k.solid(x0, LZ - 0.2, -LO, LZ + 0.2);
  k.solid(LO, LZ - 0.2, x1, LZ + 0.2);
  for (const s of [-1, 1]) k.box(s * LO - 0.3, 0, LZ - 0.3, s * LO + 0.3, 4.4, LZ + 0.3, C.wall2, { flat: true, faces: 'nsew' });
  k.box(-LO, 4.25, LZ + 0.2, LO, 4.4, LZ + 0.32, C.accent, { flat: true, faces: 'sb' });
  if (signUv) {
    const w = 9, h = w * signUv.aspect;
    k.box(-w / 2 - 0.2, 4.55, LZ + 0.2, w / 2 + 0.2, 4.75 + h, LZ + 0.3, C.desk, { flat: true, faces: 's' });
    k.sign(signUv, -w / 2, LZ + 0.3, w / 2, LZ + 0.3, 4.65, 4.65 + h, 0.02);
  }
  // Reception desk on the left, the receptionist stands behind it.
  k.box(-24, 0, 8.6, -13, 1.1, 9.8, C.desk, { flat: true, faces: 'nsewt', top: C.wood });
  k.box(-24.05, 0.15, 9.8, -12.95, 0.3, 9.86, C.accent, { glow: true, faces: 's' });
  k.solid(-24, 8.6, -13, 9.8);
  // Lounge on the right: two sofas facing a low table, plants in the corners.
  for (const [sz, dir] of [[7.2, 1], [12.4, -1]]) {
    k.box(15, 0, sz - 0.5, 24, 0.45, sz + 0.5, C.sofa, { flat: true, faces: 'nsewt' });
    const bz = sz - dir * 0.5;
    k.box(15, 0.45, Math.min(bz, bz - dir * 0.25), 24, 1.05, Math.max(bz, bz - dir * 0.25), C.sofa, { flat: true, faces: 'nsewt' });
    k.solid(15, sz - 0.55, 24, sz + 0.55, false);
  }
  k.box(17, 0, 9, 22, 0.4, 10.6, C.wood, { flat: true, faces: 'nsewt' });
  k.solid(17, 9, 22, 10.6, false);
  for (const [px, pz] of [[x0 + 1, z1 - 1], [x1 - 1, z1 - 1], [x0 + 1, LZ + 1], [x1 - 1, LZ + 1], [-S.door - 2, z1 - 1.2], [S.door + 2, z1 - 1.2]]) plant(k, px, pz, C);
  for (const x of [-18, 0, 18]) chandelier(k, x, 10, ceil, C);

  // ---- restaurant: tables in a grid, kitchen door + serving counter on the back wall
  const tables = [];
  for (const tz of hotel.tables.zs) {
    for (const tx of hotel.tables.xs) {
      if (tx + T.size / 2 + T.chairDistance > restX1 - 0.3) continue;
      table(k, tx, tz, T, C);
      const chairs = [];
      for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const cx = tx + dx * T.chairDistance, cz = tz + dz * T.chairDistance;
        chair(k, cx, cz, -dx, -dz, C);
        chairs.push({ lx: cx, lz: cz, lh: Math.atan2(-dx, -dz) });
      }
      tables.push({ lx: tx, lz: tz, chairs });
    }
  }
  for (const tz of hotel.tables.zs) for (let x = -20; x < restX1 - 2; x += 16) chandelier(k, x, tz, ceil, C);
  const kx = hotel.kitchen.x;
  k.box(kx - 1.1, 0, z0, kx + 1.1, 2.6, z0 + 0.08, C.wood, { flat: true, faces: 's' });
  k.disc(kx - 1.1, z0 + 0.09, kx + 1.1, z0 + 0.09, 1.1, 1.9, 0.28, C.lamp, { glow: true, depth: 0.01 });
  k.box(kx - 1.3, 2.6, z0, kx + 1.3, 2.9, z0 + 0.15, C.accent, { glow: true, faces: 'sb' });
  // Serving counter (hot plates glow) next to the kitchen.
  k.box(kx + 3, 0, z0, kx + 13, 1.0, z0 + 1.2, C.desk, { flat: true, faces: 'sewt', top: C.wood });
  for (let x = kx + 3.6; x < kx + 12.5; x += 1.6) k.box(x, 1.0, z0 + 0.3, x + 1.2, 1.08, z0 + 0.9, '#ff9a4a', { glow: true, faces: 'nsewt' });
  k.solid(kx + 3, z0, kx + 13, z0 + 1.2);
  // Paintings on the side wall.
  for (let z = z0 + 5; z < LZ - 3; z += 8) {
    k.box(x0, 2.2, z - 1.2, x0 + 0.06, 3.8, z + 1.2, C.wood, { flat: true, faces: 'e' });
    k.box(x0 + 0.06, 2.35, z - 1.05, x0 + 0.08, 3.65, z + 1.05, [C.accent, C.sofa, C.plant][Math.abs(Math.round(z)) % 3], { flat: true, faces: 'e' });
  }

  // ---- bar + dance lounge
  let stools = [], barServer = null, dance = null, danceSpots = [];
  if (bar) {
    const BC = cfg.barCounter;
    const bx0 = bar.x0, bx1 = x1;
    panel(k, bx0, z0, bx0, R.barWallOpening[0], 0, ceil, C.wall2);
    panel(k, bx0, R.barWallOpening[1], bx0, LZ, 0, ceil, C.wall2);
    panel(k, bx0, R.barWallOpening[0], bx0, R.barWallOpening[1], 4.4, ceil, C.wall2);
    k.solid(bx0 - 0.2, z0, bx0 + 0.2, R.barWallOpening[0]);
    k.solid(bx0 - 0.2, R.barWallOpening[1], bx0 + 0.2, LZ);
    floor(k, bx0, z0, bx1, LZ, '#16121f');
    // Counter + back shelf with glowing bottles of juice and soft drinks.
    const cx0 = bx0 + 3, cx1 = bx1 - 2.5;
    k.box(cx0, 0, BC.z0, cx1, BC.height, BC.z1, C.desk, { flat: true, faces: 'nsewt', top: C.wood });
    k.box(cx0 - 0.02, 0.2, BC.z1, cx1 + 0.02, 0.32, BC.z1 + 0.04, C.accent2, { glow: true, faces: 's' });
    k.solid(cx0, BC.z0, cx1, BC.z1);
    k.box(cx0, 0, z0, cx1, 2.6, z0 + 0.5, C.wall2, { flat: true, faces: 'st' });
    const bottle = ['#36e6ff', '#ff4fb0', '#f7c21e', '#7dff9b', '#f7931e'];
    for (let row = 0; row < 3; row++) for (let x = cx0 + 0.3, i = 0; x < cx1 - 0.2; x += 0.45, i++) {
      k.box(x, 1.2 + row * 0.5, z0 + 0.15, x + 0.12, 1.5 + row * 0.5, z0 + 0.3, bottle[(i + row) % bottle.length], { glow: true, faces: 'set' });
    }
    for (let x = cx0 + 1; x <= cx1 - 0.8; x += BC.stoolGap) {
      k.prism(x, BC.stoolZ, 0, 0.72, 0.05, 0.05, 6, C.wood);
      k.prism(x, BC.stoolZ, 0.72, 0.78, 0.24, 0.24, 10, C.chair, { cap: true });
      stools.push({ lx: x, lz: BC.stoolZ, lh: Math.PI, sx: x, sz: BC.serverZ });
    }
    barServer = { lx: (cx0 + cx1) / 2, lz: BC.serverZ, lh: 0 };
    // Dance floor of glowing tiles, neon strips above it, a DJ booth with speakers.
    const D = BC.floor;
    dance = { ...D };
    for (let x = D.x0, i = 0; x < D.x1 - 0.01; x += 1.5, i++) {
      for (let z = D.z0, j = 0; z < D.z1 - 0.01; z += 1.5, j++) {
        const lit = (i + j) % 2 === 0;
        floor(k, x + 0.05, z + 0.05, Math.min(x + 1.45, D.x1), Math.min(z + 1.45, D.z1), lit ? ((i + 2 * j) % 3 ? C.accent : C.accent2) : '#241c38', 0.03, lit);
      }
    }
    for (let z = D.z0; z <= D.z1; z += 4) k.box(D.x0, ceil - 0.25, z - 0.08, D.x1, ceil - 0.1, z + 0.08, z % 8 ? C.accent2 : C.accent, { glow: true, faces: 'nsewb' });
    k.box(bx1 - 2.2, 0, -14, bx1, 1.2, -8, C.desk, { flat: true, faces: 'nswt' });
    k.box(bx1 - 2.25, 0.3, -14, bx1 - 2.2, 0.5, -8, C.accent, { glow: true, faces: 'w' });
    for (const z of [-16.5, -5.5]) k.box(bx1 - 1.4, 0, z - 0.7, bx1, 2.2, z + 0.7, '#1a1a22', { flat: true, faces: 'nswt' });
    k.solid(bx1 - 2.2, -17.2, bx1, -4.8);
    for (let i = 0; i < cfg.barCounter.dancers; i++) {
      const u = (i % 4 + 0.5) / 4, v = (Math.floor(i / 4) + 0.5) / Math.ceil(cfg.barCounter.dancers / 4);
      danceSpots.push({ lx: D.x0 + 1.2 + u * (D.x1 - D.x0 - 2.4) + ((i * 37) % 7) * 0.12, lz: D.z0 + 1.5 + v * (D.z1 - D.z0 - 3), lh: (i * 2.39) % (Math.PI * 2) });
    }
  }

  // ---- local → world for everything the feature needs
  const cs = Math.cos(site.angle), sn = Math.sin(site.angle);
  const toWorld = (x, z) => ({ x: site.cx + x * cs + z * sn, z: site.cz - x * sn + z * cs });
  const toLocal = (x, z) => { const dx = x - site.cx, dz = z - site.cz; return { x: dx * cs - dz * sn, z: dx * sn + dz * cs }; };
  const W = (p) => ({ ...p, ...toWorld(p.lx, p.lz), heading: (p.lh ?? 0) + site.angle });
  const out = {
    builders: b, colliders: k.colliders,
    tables: tables.map((t) => ({
      ...W(t), chairs: t.chairs.map(W),
      lane: { ...toWorld(t.lx, t.lz + cfg.waiter.laneOffset) },
    })),
    stools: stools.map((s) => ({ ...W(s), server: toWorld(s.sx, s.sz) })),
    kitchen: W({ lx: kx, lz: z0 + 1.2, lh: 0 }),
    reception: W({ lx: -18.5, lz: 7.6, lh: 0 }),
    barServer: barServer ? W(barServer) : null,
    dance, danceSpots: danceSpots.map(W),
    room: { x0, z0, x1, z1 }, lobbyZ: LZ, toWorld, toLocal,
  };
  return out;
}
