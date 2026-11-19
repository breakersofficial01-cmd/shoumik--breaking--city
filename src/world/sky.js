// Sky, sun, lights and fog: the warm Vice-style sunset look. All colours come from
// data/world.json (sky, light, fog). Session 7 (day/night) will animate these values.

import * as THREE from 'three';
import { paintSky } from './skyPainter.js';

export class Sky {
  constructor(world, glowTexture, scene, renderer) {
    this.cfg = world;
    this.scene = scene;
    const s = world.sky;

    // Painted 360° sky (skyPainter.js, made once at load). Falls back to the simple gradient.
    if (s.painted && renderer) {
      try {
        this.texture = paintSky(renderer, s);
      } catch (err) {
        console.warn('sky: painting failed, using the plain gradient', err);
      }
    }

    // Gradient dome: vertex colours by height, drawn first, never fogged.
    const geo = new THREE.SphereGeometry(1, 20, 12);
    const stops = [
      [-1, new THREE.Color(s.below)],
      [-0.02, new THREE.Color(s.below)],
      [0.03, new THREE.Color(s.horizon)],
      [0.16, new THREE.Color(s.middle)],
      [0.42, new THREE.Color(s.upper)],
      [1, new THREE.Color(s.top)],
    ];
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const h = pos.getY(i);
      let k = 0;
      while (k < stops.length - 2 && h > stops[k + 1][0]) k++;
      const t = Math.min(1, Math.max(0, (h - stops[k][0]) / (stops[k + 1][0] - stops[k][0])));
      c.copy(stops[k][1]).lerp(stops[k + 1][1], t);
      colors.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const domeGeo = this.texture ? new THREE.SphereGeometry(1, 48, 24) : geo;
    this.dome = new THREE.Mesh(domeGeo, new THREE.MeshBasicMaterial({
      vertexColors: !this.texture, map: this.texture || null,
      side: THREE.BackSide, fog: false, depthWrite: false, depthTest: false,
    }));
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    this.dome.name = 'sky-dome';
    scene.add(this.dome);

    // Sun: a soft glowing disc low in the sky. Buildings hide it (depth test on).
    this.sunDir = new THREE.Vector3(...s.sunDirection).normalize();
    this.sun = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture, color: s.sunColor, fog: false, depthWrite: false,
      blending: THREE.AdditiveBlending, transparent: true,
    }));
    this.sun.name = 'sun';
    scene.add(this.sun);

    // Lights: warm low sun + pink/purple sky fill + a little ambient so shadows stay readable.
    const l = world.light;
    this.sunLight = new THREE.DirectionalLight(l.sunColor, l.sunIntensity);
    this.sunLight.position.copy(this.sunDir).multiplyScalar(100);
    this.hemi = new THREE.HemisphereLight(l.skyColor, l.groundColor, l.hemiIntensity);
    this.ambient = new THREE.AmbientLight(l.ambientColor, l.ambientIntensity);
    scene.add(this.sunLight, this.hemi, this.ambient);

    scene.fog = new THREE.Fog(world.fog.color, 50, 300);
    scene.background = new THREE.Color(world.fog.color);
    this.radius = 250;
  }

  /** Fog distance follows the quality level's view distance. */
  setViewDistance(viewDistance, camera) {
    const f = this.cfg.fog;
    this.scene.fog.near = viewDistance * f.nearFactor;
    this.scene.fog.far = viewDistance * f.farFactor;
    camera.far = viewDistance * 1.6 + 200;
    camera.updateProjectionMatrix();
    this.radius = camera.far * 0.9;
    this.dome.scale.setScalar(this.radius);
    this.sun.scale.setScalar(this.radius * this.cfg.sky.sunSize * 2);
  }

  /** Keep the dome and sun centred on the camera so they look infinitely far away. */
  update(camera) {
    this.dome.position.copy(camera.position);
    this.sun.position.copy(camera.position).addScaledVector(this.sunDir, this.radius * 0.95);
  }
}
