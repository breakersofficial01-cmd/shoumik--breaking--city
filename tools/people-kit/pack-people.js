// Packs the 3D crowd (Roadmap 2 S5) into assets/people/:
//   people.glb  – ONE skinned body (Kenney "Animated Characters 3" characterMedium, CC0) baked to
//                 metres (soles at y = 0, facing +z, his left = +x, deform bones only) with the
//                 Mixamo clips of assets/shoumik/shoumik.glb RETARGETED onto it (walk, run, sit,
//                 dance, fall, hit, punch, aim, shoot...) + posed clips: tray carrying (waiters) and cower.
//   skins.png   – 256 px, R = man's skin texture in grey, G = woman's in grey, B = region id × 16
//                 (1 face skin, 2 hair, 3 shirt body, 4 upper arm, 5 forearm, 6 hands, 7 upper leg,
//                 8 lower leg, 9 shoes). The game multiplies grey × colour per region, so every
//                 person gets Dhaka clothes (panjabi, lungi, saree, kameez...) from one texture.
// Recipe: tools/people-kit/people.json. The in-page work is tools/people-kit/page.js.
//
//   node tools/people-kit/pack-people.js --three <three@0.170.0 dir> \
//        --kenney "<Animated Characters 3 folder>" [--out assets/people] [--shot sheet.png]
// Then: node tools/compress-models.js --cli <gltf-transform> --only people
// Retargeting: the Mixamo source is first bent into the Kenney T-pose (bone directions), then each
// frame's world rotation change is copied bone by bone; hips height is scaled by leg length.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const threeDir = arg('three');
const kenneyDir = arg('kenney');
const outDir = path.resolve(arg('out', path.join(ROOT, 'assets/people')));
const shot = arg('shot', null);
const recipe = JSON.parse(fs.readFileSync(path.join(__dirname, 'people.json'), 'utf8'));
const MIME = { '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.png': 'image/png', '.fbx': 'application/octet-stream' };

const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><body style="margin:0;background:#888"></body>'); return; }
  if (req.method === 'POST') {
    const name = path.basename(u);
    const file = name === 'shot.png' ? shot : path.join(outDir, name);
    const ws = fs.createWriteStream(file); req.pipe(ws); ws.on('finish', () => res.end('ok')); return;
  }
  const roots = { '/three/': threeDir, '/kenney/': kenneyDir, '/repo/': ROOT, '/tool/': __dirname };
  const pre = Object.keys(roots).find((p) => u.startsWith(p));
  const f = pre ? path.join(roots[pre], u.slice(pre.length)) : null;
  if (!f || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

(async () => {
  if (!threeDir || !kenneyDir) { console.log('usage: --three <dir> --kenney <Animated Characters 3 dir>'); process.exit(1); }
  fs.mkdirSync(outDir, { recursive: true });
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 600 } });
  page.on('pageerror', (e) => console.log('[page error]', e.message));
  page.on('console', (m) => { const t = m.text(); if (!/FBXLoader|GPU stall/.test(t)) console.log('[page]', t); });
  await page.goto(`http://localhost:${server.address().port}/`);
  await page.addScriptTag({ type: 'importmap', content: JSON.stringify({ imports: { three: '/three/build/three.module.js', 'three/addons/': '/three/examples/jsm/' } }) });
  const report = await page.evaluate(async ({ recipe, wantShot }) => {
    const mod = await import('/tool/page.js');
    return mod.pack(recipe, wantShot);
  }, { recipe, wantShot: !!shot });
  console.log(report);
  await browser.close();
  server.close();
})();
