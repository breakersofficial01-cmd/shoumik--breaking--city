// Make an "arms crossed" version of a clip: every frame keeps the clip's body motion
// (breathing, weight shift) but the arm bones are aimed along fixed directions given in
// character space (+x = character's left, +y = up, +z = forward).
// Mixamo bones point along their local +Y axis towards the child joint.
//
// params: { L: { upper:[x,y,z], fore:[x,y,z], hand:[x,y,z] }, R: { ... }, name }

export function makeCrossedClip(THREE, root, base, params) {
  // Remember the rest pose so the model is left exactly as it was.
  const saved = [];
  root.traverse((o) => saved.push([o, o.position.clone(), o.quaternion.clone(), o.scale.clone()]));
  const mixer = new THREE.AnimationMixer(root);
  const action = mixer.clipAction(base);
  action.play();
  const bone = (n) => root.getObjectByName('mixamorig' + n);
  const sides = [['Left', params.L], ['Right', params.R]];
  const names = [];
  for (const [s] of sides) names.push(`${s}Arm`, `${s}ForeArm`, `${s}Hand`);
  const fps = 15;
  const frames = Math.max(2, Math.round(base.duration * fps) + 1);
  const times = new Float32Array(frames);
  const values = Object.fromEntries(names.map((n) => [n, new Float32Array(frames * 4)]));
  const Y = new THREE.Vector3(0, 1, 0);
  const tmpQ = new THREE.Quaternion();
  const parentQ = new THREE.Quaternion();
  const rootQ = new THREE.Quaternion();
  const dir = new THREE.Vector3();

  // Aim one bone so its +Y axis points along worldDir (character space -> world via root).
  const aim = (b, d) => {
    dir.set(...d).normalize().applyQuaternion(rootQ);
    b.parent.getWorldQuaternion(parentQ);
    // desired world rotation = rotation taking world +Y to dir, applied on top of the bone's
    // current world rotation's "twist" is ignored: we build it straight from parent space.
    const localDir = dir.clone().applyQuaternion(parentQ.clone().invert());
    // keep the bone's current twist: rotate its current local +Y onto localDir
    const curY = Y.clone().applyQuaternion(b.quaternion);
    tmpQ.setFromUnitVectors(curY, localDir);
    b.quaternion.premultiply(tmpQ);
    b.updateMatrixWorld(true);
  };

  for (let f = 0; f < frames; f++) {
    const t = Math.min(base.duration, f / fps);
    times[f] = t;
    mixer.setTime(t);
    root.updateMatrixWorld(true);
    root.getWorldQuaternion(rootQ);
    for (const [s, p] of sides) {
      aim(bone(`${s}Arm`), p.upper);
      aim(bone(`${s}ForeArm`), p.fore);
      if (p.hand) aim(bone(`${s}Hand`), p.hand);
      for (const n of [`${s}Arm`, `${s}ForeArm`, `${s}Hand`]) bone(n).quaternion.toArray(values[n], f * 4);
    }
  }
  action.stop();
  mixer.uncacheRoot(root);
  for (const [o, p, q, sc] of saved) { o.position.copy(p); o.quaternion.copy(q); o.scale.copy(sc); }
  root.updateMatrixWorld(true);

  const tracks = base.tracks
    .filter((tr) => !names.some((n) => tr.name === `mixamorig${n}.quaternion`))
    .map((tr) => tr.clone());
  for (const n of names) tracks.push(new THREE.QuaternionKeyframeTrack(`mixamorig${n}.quaternion`, times, values[n]));
  return new THREE.AnimationClip(params.name || 'idleCrossed', base.duration, tracks);
}
