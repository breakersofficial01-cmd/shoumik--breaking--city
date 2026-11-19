// Hero building photo tool for Claude sessions (not part of the game).
// Boots the game headless, prints every 3D kit-building zone (data/heroBuildings.json) and
// photographs each zone from the street and from above.
//
//   node tools/hero-shots.js --three <dir of three@0.170.0> --out <folder> [--quality high]
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
  const zones = await page.evaluate(() => {
    const h = window.BC.world.hero;
    return { loaded: !!h.lib, enabled: h.enabled, zones: h.zones.map((z) => ({ id: z.id, x: z.x, z: z.z, n: z.buildings.length, tris: z.tris,
      // a hero building near the centre, its street side, for the eye-level photo
      b: (() => { const e = z.buildings[0]?.b; return e ? { x0: e.x0, x1: e.x1, z0: e.z0, z1: e.z1, front: e.front } : null; })() })) };
  });
  console.log(`hero library loaded: ${zones.loaded}, enabled: ${zones.enabled}`);
  for (const z of zones.zones) console.log(`  ${z.id}: ${z.n} buildings, ${Math.round(z.tris / 1000)}k triangles`);
  for (const z of zones.zones) {
    if (!z.b) continue;
    for (const view of ['street', 'above']) {
      await page.evaluate(({ z }) => { const BC = window.BC; BC.setPaused('shots', false); BC.player.position.x = z.x; BC.player.position.z = z.z; }, { z });
      await page.waitForTimeout(700);
      await page.evaluate(async ({ z, view }) => {
        const BC = window.BC; BC.setPaused('shots', true);
        await BC.world.buildAround(z.x, z.z);
        BC.world.update(0, { x: z.x, z: z.z });
        const b = z.b, cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
        const o = b.front & 2 ? [0, 1] : b.front & 1 ? [0, -1] : b.front & 8 ? [1, 0] : [-1, 0];
        const fx = o[0] ? (o[0] > 0 ? b.x1 : b.x0) : cx, fz = o[1] ? (o[1] > 0 ? b.z1 : b.z0) : cz;
        if (view === 'street') {
          BC.camera.position.set(fx + o[0] * 15 - o[1] * 9, 1.7, fz + o[1] * 15 + o[0] * 9);
          BC.camera.lookAt(fx, 6, fz);
        } else {
          BC.camera.position.set(z.x + 70, 45, z.z + 70);
          BC.camera.lookAt(z.x, 5, z.z);
        }
        BC.world.sky.update(BC.camera);
        BC.graphics.update(0, { x: z.x, z: z.z });
        BC.graphics.render(0);
      }, { z, view });
      await page.waitForTimeout(120);
      await page.screenshot({ path: path.join(outDir, `hero-${z.id}-${view}.png`) });
    }
  }
  console.log(await page.evaluate(() => { const r = window.BC.renderer.info; return `last frame: ${r.render.calls} draw calls, ${Math.round(r.render.triangles / 1000)}k triangles`; }));
  if (problems.length) console.log('CONSOLE ERRORS:\n' + problems.join('\n'));
  await browser.close();
  server.close();
  process.exit(problems.length ? 1 : 0);
})();
