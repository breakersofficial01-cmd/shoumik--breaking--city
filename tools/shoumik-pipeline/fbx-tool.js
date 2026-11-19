// FBX helper running three.js (r170) in headless Chromium.
//   node fbx-tool.js <three dir> <fbx dir> <out dir> <mode> [files...]
// modes:
//   render   – render each FBX (frame 0 of its clip, or bind pose) front + side, with the colour
//              texture from <out dir>/base.jpg, to <out dir>/<name>.png
//   dump     – write the first skinned mesh of the first file as raw arrays:
//              <out>/hi_pos.f32 hi_uv.f32 hi_skinIndex.u16 hi_skinWeight.f32 hi_index.u32 + hi_skeleton.json
//   clips    – write every file's animation clip as three.js JSON to <out>/clips/<name>.json
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const [threeDir, fbxDir, outDir, mode, ...only] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png' };

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><body style="margin:0"></body>'); return; }
  if (req.method === 'POST' && url.startsWith('/save/')) {
    const file = path.join(outDir, url.slice(6));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const out = fs.createWriteStream(file);
    req.pipe(out);
    out.on('finish', () => { res.writeHead(200); res.end('ok'); });
    return;
  }
  let file;
  if (url.startsWith('/three/')) file = path.join(threeDir, url.slice(7));
  else if (url.startsWith('/fbx/')) file = path.join(fbxDir, url.slice(5));
  else if (url.startsWith('/out/')) file = path.join(outDir, url.slice(5));
  if (!file || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

(async () => {
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--js-flags=--max-old-space-size=8192'] });
  const page = await browser.newPage({ viewport: { width: 800, height: 800 } });
  page.on('console', (m) => console.log('[page]', m.text()));
  page.on('pageerror', (e) => console.log('[page error]', e.message));
  await page.goto(`http://localhost:${port}/`);
  await page.addScriptTag({ type: 'importmap', content: JSON.stringify({ imports: { three: '/three/build/three.module.js', 'three/addons/': '/three/examples/jsm/' } }) });
  let files = fs.readdirSync(fbxDir).filter((f) => f.toLowerCase().endsWith('.fbx')).sort();
  if (only.length) files = files.filter((f) => only.includes(f));

  for (const f of (mode === 'dump' ? files.slice(0, 1) : files)) {
    const r = await page.evaluate(async ({ name, mode }) => {
      const THREE = await import('three');
      const { FBXLoader } = await import('three/addons/loaders/FBXLoader.js');
      const obj = await new FBXLoader().loadAsync('/fbx/' + encodeURIComponent(name));
      const save = (file, data) => fetch('/save/' + file, { method: 'POST', body: data });
      const base = name.replace(/\.fbx$/i, '');

      if (mode === 'clips') {
        if (!obj.animations.length) return `${name}: no clip`;
        const clip = obj.animations[0];
        clip.name = base;
        await save(`clips/${base}.json`, JSON.stringify(THREE.AnimationClip.toJSON(clip)));
        return `${name}: ${clip.duration.toFixed(2)} s, ${clip.tracks.length} tracks`;
      }

      if (mode === 'dump') {
        let mesh = null;
        obj.traverse((o) => { if (!mesh && o.isSkinnedMesh) mesh = o; });
        if (!mesh) return 'no skinned mesh';
        obj.updateMatrixWorld(true);
        const g = mesh.geometry;
        const a = g.attributes;
        await save('hi_pos.f32', a.position.array);
        await save('hi_uv.f32', a.uv.array);
        await save('hi_skinIndex.u16', new Uint16Array(a.skinIndex.array));
        await save('hi_skinWeight.f32', new Float32Array(a.skinWeight.array));
        if (g.index) await save('hi_index.u32', new Uint32Array(g.index.array));
        const sk = mesh.skeleton;
        const bones = sk.bones.map((b) => ({
          name: b.name,
          parent: sk.bones.indexOf(b.parent),
          position: b.position.toArray(), quaternion: b.quaternion.toArray(), scale: b.scale.toArray(),
        }));
        // Anything above the root bone (FBX adds a group with a unit-scale transform).
        const rootChain = [];
        for (let p = sk.bones[0].parent; p; p = p.parent) rootChain.push({ name: p.name, type: p.type, position: p.position.toArray(), quaternion: p.quaternion.toArray(), scale: p.scale.toArray() });
        await save('hi_skeleton.json', JSON.stringify({
          bones, boneInverses: sk.boneInverses.map((m) => m.toArray()),
          bindMatrix: mesh.bindMatrix.toArray(), meshMatrixWorld: mesh.matrixWorld.toArray(),
          meshParent: mesh.parent?.name, rootChain, verts: a.position.count, indexed: !!g.index,
        }));
        return `dumped ${a.position.count} verts, ${sk.bones.length} bones`;
      }

      // render
      const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      renderer.setSize(800, 800);
      document.body.innerHTML = '';
      document.body.appendChild(renderer.domElement);
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x777788);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x555555, 2.2));
      const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(2, 4, 3); scene.add(sun);
      const tex = await new THREE.TextureLoader().loadAsync('/out/base.jpg');
      tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = true;
      obj.traverse((o) => { if (o.isMesh) o.material = new THREE.MeshLambertMaterial({ map: tex }); });
      if (obj.animations.length) {
        const mixer = new THREE.AnimationMixer(obj);
        mixer.clipAction(obj.animations[0]).play();
        mixer.update(obj.animations[0].duration * 0.35);
      }
      scene.add(obj);
      obj.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(obj);
      const c = box.getCenter(new THREE.Vector3());
      const h = box.getSize(new THREE.Vector3()).y;
      const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
      const shots = [];
      for (const [dx, dz] of [[0, 1], [1, 0.2]]) {
        cam.position.set(c.x + dx * h * 2.2, c.y + h * 0.05, c.z + dz * h * 2.2);
        cam.lookAt(c);
        renderer.render(scene, cam);
        shots.push(renderer.domElement.toDataURL('image/png'));
      }
      renderer.dispose();
      return { shots };
    }, { name: f, mode });
    if (r && r.shots) {
      r.shots.forEach((s, i) => fs.writeFileSync(path.join(outDir, `${f.replace(/\.fbx$/i, '')}_${i}.png`), Buffer.from(s.split(',')[1], 'base64')));
      console.log(f, 'rendered');
    } else console.log(r);
  }
  await browser.close();
  server.close();
})();
