// Code-built military models (Roadmap 2 S8). Plain olive paint, no insignia, crests or numbers.
//
//   buildTank(vb, T, C)        the HULL of a tank (style 'tank' in data/vehicles.json): low armoured
//                              body, sloped glacis, two tracks with skirts. The fleet draws it like
//                              any vehicle (physics, damage, wreck). Its wheels sit hidden inside the
//                              tracks.
//   buildTurretGeometry(T, o)  the TURRET + gun as two geometries { turret, barrel } in the same
//                              vehicle space (+z forward, +x left, y up), origin = the turret ring.
//                              src/features/army/tank.js hangs them on the vehicle mesh and turns them.
//
// When a CC0 tank model is added later (see docs/NEXT.md), only these two builders change.

import { VBuilder } from './shapes.js';

const shade = (hex, k) => {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * k)));
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
};

/** Tank hull + tracks. T.size = [length, width, hull height]. */
export function buildTank(vb, T, C) {
  const [L, W, H] = T.size;
  const hw = W / 2, zf = L / 2, zb = -L / 2;
  const trackW = T.trackWidth || 0.62, trackH = T.trackHeight || 0.95;
  const inner = hw - trackW;
  const paint = C.paint, dark = shade(paint, 0.72), tread = C.tyre || '#1c1c1c';
  // Tracks: long dark boxes with sloped ends, a darker skirt on top.
  for (const s of [-1, 1]) {
    const x = s * (hw - trackW / 2);
    vb.box({ x, w: trackW / 2, y0: 0.02, y1: trackH, z0: zb + 0.35, z1: zf - 0.35, tz0: zb + 0.05, tz1: zf - 0.05, c: tread, skip: '' });
    vb.box({ x, w: trackW / 2 + 0.03, y0: trackH - 0.16, y1: trackH + 0.06, z0: zb + 0.02, z1: zf - 0.02, c: dark });
    // Road wheel hubs showing through the track side.
    for (let i = 0; i < 6; i++) {
      const z = zb + 0.9 + ((L - 1.8) / 5) * i;
      vb.box({ x: s * (hw + 0.005), w: 0.012, y0: 0.22, y1: 0.62, z0: z - 0.2, z1: z + 0.2, c: '#3a3a36' });
    }
  }
  // Hull between the tracks, then the wide upper hull over them with a sloped front plate.
  vb.box({ w: inner, y0: 0.35, y1: trackH, z0: zb + 0.4, z1: zf - 0.5, c: dark });
  vb.box({ w: hw + 0.04, tw: hw - 0.05, y0: trackH + 0.06, y1: H, z0: zb + 0.1, z1: zf - 0.9, tz1: zf - 1.9, c: { side: paint, top: shade(paint, 1.08), front: paint } });
  vb.box({ w: hw - 0.08, y0: trackH - 0.1, y1: trackH + 0.08, z0: zf - 0.9, z1: zf - 0.1, tz1: zf - 0.2, c: paint }); // glacis lip
  // Engine deck grille at the back, tool boxes on the fenders, head and tail lights.
  vb.box({ w: hw - 0.6, y0: H, y1: H + 0.05, z0: zb + 0.35, z1: zb + 1.6, c: shade(paint, 0.55) });
  for (const s of [-1, 1]) {
    vb.box({ x: s * (hw - 0.3), w: 0.22, y0: H, y1: H + 0.22, z0: zb + 1.9, z1: zb + 3.0, c: dark });
    vb.box({ x: s * (hw - 0.35), w: 0.12, y0: trackH + 0.1, y1: trackH + 0.26, z0: zf - 0.22, z1: zf - 0.08, c: C.headlight || '#fff4d0' });
    vb.box({ x: s * (hw - 0.35), w: 0.1, y0: H - 0.25, y1: H - 0.12, z0: zb + 0.04, z1: zb + 0.12, c: C.taillight || '#c0201c' });
  }
}

/** Turret (with hatch and a small machine-gun mount) and the main gun, as two geometries. */
export function buildTurretGeometry(T, o) {
  const tr = T.turret || {};
  const r = tr.width ? tr.width / 2 : 1.35;
  const len = tr.length || 3.4, h = tr.height || 0.95, back = tr.back ?? 1.5;
  const color = o.turretColor, dark = shade(color, 0.75);
  const t = new VBuilder();
  // A flattened turret: wide middle, narrower nose and tail.
  t.box({ w: r * 0.8, wf: r * 0.62, tw: r * 0.7, twf: r * 0.5, y0: 0, y1: h, z0: -back, z1: len - back, tz0: -back + 0.2, tz1: len - back - 0.45, c: { side: color, top: shade(color, 1.1), front: dark } });
  t.box({ w: r * 0.9, tw: r * 0.82, y0: 0, y1: h * 0.75, z0: -back * 0.5, z1: len * 0.35, c: color }); // cheeks
  t.box({ w: 0.42, y0: h, y1: h + 0.12, z0: -0.7, z1: 0.1, c: dark });                            // hatch
  t.box({ x: 0.55, w: 0.06, y0: h + 0.12, y1: h + 0.42, z0: -0.3, z1: -0.22, c: '#2a2a28' });      // MG post
  t.box({ x: 0.55, w: 0.04, y0: h + 0.38, y1: h + 0.46, z0: -0.3, z1: 0.6, c: '#2a2a28' });        // MG
  t.box({ w: r * 0.95, y0: 0.15, y1: h * 0.6, z0: -back - 0.45, z1: -back + 0.02, c: dark });      // bustle rack
  const b = new VBuilder();
  const gun = tr.gunLength || 4.6;
  b.box({ w: 0.28, y0: -0.25, y1: 0.25, z0: 0, z1: 0.7, c: dark });                                // mantlet
  b.box({ w: 0.09, y0: -0.09, y1: 0.09, z0: 0.6, z1: gun, c: o.barrelColor, skip: '' });            // barrel
  b.box({ w: 0.14, y0: -0.14, y1: 0.14, z0: gun * 0.55, z1: gun * 0.7, c: o.barrelColor });         // fume extractor
  b.box({ w: 0.12, y0: -0.12, y1: 0.12, z0: gun - 0.35, z1: gun, c: shade(o.barrelColor, 0.8) });   // muzzle
  return { turret: t.build(), barrel: b.build(), muzzle: gun, height: h };
}
