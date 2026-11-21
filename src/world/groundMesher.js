// Ground geometry for one layout piece: road surfaces with painted markings, zebra
// crossings, raised sidewalks with kerbs, lanes, plot ground, park grass — plus the
// edges: lake/river railings with embankment walls, and the wall around the city limits.

import { GROUND } from '../assets/proceduralTextures.js';
import { hexToLinear, shade } from './geoBuilder.js';
import { KIND, isRaised } from './layout.js';

const ROAD_TINT = [0.96, 0.96, 0.96];
const WALK_TINT = [0.97, 0.95, 0.92];

/** Left→right ends of each piece edge as seen from OUTSIDE the piece (see GeoBuilder.wall). */
function edgesOf(p) {
  const x0 = p.x, z0 = p.z, x1 = p.x + p.w, z1 = p.z + p.d;
  return [
    { di: 0, dj: -1, ax: x1, az: z0, bx: x0, bz: z0 }, // north
    { di: 0, dj: 1, ax: x0, az: z1, bx: x1, bz: z1 },  // south
    { di: -1, dj: 0, ax: x0, az: z0, bx: x0, bz: z1 }, // west
    { di: 1, dj: 0, ax: x1, az: z1, bx: x1, bz: z0 },  // east
  ];
}

/** A low wall just inside a piece edge (railings and the city-limit wall). */
function edgeWall(gb, e, thickness, y0, y1, col) {
  const ix = -e.di * thickness; // inward offset
  const iz = -e.dj * thickness;
  const dark = shade(col, 0.8);
  gb.wall(e.ax, e.az, e.bx, e.bz, y0, y1, dark, col, GROUND.PLAZA);                       // outer face
  gb.wall(e.bx + ix, e.bz + iz, e.ax + ix, e.az + iz, y0, y1, dark, col, GROUND.PLAZA);   // inner face
  gb.flat(Math.min(e.ax, e.bx, e.ax + ix), Math.min(e.az, e.bz, e.az + iz),
    Math.max(e.ax, e.bx, e.ax + ix), Math.max(e.az, e.bz, e.az + iz), y1, col, GROUND.PLAZA);
}

function meshRoad(gb, layout, p) {
  const zl = layout.world.grid.zebraLength;
  const x0 = p.x, z0 = p.z, x1 = p.x + p.w, z1 = p.z + p.d;
  if (p.kind === KIND.CROSSING) {
    gb.flat(x0, z0, x1, z1, 0, ROAD_TINT, GROUND.ASPHALT);
    return;
  }
  if (p.kind === KIND.ROAD_NS) {
    const reps = Math.max(1, Math.round((p.d - 2 * zl) / p.w));
    gb.flat(x0, z0, x1, z0 + zl, 0, ROAD_TINT, GROUND.ZEBRA, 1, 0);
    gb.flat(x0, z0 + zl, x1, z1 - zl, 0, ROAD_TINT, GROUND.ROAD, 0, reps);
    gb.flat(x0, z1 - zl, x1, z1, 0, ROAD_TINT, GROUND.ZEBRA, 0, 1);
  } else {
    const reps = Math.max(1, Math.round((p.w - 2 * zl) / p.d));
    gb.flat(x0, z0, x0 + zl, z1, 0, ROAD_TINT, GROUND.ZEBRA, 1, 0, true);
    gb.flat(x0 + zl, z0, x1 - zl, z1, 0, ROAD_TINT, GROUND.ROAD, 0, reps, true);
    gb.flat(x1 - zl, z0, x1, z1, 0, ROAD_TINT, GROUND.ZEBRA, 0, 1, true);
  }
}

function meshBlock(gb, layout, p) {
  const g = layout.world.grid;
  const gr = layout.world.ground;
  const sw = g.sidewalkWidth;
  const y = p.y;
  const x0 = p.x, z0 = p.z, x1 = p.x + p.w, z1 = p.z + p.d;
  const tile = gr.sidewalkTileMetres;
  // Sidewalk ring.
  gb.flat(x0, z0, x1, z0 + sw, y, WALK_TINT, GROUND.SIDEWALK, 0, Math.round(p.w / tile), true);
  gb.flat(x0, z1 - sw, x1, z1, y, WALK_TINT, GROUND.SIDEWALK, 0, Math.round(p.w / tile), true);
  gb.flat(x0, z0 + sw, x0 + sw, z1 - sw, y, WALK_TINT, GROUND.SIDEWALK, 0, Math.round((p.d - 2 * sw) / tile));
  gb.flat(x1 - sw, z0 + sw, x1, z1 - sw, y, WALK_TINT, GROUND.SIDEWALK, 0, Math.round((p.d - 2 * sw) / tile));
  // Inside: lanes and plots.
  for (const t of p.content.patches) {
    if (t.lane) {
      const len = t.alongX ? t.x1 - t.x0 : t.z1 - t.z0;
      const wid = t.alongX ? t.z1 - t.z0 : t.x1 - t.x0;
      gb.flat(t.x0, t.z0, t.x1, t.z1, y, ROAD_TINT, t.tile, 0, Math.max(1, Math.round(len / wid)), t.alongX);
    } else {
      gb.tiled(t.x0, t.z0, t.x1, t.z1, y, WALK_TINT, t.tile, gr.tileMetres);
    }
  }
}

/** Roadmap 2 S3: a park block with a stone-edged pond in the middle (layout.js → p.pond). */
function meshPondPark(gb, layout, p) {
  const world = layout.world;
  const ed = world.edges;
  const q = p.pond, y = p.y, tile = world.ground.tileMetres;
  const x0 = p.x, z0 = p.z, x1 = p.x + p.w, z1 = p.z + p.d;
  gb.tiled(x0, z0, x1, q.z0, y, WALK_TINT, GROUND.GRASS, tile);   // north strip
  gb.tiled(x0, q.z1, x1, z1, y, WALK_TINT, GROUND.GRASS, tile);   // south strip
  gb.tiled(x0, q.z0, q.x0, q.z1, y, WALK_TINT, GROUND.GRASS, tile); // west strip
  gb.tiled(q.x1, q.z0, x1, q.z1, y, WALK_TINT, GROUND.GRASS, tile); // east strip
  // Inner edges seen from the water side (walls face into the pond) + a low stone rim.
  const skirt = hexToLinear(ed.skirtColor);
  const rim = hexToLinear(ed.railColor);
  const inner = [
    { di: 0, dj: 1, ax: q.x0, az: q.z0, bx: q.x1, bz: q.z0 },  // north bank, faces south
    { di: 0, dj: -1, ax: q.x1, az: q.z1, bx: q.x0, bz: q.z1 }, // south bank, faces north
    { di: 1, dj: 0, ax: q.x0, az: q.z1, bx: q.x0, bz: q.z0 },  // west bank, faces east
    { di: -1, dj: 0, ax: q.x1, az: q.z0, bx: q.x1, bz: q.z1 }, // east bank, faces west
  ];
  for (const e of inner) {
    gb.wall(e.ax, e.az, e.bx, e.bz, world.water.level - ed.skirtDepth, y, shade(skirt, 0.6), skirt, GROUND.PLAZA);
    edgeWall(gb, e, ed.railThickness * 1.4, y, y + 0.35, rim); // outside = the pond, rim on the grass
  }
}

/**
 * Add the ground of one piece to the builder.
 * @param {import('./geoBuilder.js').GeoBuilder} gb
 * @param {import('./layout.js').CityLayout} layout
 */
export function meshGroundPiece(gb, layout, p) {
  const world = layout.world;
  const ed = world.edges;
  if (p.kind === KIND.WATER) return; // the water surface is one shared mesh (water.js)

  if (p.kind === KIND.BLOCK) meshBlock(gb, layout, p);
  else if (p.kind === KIND.PARK && p.pond) meshPondPark(gb, layout, p);
  else if (p.kind === KIND.PARK) gb.tiled(p.x, p.z, p.x + p.w, p.z + p.d, p.y, WALK_TINT, GROUND.GRASS, world.ground.tileMetres);
  else if (p.kind === KIND.PLAZA) gb.tiled(p.x, p.z, p.x + p.w, p.z + p.d, p.y, WALK_TINT, GROUND.PLAZA, world.ground.tileMetres);
  else meshRoad(gb, layout, p);

  const kerbCol = hexToLinear(ed.railColor);
  const skirtCol = hexToLinear(ed.skirtColor);
  for (const e of edgesOf(p)) {
    const n = layout.piece(p.i + e.di, p.j + e.dj);
    const riverSide = !n && e.dj === 1 && layout.river?.side === 'south';
    // Roadmap 2 S3: the bridge leaves a gap in the river railing; with the countryside the
    // city-limit wall is gone (a kerb face where a raised piece meets the land).
    if (layout.openEdges?.has(`${p.i},${p.j},${e.dj === 1 ? 'S' : e.dj === -1 ? 'N' : e.di === 1 ? 'E' : 'W'}`)) continue;
    if (!n && !riverSide && layout.openCity) {
      if (isRaised(p)) gb.wall(e.ax, e.az, e.bx, e.bz, -0.3, p.y, shade(kerbCol, 0.75), kerbCol, GROUND.PLAZA);
      continue;
    }
    if ((n && n.kind === KIND.WATER) || riverSide) {
      // Embankment wall down into the water + a low railing wall on top.
      gb.wall(e.ax, e.az, e.bx, e.bz, world.water.level - ed.skirtDepth, p.y, shade(skirtCol, 0.6), skirtCol, GROUND.PLAZA);
      edgeWall(gb, e, ed.railThickness, p.y, p.y + ed.railHeight, hexToLinear(ed.railColor));
    } else if (!n) {
      edgeWall(gb, e, 0.4, p.y, p.y + ed.boundaryWallHeight, hexToLinear(ed.boundaryWallColor));
    } else if (isRaised(p) && !isRaised(n)) {
      gb.wall(e.ax, e.az, e.bx, e.bz, 0, p.y, shade(kerbCol, 0.75), kerbCol, GROUND.PLAZA); // kerb face
    }
  }
}
