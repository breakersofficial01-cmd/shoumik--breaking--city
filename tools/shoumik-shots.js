// Close-up photos of Shoumik in each animation state (for Claude sessions, not part of the game).
//   node tools/shoumik-shots.js --three <dir of three@0.170.0> --out <folder> [--quality medium]
// States: idle (signature arms crossed), walk, run, punch, dance, aim, jump, driving.
// Prints which model is in use and any console errors (exit code 1 if there were errors).

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
const quality = arg('quality', 'medium');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.glb': 'model/gltf-binary', '.webmanifest': 'application/manifest+json' };
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
  const page = await browser.newPage({ viewport: { width: 600, height: 600 } });
  const problems = [];
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); if (/Shoumik|shoumik/.test(m.text())) logs.push(m.text()); });
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

  // Photograph him from the front-left after letting a state run for a while.
  const photo = async (name, setup, seconds = 1.2, opts = {}) => {
    await page.evaluate(setup);
    await page.waitForTimeout(seconds * 1000);
    await page.evaluate(({ opts }) => {
      const BC = window.BC;
      const p = BC.player.position;
      const h = BC.player.heading + (opts.angle ?? 0.6);
      const d = opts.dist ?? 3.4;
      BC.setPaused('shots', true);
      BC.camera.position.set(p.x + Math.sin(h) * d, p.y + (opts.h ?? 1.3), p.z + Math.cos(h) * d);
      BC.camera.lookAt(p.x, p.y + (opts.look ?? 0.95), p.z);
      BC.world.sky.update(BC.camera);
      BC.graphics.update(0, p);
      BC.graphics.render(0);
    }, { opts });
    await page.screenshot({ path: path.join(outDir, `shoumik-${name}-${quality}.png`) });
    await page.evaluate(() => window.BC.setPaused('shots', false));
  };
  const emit = (name, extra = {}) => `window.BC.events.emit('player:action', ${JSON.stringify({ name, ...extra })})`;

  await photo('idle', () => {}, 2.5);
  await page.keyboard.down('w');
  await photo('walk', () => {}, 1.0, { angle: 0.9 });
  await page.keyboard.down('Shift');
  await photo('run', () => {}, 1.0, { angle: 0.9 });
  await page.keyboard.up('Shift');
  await page.keyboard.up('w');
  await page.waitForTimeout(800);
  await photo('punch', () => { window.BC.events.emit('player:action', { name: 'punch', duration: 0.42 }); }, 0.17);
  await page.waitForTimeout(600);
  await photo('aim', new Function(emit('aim')), 0.8);
  await page.evaluate(new Function(emit('aim', { on: false })));
  await page.waitForTimeout(500);
  await photo('dance', new Function(emit('dance')), 1.5);
  await page.evaluate(new Function(emit('dance', { on: false })));
  await page.waitForTimeout(600);
  await page.keyboard.press('Space');
  await photo('jump', () => {}, 0.25, { h: 1.6 });
  await page.waitForTimeout(1200);
  // Seated pose (the same clip plays while driving).
  await photo('drive', new Function(emit('enterVehicle', { duration: 0.9 })), 1.4);

  const report = await page.evaluate(() => {
    let mesh = null;
    window.BC.player.model.traverse((o) => { if (o.isSkinnedMesh) mesh = o; });
    return mesh ? `real 3D model: ${mesh.geometry.index.count / 3} triangles` : 'code-built model';
  });
  console.log(`${quality}: ${report}`);
  if (logs.length) console.log(logs.join('\n'));
  if (problems.length) console.log('CONSOLE ERRORS:\n' + problems.join('\n'));
  await browser.close();
  server.close();
  process.exit(problems.length ? 1 : 0);
})();
