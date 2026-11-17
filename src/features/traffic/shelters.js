// Bus-stop shelters: a roof on two posts with a bench, on the sidewalk next to every bus
// stop from world.roads.busStops. All of them are merged into ONE mesh.
// The posters feature hangs a 2:3 poster on the back board of each (features/posters/slots.js).

import * as THREE from 'three';
import { VBuilder } from '../../entities/vehicles/shapes.js';

export function buildShelters(roads, s) {
  if (!roads.busStops.length) return null;
  const vb = new VBuilder();
  for (const stop of roads.busStops) {
    // Local frame: `a` runs along the road, `n` points away from it.
    const ax = Math.sin(stop.heading), az = Math.cos(stop.heading);
    const nx = stop.lx, nz = stop.lz;
    const at = (along, out, y) => [stop.sx + ax * along + nx * out, stop.y + y, stop.sz + az * along + nz * out];
    const hl = s.length / 2, hd = s.depth / 2;
    const slab = (a0, a1, o0, o1, y0, y1, color) => {
      const inside = at((a0 + a1) / 2, (o0 + o1) / 2, (y0 + y1) / 2);
      const p = (a, o, y) => at(a, o, y);
      vb.quad(p(a0, o0, y1), p(a1, o0, y1), p(a1, o1, y1), p(a0, o1, y1), color, inside); // top
      vb.quad(p(a0, o0, y0), p(a1, o0, y0), p(a1, o1, y0), p(a0, o1, y0), color, inside); // bottom
      vb.quad(p(a0, o0, y0), p(a1, o0, y0), p(a1, o0, y1), p(a0, o0, y1), color, inside);
      vb.quad(p(a0, o1, y0), p(a1, o1, y0), p(a1, o1, y1), p(a0, o1, y1), color, inside);
      vb.quad(p(a0, o0, y0), p(a0, o1, y0), p(a0, o1, y1), p(a0, o0, y1), color, inside);
      vb.quad(p(a1, o0, y0), p(a1, o1, y0), p(a1, o1, y1), p(a1, o0, y1), color, inside);
    };
    slab(-hl, hl, -hd - 0.15, hd + 0.1, s.height, s.height + 0.1, s.roofColor);        // roof
    slab(-hl + 0.1, -hl + 0.2, hd - 0.1, hd, 0, s.height, s.postColor);                 // posts
    slab(hl - 0.2, hl - 0.1, hd - 0.1, hd, 0, s.height, s.postColor);
    slab(-hl + 0.2, hl - 0.2, hd - 0.06, hd - 0.02, 0.9, s.height - 0.3, s.postColor);  // back board
    slab(-hl + 0.5, hl - 0.5, -0.1, hd - 0.15, 0.42, 0.5, s.benchColor);                // bench
  }
  const mesh = new THREE.Mesh(vb.build(), new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.name = 'bus-shelters';
  mesh.matrixAutoUpdate = false;
  mesh.frustumCulled = false;
  return mesh;
}
