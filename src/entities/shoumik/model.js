// Shoumik: the real low-poly model, built in code (PS2 style, about 2,000 triangles).
// One mesh per bone (11) + the face-photo patch + a blob shadow. The meshes simply follow
// the bone matrices from skeleton.js, so every animation in animActions.js works on him.
//
//   const m = new ShoumikModel(bodyCfg, outfit, faceTexture);
//   scene.add(m.group);
//   m.update(x, y, z, heading, pose, groundY);   // every frame
//   m.setOutfit(otherOutfit);                    // rebuilds the clothes
//
// Look: docs/CHARACTER.md. Colours and outfits: data/player.json → model, data/outfits.json.

import * as THREE from 'three';
import { GeoBuilder } from '../../world/geoBuilder.js';
import { BONE, BONE_COUNT, makeBones, makeDims, computeBones, setRoot } from '../people/skeleton.js';
import { buildHead, buildFacePatch } from './head.js';
import { outfitColors, buildTorso, buildPelvis, buildUpperArm, buildForearm, buildThigh, buildShin } from './body.js';

/** Skeleton proportions the Animator uses for Shoumik (shared with the GLB model). */
export function makeShoumikDims(body) {
  const ws = body.torsoWidthScale / 1.15;
  return makeDims({
    hipY: 0.9, waist: 0.1, neck: 0.5, shoulderX: 0.262 * ws, shoulderY: 0.375,
    upperArm: 0.28, hipX: 0.11, thigh: 0.43,
  });
}

export class ShoumikModel {
  /**
   * @param {object} body     data/player.json → model
   * @param {object} outfit   one entry of data/outfits.json → outfits
   * @param {THREE.Texture|null} faceTexture
   */
  constructor(body, outfit, faceTexture) {
    this.body = body;
    this.ws = body.torsoWidthScale / 1.15; // 1.15 = the stocky build the shapes were drawn for
    this.scale = body.heightScale;
    this.dims = makeShoumikDims(body);
    this.group = new THREE.Group();
    this.group.name = 'shoumik';
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.faceMaterial = faceTexture
      ? new THREE.MeshLambertMaterial({ map: faceTexture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
      : null;
    this.bones = makeBones();
    this.root = new THREE.Matrix4();
    this.meshes = new Array(BONE_COUNT).fill(null);
    this.triangles = 0;

    // The head never changes with the outfit.
    const gb = new GeoBuilder();
    buildHead(gb, body);
    this.setBoneMesh(BONE.HEAD, gb);
    if (this.faceMaterial) {
      this.face = new THREE.Mesh(buildFacePatch(body.face), this.faceMaterial);
      this.face.matrixAutoUpdate = false;
      this.face.frustumCulled = false;
      this.face.renderOrder = 2;
      this.group.add(this.face);
      this.triangles += this.face.geometry.index.count / 3;
    }

    // PS2-style blob shadow.
    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(body.shadowRadius, 12).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: body.shadowOpacity, depthWrite: false }),
    );
    this.shadow.name = 'shadow';
    this.group.add(this.shadow);

    this.setOutfit(outfit);

    // Right hand: a weapon follows the right forearm (data/weapons.json → lowGrips).
    this.holder = new THREE.Group();
    this.holder.name = 'weapon-holder';
    this.holder.matrixAutoUpdate = false;
    this.group.add(this.holder);
    this.gripMatrix = new THREE.Matrix4();
    this.hand = {
      kind: 'low',
      attach: (obj, grip) => {
        this.holder.clear();
        const e = new THREE.Euler(...grip.rotation.map((d) => THREE.MathUtils.degToRad(d)));
        this.gripMatrix.compose(new THREE.Vector3().fromArray(grip.position), new THREE.Quaternion().setFromEuler(e), new THREE.Vector3(1, 1, 1).multiplyScalar(1 / this.scale));
        this.holder.add(obj);
      },
      clear: () => { this.holder.clear(); },
    };
  }

  setBoneMesh(bone, gb) {
    const old = this.meshes[bone];
    if (old) {
      this.triangles -= old.geometry.index.count / 3;
      this.group.remove(old);
      old.geometry.dispose();
    }
    const mesh = new THREE.Mesh(gb.build(), this.material);
    mesh.matrixAutoUpdate = false;
    mesh.frustumCulled = false; // he is always near the camera
    this.meshes[bone] = mesh;
    this.group.add(mesh);
    this.triangles += mesh.geometry.index.count / 3;
  }

  /** Build (or rebuild) everything below the neck for an outfit. */
  setOutfit(outfit) {
    this.outfit = outfit;
    const C = outfitColors(outfit, this.body);
    const style = outfit.style;
    const make = (bone, fn, ...args) => {
      const gb = new GeoBuilder();
      fn(gb, style, C, ...args);
      this.setBoneMesh(bone, gb);
    };
    make(BONE.SPINE, buildTorso, this.ws);
    make(BONE.HIPS, buildPelvis, this.ws);
    make(BONE.ARM_L, buildUpperArm);
    make(BONE.ARM_R, buildUpperArm);
    make(BONE.FORE_L, buildForearm, 1);
    make(BONE.FORE_R, buildForearm, -1);
    make(BONE.LEG_L, buildThigh);
    make(BONE.LEG_R, buildThigh);
    make(BONE.SHIN_L, buildShin);
    make(BONE.SHIN_R, buildShin);
  }

  /** Place him and apply a pose. groundY = height of the ground under him (for the shadow). */
  update(x, y, z, heading, pose, groundY) {
    setRoot(this.root, x, y, z, heading, this.scale);
    computeBones(pose, this.dims, this.root, this.bones);
    for (let i = 0; i < BONE_COUNT; i++) {
      const m = this.meshes[i];
      m.matrix.copy(this.bones[i]);
      m.matrixWorldNeedsUpdate = true;
    }
    if (this.holder.children.length) {
      this.holder.matrix.multiplyMatrices(this.bones[BONE.FORE_R], this.gripMatrix);
      this.holder.matrixWorldNeedsUpdate = true;
    }
    if (this.face) {
      this.face.matrix.copy(this.bones[BONE.HEAD]);
      this.face.matrixWorldNeedsUpdate = true;
    }
    const up = Math.max(0, y - groundY);
    this.shadow.position.set(x, groundY + 0.03, z);
    this.shadow.scale.setScalar(Math.max(0.5, 1 - up * 0.25));
  }

  dispose() {
    for (const m of this.meshes) m?.geometry.dispose();
    this.face?.geometry.dispose();
    this.shadow.geometry.dispose();
    this.shadow.material.dispose();
    this.material.dispose();
    this.faceMaterial?.dispose();
    this.group.removeFromParent();
  }
}
