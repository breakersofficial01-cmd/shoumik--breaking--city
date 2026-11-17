// Real sun shadows (Medium/High). One shadow map that follows the player, so the cost stays the
// same anywhere in the city. Objects are flagged automatically:
//   - lit meshes (Lambert/Standard) cast and receive shadows
//   - flat ground and water only receive
//   - unlit glow, signs, sky, blob shadows and lines are skipped
// Settings: data/graphics.json → shadows. Map size per quality: data/quality.json → shadowMapSize.

import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);

export class SunShadows {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.Scene} scene
   * @param {THREE.DirectionalLight} light   the sun light from src/world/sky.js
   * @param {THREE.Vector3} sunDir           unit vector pointing from the ground to the sun
   * @param {object} cfg                     data/graphics.json → shadows
   * @param {Set<THREE.Material>} receiveOnly materials that should never cast (ground, water)
   */
  constructor(renderer, scene, light, sunDir, cfg, receiveOnly) {
    this.renderer = renderer;
    this.scene = scene;
    this.light = light;
    this.cfg = cfg;
    this.receiveOnly = receiveOnly;
    this.mapSize = 0;
    this.flagTimer = 0;
    this.focus = new THREE.Vector3();
    scene.add(light.target);

    // A very low sunset sun makes shadows many times longer than the area we can afford to
    // shadow, so the shadow light never goes below cfg.minElevation (the sky still shows the
    // real low sun). This also sets the direction of the sun's diffuse light.
    this.dir = sunDir.clone();
    const minY = Math.sin(cfg.minElevation);
    if (this.dir.y < minY) {
      const flat = Math.sqrt(1 - minY * minY);
      const h = Math.hypot(this.dir.x, this.dir.z) || 1;
      this.dir.set((this.dir.x / h) * flat, minY, (this.dir.z / h) * flat);
    }
    // Light-space axes (match how the shadow camera looks at its target) for texel snapping.
    this.right = new THREE.Vector3().crossVectors(UP, this.dir).normalize();
    this.up = new THREE.Vector3().crossVectors(this.dir, this.right).normalize();

    const s = light.shadow;
    const e = cfg.extent;
    Object.assign(s.camera, { left: -e, right: e, top: e, bottom: -e, near: 1, far: cfg.distance + e * 4 });
    s.camera.updateProjectionMatrix();
    s.bias = cfg.bias;
    s.normalBias = cfg.normalBias;
    this.place(this.focus);
  }

  /** Turn shadows on/off and pick the map size for a quality level. */
  setQuality(quality) {
    const size = quality.shadowMapSize || 0;
    const wasOn = this.renderer.shadowMap.enabled;
    const type = quality.softShadows ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    const typeChanged = this.renderer.shadowMap.type !== type;
    this.renderer.shadowMap.enabled = size > 0;
    this.renderer.shadowMap.type = type;
    this.light.castShadow = size > 0;
    if (size !== this.mapSize) {
      this.light.shadow.mapSize.set(size || 1, size || 1);
      this.light.shadow.map?.dispose();
      this.light.shadow.map = null; // three.js makes a new one at the new size
      this.mapSize = size;
    }
    // Shaders must be rebuilt when shadows are switched on/off or change type.
    if (wasOn !== size > 0 || typeChanged) {
      this.scene.traverse((o) => {
        const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of mats) m.needsUpdate = true;
      });
    }
    this.flagTimer = 0;
  }

  /** Decide cast/receive for one object (done once per object). */
  flag(o) {
    if (o.userData.shadowFlagged || !o.isMesh) return;
    o.userData.shadowFlagged = true;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!m || m.isMeshBasicMaterial || m.isSpriteMaterial || m.transparent || m.userData.glow) return;
    o.receiveShadow = true;
    o.castShadow = !this.receiveOnly.has(m) && !o.userData.noCastShadow;
  }

  /** Move the shadow area with the player, snapped to whole shadow-map texels (no shimmering). */
  place(focus) {
    const texel = (2 * this.cfg.extent) / Math.max(1, this.mapSize || 1024);
    const r = Math.round(focus.dot(this.right) / texel) * texel;
    const u = Math.round(focus.dot(this.up) / texel) * texel;
    const d = focus.dot(this.dir);
    const t = this.light.target.position;
    t.copy(this.right).multiplyScalar(r).addScaledVector(this.up, u).addScaledVector(this.dir, d);
    this.light.position.copy(t).addScaledVector(this.dir, this.cfg.distance);
    this.light.target.updateMatrixWorld();
  }

  /** @param {{x:number,z:number}} focus  usually the player position */
  update(dt, focus) {
    this.focus.set(focus.x, focus.y || 0, focus.z);
    this.place(this.focus);
    if (!this.renderer.shadowMap.enabled) return;
    // New chunks, people and vehicles appear all the time: flag them twice a second.
    this.flagTimer -= dt;
    if (this.flagTimer <= 0) {
      this.flagTimer = this.cfg.flagEverySeconds;
      this.scene.traverse((o) => this.flag(o));
    }
  }
}
