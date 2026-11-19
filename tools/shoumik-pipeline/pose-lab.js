// Pose lab: build an "arms crossed" idle on top of a clip by aiming the arm bones at given
// directions (character space: +x = his left, +y up, +z forward), then render it.
//   node pose-lab.js <three dir> <glb> <out prefix> '<json params>'
// params: { base: 'idle', t: 0.3, L: { upper:[x,y,z], fore:[x,y,z] }, R: {...}, handL:[x,y,z], handR:[x,y,z] }
// The same math lives in crossArms() below and is reused by assemble-crossed.js.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const [threeDir, glbPath, outPrefix, paramJson] = process.argv.slice(2);
const params = JSON.parse(paramJson);
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><body style="margin:0"></body>'); return; }
  let file = null;
  if (url.startsWith('/three/')) file = path.join(threeDir, url.slice(7));
  else if (url === '/model.glb') file = glbPath;
  else if (url === '/crossarms.js') file = path.join(__dirname, 'crossarms.js');
  if (!file || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

(async () => {
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 500, height: 500 } });
  page.on('pageerror', (e) => console.log('[page error]', e.message));
  page.on('console', (m) => console.log('[page]', m.text()));
  await page.goto(`http://localhost:${server.address().port}/`);
  await page.addScriptTag({ type: 'importmap', content: JSON.stringify({ imports: { three: '/three/build/three.module.js', 'three/addons/': '/three/examples/jsm/' } }) });
  const shots = await page.evaluate(async (params) => {
    const THREE = await import('three');
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const { makeCrossedClip } = await import('/crossarms.js');
    const gltf = await new GLTFLoader().loadAsync('/model.glb');
    const base = gltf.animations.find((a) => a.name === params.base);
    const clip = makeCrossedClip(THREE, gltf.scene, base, params);
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(500, 500);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    document.body.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x6e7183);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x666655, 1.8));
    const sun = new THREE.DirectionalLight(0xffeedd, 2.2); sun.position.set(2, 4, 4); scene.add(sun);
    scene.add(gltf.scene);
    const mixer = new THREE.AnimationMixer(gltf.scene);
    mixer.clipAction(clip).play();
    mixer.setTime(clip.duration * (params.t ?? 0.3));
    gltf.scene.updateMatrixWorld(true);
    const cam = new THREE.PerspectiveCamera(26, 1, 0.05, 50);
    const out = [];
    for (const [a, d, h, ly] of [[0, 3.4, 1.35, 1.2], [0.75, 3.4, 1.35, 1.2], [Math.PI / 2, 3.4, 1.35, 1.2], [0.35, 1.6, 1.4, 1.3]]) {
      cam.position.set(Math.sin(a) * d, h, Math.cos(a) * d);
      cam.lookAt(0, ly, 0);
      renderer.render(scene, cam);
      out.push(renderer.domElement.toDataURL('image/jpeg', 0.9));
    }
    return out;
  }, params);
  shots.forEach((s, i) => fs.writeFileSync(`${outPrefix}_${i}.jpg`, Buffer.from(s.split(',')[1], 'base64')));
  await browser.close();
  server.close();
})();
