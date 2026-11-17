// Low-poly bodies for the four-wheelers: car (sedan / SUV / sports), pickup (police),
// van (ambulance), bus and leguna. PS2 style: a few boxes, flat colours, dark glass.
// Each builder gets  vb (VBuilder), T (the type from data/vehicles.json), C (colours:
// paint, second + the shared palette).  Vehicle space: +z forward, +x left.

import { tint } from './shapes.js';

/** Bumpers, head- and tail-lights shared by all four-wheelers. */
function ends(vb, C, hw, zb, zf, y, lampY) {
  vb.box({ w: hw - 0.03, y0: y - 0.03, y1: y + 0.17, z0: zf - 0.05, z1: zf + 0.08, c: C.trim });
  vb.box({ w: hw - 0.03, y0: y - 0.03, y1: y + 0.17, z0: zb - 0.08, z1: zb + 0.05, c: C.trim });
  for (const s of [-1, 1]) {
    vb.box({ x: s * (hw - 0.3), w: 0.17, y0: lampY, y1: lampY + 0.14, z0: zf - 0.06, z1: zf + 0.03, c: C.headlight });
    vb.box({ x: s * (hw - 0.28), w: 0.16, y0: lampY, y1: lampY + 0.13, z0: zb - 0.03, z1: zb + 0.06, c: C.taillight });
  }
}

/** Roof light bar: police = red + blue, ambulance = red + red. */
function lightbar(vb, C, kind, y, z) {
  const left = C.lightRed, right = kind === 'police' ? C.lightBlue : C.lightRed;
  vb.box({ x: 0.3, w: 0.26, y0: y, y1: y + 0.14, z0: z - 0.1, z1: z + 0.1, c: left });
  vb.box({ x: -0.3, w: 0.26, y0: y, y1: y + 0.14, z0: z - 0.1, z1: z + 0.1, c: right });
  vb.box({ w: 0.06, y0: y, y1: y + 0.1, z0: z - 0.08, z1: z + 0.08, c: C.trim });
}

export function buildCar(vb, T, C) {
  const [L, W, H] = T.size;
  const s = T.shape;
  const hw = W / 2, zf = L / 2, zb = -L / 2;
  const cabF = s.cabFront * L, cabB = s.cabBack * L;
  // Lower body, slightly narrower at the top, nose and tail pulled in.
  vb.box({ w: hw, tw: hw - 0.04, y0: s.clearance, y1: s.belt, z0: zb, z1: zf, tz0: zb + 0.06, tz1: zf - 0.12, c: { side: C.paint, top: tint(C.paint, 1.08) } });
  // Cabin: glass all round, painted roof.
  const cw = hw - 0.06, rw = cw - s.roofInset;
  vb.box({ w: cw, tw: rw, y0: s.belt, y1: H, z0: cabB, z1: cabF, tz0: cabB + s.slopeBack, tz1: cabF - s.slopeFront, c: { side: C.glass, top: C.paint } });
  // Door pillar so the side is not one long window.
  const pz = (cabB + s.slopeBack + cabF - s.slopeFront) / 2;
  vb.box({ w: cw + 0.012, tw: rw + 0.012, y0: s.belt, y1: H - 0.01, z0: pz - 0.07, z1: pz + 0.07, c: C.paint, skip: 'bt' });
  ends(vb, C, hw, zb, zf, s.clearance + 0.05, s.belt - 0.26);
  if (s.spoiler) {
    vb.box({ w: hw - 0.08, y0: s.belt + 0.16, y1: s.belt + 0.21, z0: zb + 0.05, z1: zb + 0.4, c: C.trim, skip: '' });
    for (const x of [-1, 1]) vb.box({ x: x * (hw - 0.3), w: 0.03, y0: s.belt, y1: s.belt + 0.16, z0: zb + 0.14, z1: zb + 0.28, c: C.trim });
  }
}

export function buildPickup(vb, T, C) {
  const [L, W, H] = T.size;
  const hw = W / 2, zf = L / 2, zb = -L / 2;
  const gc = 0.34, belt = 1.05, cabB = -0.05 * L, cabF = 0.27 * L;
  vb.box({ w: hw, tw: hw - 0.03, y0: gc, y1: belt, z0: zb, z1: zf, tz1: zf - 0.1, c: { side: C.paint, top: C.trim } });
  vb.box({ w: hw - 0.05, tw: hw - 0.14, y0: belt, y1: H, z0: cabB, z1: cabF, tz0: cabB + 0.08, tz1: cabF - 0.42, c: { side: C.glass, top: C.paint, back: C.paint } });
  vb.box({ w: hw, tw: hw - 0.03, y0: belt, y1: belt + 0.02, z0: cabF - 0.02, z1: zf - 0.1, c: C.paint }); // bonnet
  // Load bed: two side walls, a tailgate and benches for the officers.
  for (const x of [-1, 1]) vb.box({ x: x * (hw - 0.05), w: 0.05, y0: belt, y1: belt + 0.32, z0: zb, z1: cabB, c: C.paint });
  vb.box({ w: hw, y0: belt, y1: belt + 0.32, z0: zb, z1: zb + 0.07, c: C.paint });
  for (const x of [-1, 1]) vb.box({ x: x * (hw - 0.32), w: 0.2, y0: belt, y1: belt + 0.2, z0: zb + 0.15, z1: cabB - 0.1, c: C.seat });
  if (T.stripe) {
    for (const x of [-1, 1]) vb.box({ x: x * (hw + 0.005), w: 0.01, y0: belt - 0.3, y1: belt - 0.16, z0: zb + 0.2, z1: zf - 0.5, c: T.stripe });
  }
  if (T.lightbar) lightbar(vb, C, T.lightbar, H, (cabB + cabF) / 2 - 0.15);
  ends(vb, C, hw, zb, zf, gc + 0.04, belt - 0.3);
}

export function buildVan(vb, T, C) {
  const [L, W, H] = T.size;
  const hw = W / 2, zf = L / 2, zb = -L / 2;
  const gc = 0.32, belt = 1.15, noseB = zf - 1.15;
  vb.box({ w: hw, y0: gc, y1: belt, z0: zb, z1: zf, c: C.paint });
  // Tall box body, windscreen sloping down to a short nose.
  vb.box({ w: hw, tw: hw - 0.06, y0: belt, y1: H, z0: zb, z1: noseB + 0.75, tz1: noseB + 0.15, c: { side: C.paint, front: C.glass, top: tint(C.paint, 0.96) } });
  vb.box({ w: hw, tw: hw - 0.02, y0: belt, y1: belt + 0.03, z0: noseB + 0.7, z1: zf - 0.06, c: C.paint });
  for (const x of [-1, 1]) {
    vb.box({ x: x * (hw + 0.006), w: 0.01, y0: belt + 0.12, y1: belt + 0.62, z0: noseB - 0.55, z1: noseB + 0.3, c: C.glass }); // cab window
    if (T.stripe) vb.box({ x: x * (hw + 0.008), w: 0.012, y0: belt - 0.28, y1: belt - 0.08, z0: zb + 0.1, z1: zf - 0.2, c: T.stripe });
  }
  vb.box({ w: hw - 0.3, y0: belt + 0.2, y1: H - 0.35, z0: zb - 0.01, z1: zb + 0.02, c: C.glass }); // rear door windows
  if (T.lightbar) lightbar(vb, C, T.lightbar, H, noseB - 0.1);
  ends(vb, C, hw, zb, zf, gc + 0.04, belt - 0.34);
}

export function buildBus(vb, T, C) {
  const [L, W, H] = T.size;
  const hw = W / 2, zf = L / 2, zb = -L / 2;
  const gc = 0.42, sill = 1.45, top = 2.35;
  const second = C.second || tint(C.paint, 1.3);
  vb.box({ w: hw, y0: gc, y1: sill - 0.28, z0: zb, z1: zf, c: C.paint });                 // skirt
  vb.box({ w: hw, y0: sill - 0.28, y1: sill, z0: zb, z1: zf, c: second });                // colour band
  vb.box({ w: hw - 0.02, y0: sill, y1: top, z0: zb + 0.02, z1: zf - 0.02, c: C.glass });   // windows
  vb.box({ w: hw, tw: hw - 0.12, y0: top, y1: H, z0: zb, z1: zf, tz0: zb + 0.1, tz1: zf - 0.25, c: { side: C.paint, top: tint(C.paint, 0.8) } });
  // Window pillars, the solid back corner and a dark door on the left near the front.
  const bays = 7;
  for (let i = 0; i <= bays; i++) {
    const z = zb + 0.5 + ((L - 2.1) / bays) * i;
    vb.box({ w: hw + 0.01, y0: sill, y1: top, z0: z - 0.07, z1: z + 0.07, c: C.paint, skip: 'bt' });
  }
  vb.box({ w: hw + 0.01, y0: sill, y1: top, z0: zb, z1: zb + 0.45, c: C.paint, skip: 'bt' });
  vb.box({ x: hw + 0.006, w: 0.012, y0: gc + 0.05, y1: top - 0.1, z0: zf - 2.0, z1: zf - 1.15, c: C.trim });
  vb.box({ w: hw - 0.25, y0: H, y1: H + 0.16, z0: zb + 1.2, z1: zf - 2.4, c: C.chrome, skip: 'b' }); // roof rack
  vb.box({ w: hw - 0.5, y0: top - 0.02, y1: H - 0.08, z0: zf - 0.03, z1: zf + 0.015, c: second });  // destination board
  ends(vb, C, hw, zb, zf, gc + 0.05, sill - 0.6);
}

export function buildLeguna(vb, T, C) {
  const [L, W, H] = T.size;
  const hw = W / 2, zf = L / 2, zb = -L / 2;
  const gc = 0.3, belt = 1.02, cabB = zf - 1.45;
  const second = tint(C.paint, 0.72);
  vb.box({ w: hw, y0: gc, y1: belt, z0: zb, z1: zf, c: C.paint });
  // Cab with a flat nose.
  vb.box({ w: hw - 0.03, tw: hw - 0.1, y0: belt, y1: H - 0.25, z0: cabB, z1: zf - 0.05, tz1: zf - 0.4, c: { side: C.glass, top: C.paint, back: C.paint } });
  // Passenger box: roof on corner posts, open sides above a low wall, open back.
  vb.box({ w: hw, y0: belt, y1: belt + 0.3, z0: zb, z1: cabB, c: second, skip: 'bk' });
  vb.box({ w: hw - 0.04, y0: belt + 0.3, y1: H - 0.1, z0: zb + 0.06, z1: cabB, c: C.trim, skip: 'bt' }); // dark inside
  vb.box({ w: hw + 0.03, y0: H - 0.1, y1: H, z0: zb - 0.05, z1: cabB + 0.1, c: C.paint, skip: '' });
  for (const x of [-1, 1]) {
    for (const z of [zb + 0.05, (zb + cabB) / 2]) vb.box({ x: x * (hw - 0.02), w: 0.035, y0: belt + 0.3, y1: H - 0.1, z0: z - 0.04, z1: z + 0.04, c: C.paint });
  }
  vb.box({ w: 0.45, y0: gc, y1: gc + 0.06, z0: zb - 0.3, z1: zb, c: C.chrome, skip: '' }); // back step
  ends(vb, C, hw, zb, zf, gc + 0.04, belt - 0.32);
}
