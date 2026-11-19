// Designs one 3D "hero" building out of kit pieces: returns a list of placements
// { piece, matrix } on the building's footprint (see data/heroBuildings.json).
//
// A kit wall piece is W metres wide (2 or 4), 3 m tall, its front face at z = 0 facing +z,
// local +x running left -> right when seen from the front. Each wall of the footprint is split
// into n equal modules; a piece is stretched a little to fit (x) and to the floor height (y).
// Ground floor = groundFloorHeight, upper floors = floorHeight (data/world.json → buildings).

import * as THREE from 'three';
import { Rng } from '../../core/rng.js';
import { FACADE } from '../../assets/proceduralTextures.js';
import { SIDE } from '../blockgen.js';

const STYLE_NAME = { [FACADE.RESIDENTIAL]: 'residential', [FACADE.OFFICE]: 'office', [FACADE.GLASS]: 'glass', [FACADE.OLD]: 'old' };
const KIT_FLOOR = 3;     // kit wall pieces are 3 m tall
const CORNICE = 0.8;     // cornice band height on top of the wall (m)

/** Same four sides as buildingMesher.js: a -> b left to right seen from outside, o = outward. */
function sidesOf(b) {
  return [
    { bit: SIDE.S, ax: b.x0, az: b.z1, bx: b.x1, bz: b.z1, ox: 0, oz: 1 },
    { bit: SIDE.N, ax: b.x1, az: b.z0, bx: b.x0, bz: b.z0, ox: 0, oz: -1 },
    { bit: SIDE.E, ax: b.x1, az: b.z1, bx: b.x1, bz: b.z0, ox: 1, oz: 0 },
    { bit: SIDE.W, ax: b.x0, az: b.z0, bx: b.x0, bz: b.z1, ox: -1, oz: 0 },
  ];
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

/**
 * @param {object} b       building spec (blockgen.js)
 * @param {number} baseY   ground height under it
 * @param {object} H       data/heroBuildings.json
 * @param {object} cfgB    data/world.json → buildings
 * @param {Map<string,{width:number,tris:number}>} lib  piece sizes
 * @returns {{placements:Array<{piece:string, matrix:THREE.Matrix4}>, tris:number}|null}
 */
export function designBuilding(b, baseY, H, cfgB, lib) {
  const style = H.styles[STYLE_NAME[b.style]];
  if (!style) return null;
  const rng = new Rng(b.seed ^ 0x4e70);
  const upper = rng.pick(style.upper);
  const out = [];
  let tris = 0;
  const yGround = baseY + cfgB.groundFloorHeight;
  const yTop = baseY + b.h;
  const rows = [{ y: baseY, h: cfgB.groundFloorHeight, ground: true }];
  for (let f = 1; f < b.floors; f++) rows.push({ y: yGround + (f - 1) * cfgB.floorHeight, h: cfgB.floorHeight });
  let doorDone = false;

  const place = (piece, s, len, t, y, h, sx = 1, shiftX = 0) => {
    const info = lib.get(piece);
    if (!info) return;
    const dx = (s.bx - s.ax) / len, dz = (s.bz - s.az) / len;
    const along = t + shiftX;
    _p.set(s.ax + dx * along + s.ox * H.outset, y, s.az + dz * along + s.oz * H.outset);
    _q.setFromAxisAngle(_up, Math.atan2(s.ox, s.oz));
    _s.set(sx, h / KIT_FLOOR, 1);
    out.push({ piece, matrix: _m.compose(_p, _q, _s).clone() });
    tris += info.tris;
  };

  for (const s of sidesOf(b)) {
    const L = Math.hypot(s.bx - s.ax, s.bz - s.az) + 2 * H.outset;   // reach over the corners
    // shift a/b out by the outset so neighbouring walls meet at the corner
    const sa = { ...s, ax: s.ax - (s.bx - s.ax) / (L - 2 * H.outset) * H.outset, az: s.az - (s.bz - s.az) / (L - 2 * H.outset) * H.outset };
    sa.bx = sa.ax + (s.bx - s.ax) / (L - 2 * H.outset) * L; sa.bz = sa.az + (s.bz - s.az) / (L - 2 * H.outset) * L;
    const street = (b.front & s.bit) !== 0;
    const windows = street;   // back and side walls stay plain (cheap); windows face the street
    const wPiece = windows ? upper : style.side;
    const pw = lib.get(wPiece)?.width || 2;
    const n = Math.max(1, Math.round(L / pw));
    const mod = L / n;
    const sx = mod / pw;
    const doorK = street && !doorDone && !b.shop ? Math.floor(n / 2) : -1;
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) * mod;
      for (const r of rows) {
        if (!r.ground) {
          // style.every = 2: window, wall, window ... (spaced windows; half the triangles)
          const between = windows && style.every > 1 && k % style.every === 1 && k !== n - 1;
          const piece = between ? style.between || style.side : wPiece;
          place(piece, sa, L, t, r.y, r.h, between ? mod / (lib.get(piece)?.width || 2) : sx);
          continue;
        }
        if (k === doorK) {
          const dw = lib.get(style.door[0][0])?.width || 2;
          for (const [piece, x] of style.door) place(piece, sa, L, t, r.y, r.h, mod / dw, x * (mod / dw));
          doorDone = true;
        } else {
          const g = street ? (b.shop ? style.shop : style.ground) : style.side;
          place(g, sa, L, t, r.y, r.h, mod / (lib.get(g)?.width || 2));
        }
      }
      // Cornice band along the top of street sides (a parapet on the roof edge).
      if (street && style.cornice) place(style.cornice, sa, L, t, yTop, CORNICE * KIT_FLOOR, mod / (lib.get(style.cornice)?.width || 2));
    }
  }
  return { placements: out, tris };
}
