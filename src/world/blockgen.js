// Fills one city block with DATA: sub-blocks cut by small lanes, building plots, buildings,
// poles, wire spans, trees and roof tanks. No meshes here (see buildingMesher.js / props.js).
// Everything comes from the district settings in data/districts.json and the block's own
// seeded Rng, so the result never changes between launches.

import { hashInts } from '../core/rng.js';
import { FACADE, GROUND } from '../assets/proceduralTextures.js';

/** Bit flags for building sides. */
export const SIDE = { N: 1, S: 2, W: 4, E: 8 };

const STYLE_TILE = { residential: FACADE.RESIDENTIAL, office: FACADE.OFFICE, glass: FACADE.GLASS, old: FACADE.OLD };
const EPS = 0.01;

/** Cut a rectangle into plots no bigger than lot.max (and never thinner than lot.min). */
function splitLots(x0, z0, x1, z1, lot, rng, out) {
  const w = x1 - x0;
  const d = z1 - z0;
  const alongX = w >= d;
  const long = alongX ? w : d;
  if (long <= lot.max || long < lot.min * 2) {
    out.push({ x0, z0, x1, z1 });
    return;
  }
  const lo = Math.max(lot.min, long * 0.36);
  const hi = Math.min(long - lot.min, long * 0.64);
  const cut = rng.range(lo, Math.max(lo, hi));
  if (alongX) {
    splitLots(x0, z0, x0 + cut, z1, lot, rng, out);
    splitLots(x0 + cut, z0, x1, z1, lot, rng, out);
  } else {
    splitLots(x0, z0, x1, z0 + cut, lot, rng, out);
    splitLots(x0, z0 + cut, x1, z1, lot, rng, out);
  }
}

/** Random trees inside a rectangle. density = trees per square metre. */
export function scatterTrees(out, x0, z0, x1, z1, density, treeCfg, rng) {
  const area = Math.max(0, x1 - x0) * Math.max(0, z1 - z0);
  let count = area * density;
  count = Math.floor(count) + (rng.chance(count % 1) ? 1 : 0);
  for (let i = 0; i < count; i++) {
    out.push({
      x: rng.range(x0, x1),
      z: rng.range(z0, z1),
      h: rng.range(treeCfg.height[0], treeCfg.height[1]),
      tint: rng.int(0, treeCfg.colors.length - 1),
      rot: rng.range(0, Math.PI * 2),
    });
  }
}

/** Decide what stands on one plot. Returns a building spec, or null for an open plot. */
function makeBuilding(layout, piece, district, lot, sub, rng) {
  const cfg = layout.world.buildings;
  const gap = rng.range(district.lot.gap[0], district.lot.gap[1]);
  const inset = Math.max(0.05, gap / 2);
  const x0 = lot.x0 + inset;
  const z0 = lot.z0 + inset;
  const x1 = lot.x1 - inset;
  const z1 = lot.z1 - inset;
  const minDim = Math.min(x1 - x0, z1 - z0);
  if (minDim < 4) return null;

  // Sides that look onto a lane or the main-road sidewalk get windows, shops and signs.
  let front = 0;
  if (lot.z0 - sub.z0 < EPS) front |= SIDE.N;
  if (sub.z1 - lot.z1 < EPS) front |= SIDE.S;
  if (lot.x0 - sub.x0 < EPS) front |= SIDE.W;
  if (sub.x1 - lot.x1 < EPS) front |= SIDE.E;

  const f = district.floors;
  let floors = f.min + Math.floor((f.max - f.min + 1) * Math.pow(rng.next(), f.bias));
  const tower = rng.chance(district.towerChance || 0);
  if (tower) floors = Math.round(f.max * rng.range(1.2, 1.7));
  floors = Math.max(1, Math.min(floors, Math.floor(minDim * 0.95)));

  const styleName = rng.weighted(district.styles);
  const pal = district.palette;
  const isGlass = styleName === 'glass';
  const shop = front !== 0 && rng.chance(district.shopChance);
  const b = {
    x0, z0, x1, z1,
    floors,
    h: cfg.groundFloorHeight + (floors - 1) * cfg.floorHeight,
    style: STYLE_TILE[styleName],
    front,
    // Free-standing buildings and towers show windows on every side; packed ones have
    // blank plaster side walls (very Dhaka, and far fewer triangles).
    allSides: tower || gap >= 1.6,
    wall: isGlass ? rng.pick(cfg.glassTints) : rng.pick(pal.walls),
    shop,
    shutter: rng.pick(pal.shutters),
    balcony: !isGlass && styleName !== 'office' && rng.chance(district.balconyChance) ? rng.pick(pal.balcony) : null,
    district: piece.district,
    seed: hashInts(layout.seed, Math.round(x0 * 10), Math.round(z0 * 10)),
  };
  return b;
}

/**
 * @param {import('./layout.js').CityLayout} layout
 * @param {object} piece   the block piece (x, z, w, d)
 * @param {object} district  entry from data/districts.json
 * @param {import('../core/rng.js').Rng} rng
 */
export function generateBlock(layout, piece, district, rng) {
  const world = layout.world;
  const sw = world.grid.sidewalkWidth;
  const out = { buildings: [], patches: [], poles: [], wires: [], tanks: [], trees: [] };
  const ix0 = piece.x + sw;
  const iz0 = piece.z + sw;
  const iw = piece.w - 2 * sw;
  const id = piece.d - 2 * sw;
  const { x: nx, z: nz, laneWidth: lane } = district.subdivide;
  const subW = (iw - (nx - 1) * lane) / nx;
  const subD = (id - (nz - 1) * lane) / nz;

  // The inside of the block is a (2nx-1) x (2nz-1) patchwork: sub-blocks with lanes between.
  for (let b = 0; b < 2 * nz - 1; b++) {
    for (let a = 0; a < 2 * nx - 1; a++) {
      const x0 = ix0 + (a >> 1) * (subW + lane) + (a & 1 ? subW : 0);
      const z0 = iz0 + (b >> 1) * (subD + lane) + (b & 1 ? subD : 0);
      const x1 = x0 + (a & 1 ? lane : subW);
      const z1 = z0 + (b & 1 ? lane : subD);
      if (a & 1 || b & 1) {
        // A lane piece. alongX = the lane runs east-west.
        out.patches.push({ x0, z0, x1, z1, tile: GROUND.LANE, lane: true, alongX: !(a & 1) });
        if (district.wireStrands >= 4) addLaneWires(out.wires, x0, z0, x1, z1, !(a & 1), district, world, rng);
        continue;
      }
      const sub = { x0, z0, x1, z1 };
      const lots = [];
      splitLots(x0, z0, x1, z1, district.lot, rng, lots);
      for (const lot of lots) {
        const building = rng.chance(district.density) ? makeBuilding(layout, piece, district, lot, sub, rng) : null;
        if (building) {
          out.buildings.push(building);
          out.patches.push({ ...lot, tile: GROUND.LOT });
          addTanks(out.tanks, building, district, world, rng);
        } else {
          out.patches.push({ ...lot, tile: GROUND.GRASS });
          scatterTrees(out.trees, lot.x0 + 1.5, lot.z0 + 1.5, lot.x1 - 1.5, lot.z1 - 1.5, district.greenTreeDensity, world.props.tree, rng);
        }
      }
    }
  }
  addStreetFurniture(out, layout, piece, district, rng);
  return out;
}

/** Black plastic water tanks on the roof. */
function addTanks(tanks, b, district, world, rng) {
  if (!rng.chance(district.tankChance)) return;
  const t = world.props.tank;
  const n = (b.x1 - b.x0) * (b.z1 - b.z0) > 250 && rng.chance(0.5) ? 2 : 1;
  const margin = t.radius + 0.5;
  const nearX = rng.chance(0.5) ? b.x0 + margin : b.x1 - margin;
  const nearZ = rng.range(b.z0 + margin, b.z1 - margin);
  for (let i = 0; i < n; i++) {
    tanks.push({
      x: nearX,
      z: Math.min(b.z1 - margin, Math.max(b.z0 + margin, nearZ + i * (t.radius * 2 + 0.3))),
      y: b.h,
      scale: rng.range(0.8, 1.2),
      tint: rng.int(0, t.colors.length - 1),
    });
  }
}

/** Tangled wires strung across a narrow lane, zig-zagging between the house fronts. */
function addLaneWires(wires, x0, z0, x1, z1, alongX, district, world, rng) {
  const len = alongX ? x1 - x0 : z1 - z0;
  const width = alongX ? z1 - z0 : x1 - x0;
  const steps = Math.max(2, Math.round(len / 9));
  let prev = null;
  for (let s = 0; s <= steps; s++) {
    const along = (s / steps) * len;
    const across = (s % 2 ? 0.12 : 0.88) * width + rng.range(-0.3, 0.3);
    const y = rng.range(4.6, 6.6);
    const pt = alongX ? [x0 + along, y, z0 + across] : [x0 + across, y, z0 + along];
    if (prev) wires.push({ a: prev, b: pt, strands: Math.max(2, district.wireStrands - 2) });
    prev = pt;
  }
}

/** Electric poles around the block, the wires between them, and sidewalk trees. */
function addStreetFurniture(out, layout, piece, district, rng) {
  const world = layout.world;
  const { pole, wire, tree } = world.props;
  const x0 = piece.x + pole.inset;
  const z0 = piece.z + pole.inset;
  const x1 = piece.x + piece.w - pole.inset;
  const z1 = piece.z + piece.d - pole.inset;
  const top = layout.kerb + wire.heightMax;
  // Walk the four edges clockwise so the wire ring closes on itself.
  const edges = [
    { ax: x0, az: z0, bx: x1, bz: z0, rot: 0, di: 0, dj: -1 },           // north edge
    { ax: x1, az: z0, bx: x1, bz: z1, rot: Math.PI / 2, di: 1, dj: 0 },  // east
    { ax: x1, az: z1, bx: x0, bz: z1, rot: 0, di: 0, dj: 1 },            // south
    { ax: x0, az: z1, bx: x0, bz: z0, rot: Math.PI / 2, di: -1, dj: 0 }, // west
  ];
  const ring = [];
  for (const e of edges) {
    const len = Math.hypot(e.bx - e.ax, e.bz - e.az);
    const n = Math.max(2, Math.round(len / pole.spacing));
    const across = layout.piece(piece.i + e.di * 2, piece.j + e.dj * 2);
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const x = e.ax + (e.bx - e.ax) * t;
      const z = e.az + (e.bz - e.az) * t;
      out.poles.push({ x, z, rot: e.rot });
      ring.push([x, top, z]);
      // Sometimes a wire also crosses the main road to the block on the other side.
      if (across && across.kind === piece.kind && rng.chance(0.3)) {
        const reach = layout.W + pole.inset * 2;
        out.wires.push({ a: [x, top - 0.3, z], b: [x + e.di * reach, top - 0.3, z + e.dj * reach], strands: 2 });
      }
      // Sidewalk tree between poles.
      if (k < n - 1 && rng.chance(district.streetTreeChance)) {
        const tt = (k + 1 + rng.range(-0.15, 0.15)) / n;
        out.trees.push({
          x: e.ax + (e.bx - e.ax) * tt,
          z: e.az + (e.bz - e.az) * tt,
          h: rng.range(tree.height[0], tree.height[1]) * 0.8,
          tint: rng.int(0, tree.colors.length - 1),
          rot: rng.range(0, Math.PI * 2),
        });
      }
    }
  }
  for (let k = 0; k < ring.length; k++) {
    out.wires.push({ a: ring[k], b: ring[(k + 1) % ring.length], strands: district.wireStrands });
  }
}
