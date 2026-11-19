// Sky, sun, lights and fog: the warm Vice-style sunset look. All colours come from
// data/world.json (sky, light, fog).
// Session 7 (day/night, src/features/dayNight/): enableCycle() paints a day and a night sky as
// well, and the dome blends the three (setSkyMix). setSunDirection() moves the sun disc; the
// feature also changes the lights and fog directly (this.sunLight, this.hemi, this.ambient,
// scene.fog). Rain greys the sky with setTint().

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

  /**
   * Paint the day and night skies (once) and switch the dome to a 3-sky blend.
   * @param {THREE.WebGLRenderer} renderer
   * @param {{day: object, night: object}} skies  data/dayNight.json → skies (same fields as world.json → sky)
   */
  enableCycle(renderer, skies) {
    if (!this.texture || this.cycle) return false;
    let day, night;
    try {
      day = paintSky(renderer, skies.day);
      night = paintSky(renderer, skies.night);
    } catch (err) {
      console.warn('sky: day/night skies could not be painted', err);
      return false;
    }
    const u = this.cycle = {
      mapDay: { value: day }, mapNight: { value: night },
      weights: { value: new THREE.Vector3(0, 1, 0) },  // day, sunset, night
      tint: { value: new THREE.Color(1, 1, 1) }, tintMix: { value: 0 }, bright: { value: 1 },
    };
    const m = this.dome.material;
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u);
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', 'uniform sampler2D mapDay; uniform sampler2D mapNight; uniform vec3 weights; uniform vec3 tint; uniform float tintMix; uniform float bright;\nvoid main() {')
        .replace('#include <map_fragment>', `
          vec4 skyC = texture2D(mapDay, vMapUv) * weights.x + texture2D(map, vMapUv) * weights.y + texture2D(mapNight, vMapUv) * weights.z;
          skyC.rgb = mix(skyC.rgb, tint * dot(skyC.rgb, vec3(0.3, 0.59, 0.11)) * 1.6 + tint * 0.08, tintMix) * bright;
          diffuseColor *= skyC;`);
    };
    m.customProgramCacheKey = () => 'sky-cycle';
    m.needsUpdate = true;
    return true;
  }

  /** @param {number} day @param {number} sunset @param {number} night  weights, about 1 in total */
  setSkyMix(day, sunset, night) {
    this.cycle?.weights.value.set(day, sunset, night);
  }

  /** Grey the sky towards a colour (rain). @param {string|THREE.Color} color  @param {number} mix 0..1  @param {number} bright */
  setTint(color, mix, bright = 1) {
    if (!this.cycle) return;
    this.cycle.tint.value.set(color);
    this.cycle.tintMix.value = mix;
    this.cycle.bright.value = bright;
  }

  /** Move the sun (or moon) disc. The sun light direction is set by Graphics (shadows). */
  setSunDirection(dir) {
    this.sunDir.copy(dir).normalize();
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
    this.sun.scale.setScalar(this.radius * this.cfg.sky.sunSize * 2 * (this.sunScale ?? 1));
  }

  /** Sun disc size relative to data/world.json → sky.sunSize (the moon is smaller). */
  setSunScale(k) {
    if (this.sunScale === k) return;
    this.sunScale = k;
    this.sun.scale.setScalar(this.radius * this.cfg.sky.sunSize * 2 * k);
  }

  /** Keep the dome and sun centred on the camera so they look infinitely far away. */
  update(camera) {
    this.dome.position.copy(camera.position);
    this.sun.position.copy(camera.position).addScaledVector(this.sunDir, this.radius * 0.95);
  }
}
