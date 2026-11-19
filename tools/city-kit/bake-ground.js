// Bakes the ground atlas (assets/city/ground.jpg): the game's own painted ground tiles
// (src/assets/proceduralTextures.js: lane lines, zebras, Dhaka pavers, grass...) drawn at 4x,
// then given real surface detail from Downtown City MegaKit textures (CC0, Quaternius):
// asphalt grain under the roads and paint, concrete in pavers and plazas, dirt on empty lots.
// Detail is applied as  colour * (detail / average(detail)), so colours and markings stay.
//
//   node tools/city-kit/bake-ground.js --three <three@0.170.0 dir> --kit "<kit>/Exports/glTF (Godot)" --out assets/city/ground.jpg
// Needs playwright, python3 with numpy + opencv (for the detail step).

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const threeDir = arg('three');
const kitDir = arg('kit');
const out = arg('out', path.join(ROOT, 'assets/city/ground.jpg'));
const SCALE = 4;

const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><body></body>'); return; }
  const f = u.startsWith('/three/') ? path.join(threeDir, u.slice(7)) : path.join(ROOT, u);
  if (!fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

(async () => {
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('[page error]', e.message));
  await page.goto(`http://localhost:${server.address().port}/`);
  await page.addScriptTag({ type: 'importmap', content: JSON.stringify({ imports: { three: '/three/build/three.module.js', 'three/addons/': '/three/examples/jsm/' } }) });
  // Paint the game's ground atlas on a canvas scaled up SCALE times (crisp lines, same layout).
  const url = await page.evaluate(async (scale) => {
    const P = await import('/src/assets/proceduralTextures.js');
    const tex = P.makeGroundAtlas();
    const src = tex.image;
    const c = document.createElement('canvas'); c.width = src.width * scale; c.height = src.height * scale;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(src, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  }, SCALE);
  const tmp = path.join(os.tmpdir(), 'bc-ground-base.png');
  fs.writeFileSync(tmp, Buffer.from(url.split(',')[1], 'base64'));
  await browser.close(); server.close();

  // Detail step in python (numpy / opencv are better at this than a canvas).
  execFileSync('python3', ['-I', path.join(__dirname, 'ground_detail.py'), tmp, kitDir, out], { stdio: 'inherit' });
})();
