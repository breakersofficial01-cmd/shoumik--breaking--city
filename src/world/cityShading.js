// City shading (Session 7): small shader additions on the shared city materials so day/night
// and rain cost nothing extra per object.
//   - facades: lit windows at night (inside the window areas of each facade tile, a random
//     share of window cells glows warm), shops behind open shutters glow too
//   - shop signboards: their letters glow at night (emissive map from src/world/signboards.js)
//   - ground: darker and shiny at grazing angles when wet (rain)
//   - load-shedding: one rectangle of the city where nothing glows (setCut)
// World makes one (world.cityShading). dayNight / weather features drive it:
//   setWindows(k 0..1)  setSigns(k 0..1)  setWet(k 0..1, reflectionColour)  setCut(rect|null)
// Window areas per facade tile and colours: data/dayNight.json → windows (+ WINDOW_RECTS below,
// measured on assets/city/facades.jpg; the code-painted fallback atlas uses the same layout).

import * as THREE from 'three';
import { ATLAS_COLS, FACADE } from '../assets/proceduralTextures.js';

// Window rectangles inside each facade tile: [u0, u1, v0, v1] (v = 0 at the bottom of a floor).
// Up to 2 per tile. The shop tile (open shutter) lights its whole interior.
const WINDOW_RECTS = {
  [FACADE.RESIDENTIAL]: [[0.27, 0.73, 0.23, 0.71]],
  [FACADE.OFFICE]: [[0.22, 0.48, 0.12, 0.8], [0.53, 0.79, 0.12, 0.8]],
  [FACADE.GLASS]: [[0.03, 0.97, 0.03, 0.94]],
  [FACADE.SHUTTER]: [[0.08, 0.92, 0.08, 0.73]],
  [FACADE.OLD]: [[0.2, 0.8, 0.18, 0.84]],
};

/** GLSL: is (fx, fy) in a window of this tile? Returns 0..1 (soft edge). */
function windowMaskGlsl() {
  const cases = Object.entries(WINDOW_RECTS).map(([tile, rects]) => {
    const tests = rects.map(([u0, u1, v0, v1]) => `step(${u0.toFixed(3)}, fx) * step(fx, ${u1.toFixed(3)}) * step(${v0.toFixed(3)}, fy) * step(fy, ${v1.toFixed(3)})`).join(' + ');
    return `if (tile == ${tile}) return ${tests};`;
  }).join('\n      ');
  return `
    float bcWindowMask(int tile, float fx, float fy) {
      ${cases}
      return 0.0;
    }`;
}

export class CityShading {
  /**
   * @param {{facadeMaterial: THREE.Material, groundMaterial: THREE.Material}} shared  world.shared
   * @param {object} cfg  data/dayNight.json → windows (may be undefined: defaults are used)
   */
  constructor(shared, cfg = {}) {
    const colors = (cfg.colors || ['#ffd38a']).slice(0, 4);
    while (colors.length < 4) colors.push(colors[0]);
    this.u = {
      bcWindows: { value: 0 },
      bcSigns: { value: 0 },
      bcWet: { value: 0 },
      bcShine: { value: new THREE.Color('#8890a8') },
      bcCut: { value: new THREE.Vector4(0, 0, 0, 0) },
      bcCutOn: { value: 0 },
      bcWinShare: { value: cfg.share ?? 0.4 },
      bcWinCell: { value: new THREE.Vector2(...(cfg.cell || [3, 3.1])) },
      bcWinStrength: { value: cfg.strength ?? 1.5 },
      bcWinColors: { value: colors.map((c) => new THREE.Color(c)) },
    };
    this.groundBase = shared.groundMaterial.color.clone();
    this.facadeBase = shared.facadeMaterial.color.clone();
    this.shared = shared;
    this.patchFacades(shared.facadeMaterial);
    this.patchGround(shared.groundMaterial);
  }

  /** Common vertex additions: world position + world normal for the fragment shader. */
  static addWorldVaryings(shader) {
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying vec3 bcWorldPos;\nvarying vec3 bcWorldNormal;\nvoid main() {')
      .replace('#include <project_vertex>', `#include <project_vertex>
        bcWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        bcWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'varying vec3 bcWorldPos;\nvarying vec3 bcWorldNormal;\nvoid main() {');
  }

  /** Shared GLSL helpers (hash + load-shedding rectangle). */
  static commonGlsl() {
    return `
      uniform vec4 bcCut; uniform float bcCutOn;
      float bcHash(vec2 p) { return fract(sin(dot(p, vec2(41.31, 289.17))) * 43758.5453); }
      float bcPowered(vec3 p) {
        float inside = step(bcCut.x, p.x) * step(p.x, bcCut.z) * step(bcCut.y, p.z) * step(p.z, bcCut.w);
        return 1.0 - inside * bcCutOn;
      }`;
  }

  patchFacades(material) {
    const u = this.u;
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u);
      CityShading.addWorldVaryings(shader);
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', `
          uniform float bcWindows; uniform float bcWinShare; uniform vec2 bcWinCell; uniform float bcWinStrength;
          uniform vec3 bcWinColors[4];
          ${CityShading.commonGlsl()}
          ${windowMaskGlsl()}
          void main() {`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          if (bcWindows > 0.001 && abs(bcWorldNormal.y) < 0.5) {
            float tu = vMapUv.x * ${ATLAS_COLS.toFixed(1)};
            int tile = int(floor(tu));
            float fx = fract(tu);
            float fy = fract(vMapUv.y);
            float mask = bcWindowMask(tile, fx, fy);
            if (mask > 0.0) {
              // One random decision per window: floor number (v) x position along the wall.
              float along = abs(bcWorldNormal.x) > 0.5 ? bcWorldPos.z : bcWorldPos.x;
              vec2 cell = vec2(floor((along - fx * bcWinCell.x) / bcWinCell.x + 0.5), floor(bcWorldPos.y / bcWinCell.y));
              float h = bcHash(cell + floor(bcWorldPos.xz * 0.013) * 7.0);
              float shop = tile == ${FACADE.SHUTTER} ? 1.0 : 0.0;
              float lit = max(shop, step(1.0 - bcWinShare, h));
              int ci = int(floor(fract(h * 7.31) * 4.0));
              vec3 wc = bcWinColors[0];
              if (ci == 1) wc = bcWinColors[1]; else if (ci == 2) wc = bcWinColors[2]; else if (ci == 3) wc = bcWinColors[3];
              float flicker = 0.8 + 0.2 * fract(h * 13.7);
              totalEmissiveRadiance += wc * mask * lit * flicker * bcWindows * bcWinStrength * bcPowered(bcWorldPos);
            }
          }`);
    };
    material.customProgramCacheKey = () => 'bc-facade';
    material.needsUpdate = true;
  }

  patchGround(material) {
    const u = this.u;
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u);
      CityShading.addWorldVaryings(shader);
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', 'uniform float bcWet; uniform vec3 bcShine;\nvoid main() {')
        .replace('#include <opaque_fragment>', `
          if (bcWet > 0.001) {
            // Wet road: a sky-coloured sheen when looking along the ground (fresnel).
            vec3 v = normalize(cameraPosition - bcWorldPos);
            float fres = pow(1.0 - clamp(v.y, 0.0, 1.0), 5.0);
            outgoingLight = mix(outgoingLight, bcShine, fres * bcWet);
          }
          #include <opaque_fragment>`);
    };
    material.customProgramCacheKey = () => 'bc-ground';
    material.needsUpdate = true;
  }

  /**
   * Signboard material: its emissive map (glowing letters) follows setSigns() and the cut.
   * @param {THREE.MeshLambertMaterial} material
   */
  patchSigns(material) {
    const u = this.u;
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u);
      CityShading.addWorldVaryings(shader);
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', `uniform float bcSigns;\n${CityShading.commonGlsl()}\nvoid main() {`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          totalEmissiveRadiance *= bcSigns * bcPowered(bcWorldPos);`);
    };
    material.customProgramCacheKey = () => 'bc-signs';
    material.needsUpdate = true;
  }

  /** Any glowing material that should go dark in a load-shedding district (hero tower glass). */
  patchCut(material) {
    if (material.userData.bcCut) return;
    material.userData.bcCut = true;
    const u = this.u;
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u);
      CityShading.addWorldVaryings(shader);
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', `${CityShading.commonGlsl()}\nvoid main() {`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          totalEmissiveRadiance *= bcPowered(bcWorldPos);`);
    };
    material.customProgramCacheKey = () => 'bc-cut';
    material.needsUpdate = true;
  }

  /** @param {number} k  0 = no window lit (day) .. 1 = full night */
  setWindows(k) { this.u.bcWindows.value = k; }

  /** @param {number} k  0..1 how much the shop sign letters glow */
  setSigns(k) { this.u.bcSigns.value = k; }

  /**
   * Rain: darken the ground and walls and add a sheen to roads.
   * @param {number} k  0 = dry .. 1 = soaked
   * @param {THREE.Color|string} shine  colour reflected by the wet road (sky / fog colour)
   * @param {{darken:number, roadShine:number}} cfg  data/weather.json → wet
   */
  setWet(k, shine, cfg) {
    this.u.bcWet.value = k * (cfg?.roadShine ?? 0.5);
    if (shine) this.u.bcShine.value.set(shine);
    const d = 1 - k * (cfg?.darken ?? 0.3);
    this.shared.groundMaterial.color.copy(this.groundBase).multiplyScalar(d);
    this.shared.facadeMaterial.color.copy(this.facadeBase).multiplyScalar(1 - (1 - d) * 0.5);
  }

  /** Load-shedding: nothing glows inside this rectangle. @param {{x0,z0,x1,z1}|null} rect */
  setCut(rect) {
    if (!rect) { this.u.bcCutOn.value = 0; return; }
    this.u.bcCut.value.set(rect.x0, rect.z0, rect.x1, rect.z1);
    this.u.bcCutOn.value = 1;
  }
}
