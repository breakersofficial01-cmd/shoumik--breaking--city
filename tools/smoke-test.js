// Smoke test for Claude sessions (not part of the game).
// Boots the game in headless Chromium, walks Shoumik forward, saves a screenshot and fails
// if the browser console shows any error.
//
//   node tools/smoke-test.js [--three <dir>] [--shot <file.png>] [--query "debug=1&autostart=1"]
//
// Needs the `playwright` package. If the sandbox cannot reach the CDN, install the pinned
// three.js somewhere (npm i three@0.170.0) and pass that folder:  --three /tmp/x/node_modules/three
// The import-map URL from index.html is then served from that local copy.

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
const shotFile = arg('shot', null);
const query = arg('query', 'debug=1&autostart=1');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf', '.webmanifest': 'application/manifest+json' };

// Serve the repo under the same sub-path GitHub Pages uses, to catch absolute-path mistakes.
const SUB = '/shoumik--breaking--city';
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (!p.startsWith(SUB)) { res.writeHead(404); res.end('outside sub-path'); return; }
  p = p.slice(SUB.length) || '/';
  if (p.endsWith('/')) p += 'index.html';
  fs.readFile(path.join(ROOT, p), (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(data);
  });
});

(async () => {
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 915, height: 412 } });
  const problems = [];
  page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });
  page.on('pageerror', (e) => problems.push(e.stack || e.message));
  if (threeDir) {
    await page.route(/cdn\.jsdelivr\.net\/npm\/three@[^/]+\//, (route) => {
      const rel = route.request().url().replace(/^.*three@[^/]+\//, '');
      const file = path.join(threeDir, rel);
      if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: 'not found' });
      return route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(file) });
    });
  }
  let ok = true;
  try {
    await page.goto(`http://localhost:${server.address().port}${SUB}/?${query}`);
    await page.waitForFunction(() => window.BC && window.BC.running, null, { timeout: 90000 });
    const before = await page.evaluate(() => ({ ...window.BC.player.position }));
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(2500);
    await page.keyboard.up('KeyW');
    const after = await page.evaluate(() => ({ ...window.BC.player.position }));
    const moved = Math.hypot(after.x - before.x, after.z - before.z);
    console.log(`player moved ${moved.toFixed(1)} m`);
    console.log((await page.evaluate(() => document.getElementById('debug-panel').textContent)).replace(/\n/g, ' | '));
    if (!(moved > 0.5)) { ok = false; console.log('FAIL: the player did not move'); }
    const people = await page.evaluate(() => (window.BC.crowd ? window.BC.crowd.people.size : -1));
    console.log(`people on the street: ${people}`);
    if (people === 0) { ok = false; console.log('FAIL: no pedestrians were spawned'); }
    if (shotFile) await page.screenshot({ path: shotFile });
  } catch (err) {
    ok = false;
    console.log('FAIL:', err.message);
  }
  if (problems.length) { ok = false; console.log('FAIL: console errors:\n' + problems.join('\n')); }
  await browser.close();
  server.close();
  console.log(ok ? 'SMOKE TEST PASSED' : 'SMOKE TEST FAILED');
  process.exit(ok ? 0 : 1);
})();
