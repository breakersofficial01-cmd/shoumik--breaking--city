// Wake (Roadmap 2 S7): white foam patches left behind moving boats. ONE InstancedMesh of flat
// discs for every boat; each patch grows and fades out. Settings: data/boats.json → wake.

import * as THREE from 'three';

export class Wake {
  constructor(scene, cfg, waterY, maxBoats = 4) {
    this.cfg = cfg;
    this.y = waterY + 0.04;
    this.max = cfg.count * maxBoats;
    this.patches = [];
    const geo = new THREE.CircleGeometry(0.5, 10).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: cfg.color, transparent: true, opacity: cfg.opacity, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, this.max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.name = 'boat-wake';
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._p = new THREE.Vector3();
  }

  /** Drop foam behind a boat (call every frame; it spaces them by speed). */
  emit(boat, dt) {
    const sp = Math.abs(boat.speed);
    boat.wakeT = (boat.wakeT || 0) - dt;
    if (sp < 1 || boat.wakeT > 0) return;
    boat.wakeT = this.cfg.every * Math.max(1, boat.T.maxSpeed / Math.max(sp, 1)) * 0.6;
    const back = boat.localToWorld([0, 0, -boat.T.length * 0.5 * Math.sign(boat.speed || 1)]);
    const size = this.cfg.size * (0.6 + sp / boat.T.maxSpeed) * (boat.T.width / 2.6);
    if (this.patches.length >= this.max) this.patches.shift();
    this.patches.push({ x: back.x, z: back.z, age: 0, size, spread: 0.6 + sp * 0.08 });
  }

  update(dt) {
    const life = this.cfg.life;
    let n = 0;
    for (let i = this.patches.length - 1; i >= 0; i--) {
      const p = this.patches[i];
      p.age += dt;
      if (p.age > life) { this.patches.splice(i, 1); continue; }
    }
    for (const p of this.patches) {
      const k = p.age / life;
      const s = p.size * (1 + k * p.spread * 2) * (1 - k * 0.6);
      this._s.set(s, 1, s);
      this._p.set(p.x, this.y, p.z);
      this._m.compose(this._p, this._q, this._s);
      this.mesh.setMatrixAt(n++, this._m);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.removeFromParent();
  }
}
