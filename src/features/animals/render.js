// Draws every animal with a few InstancedMeshes per kind (Roadmap 2 S5): body, head, legs and
// wings (birds). A kind whose animals are all away costs nothing (count 0 → not drawn).
// Each frame index.js calls draw(list): for every animal its pose numbers
//   { x, y, z, heading, scale, pitch, bob, legPhase, legAmp, lie, headPitch, headYaw, wings, flap }
// are turned into instance matrices (body → head at the neck pivot → legs at the hips → wings).

import * as THREE from 'three';
import { MODELS } from './models.js';

const _body = new THREE.Matrix4();
const _m = new THREE.Matrix4();
const _t = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

export class AnimalRenderer {
  /**
   * @param {THREE.Object3D} parent
   * @param {Record<string, number>} capacity  most animals of each kind at once
   */
  constructor(parent, capacity) {
    this.group = new THREE.Group();
    this.group.name = 'animals';
    parent.add(this.group);
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.kinds = {};
    for (const [name, cap] of Object.entries(capacity)) {
      if (!(cap > 0) || !MODELS[name]) continue;
      const m = MODELS[name]();
      const mk = (geo, n, label) => {
        const mesh = new THREE.InstancedMesh(geo, this.material, n);
        mesh.name = `animal-${name}-${label}`;
        mesh.frustumCulled = false; // spread around the player
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.setColorAt(0, _c.set(1, 1, 1));
        mesh.count = 0;
        this.group.add(mesh);
        return mesh;
      };
      this.kinds[name] = {
        model: m,
        body: mk(m.body, cap, 'body'),
        head: mk(m.head, cap, 'head'),
        legs: mk(m.leg, cap * m.hips.length, 'legs'),
        wings: m.wing ? mk(m.wing, cap * 2, 'wings') : null,
      };
    }
  }

  /** @param {Array<object>} list  animals (see the top of this file) */
  draw(list) {
    for (const k of Object.values(this.kinds)) { k.n = 0; k.nl = 0; k.nw = 0; }
    for (const a of list) {
      const k = this.kinds[a.kind];
      if (!k || !a.visible) continue;
      const m = k.model;
      // Body: position, heading, pitch (grazing / rearing), lying down drops it.
      _e.set(a.pitch || 0, a.heading, a.roll || 0);
      _q.setFromEuler(_e);
      const drop = (a.lie || 0) * m.lieDrop * a.scale;
      _body.compose(_v.set(a.x, a.y - drop + (a.bob || 0), a.z), _q, _s.set(a.scale, a.scale, a.scale));
      const i = k.n++;
      k.body.setMatrixAt(i, _body);
      _c.setRGB(a.color[0], a.color[1], a.color[2]);
      k.body.setColorAt(i, _c);
      // Head at the neck pivot.
      _e.set(a.headPitch || 0, a.headYaw || 0, 0);
      _t.compose(_v.fromArray(m.headPivot), _q.setFromEuler(_e), _s.set(1, 1, 1));
      k.head.setMatrixAt(i, _m.multiplyMatrices(_body, _t));
      k.head.setColorAt(i, _c);
      // Legs: diagonal pairs swing together; lying = folded (front forward, back backward).
      const lie = a.lie || 0;
      for (let l = 0; l < m.hips.length; l++) {
        const h = m.hips[l];
        const front = h[2] > 0;
        const pair = (l === 0 || l === 3) ? 0 : Math.PI;
        let rx = Math.sin(a.legPhase + pair) * (a.legAmp || 0) * m.swing;
        rx = rx * (1 - lie) + (front ? -1.45 : 1.45) * lie;
        const hidden = a.noLegs ? 0.0001 : 1;
        const tuck = 1 - 0.68 * lie; // lying: legs folded short under the body
        _e.set(rx, 0, 0);
        _t.compose(_v.fromArray(h), _q.setFromEuler(_e), _s.set(hidden, hidden * tuck, hidden));
        const j = k.nl++;
        k.legs.setMatrixAt(j, _m.multiplyMatrices(_body, _t));
        k.legs.setColorAt(j, _c);
      }
      // Wings: folded along the back when sitting, spread and flapping when flying. The right
      // wing is the same shape turned half round (no mirroring, so its faces stay outside).
      if (k.wings) {
        const open = a.wings || 0;
        const flap = Math.sin(a.flap || 0) * 0.9 * open;
        for (let w = 0; w < 2; w++) {
          const yaw = w === 0 ? 1.37 * (1 - open) : Math.PI - 1.37 * (1 - open);
          _e.set(0, yaw, -0.15 * (1 - open) + flap);
          _t.compose(_v.fromArray(m.shoulders[w]), _q.setFromEuler(_e), _s.set(1, 1, 1));
          const j = k.nw++;
          k.wings.setMatrixAt(j, _m.multiplyMatrices(_body, _t));
          k.wings.setColorAt(j, _c);
        }
      }
    }
    for (const k of Object.values(this.kinds)) {
      for (const [mesh, n] of [[k.body, k.n], [k.head, k.n], [k.legs, k.nl], [k.wings, k.nw]]) {
        if (!mesh) continue;
        mesh.count = n;
        mesh.visible = n > 0;
        if (n > 0) { mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; }
      }
    }
  }

  dispose() {
    for (const k of Object.values(this.kinds)) {
      for (const mesh of [k.body, k.head, k.legs, k.wings]) {
        if (!mesh) continue;
        mesh.geometry.dispose();
        mesh.dispose();
      }
    }
    this.material.dispose();
    this.group.removeFromParent();
  }
}
