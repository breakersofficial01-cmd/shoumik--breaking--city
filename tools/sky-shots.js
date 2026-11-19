// Sky photo tool for Claude sessions (not part of the game): looks towards the sun, away from it and up.
// Boots the game headless, waits for the MRT cars (real 3D model on Medium/High), then
// photographs the first train from the front, side and above.
//
//   node tools/sky-shots.js --three <dir of three@0.170.0> --out <folder> [--quality high]
//
// Prints which car model is in use and any console errors (exit code 1 on errors).

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
const quality = arg('quality', 'high');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.glb': 'model/gltf-binary' };
const SUB = '/shoumik--breaking--city';

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (!p.startsWith(SUB)) { res.writeHead(404); res.end(); return; }
  p = p.slice(SUB.length) || '/';
  if (p.endsWith('/')) p += 'index.html';
  fs.readFile(path.join(ROOT, p), (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(data);
  });
});

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 620 } });
  const problems = [];
  page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });
  page.on('pageerror', (e) => problems.push(e.stack || e.message));
  if (threeDir) {
    await page.route(/cdn\.jsdelivr\.net\/npm\/three@[^/]+\//, (route) => {
      const file = path.join(threeDir, route.request().url().replace(/^.*three@[^/]+\//, ''));
      if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: 'not found' });
      return route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(file) });
    });
  }
  await page.goto(`http://localhost:${server.address().port}${SUB}/?debug=1&autostart=1&quality=${quality}`);
  await page.waitForFunction(() => window.BC && window.BC.running, null, { timeout: 120000 });
  await page.evaluate(() => { document.getElementById('ui').style.display = 'none'; const d = document.getElementById('debug-panel'); if (d) d.style.display = 'none'; });
  for (const [name, turn, pitch] of [['sun', 0, 0.12], ['away', Math.PI, 0.1], ['up', 0.6, 0.6]]) {
    await page.evaluate(async ({ turn, pitch }) => {
      const BC = window.BC; BC.setPaused('shots', true);
      const p = BC.player.position, s = BC.world.sky.sunDir;
      const a = Math.atan2(s.x, s.z) + turn;
      BC.camera.position.set(p.x, 22, p.z);
      BC.camera.lookAt(p.x + Math.sin(a) * 100, 22 + pitch * 100, p.z + Math.cos(a) * 100);
      BC.world.sky.update(BC.camera); BC.graphics.update(0, { x: p.x, z: p.z }); BC.graphics.render(0);
    }, { turn, pitch });
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(outDir, `sky-${name}.png`) });
  }
  if (problems.length) console.log('CONSOLE ERRORS:\n' + problems.join('\n'));
  await browser.close();
  server.close();
  process.exit(problems.length ? 1 : 0);
})();
