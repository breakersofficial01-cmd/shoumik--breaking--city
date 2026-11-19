// Build shoumik.glb from: the rig in standing.fbx, the reduced mesh (low_*.bin), the baked
// texture, and the clip JSON files. Then load the GLB back and render a preview sheet.
//   node assemble.js <three dir> <fbx dir> <work dir> <texture file> <out glb> <clipmap.json>
// clipmap.json: [{ "file": "Walk", "name": "walk", "inPlace": true, "loop": true }, ...]
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const [threeDir, fbxDir, work, texFile, outGlb, clipMapFile] = process.argv.slice(2);
const MIME = { '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png' };

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><body style="margin:0"></body>'); return; }
  if (req.method === 'POST' && url.startsWith('/save/')) {
    const file = path.join(work, url.slice(6));
    const out = fs.createWriteStream(file);
    req.pipe(out);
    out.on('finish', () => { res.writeHead(200); res.end('ok'); });
    return;
  }
  let file;
  if (url.startsWith('/three/')) file = path.join(threeDir, url.slice(7));
  else if (url.startsWith('/fbx/')) file = path.join(fbxDir, url.slice(5));
  else if (url.startsWith('/work/')) file = path.join(work, url.slice(6));
  else if (url === '/crossarms.js') file = path.join(__dirname, 'crossarms.js');
  if (!file || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

(async () => {
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 600, height: 600 } });
  page.on('console', (m) => { if (!m.text().includes('FBXLoader')) console.log('[page]', m.text()); });
  page.on('pageerror', (e) => console.log('[page error]', e.message));
  await page.goto(`http://localhost:${port}/`);
  await page.addScriptTag({ type: 'importmap', content: JSON.stringify({ imports: { three: '/three/build/three.module.js', 'three/addons/': '/three/examples/jsm/' } }) });
  const clipMap = JSON.parse(fs.readFileSync(clipMapFile, 'utf8'));

  const report = await page.evaluate(async ({ clipMap, texName, outName }) => {
    const THREE = await import('three');
    const { FBXLoader } = await import('three/addons/loaders/FBXLoader.js');
    const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
    const bin = async (n, T) => new T(await (await fetch('/work/' + n)).arrayBuffer());

    const root = await new FBXLoader().loadAsync('/fbx/standing.fbx');
    let orig = null;
    root.traverse((o) => { if (!orig && o.isSkinnedMesh) orig = o; });

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(await bin('low_pos.bin', Float32Array), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(await bin('low_normal.bin', Float32Array), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(await bin('low_uv.bin', Float32Array), 2));
    geo.setAttribute('skinIndex', new THREE.BufferAttribute(await bin('low_skin_i.bin', Uint16Array), 4));
    geo.setAttribute('skinWeight', new THREE.BufferAttribute(await bin('low_skin_w.bin', Float32Array), 4));
    geo.setIndex(new THREE.BufferAttribute(await bin('low_index.bin', Uint32Array), 1));

    const tex = await new THREE.TextureLoader().loadAsync('/work/' + texName);
    tex.flipY = false; // our UVs are already top-down (glTF convention)
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.userData.mimeType = 'image/jpeg';
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0, name: 'Shoumik' });

    const low = new THREE.SkinnedMesh(geo, mat);
    low.name = 'Shoumik';
    orig.parent.add(low);
    low.bind(orig.skeleton, orig.bindMatrix);
    orig.parent.remove(orig);
    root.traverse((o) => { if (o.isMesh && o !== low) o.visible = false; });
    root.name = 'ShoumikRig';

    const clips = [];
    for (const c of clipMap) {
      if (c.crossed) continue;
      const json = await (await fetch(`/work/clips/${c.file}.json`)).json();
      const clip = THREE.AnimationClip.parse(json);
      clip.name = c.name;
      if (c.inPlace) {
        // Keep the hips' height, remove forward/sideways travel (the game moves Shoumik itself).
        const t = clip.tracks.find((tr) => tr.name.endsWith('Hips.position'));
        const v = t.values;
        const x0 = v[0], z0 = v[2];
        for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; }
      }
      clip.optimize();
      clips.push(clip);
    }

    // Signature pose: arms crossed, built on top of a breathing idle (see crossarms.js).
    const { makeCrossedClip } = await import('/crossarms.js');
    for (const c of clipMap.filter((c) => c.crossed)) {
      const base = clips.find((k) => k.name === c.crossed.base);
      const crossed = makeCrossedClip(THREE, root, base, { ...c.crossed, name: c.name });
      crossed.optimize();
      clips.push(crossed);
    }

    const glb = await new GLTFExporter().parseAsync(root, { binary: true, animations: clips, onlyVisible: true });
    await fetch('/save/' + outName, { method: 'POST', body: glb });
    return { bytes: glb.byteLength, clips: clips.map((c) => `${c.name} ${c.duration.toFixed(1)}s`), verts: geo.attributes.position.count, tris: geo.index.count / 3 };
  }, { clipMap, texName: path.basename(texFile), outName: path.basename(outGlb) });
  console.log(JSON.stringify(report));

  // ---------- reload the GLB and render a preview sheet ----------
  const views = clipMap.filter((c) => c.preview).map((c) => [c.name, c.preview]);
  const shots = await page.evaluate(async ({ outName, views }) => {
    const THREE = await import('three');
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const gltf = await new GLTFLoader().loadAsync('/work/' + outName);
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(600, 600);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    document.body.innerHTML = '';
    document.body.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x6e7183);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x666655, 1.8));
    const sun = new THREE.DirectionalLight(0xffeedd, 2.2); sun.position.set(2, 4, 4); scene.add(sun);
    scene.add(gltf.scene);
    const mixer = new THREE.AnimationMixer(gltf.scene);
    const cam = new THREE.PerspectiveCamera(28, 1, 0.05, 50);
    const out = [];
    const shoot = (angle, dist, h, lookY) => {
      cam.position.set(Math.sin(angle) * dist, h, Math.cos(angle) * dist);
      cam.lookAt(0, lookY, 0);
      renderer.render(scene, cam);
      out.push(renderer.domElement.toDataURL('image/jpeg', 0.9));
    };
    // bind pose: front, side, back, face close-up
    gltf.scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const cy = (box.min.y + box.max.y) / 2, top = box.max.y;
    shoot(0, 6.2, cy, cy); shoot(Math.PI / 2, 6.2, cy, cy); shoot(Math.PI, 6.2, cy, cy);
    shoot(0.3, 1.2, top - 0.15, top - 0.15);
    for (const [name, frac] of views) {
      const clip = gltf.animations.find((a) => a.name === name);
      mixer.stopAllAction();
      const act = mixer.clipAction(clip); act.reset().play();
      mixer.setTime(clip.duration * frac);
      gltf.scene.updateMatrixWorld(true);
      shoot(0.6, 6.4, 0.95, 0.9);
    }
    return { out, box: [box.min.toArray(), box.max.toArray()] };
  }, { outName: path.basename(outGlb), views });
  console.log('bbox', JSON.stringify(shots.box));
  shots.out.forEach((s, i) => fs.writeFileSync(path.join(work, `prev_${String(i).padStart(2, '0')}.jpg`), Buffer.from(s.split(',')[1], 'base64')));
  await browser.close();
  server.close();
})();
