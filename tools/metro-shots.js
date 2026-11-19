// Metro photo tool for Claude sessions (not part of the game).
// Boots the game headless, waits for the MRT cars (real 3D model on Medium/High), then
// photographs the first train from the front, side and above.
//
//   node tools/metro-shots.js --three <dir of three@0.170.0> --out <folder> [--quality high]
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
  // Wait (max 30 s) until the cars use the real model, if this quality level should have it.
  const real = await page.waitForFunction(() => {
    const t = window.BC.metro?.trains?.[0];
    return t && t.cars[0].material !== window.BC.world.shared.facadeMaterial;
  }, null, { timeout: 30000 }).then(() => true, () => false);
  console.log(`quality ${quality}: ${real ? 'real 3D cars' : 'code-built cars'}`);

  const views = [['front', 0.35, 26, 9], ['side', Math.PI / 2, 34, 10], ['above', 2.4, 45, 30]];
  for (const [name, turn, dist, lift] of views) {
    // Bring Shoumik under the train so it is drawn, then freeze and frame car 0.
    await page.evaluate(() => {
      const BC = window.BC; BC.setPaused('shots', false);
      const t = BC.metro.trains[0]; const p = t.path.at(t.s, {}, t.side); BC.player.position.x = p.x; BC.player.position.z = p.z;
    });
    await page.waitForTimeout(400);
    await page.evaluate(async ({ turn, dist, lift }) => {
      const BC = window.BC;
      BC.setPaused('shots', true);
      const car = BC.metro.trains[0].cars[0];
      const x = car.position.x, y = car.position.y, z = car.position.z, h = car.rotation.y;
      await BC.world.buildAround(x, z);
      BC.world.update(0, { x, z });
      const a = h + turn;
      BC.camera.position.set(x + Math.sin(a) * dist, y + lift, z + Math.cos(a) * dist);
      BC.camera.lookAt(x, y + 1.5, z);
      BC.world.sky.update(BC.camera);
      BC.graphics.update(0, { x, z });
      BC.graphics.render(0);
    }, { turn, dist, lift });
    await page.waitForTimeout(120);
    await page.screenshot({ path: path.join(outDir, `metro-${quality}-${name}.png`) });
  }
  if (problems.length) console.log('CONSOLE ERRORS:\n' + problems.join('\n'));
  await browser.close();
  server.close();
  process.exit(problems.length ? 1 : 0);
})();
