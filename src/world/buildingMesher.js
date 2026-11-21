// Turns one building spec (from blockgen.js) into geometry inside a GeoBuilder.
// Low-poly Dhaka style: window bays on street sides, blank plaster side walls, ground-floor
// shop shutters with blank signboards above, balconies, a stair room on the roof.
//
// Facade trick: each wall is cut into vertical "bays" (~3 m wide). A bay is one tall quad
// whose texture tile repeats once per floor, so even a 20-floor tower is only a few quads.

import { Rng, hashInts } from '../core/rng.js';
import { FACADE } from '../assets/proceduralTextures.js';
import { hexToLinear, shade } from './geoBuilder.js';
import { SIDE } from './blockgen.js';

/**
 * The four sides of a footprint. (ax,az)->(bx,bz) runs left to right when you look at the
 * wall from outside; (ox,oz) points outward.
 */
function sidesOf(b) {
  return [
    { bit: SIDE.S, ax: b.x0, az: b.z1, bx: b.x1, bz: b.z1, ox: 0, oz: 1 },
    { bit: SIDE.N, ax: b.x1, az: b.z0, bx: b.x0, bz: b.z0, ox: 0, oz: -1 },
    { bit: SIDE.E, ax: b.x1, az: b.z1, bx: b.x1, bz: b.z0, ox: 1, oz: 0 },
    { bit: SIDE.W, ax: b.x0, az: b.z0, bx: b.x0, bz: b.z1, ox: -1, oz: 0 },
  ];
}

/** A box sticking out of a wall (signboards, balconies). t0..t1 = position along the wall. */
function wallBox(gb, s, t0, t1, depth, y0, y1, cBottom, cTop, tile, withBottom) {
  const dx = s.bx - s.ax;
  const dz = s.bz - s.az;
  const lx = s.ax + dx * t0;
  const lz = s.az + dz * t0;
  const rx = s.ax + dx * t1;
  const rz = s.az + dz * t1;
  const ox = s.ox * depth;
  const oz = s.oz * depth;
  gb.wall(lx + ox, lz + oz, rx + ox, rz + oz, y0, y1, cBottom, cTop, tile);          // front
  gb.wall(lx, lz, lx + ox, lz + oz, y0, y1, cBottom, cTop, tile);                    // left end
  gb.wall(rx + ox, rz + oz, rx, rz, y0, y1, cBottom, cTop, tile);                    // right end
  if (withBottom) {
    const x0 = Math.min(lx, rx, lx + ox, rx + ox);
    const x1 = Math.max(lx, rx, lx + ox, rx + ox);
    const z0 = Math.min(lz, rz, lz + oz, rz + oz);
    const z1 = Math.max(lz, rz, lz + oz, rz + oz);
    gb.flat(x0, z0, x1, z1, y0, shade(cBottom, 0.6), FACADE.PLAIN, 0, 1, false, false);
  }
}

/** Fixed 0..1 number per building + wall + purpose (no Rng calls: the city stays the same). */
const hash01 = (b, bit, salt) => (hashInts(b.seed, bit, salt) % 10000) / 10000;

/**
 * Roadmap 2 S1 — more signboards: a board across the first upper floor (coaching centres,
 * doctors' chambers) and big name boards on the roof edge. data/signboards.json → upper, roof.
 */
function extraSigns(gb, b, s, len, cfg, baseY, signs) {
  const S = signs.atlas.cfg;
  const yGround = baseY + cfg.groundFloorHeight;
  const yTop = baseY + b.h;
  const board = (cell, w, y0, y1, depth) => {
    const ta = 0.5 - w / 2, tb = 0.5 + w / 2;
    signs.atlas.face(signs.gb, cell, s.ax + (s.bx - s.ax) * ta, s.az + (s.bz - s.az) * ta,
      s.ax + (s.bx - s.ax) * tb, s.az + (s.bz - s.az) * tb, s.ox, s.oz, depth + 0.015, y0 + 0.05, y1 - 0.05);
    wallBox(gb, s, ta, tb, depth, y0, y1, shade(cell.bgLinear, 0.82), cell.bgLinear, FACADE.PLAIN, true);
  };
  const U = S.upper;
  if (U && !b.balcony && b.floors >= U.minFloors && len > 5 && hash01(b, s.bit, 811) < U.chance) {
    const cell = signs.atlas.pick(b.seed, 200 + s.bit, s.bit);
    const w = U.width[0] + (U.width[1] - U.width[0]) * hash01(b, s.bit, 812);
    if (cell) board(cell, w, yGround + 0.2, yGround + 0.2 + U.height, cfg.signDepth);
  }
  const R = S.roof;
  if (R && b.floors >= R.minFloors && len > 8 && hash01(b, s.bit, 813) < R.chance) {
    const cell = signs.atlas.pick(b.seed, 300 + s.bit, s.bit);
    if (!cell) return;
    const w = R.width[0] + (R.width[1] - R.width[0]) * hash01(b, s.bit, 814);
    const y0 = yTop + R.lift;
    board(cell, w, y0, y0 + R.height, 0.3);
    const post = hexToLinear(R.postColor);
    for (const t of [0.5 - w / 2 + 0.03, 0.5 + w / 2 - 0.05]) wallBox(gb, s, t, t + 0.02, 0.25, yTop, y0, post, post, FACADE.PLAIN, false);
  }
}

/**
 * @param {import('./geoBuilder.js').GeoBuilder} gb
 * @param {object} b         building spec
 * @param {object} cfg       data/world.json → buildings
 * @param {object} palette   the district's palette (for sign colours)
 * @param {number} baseY     ground height under the building (kerb height)
 * @param {object} quality   current quality level (data/quality.json)
 * @param {{gb: GeoBuilder, atlas: import('./signboards.js').SignAtlas}|null} signs
 *        Session 7: where shop-sign faces go (Bangla names); null = blank boards as before
 */
export function meshBuilding(gb, b, cfg, palette, baseY, quality, signs = null) {
  const rng = new Rng(b.seed);
  const wallCol = hexToLinear(b.wall);
  const cBase = shade(wallCol, cfg.baseShade);        // darker at street level (grime)
  const cMid = shade(wallCol, 0.93);
  const yGround = baseY + cfg.groundFloorHeight;
  const yTop = baseY + b.h;
  const upperFloors = b.floors - 1;
  const shutterCol = hexToLinear(b.shutter);
  const doorSide = rng.int(0, 3);
  let balconies = 0;
  // 3D kit building here (src/world/hero/): skip the walls and balconies, keep roof and shop signs.
  const hero = !!b.hero && quality.heroBuildings;

  for (const s of sidesOf(b)) {
    const len = Math.hypot(s.bx - s.ax, s.bz - s.az);
    const isFront = (b.front & s.bit) !== 0;
    if (signs && isFront && !hero) extraSigns(gb, b, s, len, cfg, baseY, signs);
    if (hero && !(b.shop && isFront)) continue;
    if (!isFront && !b.allSides) {
      // Blank side wall: one quad, floor lines only.
      const c = shade(wallCol, cfg.sideWallShade);
      gb.wall(s.ax, s.az, s.bx, s.bz, baseY, yTop, shade(c, cfg.baseShade), c, FACADE.PLAIN, 0, b.floors);
      continue;
    }
    const bays = Math.max(1, Math.round(len / cfg.bayWidth));
    const doorBay = rng.int(0, bays - 1);
    const shopSide = b.shop && isFront;
    const balconySide = !hero && b.balcony && isFront && quality.balconies && upperFloors > 0;
    let signUntil = 0;

    for (let k = 0; k < bays; k++) {
      const t0 = k / bays;
      const t1 = (k + 1) / bays;
      const ax = s.ax + (s.bx - s.ax) * t0;
      const az = s.az + (s.bz - s.az) * t0;
      const bx = s.ax + (s.bx - s.ax) * t1;
      const bz = s.az + (s.bz - s.az) * t1;

      // Ground floor: shutter, door or a normal window bay.
      if (shopSide) {
        if (!hero) gb.wall(ax, az, bx, bz, baseY, yGround, shade(shutterCol, 0.75), shutterCol, FACADE.SHUTTER);
        if (k >= signUntil) {
          // One blank signboard per shop (1-2 bays wide), each shop its own colour.
          const span = Math.min(bays - k, rng.int(1, 2));
          signUntil = k + span;
          let signCol = hexToLinear(rng.pick(palette.signs));
          const pad = 0.12 / len;
          const sy0 = yGround - cfg.signHeight, sy1 = yGround + rng.range(0, 0.35);
          const ta = t0 + pad, tb = (k + span) / bays - pad;
          // Session 7: a Bangla shop name on the board (same Rng calls as before: the city is unchanged).
          const cell = signs?.atlas.pick(b.seed, k, s.bit);
          if (cell) {
            signCol = cell.bgLinear;
            signs.atlas.face(signs.gb, cell, s.ax + (s.bx - s.ax) * ta, s.az + (s.bz - s.az) * ta,
              s.ax + (s.bx - s.ax) * tb, s.az + (s.bz - s.az) * tb, s.ox, s.oz, cfg.signDepth + 0.015, sy0 + 0.04, sy1 - 0.04);
          }
          wallBox(gb, s, ta, tb, cfg.signDepth, sy0, sy1, shade(signCol, 0.82), signCol, FACADE.PLAIN, true);
        }
      } else if (!hero) {
        const tile = isFront && k === doorBay && s.bit === (1 << doorSide) ? FACADE.DOOR : b.style;
        gb.wall(ax, az, bx, bz, baseY, yGround, cBase, cMid, tile);
      }
      // Upper floors: one tall quad, the tile repeats once per floor.
      if (upperFloors > 0 && !hero) gb.wall(ax, az, bx, bz, yGround, yTop, cMid, wallCol, b.style, 0, upperFloors);

      // A column of balconies on some bays.
      if (balconySide && balconies < cfg.balcony.maxPerBuilding && rng.chance(0.45)) {
        const bc = hexToLinear(b.balcony);
        const half = (1 - cfg.balcony.widthRatio) / 2 / bays;
        for (let f = 1; f <= upperFloors && balconies < cfg.balcony.maxPerBuilding; f++) {
          const y = yGround + (f - 1) * cfg.floorHeight - 0.05;
          wallBox(gb, s, t0 + half, t1 - half, cfg.balcony.depth, y, y + cfg.balcony.height, shade(bc, 0.8), bc, FACADE.RAIL, true);
          balconies++;
        }
      }
    }
  }

  // Roof slab.
  const roofCol = hexToLinear(cfg.roofColor);
  gb.flat(b.x0, b.z0, b.x1, b.z1, yTop, roofCol, FACADE.PLAIN, 0, Math.max(1, Math.round((b.z1 - b.z0) / 4)));

  // Stair room ("chilekotha") on the roof — gives Dhaka its bumpy skyline.
  const sr = cfg.stairRoom;
  const w = rng.range(sr.size[0], sr.size[1]);
  const d = rng.range(sr.size[0], sr.size[1]);
  if (rng.chance(sr.chance) && b.x1 - b.x0 > w + 2 && b.z1 - b.z0 > d + 2) {
    const sx = rng.chance(0.5) ? b.x0 + 0.4 : b.x1 - w - 0.4;
    const sz = rng.chance(0.5) ? b.z0 + 0.4 : b.z1 - d - 0.4;
    const c = shade(wallCol, 0.88);
    gb.box(sx, yTop, sz, sx + w, yTop + sr.height, sz + d, shade(c, 0.85), c, FACADE.PLAIN, 'nswe');
    gb.flat(sx, sz, sx + w, sz + d, yTop + sr.height, roofCol, FACADE.PLAIN);
  }
}
