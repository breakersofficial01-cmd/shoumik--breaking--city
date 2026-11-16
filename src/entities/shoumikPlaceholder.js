// PLACEHOLDER Shoumik (Session 1). A blocky stand-in with the right proportions and colours
// from docs/CHARACTER.md (stocky build, black quiff, full beard, maroon tee, khaki chinos,
// white sneakers, black watch on the LEFT wrist). Session 2 replaces it with the real
// low-poly model — keep the part names below so the animator keeps working:
//   body (whole upper rig), torso, head, armL, armR, legL, legR
// The model faces +z. His left side is +x.

import * as THREE from 'three';
import { GeoBuilder, hexToLinear, shade } from '../world/geoBuilder.js';

let material = null;

function part(name, gb, x = 0, y = 0, z = 0) {
  const group = new THREE.Group();
  group.name = name;
  group.position.set(x, y, z);
  group.add(new THREE.Mesh(gb.build(), material));
  return group;
}

/** Box helper: all six sides, slightly darker underneath. */
function cube(gb, x0, y0, z0, x1, y1, z1, c) {
  gb.box(x0, y0, z0, x1, y1, z1, shade(c, 0.82), c, 0, 'nswetb');
}

/** @param {object} cfg data/player.json → model */
export function buildShoumikPlaceholder(cfg) {
  material = material || new THREE.MeshLambertMaterial({ vertexColors: true });
  const skin = hexToLinear(cfg.skin);
  const hair = hexToLinear(cfg.hair);
  const beard = hexToLinear(cfg.beard);
  const tee = hexToLinear(cfg.tee);
  const pants = hexToLinear(cfg.pants);
  const shoes = hexToLinear(cfg.shoes);
  const watch = hexToLinear(cfg.watch);
  const hw = 0.28 * cfg.torsoWidthScale; // half torso width (stocky)

  const root = new THREE.Group();
  root.name = 'shoumik-placeholder';
  const body = new THREE.Group();
  body.name = 'body';
  root.add(body);

  // Torso: oversized tee with a bit of belly.
  let gb = new GeoBuilder();
  cube(gb, -hw, 0.8, -0.17, hw, 1.45, 0.17, tee);
  cube(gb, -hw * 0.82, 0.84, 0.1, hw * 0.82, 1.18, 0.22, tee);
  cube(gb, -0.07, 1.45, -0.06, 0.07, 1.5, 0.07, skin); // neck
  body.add(part('torso', gb));

  // Head: round face, thick quiff, full beard.
  gb = new GeoBuilder();
  cube(gb, -0.125, 0, -0.13, 0.125, 0.27, 0.13, skin);
  cube(gb, -0.14, 0.2, -0.15, 0.14, 0.33, 0.12, hair);          // hair mass
  cube(gb, -0.12, 0.24, 0.06, 0.13, 0.36, 0.17, hair);          // quiff swept up at the front
  cube(gb, -0.14, 0.06, -0.15, 0.14, 0.22, -0.09, hair);        // back of the head
  cube(gb, -0.132, 0.0, 0.02, 0.132, 0.1, 0.142, beard);        // beard along the jaw
  cube(gb, -0.132, 0.08, 0.0, -0.1, 0.17, 0.12, beard);         // right cheek line
  cube(gb, 0.1, 0.08, 0.0, 0.132, 0.17, 0.12, beard);           // left cheek line
  cube(gb, -0.06, 0.1, 0.125, 0.06, 0.125, 0.14, beard);        // moustache
  cube(gb, -0.085, 0.165, 0.126, -0.03, 0.185, 0.136, hair);    // eyes
  cube(gb, 0.03, 0.165, 0.126, 0.085, 0.185, 0.136, hair);
  cube(gb, -0.095, 0.195, 0.126, -0.025, 0.21, 0.138, hair);    // thick brows
  cube(gb, 0.025, 0.195, 0.126, 0.095, 0.21, 0.138, hair);
  body.add(part('head', gb, 0, 1.49, 0));

  // Arms hang from the shoulder pivot. Left arm (+x) wears the watch.
  for (const side of [1, -1]) {
    gb = new GeoBuilder();
    cube(gb, -0.075, -0.3, -0.08, 0.075, 0.05, 0.08, tee);       // loose sleeve to the elbow
    cube(gb, -0.06, -0.6, -0.06, 0.06, -0.3, 0.06, skin);        // forearm
    cube(gb, -0.055, -0.7, -0.05, 0.055, -0.6, 0.06, skin);      // hand
    if (side === 1) cube(gb, -0.072, -0.59, -0.072, 0.072, -0.53, 0.072, watch);
    body.add(part(side === 1 ? 'armL' : 'armR', gb, side * (hw + 0.075), 1.4, 0));
  }

  // Legs hang from the hip pivot.
  for (const side of [1, -1]) {
    gb = new GeoBuilder();
    cube(gb, -0.1, -0.76, -0.11, 0.1, 0.02, 0.11, pants);
    cube(gb, -0.105, -0.86, -0.12, 0.105, -0.76, 0.19, shoes);
    root.add(part(side === 1 ? 'legL' : 'legR', gb, side * 0.14, 0.86, 0));
  }

  // PS2-style blob shadow.
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.48, 12).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false }),
  );
  shadow.name = 'shadow';
  shadow.position.y = 0.03;
  root.add(shadow);
  return root;
}

/**
 * Code-driven walk / run / jump animation for any humanoid with the part names above.
 * Session 2 extends this with the full animation list.
 */
export class HumanoidAnimator {
  constructor(root) {
    this.root = root;
    this.body = root.getObjectByName('body');
    this.armL = root.getObjectByName('armL');
    this.armR = root.getObjectByName('armR');
    this.legL = root.getObjectByName('legL');
    this.legR = root.getObjectByName('legR');
    this.shadow = root.getObjectByName('shadow');
    this.phase = 0;
    this.blend = 0; // 0 idle … 1 full run
    this.time = 0;
  }

  /** @param {{speed:number, grounded:boolean, height:number}} s  height = metres above ground */
  update(dt, s) {
    this.time += dt;
    const target = Math.min(1, s.speed / 5);
    this.blend += (target - this.blend) * Math.min(1, dt * 10);
    this.phase += dt * (4.5 + s.speed * 0.75) * (s.speed > 0.2 ? 1 : 0);
    const swing = Math.sin(this.phase) * (0.25 + 0.75 * this.blend) * (s.speed > 0.2 ? 1 : 0);
    const breathe = Math.sin(this.time * 1.8) * 0.02;

    if (s.grounded) {
      this.legL.rotation.x = -swing * 0.95;
      this.legR.rotation.x = swing * 0.95;
      this.armL.rotation.x = swing * 0.8;
      this.armR.rotation.x = -swing * 0.8;
      this.armL.rotation.z = 0.07 + breathe;
      this.armR.rotation.z = -0.07 - breathe;
      this.body.position.y = Math.abs(Math.cos(this.phase)) * 0.045 * this.blend + breathe * 0.4;
    } else {
      // In the air: knees up, arms out.
      this.legL.rotation.x = -0.55;
      this.legR.rotation.x = 0.35;
      this.armL.rotation.x = -0.5;
      this.armR.rotation.x = -0.5;
      this.armL.rotation.z = 0.5;
      this.armR.rotation.z = -0.5;
    }
    this.body.rotation.x = 0.16 * this.blend * this.blend; // lean into the run
    if (this.shadow) {
      this.shadow.position.y = 0.03 - s.height;
      this.shadow.scale.setScalar(Math.max(0.5, 1 - s.height * 0.25));
    }
  }
}
