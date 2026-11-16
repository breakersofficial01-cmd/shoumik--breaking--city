// Low-poly bodies for the small vehicles: CNG auto-rickshaw, cycle rickshaw, bicycle and
// motorbike. Their riders are real crowd people seated on top (see fleet.js).
// Vehicle space: +z forward, +x left. Wheels are drawn separately (instanced).

import { tint } from './shapes.js';

export function buildCng(vb, T, C) {
  const [L, W, H] = T.size;
  const hw = W / 2, zf = L / 2, zb = -L / 2;
  const gc = 0.2, belt = 0.92;
  // Green tub, narrow at the nose.
  vb.box({ w: hw, wf: 0.3, y0: gc, y1: belt, z0: zb, z1: zf, c: C.paint });
  // Windscreen, then the dark canopy over driver and passengers.
  vb.box({ w: hw * 0.72, wf: 0.36, tw: hw * 0.62, y0: belt, y1: H - 0.12, z0: zf - 0.75, z1: zf - 0.28, tz1: zf - 0.55, c: { side: C.glass, back: C.trim } });
  vb.box({ w: hw - 0.02, tw: hw - 0.1, y0: H - 0.14, y1: H, z0: zb + 0.1, z1: zf - 0.5, c: C.cngRoof, skip: '' });
  // Back wall + engine cover, corner posts, and the grille doors of the passenger cage.
  vb.box({ w: hw - 0.02, y0: belt, y1: H - 0.14, z0: zb + 0.1, z1: zb + 0.4, c: C.paint });
  vb.box({ w: hw - 0.25, y0: belt + 0.25, y1: H - 0.3, z0: zb + 0.08, z1: zb + 0.11, c: C.glass });
  for (const x of [-1, 1]) {
    vb.box({ x: x * (hw - 0.05), w: 0.03, y0: belt, y1: H - 0.14, z0: -0.1, z1: -0.03, c: C.paint });
    vb.box({ x: x * (hw - 0.03), w: 0.012, y0: belt, y1: belt + 0.38, z0: zb + 0.4, z1: -0.1, c: C.trim });
  }
  vb.box({ w: hw - 0.2, y0: 0.5, y1: 0.62, z0: zb + 0.4, z1: -0.12, c: C.seat });  // passenger bench
  vb.box({ w: 0.12, y0: belt - 0.2, y1: belt - 0.08, z0: zf - 0.05, z1: zf + 0.03, c: C.headlight });
  for (const x of [-1, 1]) vb.box({ x: x * (hw - 0.2), w: 0.1, y0: belt - 0.2, y1: belt - 0.1, z0: zb - 0.02, z1: zb + 0.03, c: C.taillight });
}

export function buildRickshaw(vb, T, C) {
  const frame = C.rickshawFrame, steel = C.chrome;
  const hood = C.paint, hood2 = tint(C.paint, 0.7);
  // Frame: spine, front fork, handlebar, saddle, pedals' chain case.
  vb.beam([0, 0.42, -0.75], [0, 0.6, 0.55], 0.06, frame);
  vb.beam([0, 0.6, 0.55], [0, 1.06, 0.72], 0.05, frame);
  vb.beam([0, 0.36, 0.86], [0, 1.06, 0.72], 0.045, steel);
  vb.beam([-0.3, 1.08, 0.7], [0.3, 1.08, 0.7], 0.04, steel);
  vb.beam([0, 0.6, 0.3], [0, 0.94, 0.26], 0.05, frame);
  vb.box({ w: 0.11, y0: 0.94, y1: 1.0, z0: 0.14, z1: 0.42, c: C.trim, skip: '' });
  vb.box({ w: 0.03, y0: 0.26, y1: 0.36, z0: 0.05, z1: 0.5, c: frame, skip: '' });
  // Passenger seat: footboard, cushion, backrest, side arms.
  vb.box({ w: 0.36, y0: 0.4, y1: 0.45, z0: -0.2, z1: 0.18, c: steel, skip: '' });
  vb.box({ w: 0.45, y0: 0.45, y1: 0.72, z0: -0.82, z1: -0.2, c: { side: frame, top: C.rickshawSeat } });
  vb.box({ w: 0.45, y0: 0.72, y1: 1.2, z0: -0.86, z1: -0.74, c: { side: hood2, front: C.rickshawSeat } });
  for (const x of [-1, 1]) vb.box({ x: x * 0.46, w: 0.025, y0: 0.72, y1: 0.9, z0: -0.8, z1: -0.25, c: steel });
  // Folding hood: back, roof and two side flaps in the paint colour with a darker trim.
  vb.box({ w: 0.5, y0: 1.2, y1: 1.72, z0: -0.9, z1: -0.82, c: hood });
  vb.box({ w: 0.5, tw: 0.46, y0: 1.72, y1: 1.78, z0: -0.9, z1: -0.1, c: { side: hood2, top: hood }, skip: '' });
  for (const x of [-1, 1]) {
    vb.box({ x: x * 0.49, w: 0.015, y0: 1.2, y1: 1.72, z0: -0.82, z1: -0.45, c: hood });
    vb.beam([x * 0.49, 0.9, -0.3], [x * 0.47, 1.74, -0.12], 0.03, steel);
  }
  // Mudguards over the back wheels.
  for (const x of [-1, 1]) vb.box({ x: x * 0.475, w: 0.05, y0: 0.72, y1: 0.76, z0: -0.98, z1: -0.5, c: hood2, skip: '' });
}

export function buildBicycle(vb, T, C) {
  const p = C.paint, steel = C.chrome;
  const rear = [0, 0.33, -0.52], front = [0, 0.33, 0.53], crank = [0, 0.3, -0.05];
  const seatTop = [0, 0.9, -0.22], head = [0, 0.86, 0.38];
  vb.beam(crank, seatTop, 0.04, p);
  vb.beam(seatTop, head, 0.04, p);
  vb.beam(crank, head, 0.045, p);
  vb.beam(rear, crank, 0.035, p);
  vb.beam(rear, seatTop, 0.03, p);
  vb.beam(front, [0, 1.0, 0.34], 0.035, steel);
  vb.beam([-0.24, 1.0, 0.33], [0.24, 1.0, 0.33], 0.03, steel);
  vb.box({ w: 0.07, y0: 0.9, y1: 0.95, z0: -0.34, z1: -0.1, c: C.trim, skip: '' });
  vb.box({ w: 0.09, y0: 0.66, y1: 0.69, z0: -0.82, z1: -0.42, c: steel, skip: '' }); // carrier
  vb.beam([-0.1, 0.3, -0.05], [0.1, 0.3, -0.05], 0.03, C.trim);
}

export function buildMotorbike(vb, T, C) {
  const p = C.paint, dark = C.trim, steel = C.chrome;
  vb.box({ w: 0.15, tw: 0.11, y0: 0.26, y1: 0.62, z0: -0.3, z1: 0.3, c: dark });                         // engine
  vb.box({ w: 0.16, tw: 0.12, y0: 0.62, y1: 0.92, z0: -0.05, z1: 0.42, tz1: 0.34, c: p });               // tank
  vb.box({ w: 0.14, y0: 0.68, y1: 0.8, z0: -0.7, z1: -0.05, c: C.seat });                                 // seat
  vb.box({ w: 0.1, tw: 0.07, y0: 0.6, y1: 0.72, z0: -0.92, z1: -0.6, c: p });                             // tail
  vb.box({ w: 0.05, y0: 0.66, y1: 0.72, z0: -0.94, z1: -0.9, c: C.taillight, skip: '' });
  vb.beam([0, 0.31, 0.68], [0, 1.0, 0.44], 0.06, steel);                                                  // fork
  vb.beam([-0.33, 1.02, 0.42], [0.33, 1.02, 0.42], 0.035, dark);                                          // handlebar
  vb.box({ w: 0.09, y0: 0.82, y1: 0.98, z0: 0.48, z1: 0.58, c: { side: p, front: C.headlight } });
  vb.box({ w: 0.07, y0: 0.62, y1: 0.66, z0: 0.5, z1: 0.9, c: p, skip: '' });                              // front mudguard
  vb.beam([-0.17, 0.34, -0.2], [-0.19, 0.42, -0.9], 0.07, steel);                                         // exhaust
  vb.beam([0, 0.31, -0.68], [0, 0.5, -0.25], 0.05, dark);                                                 // swing arm
}
