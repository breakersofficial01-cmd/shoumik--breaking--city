// Frames around the posters: roof billboard legs + backing + catwalk, LED screen poles and
// housings, thin borders round wall posters. Static, so they are merged into a few meshes,
// one per `frameCell` square of the city (frustum culling still works). Pole colliders too.
// Built with the landmark Kit in world space (src/world/landmarks/kit.js).

import * as THREE from 'three';
import { GeoBuilder } from '../../world/geoBuilder.js';
import { COLLIDE } from '../../world/collision.js';
import { Kit } from '../../world/landmarks/kit.js';


/** A kit turned so local +z = the way the poster faces, origin under the poster centre. */
function facing(builders, s, y = 0) {
  return new Kit(builders, { cx: s.x, cz: s.z, y, angle: s.heading });
}

function billboard(b, s, C) {
  const k = facing(b, s, s.roof);
  const top = s.y - s.roof + s.h / 2, bottom = s.y - s.roof - s.h / 2;
  const hw = s.w / 2;
  k.box(-hw - 0.15, bottom - 0.15, -0.35, hw + 0.15, top + 0.15, -0.05, C.backColor, { flat: true, faces: 'nsewtb' });
  for (const x of [-hw * 0.6, hw * 0.6]) {
    k.box(x - 0.12, 0, -0.95, x + 0.12, bottom, -0.71, C.legColor, { flat: true });
    k.beam([x, 0, -2.2], [x, bottom - 0.1, -0.83], 0.14, C.legColor);
  }
  k.box(-hw, bottom - 0.45, -0.3, hw, bottom - 0.35, 0.65, C.walkwayColor, { flat: true, faces: 'nsewtb' });
  for (const x of [-hw * 0.5, 0, hw * 0.5]) {
    k.beam([x, bottom - 0.4, 0.6], [x, bottom - 0.05, 1.1], 0.08, C.legColor);
    k.box(x - 0.18, bottom - 0.12, 1.05, x + 0.18, bottom, 1.25, C.lampColor, { glow: true, faces: 'nsewtb' });
  }
}

function led(b, s, C) {
  const k = facing(b, s, s.y - s.h / 2 - C.poleHeight);
  const hw = s.w / 2;
  k.prism(0, -0.35, 0, C.poleHeight + 0.2, 0.2, 0.16, 6, C.poleColor);
  k.box(-hw - 0.18, C.poleHeight - 0.18, -0.55, hw + 0.18, C.poleHeight + s.h + 0.18, -0.03, C.housingColor, { flat: true, faces: 'nsewtb' });
  k.box(-hw - 0.2, C.poleHeight - 0.2, -0.04, hw + 0.2, C.poleHeight - 0.12, 0.0, C.rimColor, { glow: true, faces: 'nsewtb' });
  k.box(-hw - 0.2, C.poleHeight + s.h + 0.12, -0.04, hw + 0.2, C.poleHeight + s.h + 0.2, 0.0, C.rimColor, { glow: true, faces: 'nsewtb' });
  k.solid(-0.25, -0.6, 0.25, -0.1, false);
  return k.colliders;
}

function wall(b, s, C) {
  const k = facing(b, s, s.y - s.h / 2);
  const hw = s.w / 2;
  k.box(-hw - 0.1, -0.1, -0.08, hw + 0.1, s.h + 0.1, -0.01, C.frameColor, { flat: true, faces: 'nsewtb' });
}

/** Hide frame cells beyond the view distance (each cell is up to `cell` metres across). */
export function cullFrames(group, focus, viewDistance, cell) {
  const reach = viewDistance + cell * 0.71;
  for (const m of group.children) m.visible = Math.hypot(m.userData.cx - focus.x, m.userData.cz - focus.z) < reach;
}

/**
 * @returns {THREE.Group} with one mesh pair (lit + glow) per city cell
 */
export function buildFrames(slots, cfg, materials, collision) {
  const group = new THREE.Group();
  group.name = 'poster-frames';
  const cells = new Map();
  const cellOf = (s) => {
    const key = `${Math.floor(s.x / cfg.frameCell)},${Math.floor(s.z / cfg.frameCell)}`;
    let c = cells.get(key);
    if (!c) {
      const cx = (Math.floor(s.x / cfg.frameCell) + 0.5) * cfg.frameCell, cz = (Math.floor(s.z / cfg.frameCell) + 0.5) * cfg.frameCell;
      cells.set(key, (c = { lit: new GeoBuilder(), glow: new GeoBuilder(), sign: new GeoBuilder(), cx, cz }));
    }
    return c;
  };
  for (const s of slots) {
    if (s.frame === 'billboard') billboard(cellOf(s), s, cfg.billboard);
    else if (s.frame === 'wall') wall(cellOf(s), s, cfg.wall);
    else if (s.frame === 'led') {
      for (const c of led(cellOf(s), s, cfg.led)) collision.add(c.x0, c.z0, c.x1, c.z1, COLLIDE.SOLID);
    }
  }
  for (const c of cells.values()) {
    // userData.cx/cz = cell centre, used by the feature to hide far cells (cullFrames).
    if (!c.lit.isEmpty) group.add(Object.assign(new THREE.Mesh(c.lit.build(), materials.lit), { userData: { cx: c.cx, cz: c.cz } }));
    if (!c.glow.isEmpty) group.add(Object.assign(new THREE.Mesh(c.glow.build(), materials.glow), { userData: { cx: c.cx, cz: c.cz } }));
  }
  group.traverse((o) => { o.matrixAutoUpdate = false; });
  return group;
}
