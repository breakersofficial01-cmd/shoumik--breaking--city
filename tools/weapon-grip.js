// Weapon grip check for Claude sessions (not part of the game).
// Renders the real Shoumik model (assets/shoumik/shoumik.glb) in a pose with a weapon GLB on his
// right-hand bone, using the grip numbers from data/weapons.json, so grips can be tuned by eye.
//
//   node tools/weapon-grip.js --three <dir of three@0.170.0> --out <folder> [--only pistol1,rifle1] [--clip pistolAim]

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const threeDir = arg('three', null);
const outDir = arg('out', path.join(ROOT, 'shots'));
const only = arg('only', '').split(',').filter(Boolean);
const clipName = arg('clip', 'pistolAim');
const MIME = { '.js': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary' };

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><body style="margin:0"></body>'); return; }
  const file = url.startsWith('/three/') ? path.join(threeDir, url.slice(7)) : path.join(ROOT, url);
  if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 520, height: 520 } });
  page.on('pageerror', (e) => console.log('[page error]', e.message));
  await page.goto(`http://localhost:${server.address().port}/`);
  await page.addScriptTag({ type: 'importmap', content: JSON.stringify({ imports: { three: '/three/build/three.module.js', 'three/addons/': '/three/examples/jsm/' } }) });
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/weapons.json'), 'utf8'));
  const assets = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/assets.json'), 'utf8')).assets;
  for (const w of cfg.weapons) {
    if (only.length && !only.includes(w.id)) continue;
    if (!w.asset) continue; // fists and the code-built bat / machete / molotov have no GLB
    const grip = cfg.grips[w.grip];
    const url = '/' + assets[w.asset].url;
    const clip = w.grip === 'rifle' ? arg('rifleClip', clipName) : clipName;
    const png = await page.evaluate(async ({ url, grip, clip }) => {
      const THREE = await import('three');
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
      const loader = new GLTFLoader();
      const man = await loader.loadAsync('/assets/shoumik/shoumik.glb');
      const gun = (await loader.loadAsync(url)).scene;
      const scene = new THREE.Scene(); scene.background = new THREE.Color('#9aa4b0');
      scene.add(new THREE.HemisphereLight(0xffffff, 0x555555, 2.4));
      const sun = new THREE.DirectionalLight(0xffffff, 2); sun.position.set(2, 4, 3); scene.add(sun);
      scene.add(man.scene);
      const a = man.animations.find((c) => c.name === clip) || man.animations[0];
      const mixer = new THREE.AnimationMixer(man.scene); mixer.clipAction(a).play(); mixer.setTime(a.duration * 0.5);
      let hand = null; man.scene.traverse((o) => { if (o.isBone && /RightHand$/.test(o.name)) hand = o; });
      const holder = new THREE.Group();
      man.scene.updateMatrixWorld(true);
      const k = hand.getWorldScale(new THREE.Vector3()).x;   // bone units -> metres
      holder.position.fromArray(grip.position).multiplyScalar(1 / k);
      holder.rotation.set(...grip.rotation.map((d) => d * Math.PI / 180));
      holder.scale.setScalar(grip.scale / k);
      holder.add(gun); hand.add(holder);
      man.scene.updateMatrixWorld(true);
      const p = hand.getWorldPosition(new THREE.Vector3());
      const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); r.setSize(520, 520);
      document.body.innerHTML = ''; document.body.appendChild(r.domElement);
      const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
      const shots = [];
      for (const [dx, dz] of [[1.4, 1.2], [-1.6, 0.4]]) {
        cam.position.set(p.x + dx, p.y + 0.25, p.z + dz); cam.lookAt(p.x, p.y - 0.05, p.z);
        r.render(scene, cam); shots.push(r.domElement.toDataURL('image/png'));
      }
      return shots;
    }, { url, grip, clip });
    png.forEach((d, i) => fs.writeFileSync(path.join(outDir, `grip-${w.id}-${i}.png`), Buffer.from(d.split(',')[1], 'base64')));
    console.log(`${w.id}: ${w.asset} (grip ${w.grip})`);
  }
  await browser.close(); server.close();
})();
