// Post-processing chain for Medium/High quality:
//   scene → bloom (neon and sun glow) → tone mapping + sRGB (OutputPass) → colour grade + vignette
// Low quality skips all of this and renders straight to the screen (tone mapping still applies).
// Settings: data/graphics.json → bloom, grade. On/off per quality: data/quality.json.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// Colour grade in display (sRGB) space: saturation, contrast, warmth and a soft vignette.
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    saturation: { value: 1 },
    contrast: { value: 1 },
    warmth: { value: 0 },
    vignette: { value: 0 },
    aspect: { value: 1 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float saturation, contrast, warmth, vignette, aspect;
    varying vec2 vUv;
    void main() {
      vec4 tex = texture2D(tDiffuse, vUv);
      vec3 c = tex.rgb;
      float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(lum), c, saturation);
      c = (c - 0.5) * contrast + 0.5;
      c += vec3(warmth, warmth * 0.35, -warmth);
      vec2 d = (vUv - 0.5) * vec2(aspect, 1.0);
      c *= 1.0 - vignette * smoothstep(0.35, 0.95, length(d));
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), tex.a);
    }`,
};

export class PostFx {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {object} cfg       data/graphics.json
   * @param {object} quality   current level from data/quality.json
   */
  constructor(renderer, scene, camera, cfg, quality) {
    this.renderer = renderer;
    // Half-float buffers keep neon brighter than white until bloom sees it. Fall back to
    // 8-bit on phones that cannot render to float textures (bloom is then a bit weaker).
    const canFloat = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: canFloat ? THREE.HalfFloatType : THREE.UnsignedByteType,
      samples: quality.msaa || 0, // anti-aliasing inside the effect chain (High only)
    });
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));

    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), cfg.bloom.strength, cfg.bloom.radius, cfg.bloom.threshold);
    this.bloom.enabled = !!quality.bloom;
    this.composer.addPass(this.bloom);

    this.composer.addPass(new OutputPass()); // tone mapping + sRGB, uses renderer.toneMapping

    this.grade = new ShaderPass(GradeShader);
    const g = cfg.grade;
    Object.assign(this.grade.uniforms.saturation, { value: g.saturation });
    Object.assign(this.grade.uniforms.contrast, { value: g.contrast });
    Object.assign(this.grade.uniforms.warmth, { value: g.warmth });
    Object.assign(this.grade.uniforms.vignette, { value: g.vignette });
    this.composer.addPass(this.grade);
  }

  /** Called on window resize and quality change (pixel ratio already set on the renderer). */
  setSize(width, height) {
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(width, height);
    this.grade.uniforms.aspect.value = width / height;
  }

  render(dt) {
    this.composer.render(dt);
  }

  dispose() {
    this.composer.renderTarget1.dispose();
    this.composer.renderTarget2.dispose();
    this.bloom.dispose();
    this.composer.dispose?.();
  }
}
