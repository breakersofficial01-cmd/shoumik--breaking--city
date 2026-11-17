// Poster slots: WHERE posters hang. Pure data worked out once from the city layout, the bus
// stops and the viaduct pillars (no meshes here; frames.js draws the frames).
//
// A slot is { id, kind, shape, x, y, z, heading, w, h, district, tap, frame }:
//   (x, y, z)  centre of the picture       heading  the direction the picture FACES (0 = +z)
//   w, h       size in metres              shape    'wide' (2:1) | '16:9' | 'tall' (2:3)
//   tap        how close Shoumik must be to open its link
// Kinds: billboard (roof, 2:1), led (junction screen, 16:9, rotates), wall (2:3),
// busStop (2:3), pillar (2:3). Moving slots on vehicles are made in vehicles.js.
// Numbers: data/posterSlots.json.

import { hashInts } from '../../core/rng.js';
import { KIND } from '../../world/layout.js';
import { FACADE } from '../../assets/proceduralTextures.js';

const ASPECT = { wide: 0.5, '16:9': 9 / 16, tall: 1.5 };

/** Keep candidates in hash order, skipping any closer than `spacing` to one already taken. */
function spread(candidates, count, spacing, seed) {
  const sorted = candidates.map((c, i) => ({ c, k: hashInts(seed, i, Math.round(c.x), Math.round(c.z)) })).sort((a, b) => a.k - b.k);
  const out = [];
  for (const { c } of sorted) {
    if (out.length >= count) break;
    if (out.some((o) => Math.hypot(o.x - c.x, o.z - c.z) < spacing)) continue;
    out.push(c);
  }
  return out;
}

/** The sides of a building that look straight onto a main-road sidewalk. */
function roadSides(b, p, sw) {
  const out = [];
  const near = sw + 0.8;
  if (b.z0 - p.z <= near) out.push({ ax: b.x1, az: b.z0, bx: b.x0, bz: b.z0, nx: 0, nz: -1 });
  if (p.z + p.d - b.z1 <= near) out.push({ ax: b.x0, az: b.z1, bx: b.x1, bz: b.z1, nx: 0, nz: 1 });
  if (b.x0 - p.x <= near) out.push({ ax: b.x0, az: b.z0, bx: b.x0, bz: b.z1, nx: -1, nz: 0 });
  if (p.x + p.w - b.x1 <= near) out.push({ ax: b.x1, az: b.z1, bx: b.x1, bz: b.z0, nx: 1, nz: 0 });
  return out;
}

/**
 * @param {object} world  game.world (layout, roads, landmarks)
 * @param {object} cfg    data/posterSlots.json
 * @param {object} worldCfg data/world.json
 */
export function planSlots(world, cfg, worldCfg) {
  const L = world.layout;
  const sw = worldCfg.grid.sidewalkWidth;
  const groundFloor = worldCfg.buildings.groundFloorHeight;
  const slots = [];
  const districtId = (x, z) => L.districtAt(x, z)?.id || '';
  const add = (s) => {
    s.id = `${s.kind}-${slots.length}`;
    s.district = districtId(s.x - Math.sin(s.heading) * 2, s.z - Math.cos(s.heading) * 2);
    slots.push(s);
  };

  // 1) Roof billboards and 2) first-floor wall posters, both on buildings facing a main road.
  const roofs = [], walls = [];
  const B = cfg.billboard, Wl = cfg.wall;
  for (const p of L.pieces) {
    if (p.kind !== KIND.BLOCK || p.landmark || !p.content) continue;
    for (const b of p.content.buildings) {
      for (const s of roadSides(b, p, sw)) {
        const len = Math.hypot(s.bx - s.ax, s.bz - s.az);
        const mx = (s.ax + s.bx) / 2, mz = (s.az + s.bz) / 2;
        const heading = Math.atan2(s.nx, s.nz);
        if (b.floors >= B.minFloors && b.floors <= B.maxFloors && len >= B.width * 0.7) {
          const w = Math.min(B.width, len - 0.6), h = w * ASPECT.wide;
          roofs.push({ kind: 'billboard', shape: 'wide', heading, w, h, tap: B.tap, x: mx - s.nx * B.setback, z: mz - s.nz * B.setback, y: p.y + b.h + B.lift + h / 2, roof: p.y + b.h, frame: 'billboard' });
        }
        // Wall posters avoid balconies (they stick out) and glass towers.
        if (!b.balcony && b.floors >= 2 && len >= Wl.width + 1.2 && b.style !== FACADE.GLASS) {
          const w = Wl.width, h = w * ASPECT.tall;
          walls.push({ kind: 'wall', shape: 'tall', heading, w, h, tap: Wl.tap, x: mx + s.nx * 0.07, z: mz + s.nz * 0.07, y: p.y + groundFloor + Wl.lift + h / 2, frame: 'wall' });
        }
      }
    }
  }
  spread(roofs, B.count, B.minSpacing, L.seed ^ 0xb111).forEach(add);
  spread(walls, Wl.count, Wl.minSpacing, L.seed ^ 0xa11).forEach(add);

  // 3) LED screens on the corner of busy junctions, turned to look at the middle of the junction.
  const E = cfg.led;
  const corners = [];
  const seenJ = new Set();
  const junctionCorner = (c, r, preferred) => {
    if (seenJ.has(`${c},${r}`) || world.roads.exits(c, r).length < 3) return;
    seenJ.add(`${c},${r}`);
    const j = L.crossingCentre(c, r);
    // Blocks around the junction: NW, NE, SE, SW. Pick the first real block (hash order).
    const options = [[-1, -1], [0, -1], [0, 0], [-1, 0]].filter(([dc, dr]) => {
      const p = L.piece(2 * (c + dc) + 1, 2 * (r + dr) + 1);
      return p && p.kind === KIND.BLOCK && !p.landmark;
    });
    if (!options.length) return;
    const [dc, dr] = options[hashInts(c, r, 31) % options.length];
    const sx = dc < 0 ? -1 : 1, sz = dr < 0 ? -1 : 1;
    const x = j.x + sx * (L.W / 2 + E.inset), z = j.z + sz * (L.W / 2 + E.inset);
    const h = E.width * ASPECT['16:9'];
    corners.push({ kind: 'led', shape: '16:9', heading: Math.atan2(j.x - x, j.z - z), w: E.width, h, tap: E.tap, x, z, y: L.kerb + E.poleHeight + h / 2, pole: { x, z }, frame: 'led', preferred });
  };
  for (const [c, r] of E.junctions || []) junctionCorner(c, r, true);
  const fixed = corners.slice();
  for (let c = 1; c < L.cols; c++) for (let r = 1; r < L.rows; r++) junctionCorner(c, r, false);
  fixed.forEach(add);
  spread(corners.filter((c) => !c.preferred && fixed.every((f) => Math.hypot(f.x - c.x, f.z - c.z) > E.minSpacing)), Math.max(0, E.count - fixed.length), E.minSpacing, L.seed ^ 0x1ed).forEach(add);

  // 4) Bus shelters: on the back board, facing the road (roads.busStops; lx/lz point away from the road).
  const S = cfg.busStop;
  for (const stop of world.roads.busStops) {
    add({
      kind: 'busStop', shape: 'tall', w: S.width, h: S.height, tap: S.tap, frame: null,
      x: stop.sx + stop.lx * S.out, z: stop.sz + stop.lz * S.out, y: stop.y + S.y, heading: Math.atan2(-stop.lx, -stop.lz),
    });
  }

  // 5) Both long sides of every viaduct pillar (MRT and flyover).
  const Pl = cfg.pillar;
  for (const v of world.landmarks?.viaducts || []) {
    const half = v.line.pillar.width / 2 + 0.03;
    for (const p of v.pillars) {
      // Pillar local x (across the road) in world space = (cos h, -sin h).
      const rx = Math.cos(p.heading), rz = -Math.sin(p.heading);
      for (const s of [-1, 1]) {
        add({
          kind: 'pillar', shape: 'tall', w: Pl.width, h: Pl.height, tap: Pl.tap, frame: null,
          x: p.x + rx * half * s, z: p.z + rz * half * s, y: Pl.y, heading: Math.atan2(rx * s, rz * s),
        });
      }
    }
  }
  return slots;
}
