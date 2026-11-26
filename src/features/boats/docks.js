// Ghats (Roadmap 2 S7): where boats are moored. Data: data/boats.json → docks.list
// ({ id, name, near: [col, row], free: [types] }). For each ghat the game finds, near `near`,
// a dry walkable spot (`land`) with open water a few metres away, then mooring spots in a row
// along the bank. A small wooden jetty is drawn from the land spot to the boats.
//
//   planDock(world, def)            → { id, name, land:{x,z,heading}, water:{x,z}, spots:[{x,z,heading}] } | null
//   findShore(world, boat, search)  → { x, z, heading } dry land next to the boat, or null
//   buildJetties(docks, waterY)     → one merged mesh for every jetty

import * as THREE from 'three';
import { VBuilder } from '../../entities/vehicles/shapes.js';
import { isRaised } from '../../world/layout.js';

const MOOR_MARGIN = 3.2;   // open water needed around a mooring spot (metres)
const SPACING = 7;         // metres between moored boats (side by side; a yacht is 4.2 m wide)

const dry = (world, x, z) => !world.waterAt(x, z) && !world.collision.isBlocked(x, z, 0.45) && Number.isFinite(world.heightAt(x, z));
/** A ghat stands on a sidewalk, park or plaza in the city (not on a road or a bridge), or on open land outside. */
const bank = (world, x, z) => {
  if (!dry(world, x, z)) return false;
  const p = world.layout.pieceAt(x, z);
  return !p || isRaised(p);
};

/** A dry spot right at the water's edge (lakes in the city are bordered by roads: the kerb side). */
const edge = (world, x, z) => {
  if (!dry(world, x, z)) return false;
  for (let k = 0; k < 8; k++) {
    const b = (k / 8) * Math.PI * 2;
    if (world.waterAt(x + Math.sin(b) * 4, z + Math.cos(b) * 4)) return true;
  }
  return false;
};

export function planDock(world, def) {
  // First a sidewalk / park / open land; if there is none near, the edge of a road by the water.
  return planWith(world, def, bank) || planWith(world, def, edge);
}

function planWith(world, def, okLand) {
  const L = world.layout;
  const cx = L.minX + def.near[0] * L.P + L.W / 2, cz = L.minZ + def.near[1] * L.P + L.W / 2;
  for (let r = 0; r <= 150; r += 3) {
    const steps = r === 0 ? 1 : Math.max(8, Math.round(r / 2));
    let best = null;
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (!okLand(world, x, z)) continue;
      for (let k = 0; k < 16; k++) {
        const b = (k / 16) * Math.PI * 2;
        const dx = Math.sin(b), dz = Math.cos(b);
        for (let d = 4; d <= 12; d += 1.5) {
          const wx = x + dx * d, wz = z + dz * d;
          if (!world.waterAt(wx, wz, MOOR_MARGIN)) continue;
          if (!best || d < best.d) best = { d, land: { x, z, heading: b }, water: { x: wx, z: wz }, dir: { x: dx, z: dz } };
          break;
        }
      }
    }
    if (!best) continue;
    // Mooring spots in a row along the bank, every boat bow-out (pointing to open water), so
    // full throttle takes it away from the bank.
    const px = -best.dir.z, pz = best.dir.x;
    const heading = Math.atan2(best.dir.x, best.dir.z);
    const spots = [];
    for (const k of [0, 1, -1, 2, -2, 3, -3, 4, -4]) {
      const x = best.water.x + px * k * SPACING + best.dir.x * 4, z = best.water.z + pz * k * SPACING + best.dir.z * 4;
      const ok = world.waterAt(x, z, 2.5)
        && world.waterAt(x + best.dir.x * 6, z + best.dir.z * 6, 1.5)
        && world.waterAt(x - best.dir.x * 4, z - best.dir.z * 4, 0.6);
      if (ok) spots.push({ x, z, heading });
    }
    if (!spots.length) continue;
    return { id: def.id, name: def.name, def, land: best.land, water: best.water, dir: best.dir, spots };
  }
  return null;
}

/** The nearest dry, free spot next to a boat (to step out to), or null. */
export function findShore(world, boat, search) {
  const hw = boat.T.width / 2 + 0.8;
  for (let d = hw; d <= search; d += 1) {
    let best = null;
    const steps = Math.max(12, Math.round(d * 3));
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const x = boat.x + Math.sin(a) * d, z = boat.z + Math.cos(a) * d;
      if (!dry(world, x, z)) continue;
      // Not on top of the boat's own hull (long boats).
      if (boat.distanceTo(x, z) < 0.6) continue;
      best = { x, z, heading: a };
      break;
    }
    if (best) return best;
  }
  return null;
}

/** Wooden jetties: planks from the land spot out to the mooring row, on posts. */
export function buildJetties(docks, waterY, colors = { plank: '#8a6a45', post: '#5b4632' }) {
  const vb = new VBuilder();
  for (const d of docks) {
    const ax = d.land.x, az = d.land.z, bx = d.water.x - d.dir.x * 1.2, bz = d.water.z - d.dir.z * 1.2;
    const len = Math.hypot(bx - ax, bz - az);
    const ux = (bx - ax) / (len || 1), uz = (bz - az) / (len || 1), lx = -uz * 1.1, lz = ux * 1.1;
    const y = waterY + 0.75;
    const inside = [(ax + bx) / 2, y - 3, (az + bz) / 2];
    vb.quad([ax + lx, y, az + lz], [ax - lx, y, az - lz], [bx - lx, y, bz - lz], [bx + lx, y, bz + lz], colors.plank, inside);
    vb.quad([ax + lx, y - 0.15, az + lz], [bx + lx, y - 0.15, bz + lz], [bx + lx, y, bz + lz], [ax + lx, y, az + lz], colors.post, [ax - lx, y, az - lz]);
    vb.quad([ax - lx, y - 0.15, az - lz], [bx - lx, y - 0.15, bz - lz], [bx - lx, y, bz - lz], [ax - lx, y, az - lz], colors.post, [ax + lx, y, az + lz]);
    for (let t = 0; t <= len; t += 2.5) {
      for (const s of [1, -1]) {
        const x = ax + ux * t + lx * s, z = az + uz * t + lz * s;
        vb.beam([x, waterY - 1, z], [x, y + 0.9, z], 0.16, colors.post);
      }
    }
  }
  const mesh = new THREE.Mesh(vb.build(), new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.name = 'boat-jetties';
  mesh.matrixAutoUpdate = false;
  return mesh;
}
