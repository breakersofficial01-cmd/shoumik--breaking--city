// Graphics: the "look" of the game on top of the plain renderer (Session 4.5, Part A).
//   - filmic tone mapping (all qualities)
//   - sky reflection map → scene.environment (water now; real 3D cars and glass later)
//   - real sun shadows that follow the player (Medium/High)
//   - bloom + colour grade + vignette (Medium/High, src/world/graphics/postfx.js)
// Game owns one Graphics object (game.graphics) and calls setQuality / setSize / update / render.
// All numbers: data/graphics.json. Which effects run per quality: data/quality.json.

import * as THREE from 'three';
import { log } from '../../core/debug.js';
import { PostFx } from './postfx.js';
import { SunShadows } from './shadows.js';

const TONE = {
  ACES: THREE.ACESFilmicToneMapping,
  AgX: THREE.AgXToneMapping,
  Neutral: THREE.NeutralToneMapping,
  None: THREE.NoToneMapping,
};

export class Graphics {
  /** @param {import('../../core/game.js').Game} game  after game.world.init() */
  constructor(game) {
    this.game = game;
    this.cfg = game.config.get('graphics');
    const { renderer, scene, world } = game;
    this.postfx = null;
    this.size = { w: 1, h: 1 };

    renderer.toneMapping = TONE[this.cfg.toneMapping.type] ?? THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = this.cfg.toneMapping.exposure;
    // Several passes render per frame; reset the draw-call counters once per frame instead.
    renderer.info.autoReset = false;

    // Stronger sun, weaker sky fill (data/graphics.json → lighting) so shadows read clearly.
    const light = this.cfg.lighting;
    world.sky.sunLight.intensity = light.sunIntensity;
    world.sky.hemi.intensity = light.hemiIntensity;
    world.sky.ambient.intensity = light.ambientIntensity;

    scene.environment = this.buildEnvironment(world.sky);

    const receiveOnly = new Set([world.shared.groundMaterial, world.water.mesh.material, world.water.base.material]);
    this.shadows = new SunShadows(renderer, scene, world.sky.sunLight, world.sky.sunDir, this.cfg.shadows, receiveOnly);
  }

  /** Render the sky dome and sun once into a small blurred cube map used for reflections. */
  buildEnvironment(sky) {
    const envScene = new THREE.Scene();
    const dome = new THREE.Mesh(sky.dome.geometry, sky.dome.material);
    dome.scale.setScalar(50);
    const sun = new THREE.Sprite(sky.sun.material);
    sun.position.copy(sky.sunDir).multiplyScalar(45);
    sun.scale.setScalar(14);
    envScene.add(dome, sun);
    const pmrem = new THREE.PMREMGenerator(this.game.renderer);
    const target = pmrem.fromScene(envScene, 0.03, 0.1, 100, { size: this.cfg.environment.size });
    pmrem.dispose();
    return target.texture;
  }

  setQuality(quality) {
    const { renderer, scene, camera } = this.game;
    this.shadows.setQuality(quality);
    this.postfx?.dispose();
    this.postfx = quality.postfx ? new PostFx(renderer, scene, camera, this.cfg, quality) : null;
    if (this.postfx) this.postfx.setSize(this.size.w, this.size.h);
    log.info(`graphics: postfx ${quality.postfx ? 'on' : 'off'}, bloom ${quality.bloom ? 'on' : 'off'}, shadows ${quality.shadowMapSize || 'off'}`);
  }

  setSize(w, h) {
    this.size = { w, h };
    this.postfx?.setSize(w, h);
  }

  /** @param {{x:number,z:number}} focus  the point the shadows follow (player) */
  update(dt, focus) {
    this.shadows.update(dt, focus);
  }

  render(dt) {
    const { renderer, scene, camera } = this.game;
    renderer.info.reset();
    if (this.postfx) this.postfx.render(dt);
    else renderer.render(scene, camera);
  }
}
