// Real 3D people (Roadmap 2 S5): the people nearest to Shoumik are drawn with the rigged,
// animated model assets/people/people.glb (Kenney body + Mixamo clips, tools/people-kit)
// instead of the code-built instanced shapes. Owned by the shared Crowd (crowd.js), so every
// feature that adds people to the crowd — pedestrians, hotspot dancers, police on foot,
// carjacked drivers, hotel staff and guests — gets real people with NO changes of its own.
//
// How a person becomes real: Crowd.update() calls update(dt, people) every frame. A few times a
// second the nearest `count` people (data/people.json, per quality) that have an Animator are
// given a SLOT: a cloned skinned body + one skinned attachment mesh (attachments.js) + an
// AnimationMixer. The crowd then skips their code-built parts. The Animator stays the brain:
// its speed / action / fade decide which clip plays (walk, run, sit, dance, fall, cower...).
// Hotel waiters set person.carryObject (their tray): it is put between the hands each frame.
//
// Low quality: count 0 → nobody is real. Nothing is downloaded on Low (data/streaming.json).

import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { SkinPainter } from './skinPainter.js';
import { measureBody, buildAttachments } from './attachments.js';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class RealPeople {
  /**
   * @param {object} game
   * @param {object} cfg  data/people.json
   * @param {THREE.Object3D} rig  model.people (gltf scene, userData.animations = clips)
   * @param {HTMLImageElement} skins  image.people.skins
   */
  constructor(game, cfg, rig, skins) {
    this.game = game;
    this.cfg = cfg;
    this.rig = rig;
    this.clips = new Map((rig.userData.animations || []).map((c) => [c.name, c]));
    let body = null;
    rig.traverse((o) => { if (o.isSkinnedMesh && !body) body = o; });
    this.M = measureBody(body, cfg.modelHeight);
    this.painter = new SkinPainter(skins, cfg);
    this.blank = new THREE.DataTexture(new Uint8Array([200, 200, 200, 255]), 1, 1);
    this.blank.needsUpdate = true;
    this.attachMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.group = new THREE.Group();
    this.group.name = 'real-people';
    game.scene.add(this.group);
    /** @type {Array<object>} */
    this.slots = [];
    this.timer = 0;
    this.frame = 0;
    this.painted = 0;
  }

  /** How many real people at once on the current quality. */
  get count() { return this.cfg.count[this.game.qualityName] ?? 0; }

  makeSlot() {
    const root = SkeletonUtils.clone(this.rig);
    root.name = 'real-person';
    let body = null;
    root.traverse((o) => { if (o.isSkinnedMesh && !body) body = o; });
    body.material = new THREE.MeshLambertMaterial({ map: this.blank });
    // Skinned: a fixed, generous sphere around the T-pose (in geometry units, see measureBody).
    const k = this.M.k;
    body.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, this.M.floor + 0.9 * k, 0), 1.5 * k);
    const extra = new THREE.SkinnedMesh(new THREE.BufferGeometry(), this.attachMaterial);
    extra.name = 'real-person-extras';
    extra.bind(body.skeleton, body.bindMatrix);
    extra.boundingSphere = body.boundingSphere;
    extra.visible = false;
    root.add(extra);
    const head = body.skeleton.getBoneByName('Head');
    if (head) head.scale.setScalar(this.cfg.headScale);
    const slot = {
      root, body, extra,
      hands: [body.skeleton.getBoneByName('LeftHand'), body.skeleton.getBoneByName('RightHand')],
      mixer: new THREE.AnimationMixer(root),
      actions: new Map(),
      person: null, cur: null, curAct: null, skip: 0,
    };
    root.visible = false;
    this.group.add(root);
    this.slots.push(slot);
    return slot;
  }

  action(slot, name) {
    let a = slot.actions.get(name);
    if (!a) {
      const clip = this.clips.get(name);
      if (!clip) return null;
      a = slot.mixer.clipAction(clip);
      slot.actions.set(name, a);
    }
    return a;
  }

  /** Give person p the free slot s. */
  attach(s, p) {
    const d = p.look.desc;
    s.person = p;
    p.real = s;
    s.body.material.map = this.painter.get(d);
    const g = buildAttachments(d, this.M, this.cfg);
    s.extra.geometry.dispose();
    s.extra.geometry = g || new THREE.BufferGeometry();
    s.extra.visible = !!g;
    s.root.scale.setScalar((p.look.scale || 1) * this.cfg.heightScale);
    const noShadow = !this.cfg.shadows[this.game.qualityName];
    s.body.userData.noCastShadow = noShadow;
    s.extra.userData.noCastShadow = noShadow;
    s.mixer.stopAllAction();
    s.cur = null;
    s.curAct = null;
  }

  release(s) {
    if (!s.person) return;
    this.painter.release(s.person.look.desc);
    s.person.real = null;
    s.person = null;
    s.root.visible = false;
    s.mixer.stopAllAction();
    s.extra.geometry.dispose();
    s.extra.geometry = new THREE.BufferGeometry();
    s.extra.visible = false;
  }

  /** Choose who is real now: the nearest people with an Animator, within the quality's distance. */
  assign(people, focus) {
    const n = this.count;
    const q = this.game.qualityName;
    const dist = this.cfg.distance[q] ?? 0;
    const cand = [];
    if (n > 0) {
      for (const p of people) {
        if (!p.anim || !p.look.desc || !p.visible) continue;
        const d = Math.hypot(p.x - focus.x, p.z - focus.z);
        const limit = (p.real ? dist * this.cfg.keepFactor : dist) * (p.carryObject ? 2 : 1);
        // Already real: keep (no flicker). Carrying something (hotel waiters): always first.
        if (d < limit) cand.push([(p.real ? d * 0.85 : d) * (p.carryObject ? 0.3 : 1), p]);
      }
      cand.sort((a, b) => a[0] - b[0]);
    }
    const chosen = new Set(cand.slice(0, n).map((c) => c[1]));
    for (const s of this.slots) if (s.person && !chosen.has(s.person)) this.release(s);
    this.painted = 0;
    for (const p of chosen) {
      if (p.real) continue;
      if (!this.painter.has(p.look.desc) && this.painted >= this.cfg.paintPerFrame) continue; // next time
      if (!this.painter.has(p.look.desc)) this.painted++;
      const s = this.slots.find((x) => !x.person) || (this.slots.length < n ? this.makeSlot() : null);
      if (!s) break;
      this.attach(s, p);
    }
  }

  /** Which clip this person should play now (from the Animator's state). */
  plan(s, p) {
    const an = p.anim;
    const C = this.cfg.clips;
    const act = an.action;
    const map = act && !act.ending && act.w > 0.2 ? this.cfg.actions[act.name] : null;
    if (map) {
      const variants = map.variants;
      const name = variants ? variants[(act.ctx?.variant || 0) % variants.length] : map.clip;
      const clip = this.clips.get(name);
      let ts = map.speed ?? 1;
      if (!map.loop && !map.speed && act.duration && clip) ts = clamp(clip.duration / act.duration, 0.6, 2.5);
      return { name, loop: !!map.loop, hold: !!map.hold, ts, y: map.y || 0, act };
    }
    const speed = an.speed || 0;
    const carry = !!p.carryObject;
    if (an.move > 0.5 && speed > 0.3) {
      if (speed >= C.runFrom) return { name: C.run, loop: true, ts: clamp(speed / C.runSpeed, 0.6, 1.6), y: 0 };
      return { name: carry ? this.cfg.carry.walk : C.walk, loop: true, ts: clamp(speed / C.walkSpeed, 0.5, 1.8), y: 0 };
    }
    return { name: carry ? this.cfg.carry.idle : C.idle, loop: true, ts: 1, y: 0 };
  }

  /** Every frame (from Crowd.update). */
  update(dt, people) {
    this.frame++;
    const focus = this.game.player?.position || this.game.camera.position;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = this.cfg.assignSeconds;
      this.assign(people, focus);
    }
    const fade = this.cfg.fade;
    for (const s of this.slots) {
      const p = s.person;
      if (!p) continue;
      s.root.visible = p.visible;
      if (!p.visible) continue;
      const want = this.plan(s, p);
      s.root.position.set(p.x, p.y + want.y, p.z);
      s.root.rotation.y = p.heading;
      const restart = want.act && want.act !== s.curAct && !want.loop;
      if (!s.cur || s.cur.name !== want.name || restart) {
        const next = this.action(s, want.name);
        if (next) {
          const prev = s.cur && this.action(s, s.cur.name);
          next.reset();
          next.setLoop(want.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
          next.clampWhenFinished = !want.loop;
          next.play();
          if (prev && prev !== next) next.crossFadeFrom(prev, fade, false);
          else next.fadeIn(s.cur ? fade : 0);
          if (want.loop && !s.cur) next.time = Math.random() * next.getClip().duration; // not in step
        }
        s.cur = want;
        s.curAct = want.act || null;
      }
      const a = this.action(s, want.name);
      if (a) a.timeScale = want.ts;
      // Far people animate every 2nd frame (half the work, still smooth enough).
      const far = Math.hypot(p.x - focus.x, p.z - focus.z) > this.cfg.farUpdate;
      s.skip += dt;
      if (!far || (this.frame & 1) === 0) { s.mixer.update(s.skip); s.skip = 0; }
      if (p.carryObject) {
        s.root.updateMatrixWorld(true);
        s.hands[0].getWorldPosition(_a);
        s.hands[1].getWorldPosition(_b);
        p.carryObject.position.set((_a.x + _b.x) / 2, (_a.y + _b.y) / 2 + this.cfg.carry.trayLift, (_a.z + _b.z) / 2);
        p.carryObject.rotation.y = p.heading;
      }
    }
  }

  /** Debug / tests: who is real. */
  report() {
    return { slots: this.slots.length, real: this.slots.filter((s) => s.person).length, textures: this.painter.cache.size };
  }

  dispose() {
    for (const s of this.slots) {
      if (s.person) s.person.real = null;
      s.mixer.stopAllAction();
      s.body.material.dispose();
      s.extra.geometry.dispose();
    }
    this.slots = [];
    this.painter.dispose();
    this.blank.dispose();
    this.attachMaterial.dispose();
    this.group.removeFromParent();
  }
}
