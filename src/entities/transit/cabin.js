// Cabin: the inside of a bus / MRT car / train car, seen from the inside ride view
// (Roadmap 2 S6). The outside bodies of the vehicles are single-sided shells, so from inside
// they are invisible — this adds a floor, inner walls (with an OPEN window band you look
// through), ceiling, seats, poles and ceiling lights. Settings: data/transit.json → cabins.
//
// Local frame (same as vehicles and the landmark Kit): x = to the LEFT, y = up, z = forward,
// origin = middle of the vehicle on the ground.
//
//   const cabin = getCabin(kind, cfg)   (built once per kind and kept)
//     cabin.geometry / cabin.lights      merged geometries (lit / glowing)
//     cabin.seats     [{ x, z, heading, row }]   people sit here (heading 0 = facing forward)
//     cabin.standing  [{ x, z, heading }]
//     cabin.doors     [{ x, z, side }]           inside the door (x on the wall)
//     cabin.floor     floor height (people stand / sit at this y)
//     cabin.eye       { x, y, z } inside camera position
//   placeCabinMesh(mesh, pose)   put a cabin mesh where a vehicle is

import * as THREE from 'three';
import { VBuilder } from '../vehicles/shapes.js';

const cache = new Map();

function build(kind, C, cam) {
  const vb = new VBuilder();
  const glow = new VBuilder();
  const L = C.length / 2, W = C.width / 2, f = C.floor, top = f + C.height;
  const [w0, w1] = C.window;
  const col = C.colors;
  // VBuilder turns each quad to face AWAY from the point given last, so for an inside we pass a
  // point OUTSIDE the cabin (below the floor, above the ceiling, beyond a wall): faces look in.
  vb.quad([-W, f + 0.01, -L], [W, f + 0.01, -L], [W, f + 0.01, L], [-W, f + 0.01, L], col.floor, [0, f - 5, 0]);
  vb.quad([-W, top, -L], [W, top, -L], [W, top, L], [-W, top, L], col.ceiling, [0, top + 5, 0]);
  // Side walls: below and above the window band; a thin pillar every ~1.6 m.
  for (const s of [-1, 1]) {
    const x = s * W;
    const inner = [s * W * 4, f + 1, 0]; // outside this wall (see above)
    vb.quad([x, f, -L], [x, f, L], [x, f + w0, L], [x, f + w0, -L], col.wall, inner);
    vb.quad([x, f + w1, -L], [x, f + w1, L], [x, top, L], [x, top, -L], col.wall, inner);
    const n = Math.max(2, Math.round(C.length / 1.6));
    for (let i = 0; i <= n; i++) {
      const z = -L + (i / n) * C.length;
      vb.quad([x, f + w0, z - 0.07], [x, f + w0, z + 0.07], [x, f + w1, z + 0.07], [x, f + w1, z - 0.07], col.wall, inner);
    }
  }
  // End walls: the back is closed below and above the window band; the front too (you see out).
  for (const e of [-1, 1]) {
    const z = e * L;
    const inner = [0, f + 1, e * L * 3];
    vb.quad([-W, f, z], [W, f, z], [W, f + w0, z], [-W, f + w0, z], col.wall, inner);
    vb.quad([-W, f + w1, z], [W, f + w1, z], [W, top, z], [-W, top, z], col.wall, inner);
  }
  // Ceiling lights (glow): two strips along the car.
  for (const s of [-1, 1]) {
    const x = s * W * 0.45;
    glow.quad([x - 0.08, top - 0.02, -L + 0.4], [x + 0.08, top - 0.02, -L + 0.4], [x + 0.08, top - 0.02, L - 0.4], [x - 0.08, top - 0.02, L - 0.4], col.light, [x, top + 5, 0]);
  }

  const S = C.seats;
  const seats = [];
  const seatBox = (x, z, heading, hw, depth) => {
    // Cushion + backrest. heading 0 faces +z (forward), ±π/2 faces across.
    const sh = S.height;
    if (heading === 0) {
      vb.box({ x, w: hw, y0: f, y1: f + sh, z0: z - depth / 2, z1: z + depth / 2, c: { side: col.seat, top: col.seat }, skip: 'b' });
      vb.box({ x, w: hw, y0: f + sh, y1: f + sh + 0.55, z0: z - depth / 2 - 0.08, z1: z - depth / 2, c: col.seatBack, skip: 'b' });
    }
  };
  if (S.kind === 'rows') {
    const hw = S.seatWidth / 2;
    const xs = [S.aisle / 2 + hw, S.aisle / 2 + 3 * hw].flatMap((x) => [x, -x]);
    let row = 0;
    for (let z = -L + S.back + 0.25; z <= L - S.front; z += S.pitch, row++) {
      for (const x of xs) {
        seatBox(x, z, 0, hw - 0.02, 0.44);
        seats.push({ x, z, heading: 0, row });
      }
    }
  } else {
    // Long benches along both walls, facing the middle, broken by the door spaces.
    const inside = (z) => !S.gaps.some(([a, b]) => z > a - 0.35 && z < b + 0.35);
    for (const s of [-1, 1]) {
      const x = s * (W - S.depth / 2 - 0.05);
      const heading = s > 0 ? -Math.PI / 2 : Math.PI / 2; // face the middle
      for (let z = -L + S.ends; z <= L - S.ends; z += S.spacing) {
        if (!inside(z)) continue;
        seats.push({ x, z, heading, row: Math.round(z) });
      }
      // The bench pieces between the gaps.
      const edges = [-L + S.ends - 0.3, ...S.gaps.flat(), L - S.ends + 0.3];
      for (let i = 0; i + 1 < edges.length; i += 2) {
        const z0 = edges[i], z1 = edges[i + 1];
        vb.box({ x, w: S.depth / 2, y0: f, y1: f + S.height, z0, z1, c: col.seat, skip: 'b' });
        const bx = s * (W - 0.04);
        vb.box({ x: bx, w: 0.04, y0: f + S.height, y1: f + S.height + 0.5, z0, z1, c: col.seatBack, skip: 'b' });
      }
    }
  }
  // Poles: vertical ones in the aisle and a bar near the ceiling.
  for (const [x, z] of C.standing) {
    vb.beam([x + (x === 0 ? 0.32 : 0), f, z], [x + (x === 0 ? 0.32 : 0), top, z], 0.05, col.pole);
  }
  for (const s of [-1, 1]) vb.beam([s * 0.35, top - 0.25, -L + 0.5], [s * 0.35, top - 0.25, L - 0.5], 0.04, col.pole);

  // Seats right in front of the inside camera (it sits at the back wall, and the back depends on
  // the direction of travel) stay free, so nobody's head fills the view.
  const eyeZone = L - cam.eyeBack - 1.5;
  for (const st of seats) st.nearEye = Math.abs(st.z) > eyeZone && Math.abs(st.x) < 1.3;
  const standing = C.standing.map(([x, z]) => ({ x, z, heading: x === 0 ? 0 : x > 0 ? -Math.PI / 2 : Math.PI / 2 }));
  const doors = C.doors.map(([side, z]) => ({ x: side * W, z, side }));
  return {
    kind,
    geometry: vb.build(),
    lights: glow.build(),
    seats, standing, doors,
    floor: f,
    length: C.length, width: C.width,
    eye: { x: 0, y: f + cam.eyeHeight, z: -L + cam.eyeBack },
    driver: C.driver ? { x: C.driver[0], z: C.driver[1] } : null,
  };
}

/** The cabin of one kind ('bus' | 'metro' | 'train'), built on first use. */
export function getCabin(game, kind) {
  if (!cache.has(kind)) {
    const t = game.config.get('transit');
    cache.set(kind, build(kind, t.cabins[kind], t.camera));
  }
  return cache.get(kind);
}

/** Meshes for showing a cabin (one lit, one glowing). Add `group` to the scene. */
export function makeCabinMeshes(cabin) {
  const group = new THREE.Group();
  group.name = `cabin-${cabin.kind}`;
  const lit = new THREE.Mesh(cabin.geometry, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, emissive: 0x222222 }));
  const glow = new THREE.Mesh(cabin.lights, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  group.add(lit, glow);
  group.matrixAutoUpdate = false;
  return group;
}

/** Local cabin point → world point for a vehicle at pose { x, y, z, heading }. */
export function toWorld(pose, lx, ly, lz, out = {}) {
  const c = Math.cos(pose.heading), s = Math.sin(pose.heading);
  out.x = pose.x + lx * c + lz * s;
  out.y = pose.y + ly;
  out.z = pose.z - lx * s + lz * c;
  return out;
}

export function placeCabinMesh(group, pose) {
  group.position.set(pose.x, pose.y, pose.z);
  group.rotation.set(0, pose.heading, 0);
  group.updateMatrix();
}

export function disposeCabinMeshes(group) {
  group.traverse((o) => o.material?.dispose());
  group.removeFromParent();
}

/**
 * Shoumik's seat: a free one in the middle-front part of the cabin, by a window, so he does not
 * block the inside view (the camera is at the back) and the passengers sit around him.
 */
export function pickSeat(cabin, used = new Set()) {
  const free = cabin.seats.filter((s) => !used.has(s) && !s.nearEye);
  const list = free.length ? free : cabin.seats;
  const want = cabin.length * 0.12;
  const score = (s) => Math.abs(s.z - want) - Math.abs(s.x) * 0.3;
  return list.reduce((a, b) => (score(b) < score(a) ? b : a), list[0]);
}
