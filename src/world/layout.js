// City layout: turns data/world.json + data/districts.json into a grid of "pieces".
// PURE DATA — no Three.js here. Meshes are built later, chunk by chunk (chunks.js).
//
// THE GRID. The city is cols x rows big blocks separated by roads. It is stored as a grid
// of pieces, (2*cols+1) x (2*rows+1):
//     i even = a road column,  i odd = a block column     (same for j / rows)
//     (even,even) road crossing   (odd,even) east-west road
//     (even,odd)  north-south road (odd,odd)  city block
// "Areas" (lakes, parks, plazas) take over blocks AND the roads between them, unless a
// road is listed as a bridge.
//
// The same seed always gives the same city (fixed seed, CLAUDE.md).

import { Rng, hashInts } from '../core/rng.js';
import { generateBlock, scatterTrees } from './blockgen.js';

export const KIND = { CROSSING: 0, ROAD_EW: 1, ROAD_NS: 2, BLOCK: 3, WATER: 4, PARK: 5, PLAZA: 6 };
const AREA_KIND = { water: KIND.WATER, park: KIND.PARK, plaza: KIND.PLAZA };

export const isRoad = (p) => p.kind <= KIND.ROAD_NS;
export const isRaised = (p) => p.kind === KIND.BLOCK || p.kind === KIND.PARK || p.kind === KIND.PLAZA;

export class CityLayout {
  constructor(world, districtsCfg) {
    const g = world.grid;
    this.world = world;
    this.seed = world.seed;
    this.cols = g.cols;
    this.rows = g.rows;
    this.P = g.pitch;
    this.W = g.roadWidth;
    this.kerb = g.kerbHeight;
    this.width = this.cols * this.P + this.W;
    this.depth = this.rows * this.P + this.W;
    this.minX = -this.width / 2;
    this.minZ = -this.depth / 2;
    this.maxX = this.minX + this.width;
    this.maxZ = this.minZ + this.depth;
    this.nI = 2 * this.cols + 1;
    this.nJ = 2 * this.rows + 1;
    this.districts = districtsCfg.districts;
    this.areas = districtsCfg.areas || [];
    this.areaTypes = districtsCfg.areaTypes || {};
    this.river = districtsCfg.river || null;
    /** @type {Array<object>} all pieces, index = j * nI + i */
    this.pieces = new Array(this.nI * this.nJ);
    this.build();
  }

  // ---- geometry of the piece grid
  px(i) { return this.minX + (i >> 1) * this.P + (i & 1 ? this.W : 0); }
  pz(j) { return this.minZ + (j >> 1) * this.P + (j & 1 ? this.W : 0); }
  pw(i) { return i & 1 ? this.P - this.W : this.W; }

  /** Piece by grid index, or null outside the city. */
  piece(i, j) {
    if (i < 0 || j < 0 || i >= this.nI || j >= this.nJ) return null;
    return this.pieces[j * this.nI + i];
  }

  /** Piece under a world position, or null outside the city. */
  pieceAt(x, z) {
    const lx = x - this.minX;
    const lz = z - this.minZ;
    if (lx < 0 || lz < 0 || lx >= this.width || lz >= this.depth) return null;
    const c = Math.floor(lx / this.P);
    const r = Math.floor(lz / this.P);
    return this.piece(2 * c + (lx - c * this.P >= this.W ? 1 : 0), 2 * r + (lz - r * this.P >= this.W ? 1 : 0));
  }

  /** Centre of the road crossing at grid col/row (used for spawn points, later for places). */
  crossingCentre(col, row) {
    return { x: this.minX + col * this.P + this.W / 2, z: this.minZ + row * this.P + this.W / 2 };
  }

  /** Ground height (0 on roads, kerb height on blocks/parks). */
  heightAt(x, z) {
    const p = this.pieceAt(x, z);
    return p && isRaised(p) ? this.kerb : 0;
  }

  districtAt(x, z) {
    const p = this.pieceAt(x, z);
    return p ? this.districts[p.district] : null;
  }

  // ---- generation
  districtIndexOfBlock(c, r) {
    const cc = Math.min(this.cols - 1, Math.max(0, c));
    const rr = Math.min(this.rows - 1, Math.max(0, r));
    for (let d = 0; d < this.districts.length; d++) {
      const t = this.districts[d].rect;
      if (cc >= t.col && cc < t.col + t.cols && rr >= t.row && rr < t.row + t.rows) return d;
    }
    return 0;
  }

  build() {
    const { cols, rows, nI, nJ } = this;
    // 1) Which area (lake/park/plaza) owns each block, and which roads are bridges.
    const areaOf = new Map(); // "c,r" -> area
    const bridges = new Set(); // "i,j" of road pieces that stay roads
    for (const area of this.areas) {
      for (const t of area.rects) {
        for (let c = t.col; c < t.col + t.cols; c++) {
          for (let r = t.row; r < t.row + t.rows; r++) areaOf.set(`${c},${r}`, area);
        }
      }
      for (const [[c1, r1], [c2, r2]] of area.bridges || []) {
        if (c1 === c2) bridges.add(`${2 * c1 + 1},${2 * Math.max(r1, r2)}`);
        else bridges.add(`${2 * Math.max(c1, c2)},${2 * r1 + 1}`);
      }
    }
    const A = (c, r) => (c < 0 || r < 0 || c >= cols || r >= rows ? null : areaOf.get(`${c},${r}`) || null);

    // 2) Blocks and straight roads.
    for (let j = 0; j < nJ; j++) {
      for (let i = 0; i < nI; i++) {
        const c = i >> 1;
        const r = j >> 1;
        const oddI = i & 1;
        const oddJ = j & 1;
        let kind;
        let area = null;
        if (oddI && oddJ) {
          kind = KIND.BLOCK;
          area = A(c, r);
        } else if (oddI) {
          kind = KIND.ROAD_EW; // between block (c, r-1) and (c, r)
          const a = A(c, r - 1);
          if (a && a === A(c, r) && !bridges.has(`${i},${j}`)) area = a;
        } else if (oddJ) {
          kind = KIND.ROAD_NS; // between block (c-1, r) and (c, r)
          const a = A(c - 1, r);
          if (a && a === A(c, r) && !bridges.has(`${i},${j}`)) area = a;
        } else {
          kind = KIND.CROSSING;
        }
        if (area) kind = AREA_KIND[area.type] ?? kind;
        this.pieces[j * nI + i] = {
          i, j, kind, area,
          district: this.districtIndexOfBlock(oddI ? c : Math.min(c, cols - 1), oddJ ? r : Math.min(r, rows - 1)),
          x: this.px(i), z: this.pz(j), w: this.pw(i), d: this.pw(j),
          content: null,
        };
      }
    }
    // 3) A crossing joins an area only when all four roads around it did.
    for (let j = 0; j < nJ; j += 2) {
      for (let i = 0; i < nI; i += 2) {
        const around = [this.piece(i - 1, j), this.piece(i + 1, j), this.piece(i, j - 1), this.piece(i, j + 1)];
        const area = around[0]?.area;
        if (area && around.every((p) => p && p.area === area)) {
          const p = this.piece(i, j);
          p.area = area;
          p.kind = AREA_KIND[area.type];
        }
      }
    }
    // 4) Fill blocks with buildings, parks with trees. Each piece has its own seed.
    for (const p of this.pieces) {
      p.y = isRaised(p) ? this.kerb : 0;
      const rng = new Rng(hashInts(this.seed, p.i, p.j));
      if (p.kind === KIND.BLOCK) {
        p.content = generateBlock(this, p, this.districts[p.district], rng);
      } else if (p.kind === KIND.PARK || p.kind === KIND.PLAZA) {
        const density = this.areaTypes[p.area.type]?.treeDensity ?? 0;
        p.content = { buildings: [], patches: [], poles: [], wires: [], tanks: [], trees: [] };
        scatterTrees(p.content.trees, p.x + 1.5, p.z + 1.5, p.x + p.w - 1.5, p.z + p.d - 1.5, density, this.world.props.tree, rng);
      }
    }
  }
}
