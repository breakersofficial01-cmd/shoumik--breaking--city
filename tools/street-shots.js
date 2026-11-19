// Street photo tool for Claude sessions (not part of the game).
// Boots the game headless and photographs building fronts at eye level in every district,
// to judge facades (data/assets.json -> texture.facades) up close.
//
//   node tools/street-shots.js --three <dir of three@0.170.0> --out <folder> [--quality high] [--tag name]
//
// Prints any console errors (exit code 1 on errors).

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
  const tag = arg('tag', quality);
  // One front-facing building per district: tall enough, with a street side.
  const spots = await page.evaluate(() => {
    const BC = window.BC, L = BC.world.layout, seen = new Map();
    const dirs = { 1: [0, -1], 2: [0, 1], 4: [-1, 0], 8: [1, 0] }; // SIDE N S W E -> outward
    for (const p of L.pieces) {
      for (const b of p?.content?.buildings || []) {
        const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
        const d = BC.world.districtAt(cx, cz); const id = d?.id || d;
        if (!id || seen.has(id) || b.floors < 4) continue;
        const bit = [2, 1, 8, 4].find((k) => b.front & k); if (!bit) continue;
        const [ox, oz] = dirs[bit];
        const fx = ox ? (ox > 0 ? b.x1 : b.x0) : cx, fz = oz ? (oz > 0 ? b.z1 : b.z0) : cz;
        seen.set(id, { id, fx, fz, ox, oz });
      }
    }
    return [...seen.values()];
  });
  for (const s of spots) {
    await page.evaluate(({ s }) => { const BC = window.BC; BC.setPaused('shots', false); BC.player.position.x = s.fx + s.ox * 12; BC.player.position.z = s.fz + s.oz * 12; }, { s });
    await page.waitForTimeout(600);
    await page.evaluate(async ({ s }) => {
      const BC = window.BC; BC.setPaused('shots', true);
      await BC.world.buildAround(s.fx, s.fz);
      BC.world.update(0, { x: s.fx, z: s.fz });
      // Stand across the street, a little to the side, at eye level, looking up at the front.
      const side = { x: -s.oz, z: s.ox };
      BC.camera.position.set(s.fx + s.ox * 16 + side.x * 7, 1.7, s.fz + s.oz * 16 + side.z * 7);
      BC.camera.lookAt(s.fx, 7, s.fz);
      BC.world.sky.update(BC.camera);
      BC.graphics.update(0, { x: s.fx, z: s.fz });
      BC.graphics.render(0);
    }, { s });
    await page.waitForTimeout(120);
    await page.screenshot({ path: path.join(outDir, `street-${s.id}-${tag}.png`) });
  }
  console.log('districts:', spots.map((s) => s.id).join(', '));
  if (problems.length) console.log('CONSOLE ERRORS:\n' + problems.join('\n'));
  await browser.close();
  server.close();
  process.exit(problems.length ? 1 : 0);
})();
