// Water map (Roadmap 2 S7): "is this point open water a boat can float on?"
//   world.waterAt(x, z, margin = 0) → 'lake' | 'river' | 'sea' | null
//   - lake  : city water pieces (Dhanmondi Lake, Hatirjheel, Gulshan Lake …); road bridges over a
//             lake are low, so they count as land (they split a lake into parts)
//   - river : the Buriganga south of the city, from the west edge to the sea (under the
//             Buriganga Bridge too — its deck is high)
//   - sea   : east of the wobbly shore line (terrain field shoreX), inside the playable bounds
//   (river and sea: wherever the ground is below the water surface by a boat's draft)
// `margin` (metres): the point AND margin metres around it (4 directions) must be water.
// Pure maths — no meshes.

import { KIND } from './layout.js';

export function makeWaterAt(world) {
  const L = world.layout;
  const f = world.terrain?.field || null;
  const river = f?.river || null;
  const b = f?.bounds || null;
  // Outside the city a point is water when the ground there is below the water surface by at
  // least `draft` (the beach and the river banks slope gently into the water).
  const level = world.cfg.water.level;
  const draft = 0.35;

  const kindAt = (x, z) => {
    if (b && (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1)) return null;
    const p = L.pieceAt(x, z);
    if (p) return p.kind === KIND.WATER ? 'lake' : null;
    if (!f) return null;
    // Under the Buriganga Bridge: field.heightAt gives the deck there, but the river flows on.
    const B = f.bridge;
    const under = B && river && Math.abs(x - B.x) < B.half + 1 && z > river.z0 + 2 && z < river.z1 - 2;
    if (!under && f.heightAt(x, z) > level - draft) return null;
    if (river && z > river.z0 && z < river.z1 && x < f.shoreX(z) - 30) return 'river';
    if (x > f.shoreX(z) - 60) return 'sea';
    return null; // a pond (boats are not brought there)
  };

  return function waterAt(x, z, margin = 0) {
    const k = kindAt(x, z);
    if (!k || margin <= 0) return k;
    for (const [dx, dz] of [[margin, 0], [-margin, 0], [0, margin], [0, -margin]]) if (!kindAt(x + dx, z + dz)) return null;
    return k;
  };
}
