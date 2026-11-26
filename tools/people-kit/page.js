// In-page half of tools/people-kit/pack-people.js (runs in headless Chromium with three r170).
// pack(recipe) → saves people.glb + skins.png through POST, returns a short report.

const THREE = await import('three');
const { FBXLoader } = await import('three/addons/loaders/FBXLoader.js');
const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
const { MeshoptDecoder } = await import('three/addons/libs/meshopt_decoder.module.js');

const save = (name, blob) => fetch('/save/' + name, { method: 'POST', body: blob });
const wp = (o) => o.getWorldPosition(new THREE.Vector3());
const wq = (o) => o.getWorldQuaternion(new THREE.Quaternion());
const KEEP = (n) => !/Ctrl|IK|Roll|_end$/.test(n);

// Mixamo bone (without "mixamorig") → Kenney bone.
const MAP = { Hips: 'Hips', Spine: 'Spine', Spine1: 'Chest', Spine2: 'UpperChest', Neck: 'Neck', Head: 'Head' };
// Bone → child that gives its direction (Mixamo names).
const DIR = { Spine: 'Spine1', Spine1: 'Spine2', Spine2: 'Neck', Neck: 'Head' };
for (const s of ['Left', 'Right']) {
  for (const b of ['Shoulder', 'Arm', 'ForeArm', 'Hand', 'UpLeg', 'Leg', 'Foot', 'HandThumb1', 'HandThumb2', 'HandIndex1', 'HandIndex2', 'HandIndex3']) MAP[s + b] = s + b;
  MAP[s + 'ToeBase'] = s + 'Toes';
  Object.assign(DIR, {
    [s + 'Shoulder']: s + 'Arm', [s + 'Arm']: s + 'ForeArm', [s + 'ForeArm']: s + 'Hand', [s + 'Hand']: s + 'HandIndex1',
    [s + 'UpLeg']: s + 'Leg', [s + 'Leg']: s + 'Foot', [s + 'Foot']: s + 'ToeBase',
    [s + 'HandThumb1']: s + 'HandThumb2', [s + 'HandIndex1']: s + 'HandIndex2', [s + 'HandIndex2']: s + 'HandIndex3',
  });
}

/** Bake the Kenney FBX into a clean rig: metres, soles at 0, deform bones only, identity bind. */
function bakeRig(fbx, height) {
  fbx.updateMatrixWorld(true);
  let km = null;
  fbx.traverse((o) => { if (o.isSkinnedMesh && !km) km = o; });
  const oldBones = km.skeleton.bones;
  const g = km.geometry;
  const n = g.attributes.position.count;
  // Skinned rest positions and normals in world space.
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  const boneM = oldBones.map((b, i) => new THREE.Matrix4().multiplyMatrices(b.matrixWorld, km.skeleton.boneInverses[i]));
  const M = new THREE.Matrix4(), tmp = new THREE.Matrix4(), v = new THREE.Vector3(), nm = new THREE.Matrix3();
  const si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  for (let i = 0; i < n; i++) {
    M.elements.fill(0);
    for (let k = 0; k < 4; k++) {
      const w = sw.getComponent(i, k);
      if (!w) continue;
      const e = boneM[si.getComponent(i, k)].elements;
      for (let j = 0; j < 16; j++) M.elements[j] += e[j] * w;
    }
    tmp.multiplyMatrices(km.matrixWorld, km.bindMatrixInverse).multiply(M).multiply(km.bindMatrix);
    v.fromBufferAttribute(g.attributes.position, i).applyMatrix4(tmp).toArray(pos, i * 3);
    nm.getNormalMatrix(tmp);
    v.fromBufferAttribute(g.attributes.normal, i).applyMatrix3(nm).normalize().toArray(nor, i * 3);
  }
  let minY = Infinity, maxY = -Infinity;
  for (let i = 1; i < pos.length; i += 3) { minY = Math.min(minY, pos[i]); maxY = Math.max(maxY, pos[i]); }
  const s = height / (maxY - minY);
  const hips = wp(oldBones.find((b) => b.name === 'Hips'));
  const off = new THREE.Vector3(hips.x, minY, hips.z);
  for (let i = 0; i < n; i++) v.fromArray(pos, i * 3).sub(off).multiplyScalar(s).toArray(pos, i * 3);

  // New bones: same world rotation, positions scaled; parent = nearest kept ancestor.
  const root = new THREE.Group();
  root.name = 'people';
  const kept = oldBones.filter((b) => KEEP(b.name));
  const newOf = new Map();
  const worldOf = new Map();
  const keptAncestor = (b) => { let p = b.parent; while (p && !(p.isBone && newOf.has(p))) p = p.parent; return p ? newOf.get(p) : null; };
  const _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
  for (const b of kept) {
    const nb = new THREE.Bone();
    nb.name = b.name;
    b.matrixWorld.decompose(_p, _q, _s);
    const W = new THREE.Matrix4().compose(_p.clone().sub(off).multiplyScalar(s), _q.clone(), new THREE.Vector3(1, 1, 1));
    worldOf.set(nb, W);
    const parent = keptAncestor(b);
    const PW = parent ? worldOf.get(parent) : new THREE.Matrix4();
    PW.clone().invert().multiply(W).decompose(nb.position, nb.quaternion, nb.scale);
    (parent || root).add(nb);
    newOf.set(b, nb);
  }
  // Skin indices → new bones (weights of dropped bones go to their kept ancestor).
  const newBones = kept.map((b) => newOf.get(b));
  const remap = oldBones.map((b) => {
    let o = b;
    while (o && !newOf.has(o)) o = o.parent;
    return o ? newBones.indexOf(newOf.get(o)) : 0;
  });
  const idx = new Uint16Array(n * 4), wts = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) { idx[i * 4 + k] = remap[si.getComponent(i, k)]; wts[i * 4 + k] = sw.getComponent(i, k); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', g.attributes.uv.clone());
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(idx, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(wts, 4));
  if (g.index) geo.setIndex(g.index.clone());
  const mat = new THREE.MeshStandardMaterial({ name: 'body', roughness: 0.85, metalness: 0 });
  const mesh = new THREE.SkinnedMesh(geo, mat);
  mesh.name = 'body';
  root.add(mesh);
  root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(newBones));
  return { root, mesh, bones: newBones };
}

/** Retargeter from the Mixamo rig (src) onto the baked rig (tgt). idleClip = a standing clip of src. */
function makeRetargeter(src, tgt, idleClip) {
  const S = (n) => src.getObjectByName('mixamorig' + n);
  const T = (n) => tgt.getObjectByName(MAP[n]);
  src.updateMatrixWorld(true);
  tgt.updateMatrixWorld(true);
  // The clips' floor: the source's rest pose is not standing on the clips' ground, so measure the
  // ankles in a standing frame of the idle clip (the hips' HEIGHT is copied relative to it).
  const saved = [];
  src.traverse((o) => { if (o.isBone) saved.push([o, o.position.clone(), o.quaternion.clone()]); });
  const m0 = new THREE.AnimationMixer(src);
  m0.clipAction(idleClip).play();
  m0.setTime(0);
  src.updateMatrixWorld(true);
  const srcFloor = Math.min(wp(S('LeftFoot')).y, wp(S('RightFoot')).y);
  m0.stopAllAction(); m0.uncacheRoot(src);
  for (const [o, p, q] of saved) { o.position.copy(p); o.quaternion.copy(q); }
  src.updateMatrixWorld(true);
  const depth = (o) => { let d = 0; while (o.parent) { d++; o = o.parent; } return d; };
  const order = Object.keys(MAP).filter((n) => S(n) && T(n)).sort((a, b) => depth(S(a)) - depth(S(b)));
  // 1. bend the Mixamo rest pose into the target's T-pose (bone directions only)
  for (const n of order) {
    const c = DIR[n];
    if (!c || !S(c) || !T(c)) continue;
    const sb = S(n);
    const sd = wp(S(c)).sub(wp(sb)).normalize();
    const td = wp(T(c)).sub(wp(T(n))).normalize();
    const nw = new THREE.Quaternion().setFromUnitVectors(sd, td).multiply(wq(sb));
    sb.quaternion.copy(wq(sb.parent).invert().multiply(nw));
    src.updateMatrixWorld(true);
  }
  const srcRest = {}, tgtRest = {}, restLocal = {};
  for (const n of order) { srcRest[n] = wq(S(n)); tgtRest[n] = wq(T(n)); }
  tgt.traverse((o) => { if (o.isBone) restLocal[o.name] = o.quaternion.clone(); });
  const srcHip0 = wp(S('Hips')), tgtHip0 = T('Hips').position.clone();
  const legS = wp(S('Hips')).y - wp(S('LeftFoot')).y, legT = wp(T('Hips')).y - wp(T('LeftFoot')).y;
  const hipRatio = legT / legS;
  const toTargetParent = wq(T('Hips').parent).invert();
  const tgtFoot = Math.min(wp(T('LeftFoot')).y, wp(T('RightFoot')).y);

  function frame() {
    src.updateMatrixWorld(true);
    for (const n of order) {
      const tb = T(n);
      const tw = wq(S(n)).multiply(srcRest[n].clone().invert()).multiply(tgtRest[n]);
      tb.quaternion.copy(wq(tb.parent).invert().multiply(tw));
      tb.updateMatrixWorld(true);
    }
    const sh = wp(S('Hips'));
    const d = sh.clone().sub(srcHip0).multiplyScalar(hipRatio).applyQuaternion(toTargetParent);
    T('Hips').position.copy(tgtHip0).add(d);
    // Height: ankles-to-hips of the clip, scaled by leg length, above the target's ankles
    // (the baked root is the identity, so world y = local y).
    T('Hips').position.y = tgtFoot + (sh.y - srcFloor) * hipRatio;
    tgt.updateMatrixWorld(true);
  }
  function reset() {
    tgt.traverse((o) => { if (o.isBone) o.quaternion.copy(restLocal[o.name]); });
    T('Hips').position.copy(tgtHip0);
    tgt.updateMatrixWorld(true);
  }
  /** Point bone `name` (target) along world direction dir (swing from where it points now). */
  function aim(name, child, dir) {
    const b = tgt.getObjectByName(name), c = tgt.getObjectByName(child);
    const now = wp(c).sub(wp(b)).normalize();
    const nw = new THREE.Quaternion().setFromUnitVectors(now, dir.clone().normalize()).multiply(wq(b));
    b.quaternion.copy(wq(b.parent).invert().multiply(nw));
    tgt.updateMatrixWorld(true);
  }
  /** Turn the hand about its own length so the palm faces up (thumb points outward). */
  function palmUp(side) {
    const h = tgt.getObjectByName(side + 'Hand');
    const along = wp(tgt.getObjectByName(side + 'HandIndex1')).sub(wp(h)).normalize();
    const thumb = wp(tgt.getObjectByName(side + 'HandThumb1')).sub(wp(h));
    thumb.sub(along.clone().multiplyScalar(thumb.dot(along))).normalize();
    const want = new THREE.Vector3(side === 'Left' ? 1 : -1, 0, 0);
    want.sub(along.clone().multiplyScalar(want.dot(along))).normalize();
    const twist = new THREE.Quaternion().setFromUnitVectors(thumb, want);
    h.quaternion.copy(wq(h.parent).invert().multiply(twist.multiply(wq(h))));
    tgt.updateMatrixWorld(true);
  }

  function bake(clip, name, fps, maxSeconds, posed) {
    const mixer = new THREE.AnimationMixer(src);
    mixer.clipAction(clip).play();
    const dur = Math.min(clip.duration, maxSeconds || Infinity);
    const nF = Math.max(2, Math.round(dur * fps) + 1);
    const times = new Float32Array(nF);
    const bones = order.map((n) => MAP[n]);
    const q = {};
    for (const b of bones) q[b] = new Float32Array(nF * 4);
    const p = new Float32Array(nF * 3);
    for (let i = 0; i < nF; i++) {
      const t = (i / (nF - 1)) * dur;
      times[i] = t;
      mixer.setTime(t);
      frame();
      if (posed) {
        // Fixed bone directions on top of the clip (written for the left side, mirrored right).
        for (const [bone, child, d] of posed.aim) {
          const sided = /Arm|Hand|Leg|Shoulder|Foot/.test(bone);
          for (const side of sided ? ['Left', 'Right'] : ['']) {
            const m = side === 'Right' ? -1 : 1;
            aim(side + bone, side + child, new THREE.Vector3(d[0] * m, d[1], d[2]));
          }
        }
        if (posed.palmUp) { palmUp('Left'); palmUp('Right'); }
        if (posed.hipsDrop) { tgt.getObjectByName('Hips').position.y -= posed.hipsDrop; tgt.updateMatrixWorld(true); }
      }
      for (const b of bones) tgt.getObjectByName(b).quaternion.toArray(q[b], i * 4);
      tgt.getObjectByName('Hips').position.toArray(p, i * 3);
    }
    mixer.stopAllAction();
    mixer.uncacheRoot(src);
    reset();
    const tracks = bones.map((b) => new THREE.QuaternionKeyframeTrack(`${b}.quaternion`, times, q[b]));
    tracks.push(new THREE.VectorKeyframeTrack('Hips.position', times, p));
    return new THREE.AnimationClip(name, dur, tracks);
  }
  return { bake, reset };
}

/** Body region of every texel (see pack-people.js) from the dominant bone of each triangle. */
function regionMap(mesh, size) {
  const g = mesh.geometry, uv = g.attributes.uv, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  const names = mesh.skeleton.bones.map((b) => b.name);
  const dom = (i) => { let b = 0, w = -1; for (let k = 0; k < 4; k++) { const x = sw.getComponent(i, k); if (x > w) { w = x; b = si.getComponent(i, k); } } return names[b]; };
  const cls = (n, u, v) => {
    if (/Head|Neck/.test(n)) return 1;
    if (/Hand/.test(n)) return 6;
    if (/ForeArm/.test(n)) return 5;
    if (/Arm|Shoulder/.test(n)) return 4;
    if (/Foot|Toes/.test(n)) return 9;
    if (/UpLeg/.test(n)) return 7;
    if (/Leg/.test(n)) return 8;
    if (u > 0.6 && v > 0.74) return 7; // hips part of the trousers island
    return 3;
  };
  // Exact (not anti-aliased) triangle fill in texel space: a texel belongs to a triangle when
  // its centre is inside it (canvas paths blend edges, which would invent wrong region ids).
  const reg = new Uint8Array(size * size);
  const index = g.index ? g.index.array : [...Array(uv.count).keys()];
  const P = (v) => [uv.getX(v) * size, (1 - uv.getY(v)) * size];
  for (let t = 0; t < index.length; t += 3) {
    const vs = [index[t], index[t + 1], index[t + 2]];
    const [a, b2, c2] = vs.map(P);
    const cu = (a[0] + b2[0] + c2[0]) / 3 / size, cv = (a[1] + b2[1] + c2[1]) / 3 / size;
    // Each corner's bone weights; a texel takes the bone with the most interpolated weight, so
    // borders (sleeves, collars, trouser hems) are smooth lines, not the triangles' zig-zag.
    const wOf = vs.map((v) => { const m = new Map(); for (let k = 0; k < 4; k++) { const w = sw.getComponent(v, k); if (w > 0) m.set(si.getComponent(v, k), (m.get(si.getComponent(v, k)) || 0) + w); } return m; });
    const bonesHere = [...new Set(wOf.flatMap((m) => [...m.keys()]))];
    const area = (b2[0] - a[0]) * (c2[1] - a[1]) - (c2[0] - a[0]) * (b2[1] - a[1]);
    if (Math.abs(area) < 1e-9) continue;
    const x0 = Math.max(0, Math.floor(Math.min(a[0], b2[0], c2[0]))), x1 = Math.min(size - 1, Math.ceil(Math.max(a[0], b2[0], c2[0])));
    const y0 = Math.max(0, Math.floor(Math.min(a[1], b2[1], c2[1]))), y1 = Math.min(size - 1, Math.ceil(Math.max(a[1], b2[1], c2[1])));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      const w0 = ((b2[0] - px) * (c2[1] - py) - (c2[0] - px) * (b2[1] - py)) / area;
      const w1 = ((c2[0] - px) * (a[1] - py) - (a[0] - px) * (c2[1] - py)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 < -0.02 || w1 < -0.02 || w2 < -0.02) continue;
      let best = bonesHere[0], bw = -1;
      for (const bn of bonesHere) {
        const w = w0 * (wOf[0].get(bn) || 0) + w1 * (wOf[1].get(bn) || 0) + w2 * (wOf[2].get(bn) || 0);
        if (w > bw) { bw = w; best = bn; }
      }
      reg[y * size + x] = cls(names[best], cu, cv);
    }
  }
  // Grow regions into the empty gaps (no seams when the texture is filtered).
  for (let pass = 0; pass < 6; pass++) {
    const copy = reg.slice();
    for (let y = 0; y < size; y++) for (let xx = 0; xx < size; xx++) {
      const i = y * size + xx;
      if (copy[i]) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const X = xx + dx, Y = y + dy;
        if (X >= 0 && Y >= 0 && X < size && Y < size && copy[Y * size + X]) { reg[i] = copy[Y * size + X]; break; }
      }
    }
  }
  return reg;
}

async function pixelsOf(url, size) {
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0, size, size);
  return x.getImageData(0, 0, size, size).data;
}

/** Grey shading per region (mean ≈ 0.78) + hair split from face skin in the head region. */
function greyOf(px, reg, size) {
  const n = size * size;
  const lum = new Float32Array(n), r2 = reg.slice();
  for (let i = 0; i < n; i++) {
    const R = px[i * 4] / 255, G = px[i * 4 + 1] / 255, B = px[i * 4 + 2] / 255;
    lum[i] = 0.3 * R + 0.59 * G + 0.11 * B;
    if (reg[i] === 1) {
      // Head: skin is light and warm, hair / beard / brows are dark.
      const warm = R - B;
      if (lum[i] < 0.36 || (lum[i] < 0.5 && warm < 0.14)) r2[i] = 2;
    }
  }
  const sum = new Float64Array(16), cnt = new Float64Array(16);
  for (let i = 0; i < n; i++) { sum[r2[i]] += lum[i]; cnt[r2[i]]++; }
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const mean = sum[r2[i]] / Math.max(1, cnt[r2[i]]);
    const k = r2[i] === 0 ? 0.5 : Math.min(1, (lum[i] / Math.max(0.05, mean)) * 0.78);
    out[i] = Math.round(k * 255);
  }
  return { grey: out, regions: r2 };
}

export async function pack(recipe, wantShot) {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync('/repo/assets/shoumik/shoumik.glb');
  const src = gltf.scene, srcClips = gltf.animations;
  const fbx = await new FBXLoader().loadAsync('/kenney/Model/characterMedium.fbx');
  const rig = bakeRig(fbx, recipe.height);
  const rt = makeRetargeter(src, rig.root, srcClips.find((c) => c.name === recipe.clips.idle.from));

  const clips = [];
  const byName = (n) => { const c = srcClips.find((x) => x.name === n); if (!c) throw new Error('missing source clip ' + n); return c; };
  for (const [name, c] of Object.entries(recipe.clips)) clips.push(rt.bake(byName(c.from), name, recipe.fps, c.maxSeconds));
  for (const [name, c] of Object.entries(recipe.posed || {})) {
    clips.push(rt.bake(byName(recipe.clips[c.base].from), name, recipe.fps, c.maxSeconds, c));
  }

  // Textures: man (left half) and woman (right half): R = grey shading, G = region id × 16.
  const SIZE = 256;
  const reg = regionMap(rig.mesh, SIZE);
  const male = greyOf(await pixelsOf('/kenney/Skins/humanMaleA.png', SIZE), reg, SIZE);
  const female = greyOf(await pixelsOf('/kenney/Skins/humanFemaleA.png', SIZE), reg, SIZE);
  const c = document.createElement('canvas');
  c.width = SIZE * 2; c.height = SIZE;
  const x = c.getContext('2d');
  const img = x.createImageData(SIZE * 2, SIZE);
  for (let y = 0; y < SIZE; y++) for (let xx = 0; xx < SIZE; xx++) {
    const i = y * SIZE + xx;
    for (const [half, t] of [[0, male], [1, female]]) {
      const o = (y * SIZE * 2 + xx + half * SIZE) * 4;
      img.data[o] = t.grey[i]; img.data[o + 1] = t.regions[i] * 16; img.data[o + 2] = 0; img.data[o + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
  await save('skins.png', await new Promise((r) => c.toBlob(r)));

  // GLB.
  rig.root.userData = { kit: 'people', height: recipe.height };
  const glb = await new GLTFExporter().parseAsync(rig.root, { binary: true, animations: clips });
  await save('people.glb', new Blob([glb]));

  if (wantShot) {
    // Contact sheet: each clip at 40 % of its length, grey shading only.
    const W = 1600, H = 600;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(W, H);
    document.body.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x8a99a8);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x445544, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 2); sun.position.set(2, 5, 4); scene.add(sun);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.repeat.set(0.5, 1);
    rig.mesh.material = new THREE.MeshLambertMaterial({ map: tex });
    const cols = 8, rows = Math.ceil(clips.length / cols);
    const cam = new THREE.PerspectiveCamera(30, (W / cols) / (H / rows), 0.1, 50);
    cam.position.set(2.2, 1.4, 6); cam.lookAt(0, 0.8, 0);
    scene.add(rig.root);
    renderer.setScissorTest(true);
    clips.forEach((clip, i) => {
      const m = new THREE.AnimationMixer(rig.root);
      m.clipAction(clip).play();
      m.setTime(clip.duration * 0.4);
      rig.root.updateMatrixWorld(true);
      const vx = (i % cols) * (W / cols), vy = H - (Math.floor(i / cols) + 1) * (H / rows);
      renderer.setViewport(vx, vy, W / cols, H / rows); renderer.setScissor(vx, vy, W / cols, H / rows);
      renderer.render(scene, cam);
      m.stopAllAction(); m.uncacheRoot(rig.root); rt.reset();
    });
    await save('shot.png', await new Promise((r) => renderer.domElement.toBlob(r)));
  }
  return `people.glb: ${rig.bones.length} bones, ${rig.mesh.geometry.attributes.position.count} vertices, ${clips.length} clips (${clips.map((c) => c.name).join(', ')}); skins.png ${SIZE * 2}×${SIZE}`;
}
