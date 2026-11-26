// Crowd renderer: draws every pedestrian with a handful of draw calls.
//
// A person is NOT a scene object. It is { look, dims, x, y, z, heading, scale, pose }.
// Each frame the crowd turns the pose into bone matrices (skeleton.js) and writes one
// instance per body part into shared InstancedMeshes — one per shape in partGeometry.js.
// So 40 people = about 11 draw calls instead of 600.
//
// LOD: people further than quality.pedLodDistance are drawn "far": hands, shoes, forearms
// and shins are skipped (upper limbs are stretched to cover) and their bones are only
// recomputed every few frames.
//
// One crowd is shared by the pedestrians and hotspots features: acquireCrowd(game).
// Game.frame calls game.crowd.update() once after all features have moved their people.
//
// Roadmap 2 S5 — real 3D people: on Medium/High, once the streamed model has arrived
// (data/streaming.json → model.people + image.people.skins), the nearest people that were added
// WITH their Animator (add(look, pose, animator)) are drawn by RealPeople (real/realPeople.js)
// as rigged, animated models; the crowd skips their code-built parts (person.real is set).
// Settings: data/people.json. People without an Animator (vehicle riders) stay code-built.

import * as THREE from 'three';
import { makeBones, computeBones, setRoot } from './skeleton.js';
import { PART_KINDS, PER_PERSON, makePartGeometry } from './partGeometry.js';
import { RealPeople } from './real/realPeople.js';

const REAL_IDS = ['model.people', 'image.people.skins'];

const _m = new THREE.Matrix4();
const _root = new THREE.Matrix4();

export class Crowd {
  /** @param {object} game  @param {{capacity:number, farEvery:number, shadowRadius:number, shadowOpacity:number}} cfg */
  constructor(game, cfg) {
    this.game = game;
    this.cfg = cfg;
    this.capacity = cfg.capacity;
    this.people = new Set();
    this.frame = 0;
    this.real = null;         // RealPeople once the 3D model has streamed in (Medium/High)
    this.realState = 'wait';  // wait → loading → ready | failed
    this.last = performance.now();
    this.group = new THREE.Group();
    this.group.name = 'crowd';
    game.scene.add(this.group);
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true });
    /** @type {Record<string, {mesh:THREE.InstancedMesh, n:number, max:number}>} */
    this.layers = {};
    for (const kind of PART_KINDS) {
      game.assets.registerDefault(`geometry.person.${kind}`, () => makePartGeometry(kind));
    }
    this.ready = game.assets.loadMany(PART_KINDS.map((k) => `geometry.person.${k}`)).then((geos) => {
      PART_KINDS.forEach((kind, i) => {
        const max = this.capacity * PER_PERSON[kind];
        const mesh = new THREE.InstancedMesh(geos[i], this.material, max);
        mesh.name = `crowd-${kind}`;
        mesh.frustumCulled = false; // instances are spread all around the player
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.setColorAt(0, new THREE.Color(1, 1, 1)); // creates instanceColor
        mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
        mesh.count = 0;
        this.group.add(mesh);
        this.layers[kind] = { mesh, n: 0, max };
      });
      // Blob shadows.
      const shadow = new THREE.InstancedMesh(
        new THREE.CircleGeometry(cfg.shadowRadius, 8).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: cfg.shadowOpacity, depthWrite: false }),
        this.capacity,
      );
      shadow.frustumCulled = false;
      shadow.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      shadow.count = 0;
      this.group.add(shadow);
      this.shadow = shadow;
    });
  }

  /**
   * Add a person. Keep the returned object and change x/y/z/heading/pose/visible/far freely.
   * @param {{parts:Array, dims:object, scale:number}} look  from looks.js
   * @param {Float32Array} pose  usually animator.pose (kept by reference)
   * @param {import('./animator.js').Animator} [anim]  pass it so the person can be drawn as a
   *        real 3D model near the player (S5); its speed / action pick the clip
   */
  add(look, pose, anim = null) {
    const person = {
      look, pose, anim,
      real: null,          // RealPeople slot while drawn in 3D
      carryObject: null,   // e.g. a waiter's tray: put between the hands of the 3D model
      x: 0, y: 0, z: 0, heading: 0, groundY: 0,
      visible: true,
      far: false,
      bones: makeBones(),
      tick: this.people.size, // staggers the far-LOD bone updates
      fresh: true,
    };
    this.people.add(person);
    return person;
  }

  remove(person) {
    if (person.real) this.real?.release(person.real);
    this.people.delete(person);
  }

  /** Real 3D people: start loading once the streamer has fetched both files (Medium/High). */
  checkReal() {
    if (this.realState !== 'wait') return;
    const game = this.game;
    const cfg = game.config.has('people') ? game.config.get('people') : null;
    if (!cfg || !(cfg.count[game.qualityName] > 0)) return;
    const st = game.streamer?.started;
    if (!st || !REAL_IDS.every((id) => st.get(id) === 'done')) {
      if (st && REAL_IDS.some((id) => st.get(id) === 'failed')) this.realState = 'failed';
      return;
    }
    this.realState = 'loading';
    game.assets.loadMany(REAL_IDS).then(([rig, skins]) => {
      let ok = false;
      rig.traverse((o) => { if (o.isSkinnedMesh) ok = true; });
      if (!ok || !skins?.width) throw new Error('people model or skins missing');
      this.real = new RealPeople(game, cfg, rig, skins);
      this.realState = 'ready';
    }).catch((err) => { this.realState = 'failed'; console.warn('real people:', err.message); });
  }

  /** Write all instances for this frame. */
  update() {
    if (!this.shadow) return;
    this.frame++;
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (this.frame % 30 === 0) this.checkReal();
    this.real?.update(dt, this.people);
    const layers = this.layers;
    for (const k in layers) layers[k].n = 0;
    let shadows = 0;
    const sArr = this.shadow.instanceMatrix.array;
    const farEvery = this.cfg.farEvery;

    for (const p of this.people) {
      if (!p.visible) continue;
      const look = p.look;
      if (p.real) {
        // Drawn by RealPeople; keep only the soft contact shadow.
        if (shadows < this.capacity) { _m.makeTranslation(p.x, p.groundY + 0.03, p.z); _m.toArray(sArr, shadows * 16); shadows++; }
        continue;
      }
      if (p.fresh || !p.far || (this.frame + p.tick) % farEvery === 0) {
        setRoot(_root, p.x, p.y, p.z, p.heading, look.scale);
        computeBones(p.pose, look.dims, _root, p.bones);
        p.fresh = false;
      }
      const parts = look.parts;
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const local = p.far ? part.far : part.near;
        if (!local) continue;
        const layer = layers[part.kind];
        if (layer.n >= layer.max) continue;
        _m.multiplyMatrices(p.bones[part.bone], local);
        _m.toArray(layer.mesh.instanceMatrix.array, layer.n * 16);
        layer.mesh.instanceColor.array.set(part.color, layer.n * 3);
        layer.n++;
      }
      if (!p.far && shadows < this.capacity) {
        _m.makeTranslation(p.x, p.groundY + 0.03, p.z);
        _m.toArray(sArr, shadows * 16);
        shadows++;
      }
    }
    for (const k in layers) {
      const { mesh, n } = layers[k];
      mesh.count = n;
      if (n > 0) {
        mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor.needsUpdate = true;
      }
    }
    this.shadow.count = shadows;
    this.shadow.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.real?.dispose();
    this.real = null;
    for (const k in this.layers) this.layers[k].mesh.dispose();
    this.shadow?.dispose();
    this.material.dispose();
    this.group.removeFromParent();
    this.people.clear();
  }
}

/** The one shared crowd (made on first use). Sizes: data/pedestrians.json → crowd. */
export async function acquireCrowd(game) {
  if (!game.crowd) game.crowd = new Crowd(game, game.config.get('pedestrians').crowd);
  await game.crowd.ready;
  return game.crowd;
}
