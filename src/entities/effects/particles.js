// Tiny particle system for smoke, fire and explosions (Session 6 can reuse it for blood and
// gun flashes). Every puff is a camera-facing square with the soft round `texture.glow` on
// it, drawn through two InstancedMeshes: "smoke" (normal blending) and "fire" (glowing).
// Two draw calls no matter how many puffs.

import * as THREE from 'three';

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

class Layer {
  constructor(scene, texture, max, additive) {
    this.max = max;
    this.items = [];
    const mat = new THREE.MeshBasicMaterial({
      map: texture, transparent: true, depthWrite: false,
      opacity: additive ? 0.95 : 0.6,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, max);
    this.mesh.name = additive ? 'fx-fire' : 'fx-smoke';
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, _c.set(1, 1, 1));
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.renderOrder = additive ? 3 : 2;
    this.additive = additive;
    scene.add(this.mesh);
  }

  update(dt, camera) {
    const items = this.items;
    let n = 0;
    for (let i = 0; i < items.length; i++) {
      const p = items[i];
      p.t += dt;
      if (p.t >= p.life) continue;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.vy += p.lift * dt;
      const u = p.t / p.life;
      // Grow, then (smoke cannot fade its alpha per puff) shrink away at the end.
      let size = p.s0 + (p.s1 - p.s0) * u;
      if (!this.additive && u > 0.7) size *= (1 - u) / 0.3;
      _m.compose(_p.set(p.x, p.y, p.z), camera.quaternion, _s.set(size, size, 1));
      _m.toArray(this.mesh.instanceMatrix.array, n * 16);
      const f = this.additive ? 1 - u : 1;
      this.mesh.instanceColor.array[n * 3] = p.r * f;
      this.mesh.instanceColor.array[n * 3 + 1] = p.g * f;
      this.mesh.instanceColor.array[n * 3 + 2] = p.b * f;
      items[n++] = p;
    }
    items.length = n;
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.removeFromParent();
  }
}

export class Particles {
  /** @param {THREE.Texture} texture soft round sprite  @param {number} max puffs per layer */
  constructor(scene, texture, max) {
    this.smoke = new Layer(scene, texture, max, false);
    this.fire = new Layer(scene, texture, max, true);
  }

  /**
   * @param {'smoke'|'fire'} kind
   * @param {{x,y,z,vx?,vy?,vz?,life,size:[number,number],color:string,lift?:number}} o
   */
  emit(kind, o) {
    const layer = kind === 'fire' ? this.fire : this.smoke;
    if (layer.items.length >= layer.max) return;
    _c.set(o.color);
    layer.items.push({
      x: o.x, y: o.y, z: o.z, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0,
      t: 0, life: o.life, s0: o.size[0], s1: o.size[1], lift: o.lift || 0,
      r: _c.r, g: _c.g, b: _c.b,
    });
  }

  update(dt, camera) {
    this.smoke.update(dt, camera);
    this.fire.update(dt, camera);
  }

  dispose() {
    this.smoke.dispose();
    this.fire.dispose();
  }
}
