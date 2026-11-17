// Look check for Claude sessions (not part of the game). Session 4.5 visual upgrade.
// Boots the game at one quality level, takes the same set of photos every time (street view
// behind Shoumik, a raised view to see shadows, neon at Breaking School, water, towers) and
// prints draw calls and how many objects cast shadows. Compare before/after a look change.
//
//   node tools/look-shots.js --three <dir of three@0.170.0> --out <folder> [--quality medium]
//
// Same serving rules as tools/smoke-test.js (sub-path, local three.js copy).

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
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf', '.webmanifest': 'application/manifest+json' };
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
  fs.mkdirSync(outDir, { recursive: true });
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1000, height: 450 } });
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
  await page.waitForTimeout(1500);

  // 1) The normal game view behind Shoumik, HUD visible.
  await page.screenshot({ path: path.join(outDir, `street-${quality}.png`) });
  await page.evaluate(() => { document.getElementById('ui').style.display = 'none'; const d = document.getElementById('debug-panel'); if (d) d.style.display = 'none'; });

  // Views: [name, focus point getter, camera offset from focus, look height]
  const views = await page.evaluate(() => {
    const BC = window.BC;
    const p = BC.player.position;
    const site = (id) => BC.world.landmarks.sites.find((s) => s.id === id);
    const lake = BC.world.landmarks.units.find((u) => u.id === 'lake-hatirjheel');
    const list = [{ id: 'raised', x: p.x, z: p.z, cam: [10, 22, 12], look: 0 }];
    const bs = site('breaking-school');
    if (bs) list.push({ id: 'breaking-school', x: bs.cx, z: bs.cz, cam: [Math.sin(bs.angle + 0.35) * 70, 30, Math.cos(bs.angle + 0.35) * 70], look: 14 });
    if (lake) list.push({ id: 'hatirjheel', x: lake.cx, z: lake.cz, cam: [55, 38, 75], look: 0 });
    const g = site('gulshan');
    if (g) list.push({ id: 'gulshan', x: g.cx, z: g.cz, cam: [Math.sin(g.angle + 0.35) * 150, 90, Math.cos(g.angle + 0.35) * 150], look: 30 });
    return list;
  });

  for (const v of views) {
    await page.evaluate(({ v }) => { const BC = window.BC; BC.setPaused('shots', false); BC.player.position.x = v.x; BC.player.position.z = v.z; }, { v });
    await page.waitForTimeout(800);
    await page.evaluate(async ({ v }) => {
      const BC = window.BC;
      BC.setPaused('shots', true);
      await BC.world.buildAround(v.x, v.z);
      BC.world.update(0, { x: v.x, z: v.z });
      BC.camera.position.set(v.x + v.cam[0], v.cam[1], v.z + v.cam[2]);
      BC.camera.lookAt(v.x, v.look, v.z);
      BC.world.sky.update(BC.camera);
      BC.graphics.update(0, { x: v.x, z: v.z });
      BC.graphics.render(0);
    }, { v });
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(outDir, `${v.id}-${quality}.png`) });
  }

  console.log(await page.evaluate(() => {
    const BC = window.BC;
    let cast = 0, recv = 0;
    BC.scene.traverse((o) => { if (o.castShadow) cast++; if (o.receiveShadow) recv++; });
    const r = BC.renderer.info;
    return `${BC.qualityName}: ${r.render.calls} draw calls, ${Math.round(r.render.triangles / 1000)}k triangles, ` +
      `${r.memory.textures} textures; shadows ${BC.renderer.shadowMap.enabled ? 'on' : 'off'} (${cast} casters, ${recv} receivers)`;
  }));
  if (problems.length) console.log('CONSOLE ERRORS:\n' + problems.join('\n'));
  await browser.close();
  server.close();
  process.exit(problems.length ? 1 : 0);
})();
