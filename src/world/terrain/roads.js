// Highways and the Buriganga bridge (Roadmap 2 S3), built once in code with vertex colours.
//   buildHighways(field, cfg)  → one mesh: asphalt ribbons that follow the land + painted lines
//   buildBridge(field, cfg)    → one mesh: deck, parapets, piers, lamp posts (+ glow heads)
// Both are part of the world (not streamed): a few thousand triangles in total.

import * as THREE from 'three';
import { hexToLinear } from '../geoBuilder.js';

/** Tiny builder: flat-shaded quads and boxes with one colour each. */
class QuadKit {
  constructor() { this.pos = []; this.nor = []; this.col = []; }
  /** Quad a→b→c→d (counter-clockwise seen from the side it faces; normal = (b-a) × (d-a)). */
  quad(a, b, c, d, color) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; // u × v
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    for (const p of [a, b, c, a, c, d]) {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(nx, ny, nz);
      this.col.push(color[0], color[1], color[2]);
    }
  }
  /** Axis-aligned box (all six sides). */
  box(x0, y0, z0, x1, y1, z1, color) {
    const q = (a, b, c, d) => this.quad(a, b, c, d, color);
    q([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]); // top
    q([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]); // south
    q([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]); // north
    q([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]); // west
    q([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]); // east
    q([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]); // bottom
  }
  geometry() {
    if (!this.pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    return g;
  }
}

/** Points every `step` metres along a polyline: { x, z, fx, fz (unit direction) }. */
function walk(pts, step) {
  const out = [];
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
    const len = Math.hypot(bx - ax, bz - az);
    const fx = (bx - ax) / len, fz = (bz - az) / len;
    const n = Math.max(1, Math.ceil(len / step));
    for (let k = i === 1 ? 0 : 1; k <= n; k++) out.push({ x: ax + fx * len * k / n, z: az + fz * len * k / n, fx, fz });
  }
  return out;
}

/**
 * Asphalt ribbons + centre dashes + edge lines for every highway in data/terrain.json.
 * The land under a highway is already flattened by field.js, so the ribbon sits just above it.
 */
export function buildHighways(field, cfg, material) {
  const H = cfg.highways;
  const kit = new QuadKit();
  const asphalt = hexToLinear(H.color), line = hexToLinear(H.lineColor), edgeCol = hexToLinear(H.edgeColor);
  const half = H.width / 2;
  for (const hw of field.highways) {
    const lift = 0.08 + hw.index * 0.004; // overlapping highways never flicker
    const pts = walk(hw.pts, 4).filter((p) => !field.inCity(p.x, p.z) && field.deckAt(p.x, p.z) === null);
    let dashRun = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      if (Math.hypot(b.x - a.x, b.z - a.z) > 6) { dashRun = 0; continue; } // a gap (city / bridge)
      const ya = field.groundAt(a.x, a.z) + lift, yb = field.groundAt(b.x, b.z) + lift;
      // Left = (fz, -fx) … right = (-fz, fx) for direction (fx, fz) in x/z.
      const side = (p, off, y) => [p.x + p.fz * off, y, p.z - p.fx * off];
      kit.quad(side(a, -half, ya), side(b, -half, yb), side(b, half, yb), side(a, half, ya), asphalt);
      // Edge lines.
      for (const s of [-1, 1]) {
        const o0 = s * (half - 0.45), o1 = s * (half - 0.25);
        kit.quad(side(a, Math.min(o0, o1), ya + 0.01), side(b, Math.min(o0, o1), yb + 0.01), side(b, Math.max(o0, o1), yb + 0.01), side(a, Math.max(o0, o1), ya + 0.01), edgeCol);
      }
      // Centre dashes: on for dash[0] m, off for dash[1] m.
      const seg = Math.hypot(b.x - a.x, b.z - a.z);
      if (dashRun % (H.dash[0] + H.dash[1]) < H.dash[0]) {
        kit.quad(side(a, -0.12, ya + 0.012), side(b, -0.12, yb + 0.012), side(b, 0.12, yb + 0.012), side(a, 0.12, ya + 0.012), line);
      }
      dashRun += seg;
    }
  }
  const geo = kit.geometry();
  if (!geo) return null;
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'terrain-highways';
  mesh.userData.noCastShadow = true;
  mesh.matrixAutoUpdate = false;
  return mesh;
}

/**
 * The road bridge over the Buriganga: deck that rises from the city edge, parapets, piers
 * down into the river, lamp posts. Gameplay height = field.deckAt(); colliders: Terrain.
 * @returns {{ mesh: THREE.Mesh, glow: THREE.Mesh|null, lamps: Array<{x,y,z}> }}
 */
export function buildBridge(field, cfg, material, glowMaterial) {
  const B = field.bridge;
  if (!B) return null;
  const kit = new QuadKit();
  const glowKit = new QuadKit();
  const deck = hexToLinear(B.deckColor), rail = hexToLinear(B.railColor), pier = hexToLinear(B.pierColor);
  const road = hexToLinear(cfg.highways.color), line = hexToLinear(cfg.highways.lineColor);
  const x0 = B.x - B.half, x1 = B.x + B.half;
  const step = 4;
  const bed = field.waterLevel - cfg.river.bedDepth - 1;
  const lamps = [];
  let dash = 0;
  for (let z = B.z0; z < B.landZ - 0.01; z += step) {
    const za = z, zb = Math.min(B.landZ, z + step);
    const ya = field.deckAt(B.x, za), yb = field.deckAt(B.x, zb);
    // Road surface + the deck slab sides and underside.
    kit.quad([x0, ya, za], [x0, yb, zb], [x1, yb, zb], [x1, ya, za], road);
    if (dash++ % 3 === 0) kit.quad([B.x - 0.12, ya + 0.01, za], [B.x - 0.12, yb + 0.01, zb], [B.x + 0.12, yb + 0.01, zb], [B.x + 0.12, ya + 0.01, za], line);
    const t = 1.2;
    kit.quad([x0 - 0.3, ya - t, za], [x0 - 0.3, yb - t, zb], [x0 - 0.3, yb + 0.05, zb], [x0 - 0.3, ya + 0.05, za], deck); // west face
    kit.quad([x1 + 0.3, yb - t, zb], [x1 + 0.3, ya - t, za], [x1 + 0.3, ya + 0.05, za], [x1 + 0.3, yb + 0.05, zb], deck); // east face
    kit.quad([x0 - 0.3, ya - t, za], [x1 + 0.3, ya - t, za], [x1 + 0.3, yb - t, zb], [x0 - 0.3, yb - t, zb], deck);       // underside
    // Parapets (a low wall each side).
    for (const [a, b] of [[x0 - 0.3, x0 + 0.05], [x1 - 0.05, x1 + 0.3]]) {
      const h = B.railHeight;
      kit.quad([a, ya + h, za], [a, yb + h, zb], [b, yb + h, zb], [b, ya + h, za], rail);
      kit.quad([a, ya, za], [a, yb, zb], [a, yb + h, zb], [a, ya + h, za], rail);
      kit.quad([b, yb, zb], [b, ya, za], [b, ya + h, za], [b, yb + h, zb], rail);
    }
  }
  // Piers every pierEvery metres where the deck is high enough above the water.
  for (let z = B.z0 + B.pierEvery * 0.5; z < B.landZ - 6; z += B.pierEvery) {
    const y = field.deckAt(B.x, z);
    if (y < 2) continue;
    kit.box(B.x - B.half + 1, bed, z - 1.2, B.x + B.half - 1, y - 1.2, z + 1.2, pier);
  }
  // Abutment at the south end (hides the river bank under the deck end).
  kit.box(x0 - 0.3, bed, field.river.z1 - 12, x1 + 0.3, 0.02, B.landZ, pier);
  // Lamp posts on both parapets.
  for (let z = B.z0 + 10; z < B.landZ - 5; z += B.lampEvery) {
    const y = field.deckAt(B.x, z);
    for (const [px, dir] of [[x0 - 0.1, 1], [x1 + 0.1, -1]]) {
      kit.box(px - 0.09, y, z - 0.09, px + 0.09, y + 7.5, z + 0.09, rail);
      kit.box(Math.min(px, px + dir * 1.6), y + 7.4, z - 0.08, Math.max(px, px + dir * 1.6), y + 7.55, z + 0.08, rail);
      const hx = px + dir * 1.5;
      glowKit.box(hx - 0.25, y + 7.2, z - 0.15, hx + 0.25, y + 7.4, z + 0.15, [1, 0.85, 0.55]);
      lamps.push({ x: hx, y: y + 7.1, z });
    }
  }
  const mesh = new THREE.Mesh(kit.geometry(), material);
  mesh.name = 'buriganga-bridge';
  mesh.matrixAutoUpdate = false;
  const gg = glowKit.geometry();
  const glow = gg && glowMaterial ? new THREE.Mesh(gg, glowMaterial) : null;
  if (glow) { glow.name = 'buriganga-bridge-lamps'; glow.matrixAutoUpdate = false; }
  return { mesh, glow, lamps };
}
