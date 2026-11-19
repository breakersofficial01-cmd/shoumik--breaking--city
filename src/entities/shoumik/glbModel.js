// Real 3D Shoumik (Session 4.5 Part B): the rigged model from assets/shoumik/shoumik.glb with
// Mixamo animations, used on Medium/High quality. Same interface as the code-built
// ShoumikModel (model.js), so the player feature does not care which one it has:
//
//   const m = new GlbShoumikModel(rig, cfg, dims, animator);
//   scene.add(m.group);
//   m.update(x, y, z, heading, pose, groundY, { dt, speed, vy });   // every frame
//
// The procedural Animator (src/entities/people/animator.js) stays the "brain": it already
// tracks how much he is moving, in the air, and which action (punch, aim, dance, vehicle…) is
// running and how strongly. This class turns those numbers into weights for real clips:
//   base layer   idle (signature arms-crossed) ↔ walk ↔ run ↔ sprint by speed, jump/fall in air
//   action layer the clip mapped to the animator's action, weighted by the action's fade
// Actions with an "upper" mask (aim, shoot…) only drive the upper body while he walks.
// Clip names and speeds: data/player.json → model.glb.

import * as THREE from 'three';

// Mixamo bones that belong to the upper body (everything else = lower body + hips).
const UPPER = /Spine|Neck|Head|Shoulder|Arm|Hand/;
const clamp01 = (v) => Math.max(0, Math.min(1, v));

export class GlbShoumikModel {
  /**
   * @param {THREE.Object3D} rig      gltf.scene (userData.animations = clips)
   * @param {object} body             data/player.json → model
   * @param {object} dims             skeleton dims the Animator expects (makeShoumikDims)
   * @param {import('../people/animator.js').Animator} animator
   */
  constructor(rig, body, dims, animator) {
    this.cfg = body.glb;
    this.dims = dims;
    this.animator = animator;
    // group (stays at the origin) holds the moving body and the ground shadow, like model.js.
    this.group = new THREE.Group();
    this.group.name = 'shoumik';
    this.body = new THREE.Group();
    this.rig = rig;
    rig.scale.setScalar(this.cfg.height / this.cfg.nativeHeight);
    this.body.add(rig);
    this.group.add(this.body);
    this.triangles = 0;
    rig.traverse((o) => {
      if (o.isMesh) {
        o.material.color.setScalar(this.cfg.brightness ?? 1);
        o.frustumCulled = false; // always near the camera; skinned bounds are unreliable
        this.triangles += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
      }
    });

    // Contact shadow under his feet (real sun shadows come from src/world/graphics/).
    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(body.shadowRadius, 12).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: body.shadowOpacity, depthWrite: false }),
    );
    this.shadow.name = 'shadow';
    this.group.add(this.shadow);

    // Three versions of every clip: full body, upper body only, lower body only.
    this.mixer = new THREE.AnimationMixer(rig);
    this.clips = new Map();
    for (const clip of rig.userData.animations || []) {
      const upper = clip.tracks.filter((t) => UPPER.test(t.name.split('.')[0]));
      const lower = clip.tracks.filter((t) => !UPPER.test(t.name.split('.')[0]));
      this.clips.set(clip.name, {
        clip,
        full: this.mixer.clipAction(clip),
        upper: this.mixer.clipAction(new THREE.AnimationClip(`${clip.name}:upper`, clip.duration, upper)),
        lower: this.mixer.clipAction(new THREE.AnimationClip(`${clip.name}:lower`, clip.duration, lower)),
      });
    }
    this.weights = new Map(); // AnimationAction -> weight wanted this frame
    this.active = new Set();
    const missing = Object.values(this.cfg.clips).flat().filter((n) => n && !this.clips.has(n));
    if (missing.length) console.warn('shoumik.glb is missing clips:', [...new Set(missing)].join(', '));
  }

  /** The GLB has one outfit for now; outfits still change the code-built (Low) model. */
  setOutfit(outfit) {
    this.outfit = outfit;
  }

  /** Add weight w of clip `name` (variant: full | upper | lower). */
  want(name, w, variant = 'full', timeScale = 1, time = null) {
    if (w <= 0.001 || !name) return;
    const c = this.clips.get(name);
    if (!c) return;
    const a = c[variant];
    this.weights.set(a, (this.weights.get(a) || 0) + w);
    a.timeScale = timeScale;
    a.userData = { clip: c, time };
  }

  /** Decide this frame's clip weights from the Animator's state. */
  plan(speed, vy) {
    const an = this.animator;
    const C = this.cfg.clips;
    const S = this.cfg.speeds;
    const move = clamp01(an.move);
    const air = clamp01(an.air);
    const act = an.action;
    const actW = act ? clamp01(act.w) : 0;
    const map = act ? this.cfg.actions[act.name] : null;
    const upperOnly = !!(map && (act.mask || act.def.mask) === 'upper' && move > 0.05);

    // ---- base layer (sums to 1) ----
    const base = [];
    base.push([C.idle, (1 - move) * (1 - air), 1]);
    if (move > 0.001) {
      const r = clamp01((speed - S.walk) / (S.run - S.walk));
      const sp = clamp01((speed - S.run) / (S.sprint - S.run));
      const m = move * (1 - air);
      base.push([C.walk, m * (1 - r), THREE.MathUtils.clamp(speed / S.walkClip, 0.5, 1.8)]);
      base.push([C.run, m * r * (1 - sp), THREE.MathUtils.clamp(speed / S.runClip, 0.6, 1.5)]);
      base.push([C.sprint, m * r * sp, THREE.MathUtils.clamp(speed / S.sprintClip, 0.7, 1.5)]);
    }
    if (air > 0.001) {
      const falling = vy < -this.cfg.fallAfterSpeed ? 1 : 0;
      base.push([C.jump, air * (1 - falling), 0, this.cfg.jumpHoldAt]); // frozen mid-air frame
      base.push([C.fall, air * falling, 1]);
    }

    // ---- action layer ----
    if (map && actW > 0) {
      const clipName = act.ctx?.variant && map.variants ? map.variants[act.ctx.variant % map.variants.length] : map.clip;
      const info = this.clips.get(clipName);
      let time = null;
      let scale = 1;
      if (info && act.duration != null && !map.loop) {
        // One-shot: follow the animator's clock so hits land when the game expects.
        time = clamp01(act.t / act.duration) * info.clip.duration * (map.span ?? 1);
        scale = 0;
      }
      if (upperOnly) {
        for (const [n, w, ts, t] of base) { this.want(n, w, 'lower', ts, t); this.want(n, w * (1 - actW), 'upper', ts, t); }
        this.want(clipName, actW, 'upper', scale, time);
        return;
      }
      for (const [n, w, ts, t] of base) this.want(n, w * (1 - actW), 'full', ts, t);
      this.want(clipName, actW, 'full', scale, time);
      return;
    }
    for (const [n, w, ts, t] of base) this.want(n, w, 'full', ts, t);
  }

  /**
   * Place him and animate. `pose` (the code-built skeleton pose) is ignored here; the
   * animator's state is read directly.
   * @param {{dt?:number, speed?:number, vy?:number}} motion  from the player feature
   */
  update(x, y, z, heading, pose, groundY, motion = {}) {
    const dt = motion.dt || 0;
    this.body.position.set(x, y, z);
    this.body.rotation.y = heading;

    this.weights.clear();
    this.plan(motion.speed || 0, motion.vy || 0);
    // Start what is new, stop what is no longer wanted, set weights.
    for (const a of this.active) {
      if (!this.weights.has(a)) { a.stop(); this.active.delete(a); }
    }
    for (const [a, w] of this.weights) {
      if (!this.active.has(a)) {
        a.reset().play();
        // Keep variants of the same clip in step with each other.
        const c = a.userData.clip;
        for (const sib of [c.full, c.upper, c.lower]) if (sib !== a && this.active.has(sib)) { a.time = sib.time; break; }
        this.active.add(a);
      }
      a.setEffectiveWeight(w);
      if (a.userData.time != null) a.time = a.userData.time;
    }
    this.mixer.update(dt);

    const up = Math.max(0, y - groundY);
    this.shadow.position.set(x, groundY + 0.03, z);
    this.shadow.scale.setScalar(Math.max(0.5, 1 - up * 0.25));
  }

  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.rig);
    this.shadow.geometry.dispose();
    this.shadow.material.dispose();
    this.group.removeFromParent();
  }
}
