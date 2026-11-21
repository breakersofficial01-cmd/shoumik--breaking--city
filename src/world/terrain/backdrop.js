// Far mountains on the horizon (Roadmap 2 S3). The real hills at the edge of the land are
// usually hidden by the fog, so a cheap painted ring of mountain silhouettes travels with the
// camera (like the sky dome): it always looks infinitely far away. The ring is low over the
// sea (east) and tall elsewhere. Its colour is the fog colour at the bottom, fading into a
// hazy blue-grey at the top, so it suits day, sunset, night and rain without extra settings.
// Settings: data/terrain.json → backdrop.

import * as THREE from 'three';
import { fbm } from './noise.js';

export class Backdrop {
  /** @param {object} cfg  data/terrain.json */
  constructor(cfg, parent) {
    const B = cfg.backdrop;
    this.B = B;
    const n = B.segments;
    // Two rows of points: the foot (well below the horizon) and the ridge.
    const pos = new Float32Array((n + 1) * 2 * 3);
    this.top = new Float32Array(n + 1); // ridge elevation (tan of the angle)
    const deg = Math.PI / 180;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;       // 0 = +x (east), turning towards +z (south)
      const bearing = ((a / deg) + 360) % 360; // 0 = east
      // Low over the sea: east ± (seaFrom..seaTo) degrees… measured from due east.
      const fromEast = Math.min(bearing, 360 - bearing);
      const sea = 1 - THREE.MathUtils.smoothstep(fromEast, B.seaFrom, B.seaTo);
      const k = fbm(Math.cos(a) * B.noiseScale + 50, Math.sin(a) * B.noiseScale + 50, cfg.seed + 77, 4);
      const elev = (B.elevation[0] + (B.elevation[1] - B.elevation[0]) * k) * (1 - sea * 0.92);
      this.top[i] = Math.tan(elev * deg);
      const cx = Math.cos(a), cz = Math.sin(a);
      pos.set([cx, -0.12, cz], i * 6);
      pos.set([cx, this.top[i], cz], i * 6 + 3);
    }
    const idx = [];
    for (let i = 0; i < n; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, c, b, b, c, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.colors = new Float32Array(pos.length);
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    geo.setIndex(idx);
    this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      vertexColors: true, fog: false, side: THREE.DoubleSide, depthWrite: false,
    }));
    this.mesh.name = 'terrain-backdrop';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1; // after the sky dome, before everything else
    parent.add(this.mesh);
    this.tint = new THREE.Color(B.tint);
    this.last = new THREE.Color(-1, -1, -1);
    this._c = new THREE.Color();
  }

  /** Follow the camera; recolour when the fog colour changes (time of day, rain). */
  update(camera, fog, radius) {
    const r = radius * this.B.radiusShare;
    this.mesh.position.copy(camera.position);
    this.mesh.scale.set(r, r, r);
    this.mesh.updateMatrixWorld();
    if (!fog || fog.color.equals(this.last)) return;
    this.last.copy(fog.color);
    const top = this._c.copy(fog.color).lerp(this.tint, this.B.haze);
    // Darker at night: never much brighter than the fog itself.
    const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    const cap = lum(fog.color) * 1.3 + 0.01;
    if (lum(top) > cap) top.multiplyScalar(cap / lum(top));
    const n = this.top.length;
    for (let i = 0; i < n; i++) {
      this.colors.set([fog.color.r, fog.color.g, fog.color.b], i * 6);
      this.colors.set([top.r, top.g, top.b], i * 6 + 3);
    }
    this.mesh.geometry.attributes.color.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
