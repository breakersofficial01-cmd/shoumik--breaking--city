// Lightweight arcade collision (no physics engine): a grid of axis-aligned boxes.
//   - resolveCircle(): pushes the player's circle out of walls (he slides along them).
//   - raycast(): used by the chase camera so it doesn't go inside buildings.
// Buildings, water edges, poles, trees and the city limits are added once at start.
//
// Moving things (pedestrians, later vehicles) are NOT in the grid. They are a small list of
// circles: collision.dynamic.add({ x, z, r }) — keep the object and move its x/z yourself,
// collision.dynamic.delete(obj) when it goes away. resolveDynamic() pushes a circle out of them.

export const COLLIDE = {
  SOLID: 1,   // blocks walking
  CAMERA: 2,  // also blocks the camera
};

export class CollisionWorld {
  constructor(cellSize = 16) {
    this.cell = cellSize;
    this.grid = new Map();   // cell key -> array of box indices
    this.boxes = [];         // flat: minX, minZ, maxX, maxZ, flags
    this.big = [];           // boxes too large for the grid (river, city limits)
    this.stamp = [];         // de-duplication marks per box
    this.stampId = 0;
    this.hits = [];
    /** @type {Set<{x:number, z:number, r:number}>} moving circles (people, vehicles) */
    this.dynamic = new Set();
  }

  /**
   * Push a circle out of the moving circles. `self` (if given) is skipped.
   * @returns {boolean} true if it touched one
   */
  resolveDynamic(pos, radius, self = null) {
    let touched = false;
    for (const o of this.dynamic) {
      if (o === self || o.owner === self) continue;
      const dx = pos.x - o.x, dz = pos.z - o.z;
      const min = radius + o.r;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2);
      if (d > 1e-4) {
        pos.x = o.x + (dx / d) * min;
        pos.z = o.z + (dz / d) * min;
      } else {
        pos.x += min;
      }
      touched = true;
    }
    return touched;
  }

  key(ix, iz) {
    return (ix + 32768) * 65536 + (iz + 32768);
  }

  add(minX, minZ, maxX, maxZ, flags = COLLIDE.SOLID | COLLIDE.CAMERA) {
    const id = this.boxes.length / 5;
    this.boxes.push(minX, minZ, maxX, maxZ, flags);
    this.stamp.push(0);
    const ix0 = Math.floor(minX / this.cell), ix1 = Math.floor(maxX / this.cell);
    const iz0 = Math.floor(minZ / this.cell), iz1 = Math.floor(maxZ / this.cell);
    if ((ix1 - ix0 + 1) * (iz1 - iz0 + 1) > 64) {
      this.big.push(id);
      return id;
    }
    for (let ix = ix0; ix <= ix1; ix++) {
      for (let iz = iz0; iz <= iz1; iz++) {
        const k = this.key(ix, iz);
        let list = this.grid.get(k);
        if (!list) this.grid.set(k, (list = []));
        list.push(id);
      }
    }
    return id;
  }

  /**
   * Change what a box blocks (id = what add() returned). flags 0 = it blocks nothing any more
   * (Roadmap 2 S4: the hotel doors open once the inside has loaded).
   */
  setFlags(id, flags) {
    if (id >= 0 && id * 5 + 4 < this.boxes.length) this.boxes[id * 5 + 4] = flags;
  }

  /** Collect ids of boxes whose grid cells touch the given rectangle (each id once). */
  query(minX, minZ, maxX, maxZ) {
    const out = this.hits;
    out.length = 0;
    const mark = ++this.stampId;
    for (const id of this.big) out.push(id);
    const ix0 = Math.floor(minX / this.cell), ix1 = Math.floor(maxX / this.cell);
    const iz0 = Math.floor(minZ / this.cell), iz1 = Math.floor(maxZ / this.cell);
    for (let ix = ix0; ix <= ix1; ix++) {
      for (let iz = iz0; iz <= iz1; iz++) {
        const list = this.grid.get(this.key(ix, iz));
        if (!list) continue;
        for (const id of list) {
          if (this.stamp[id] !== mark) {
            this.stamp[id] = mark;
            out.push(id);
          }
        }
      }
    }
    return out;
  }

  /**
   * Push a circle out of every solid box it overlaps. Changes pos.x / pos.z.
   * @returns {boolean} true if it touched something
   */
  resolveCircle(pos, radius) {
    let touched = false;
    const b = this.boxes;
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      const ids = this.query(pos.x - radius, pos.z - radius, pos.x + radius, pos.z + radius);
      for (const id of ids) {
        const o = id * 5;
        if (!(b[o + 4] & COLLIDE.SOLID)) continue;
        const cx = Math.max(b[o], Math.min(pos.x, b[o + 2]));
        const cz = Math.max(b[o + 1], Math.min(pos.z, b[o + 3]));
        let dx = pos.x - cx;
        let dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= radius * radius) continue;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          pos.x = cx + (dx / d) * radius;
          pos.z = cz + (dz / d) * radius;
        } else {
          // Centre is inside the box: leave through the nearest side.
          const left = pos.x - b[o], right = b[o + 2] - pos.x;
          const up = pos.z - b[o + 1], down = b[o + 3] - pos.z;
          const m = Math.min(left, right, up, down);
          if (m === left) pos.x = b[o] - radius;
          else if (m === right) pos.x = b[o + 2] + radius;
          else if (m === up) pos.z = b[o + 1] - radius;
          else pos.z = b[o + 3] + radius;
        }
        moved = touched = true;
      }
      if (!moved) break;
    }
    return touched;
  }

  /** True if a circle at (x, z) overlaps any solid box. */
  isBlocked(x, z, radius) {
    const b = this.boxes;
    for (const id of this.query(x - radius, z - radius, x + radius, z + radius)) {
      const o = id * 5;
      if (!(b[o + 4] & COLLIDE.SOLID)) continue;
      const cx = Math.max(b[o], Math.min(x, b[o + 2]));
      const cz = Math.max(b[o + 1], Math.min(z, b[o + 3]));
      if ((x - cx) ** 2 + (z - cz) ** 2 < radius * radius) return true;
    }
    return false;
  }

  /**
   * Distance along a ray (ox,oz) + t*(dx,dz) to the first box with the given flag.
   * (dx,dz) must be normalised. Returns maxDist when nothing is hit.
   */
  raycast(ox, oz, dx, dz, maxDist, flag = COLLIDE.CAMERA) {
    const ex = ox + dx * maxDist;
    const ez = oz + dz * maxDist;
    const ids = this.query(Math.min(ox, ex), Math.min(oz, ez), Math.max(ox, ex), Math.max(oz, ez));
    const b = this.boxes;
    let best = maxDist;
    for (const id of ids) {
      const o = id * 5;
      if (!(b[o + 4] & flag)) continue;
      // Slab test.
      let t0 = 0, t1 = best;
      if (Math.abs(dx) < 1e-9) {
        if (ox < b[o] || ox > b[o + 2]) continue;
      } else {
        let a = (b[o] - ox) / dx, c = (b[o + 2] - ox) / dx;
        if (a > c) [a, c] = [c, a];
        t0 = Math.max(t0, a);
        t1 = Math.min(t1, c);
        if (t0 > t1) continue;
      }
      if (Math.abs(dz) < 1e-9) {
        if (oz < b[o + 1] || oz > b[o + 3]) continue;
      } else {
        let a = (b[o + 1] - oz) / dz, c = (b[o + 3] - oz) / dz;
        if (a > c) [a, c] = [c, a];
        t0 = Math.max(t0, a);
        t1 = Math.min(t1, c);
        if (t0 > t1) continue;
      }
      if (t0 < best) best = t0;
    }
    return best;
  }
}
