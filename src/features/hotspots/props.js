// What a hangout spot looks like when nobody is there: a colourful dance mat, a boombox and
// four neon posts. Two small meshes per spot (lit props + glowing neon).

import * as THREE from 'three';
import { GeoBuilder, hexToLinear, shade } from '../../world/geoBuilder.js';
import { cube } from '../../entities/people/shapes.js';

/**
 * @param {{x:number, z:number, y:number, ax:number, az:number, nx:number, nz:number, length:number, depth:number, box:{x:number,z:number}}} spot
 *        ax/az = direction along the rows, nx/nz = direction the rows are stacked in.
 */
export function buildHotspotProps(spot, settings, materials) {
  const group = new THREE.Group();
  group.name = `hotspot-${spot.id}`;
  const lit = new GeoBuilder();
  const neon = new GeoBuilder();
  const colors = settings.matColors.map(hexToLinear);
  const y = spot.y;

  // Dance mat: a strip of coloured tiles under the dancers.
  const tiles = Math.max(2, Math.round(spot.length / 1.2));
  const half = spot.depth / 2;
  for (let i = 0; i < tiles; i++) {
    const t0 = -spot.length / 2 + (i / tiles) * spot.length;
    const t1 = t0 + spot.length / tiles;
    const c = shade(colors[i % colors.length], 0.85);
    const p = (t, n) => [spot.x + spot.ax * t + spot.nx * n, spot.z + spot.az * t + spot.nz * n];
    const [x0, z0] = p(t0, -half), [x1, z1] = p(t1, -half), [x2, z2] = p(t1, half), [x3, z3] = p(t0, half);
    const v = [[x0, z0], [x1, z1], [x2, z2], [x3, z3]].map(([x, z]) => neon.vertex(x, y + 0.02, z, 0, 1, 0, c, 0, 0));
    neon.idx.push(v[0], v[2], v[1], v[0], v[3], v[2], v[0], v[1], v[2], v[0], v[2], v[3]); // both ways round
  }

  // Boombox: dark body, two speakers, handle.
  const b = spot.box;
  const body = hexToLinear('#23252b');
  cube(lit, b.x, y + 0.24, b.z, 0.38, 0.22, 0.16, body);
  cube(lit, b.x, y + 0.5, b.z, 0.26, 0.025, 0.03, hexToLinear('#8a8f98'));
  for (const s of [-1, 1]) {
    cube(neon, b.x + spot.ax * 0.2 * s - spot.nx * 0.165, y + 0.24, b.z + spot.az * 0.2 * s - spot.nz * 0.165, 0.11, 0.11, 0.11, colors[(s + 1) % colors.length]);
    cube(neon, b.x + spot.ax * 0.2 * s + spot.nx * 0.165, y + 0.24, b.z + spot.az * 0.2 * s + spot.nz * 0.165, 0.11, 0.11, 0.11, colors[(s + 2) % colors.length]);
  }

  // Neon posts at the corners of the mat.
  const h = settings.neonHeight;
  let k = 0;
  for (const t of [-spot.length / 2 - 0.3, spot.length / 2 + 0.3]) {
    for (const n of [-half - 0.1, half + 0.1]) {
      const x = spot.x + spot.ax * t + spot.nx * n, z = spot.z + spot.az * t + spot.nz * n;
      cube(lit, x, y + 0.05, z, 0.09, 0.05, 0.09, body);
      cube(neon, x, y + 0.1 + h / 2, z, 0.035, h / 2, 0.035, colors[k++ % colors.length]);
    }
  }
  group.add(new THREE.Mesh(lit.build(), materials.lit));
  group.add(new THREE.Mesh(neon.build(), materials.neon));
  group.traverse((o) => { o.matrixAutoUpdate = false; });
  return group;
}
