// Foot overbridges (Roadmap 2, Session 1): steel deck over the road with solid side panels
// (room for adverts later), a light roof, lamps under it and stairs down to both sidewalks.
// Built with the landmark Kit (src/world/landmarks/kit.js) in a LOCAL space per bridge:
//     origin = road centre under the deck, +x = the way the stairs run down, +z = across the road.
// Positions come from footbridgePlan.js; sizes and colours from data/street.json → footbridges.

import * as THREE from 'three';
import { GeoBuilder } from '../geoBuilder.js';
import { Kit } from '../landmarks/kit.js';

/** Fill a Kit with one footbridge. */
function buildOne(k, F, b) {
  const C = F.colors;
  const dw = F.deckWidth, H = F.clearance + F.deckDepth;
  const zIn = b.half + 0.1, zOut = b.half + 0.1 + F.stairWidth; // the stair strip on each sidewalk
  const x0 = -dw / 2, x1 = dw / 2;
  // Deck, side panels, rails.
  k.box(x0, F.clearance, -zOut, x1, H, zOut, C.deck, { faces: 'nsewtb', flat: true });
  for (const x of [x0 - 0.08, x1]) {
    k.box(x, F.clearance - 0.25, -zIn, x + 0.08, H + 0.55, zIn, C.steel, { faces: 'nsewtb', flat: true });
    k.beam([x + 0.04, H + F.railHeight, -zOut], [x + 0.04, H + F.railHeight, zOut], 0.07, C.rail);
    for (let z = -zOut; z <= zOut + 0.01; z += 2) k.beam([x + 0.04, H + 0.5, z], [x + 0.04, H + F.railHeight, z], 0.05, C.rail);
  }
  // Roof on four posts, lamps hanging under it.
  const roofY = H + 2.55;
  for (const x of [x0 + 0.1, x1 - 0.1]) for (const z of [-zOut + 0.1, zOut - 0.1, 0]) k.beam([x, H, z], [x, roofY, z], 0.1, C.steel);
  k.box(x0 - 0.35, roofY, -zOut - 0.3, x1 + 0.35, roofY + 0.12, zOut + 0.3, C.roof, { faces: 'nsewtb', flat: true });
  for (const z of [-zOut + 1.2, -3, 3, zOut - 1.2]) k.box(-0.25, roofY - 0.1, z - 0.25, 0.25, roofY, z + 0.25, C.lamp, { glow: true, faces: 'b' });
  // Piers under the deck ends (on the kerb strip, inside the stairs' collider).
  for (const z of [-(zIn + zOut) / 2, (zIn + zOut) / 2]) k.prism(0, z, b.kerb, F.clearance, 0.3, 0.26, 6, C.steel);
  // Stairs down along the kerb, both sides.
  const run = F.stairRun, xs = x1, xe = x1 + run;
  const steps = Math.max(8, Math.round((H - b.kerb) / 0.19));
  for (const sgn of [-1, 1]) {
    const za = sgn * zIn, zb = sgn * zOut;
    const lo = Math.min(za, zb), hi = Math.max(za, zb);
    for (let i = 0; i < steps; i++) {
      const top = b.kerb + ((H - b.kerb) * (steps - i)) / steps;
      const xa = xs + (run * i) / steps, xb = xs + (run * (i + 1)) / steps;
      k.box(xa, top - 0.07, lo, xb, top, hi, C.stairs, { faces: 'nsewt', flat: true });
    }
    for (const z of [za, zb]) {
      k.beam([xs, H - 0.12, z], [xe, b.kerb, z], 0.16, C.steel);                       // stringer
      k.beam([xs, H + 1.0, z], [xe, b.kerb + 1.0, z], 0.06, C.rail);                    // handrail
      for (const t of [0.33, 0.66]) {
        const x = xs + run * t, y = H + (b.kerb - H) * t;
        k.beam([x, y - 0.1, z], [x, y + 1.0, z], 0.05, C.rail);
      }
    }
    k.beam([xs + run * 0.5, b.kerb, sgn * (zIn + zOut) / 2], [xs + run * 0.5, (H + b.kerb) / 2 - 0.2, sgn * (zIn + zOut) / 2], 0.18, C.steel);
  }
}

export class Footbridges {
  /**
   * @param {Array} list  from footbridgePlan.js
   * @param {object} F    data/street.json → footbridges
   * @param {{lit:THREE.Material, glow:THREE.Material}} materials
   */
  constructor(list, F, materials, parent) {
    this.F = F;
    this.units = [];
    this.group = new THREE.Group();
    this.group.name = 'footbridges';
    parent.add(this.group);
    for (const b of list) {
      const builders = { lit: new GeoBuilder(), glow: new GeoBuilder(), sign: new GeoBuilder() };
      // Kit angle: its local +x must point along (ux, uz) in the world.
      const site = { cx: b.cx, cz: b.cz, y: 0, angle: Math.atan2(-b.uz, b.ux) };
      buildOne(new Kit(builders, site), F, b);
      const node = new THREE.Group();
      node.name = b.id;
      node.add(new THREE.Mesh(builders.lit.build(), materials.lit));
      const glow = new THREE.Mesh(builders.glow.build(), materials.glow);
      glow.userData.noCastShadow = true;
      node.add(glow);
      node.traverse((o) => { o.matrixAutoUpdate = false; });
      this.group.add(node);
      this.units.push({ node, cx: b.cx, cz: b.cz });
    }
  }

  /** Hide bridges out of view. */
  update(focus, viewDistance) {
    const far = viewDistance + this.F.viewMargin;
    for (const u of this.units) u.node.visible = Math.hypot(u.cx - focus.x, u.cz - focus.z) < far;
  }
}
