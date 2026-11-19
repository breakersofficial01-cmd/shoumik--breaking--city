// Paints the whole 360° sky ONCE into a texture (equirectangular, matching SphereGeometry's UVs),
// so the sky costs nothing per frame on phones. Original work, made in code from the owner's
// reference photos: colour gradient, glow on the sun side of the horizon, a halo, streaky
// sunset clouds lit from below, and faint stars high up. Everything is tuned in
// data/world.json → sky.painted.

import * as THREE from 'three';

const MAX_STOPS = 8;

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const fragmentShader = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform vec3 sunDir;
  uniform float stopH[${MAX_STOPS}];
  uniform vec3 stopC[${MAX_STOPS}];
  uniform int stopCount;
  uniform vec3 glowColor;   uniform float glowStrength; uniform float glowPower; uniform float glowHeight;
  uniform vec3 haloColor;   uniform float haloStrength; uniform float haloPower;
  uniform vec3 cloudLit;    uniform vec3 cloudShade;   uniform vec3 cloudRim;
  uniform float cloudCover; uniform float cloudSoft;   uniform float cloudScale; uniform float cloudStretch;
  uniform float cloudAlpha; uniform float cloudLow;    uniform float cloudHigh;  uniform float seed;
  uniform float starDensity; uniform float starBright; uniform float starFrom;

  // Value noise + fbm (cheap; runs once, not per frame).
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + seed) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 6; i++) { v += a * noise(p); p = p * 2.03 + vec2(17.3, 9.1); a *= 0.5; }
    return v;
  }

  vec3 gradient(float h) {
    vec3 c = stopC[0];
    for (int i = 1; i < ${MAX_STOPS}; i++) {
      if (i >= stopCount) break;
      float t = clamp((h - stopH[i - 1]) / max(1e-4, stopH[i] - stopH[i - 1]), 0.0, 1.0);
      c = mix(c, stopC[i], smoothstep(0.0, 1.0, t));
    }
    return c;
  }

  void main() {
    // Same direction SphereGeometry uses for this UV.
    float theta = (1.0 - vUv.y) * 3.14159265, phi = vUv.x * 6.28318531;
    vec3 d = vec3(-cos(phi) * sin(theta), cos(theta), sin(phi) * sin(theta));
    float h = d.y;
    vec3 s = normalize(sunDir);
    vec3 col = gradient(h);

    // Warm glow along the horizon, strongest towards the sun.
    vec2 dh = normalize(d.xz + 1e-5), sh = normalize(s.xz);
    float side = pow(max(dot(dh, sh) * 0.5 + 0.5, 0.0), glowPower);
    col += glowColor * glowStrength * side * exp(-abs(h - s.y * 0.3) / glowHeight);
    // Halo around the sun.
    float toSun = max(dot(d, s), 0.0);
    col += haloColor * haloStrength * pow(toSun, haloPower);

    // Streaky clouds on a flat layer above the city, lit from below by the low sun.
    if (h > cloudLow) {
      vec2 p = d.xz / (h + 0.12) * cloudScale;
      p.x *= cloudStretch;
      float n = fbm(p);
      float cover = smoothstep(cloudCover, cloudCover + cloudSoft, n);
      // Lighting: compare with a sample shifted towards the sun (edges facing it glow).
      vec2 ps = (d.xz - s.xz * 0.04) / (h + 0.12) * cloudScale; ps.x *= cloudStretch;
      float lit = clamp((n - fbm(ps)) * 6.0 + 0.5, 0.0, 1.0);
      float nearSun = pow(toSun, 3.0);
      vec3 cc = mix(cloudShade, cloudLit, clamp(lit * 0.7 + nearSun * 0.6 + (1.0 - h) * 0.3, 0.0, 1.0));
      cc += cloudRim * pow(toSun, 12.0) * lit;
      float fade = smoothstep(cloudLow, cloudLow + 0.08, h) * (1.0 - smoothstep(cloudHigh - 0.2, cloudHigh, h));
      col = mix(col, cc, cover * cloudAlpha * fade);
    }

    // Faint stars high up (dusk), hidden behind clouds' glow.
    if (h > starFrom) {
      vec2 g = vec2(phi * 220.0, theta * 110.0);
      float st = hash(floor(g));
      vec2 f = fract(g) - 0.5;
      float star = step(1.0 - starDensity, st) * smoothstep(0.35, 0.0, length(f));
      col += vec3(1.0, 0.9, 0.85) * star * starBright * smoothstep(starFrom, starFrom + 0.3, h) * (0.5 + 0.5 * hash(floor(g) + 3.1));
    }
    gl_FragColor = vec4(col, 1.0);
  }
`;

/**
 * @param {THREE.WebGLRenderer} renderer
 * @param {object} sky   data/world.json → sky (uses sky.painted and sky.sunDirection)
 * @returns {THREE.Texture} the painted sky (sRGB colours stored as-is; drawn unlit)
 */
export function paintSky(renderer, sky) {
  const P = sky.painted;
  const w = P.width || 2048, h = w / 2;
  const target = new THREE.WebGLRenderTarget(w, h, {
    generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
    wrapS: THREE.RepeatWrapping, colorSpace: THREE.SRGBColorSpace,
  });
  const stops = P.stops.slice(0, MAX_STOPS);
  const hs = new Array(MAX_STOPS).fill(1), cs = new Array(MAX_STOPS).fill(0).map(() => new THREE.Color());
  // Shader colours are linear; the target stores sRGB, so this round-trips to the data colours.
  stops.forEach(([y, c], i) => { hs[i] = y; cs[i] = new THREE.Color(c); });
  const C = (c) => new THREE.Color(c);
  const cl = P.clouds, st = P.stars;
  const material = new THREE.ShaderMaterial({
    vertexShader, fragmentShader, depthTest: false, depthWrite: false,
    uniforms: {
      sunDir: { value: new THREE.Vector3(...sky.sunDirection) },
      stopH: { value: hs }, stopC: { value: cs }, stopCount: { value: stops.length },
      glowColor: { value: C(P.glow.color) }, glowStrength: { value: P.glow.strength }, glowPower: { value: P.glow.power }, glowHeight: { value: P.glow.height },
      haloColor: { value: C(P.halo.color) }, haloStrength: { value: P.halo.strength }, haloPower: { value: P.halo.power },
      cloudLit: { value: C(cl.lit) }, cloudShade: { value: C(cl.shade) }, cloudRim: { value: C(cl.rim) },
      cloudCover: { value: cl.cover }, cloudSoft: { value: cl.softness }, cloudScale: { value: cl.scale }, cloudStretch: { value: cl.stretch },
      cloudAlpha: { value: cl.opacity }, cloudLow: { value: cl.from }, cloudHigh: { value: cl.to }, seed: { value: cl.seed },
      starDensity: { value: st.density }, starBright: { value: st.brightness }, starFrom: { value: st.from },
    },
  });
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(target);
  renderer.render(scene, new THREE.Camera());
  renderer.setRenderTarget(prev);
  material.dispose();
  scene.children[0].geometry.dispose();
  return target.texture;
}
