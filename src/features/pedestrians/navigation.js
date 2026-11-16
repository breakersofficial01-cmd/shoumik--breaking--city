// Where pedestrians can walk: the sidewalk ring round every city block.
//
// Each block has 4 corner "nodes" (0 = north-west, 1 = north-east, 2 = south-east,
// 3 = south-west). From a corner a person can walk along the block to the next corner, or
// cross the road to the matching corner of the neighbouring block (that is where the zebra
// crossings are). Nodes are worked out on the fly from the city grid — nothing is stored.
// A node is { i, j, k }: piece-grid position of the block (both odd) and the corner number.

import { KIND } from '../../world/layout.js';

// For each corner: the two road crossings that start there → [di, dj, corner on the other side].
const CROSSINGS = [
  [[-2, 0, 1], [0, -2, 3]],
  [[2, 0, 0], [0, -2, 2]],
  [[2, 0, 3], [0, 2, 1]],
  [[-2, 0, 2], [0, 2, 0]],
];

export class SidewalkNav {
  /** @param {import('../../world/layout.js').CityLayout} layout */
  constructor(layout) {
    this.layout = layout;
  }

  isBlock(i, j) {
    const p = this.layout.piece(i, j);
    return !!p && p.kind === KIND.BLOCK;
  }

  /** World position of a corner node, `off` metres in from the kerb. Writes into out. */
  cornerPos(node, off, out) {
    const p = this.layout.piece(node.i, node.j);
    const east = node.k === 1 || node.k === 2;
    const south = node.k === 2 || node.k === 3;
    out.x = east ? p.x + p.w - off : p.x + off;
    out.z = south ? p.z + p.d - off : p.z + off;
    return out;
  }

  /**
   * Where a person standing at `node` can go next.
   * @returns {Array<{i:number, j:number, k:number, cross:boolean}>}
   */
  options(node, prev) {
    const out = [];
    const same = (n) => prev && n.i === prev.i && n.j === prev.j && n.k === prev.k;
    for (const dk of [1, 3]) {
      const n = { i: node.i, j: node.j, k: (node.k + dk) % 4, cross: false };
      if (!same(n)) out.push(n);
    }
    for (const [di, dj, k] of CROSSINGS[node.k]) {
      const n = { i: node.i + di, j: node.j + dj, k, cross: true };
      if (this.isBlock(n.i, n.j) && !same(n)) out.push(n);
    }
    if (out.length === 0 && prev) out.push({ ...prev, cross: false });
    return out;
  }

  /** The block under (x, z), or the nearest block next to that spot. Null outside the city. */
  blockNear(x, z) {
    const L = this.layout;
    const p = L.pieceAt(x, z);
    if (!p) return null;
    if (p.kind === KIND.BLOCK) return p;
    let best = null;
    let bestD = Infinity;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const q = L.piece(p.i + di, p.j + dj);
        if (!q || q.kind !== KIND.BLOCK) continue;
        const dx = Math.max(q.x - x, 0, x - (q.x + q.w));
        const dz = Math.max(q.z - z, 0, z - (q.z + q.d));
        const d = dx * dx + dz * dz;
        if (d < bestD) { bestD = d; best = q; }
      }
    }
    return best;
  }

  /** Nearest corner node to (x, z), or null. */
  nearestNode(x, z) {
    const p = this.blockNear(x, z);
    if (!p) return null;
    const east = x > p.x + p.w / 2;
    const south = z > p.z + p.d / 2;
    return { i: p.i, j: p.j, k: south ? (east ? 2 : 3) : (east ? 1 : 0) };
  }

  /**
   * A spot on the sidewalk nearest to (x, z), with the two corners at the ends of that edge.
   * @returns {{x:number, z:number, a:object, b:object}|null}
   */
  sidewalkSpot(x, z, off) {
    const p = this.blockNear(x, z);
    if (!p) return null;
    const x0 = p.x + off, x1 = p.x + p.w - off, z0 = p.z + off, z1 = p.z + p.d - off;
    const cx = Math.min(x1, Math.max(x0, x));
    const cz = Math.min(z1, Math.max(z0, z));
    const dN = Math.abs(z - z0), dS = Math.abs(z - z1), dW = Math.abs(x - x0), dE = Math.abs(x - x1);
    const m = Math.min(dN, dS, dW, dE);
    const node = (k) => ({ i: p.i, j: p.j, k });
    if (m === dN) return { x: cx, z: z0, a: node(0), b: node(1) };
    if (m === dS) return { x: cx, z: z1, a: node(3), b: node(2) };
    if (m === dW) return { x: x0, z: cz, a: node(0), b: node(3) };
    return { x: x1, z: cz, a: node(1), b: node(2) };
  }
}
