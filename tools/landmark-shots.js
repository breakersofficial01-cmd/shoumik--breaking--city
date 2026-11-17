// Landmark photo tool for Claude sessions (not part of the game).
// Boots the game headless, then flies a free camera to every landmark, MRT station and
// lake and saves one picture of each — so you can SEE what a landmark change did.
//
//   node tools/landmark-shots.js --three <dir of three@0.170.0> --out <folder> [--only tsc,sangsad-bhaban] [--quality high]
//
// Also prints the landmark list, triangle counts and any console errors (exit code 1 on errors).

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
const quality = arg('quality', 'high');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf' };
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

  // Every target: a point to look at, how far away the camera stands and from which side.
  const targets = await page.evaluate(() => {
    const lm = window.BC.world.landmarks;
    const list = lm.sites.map((s) => ({ id: s.id, x: s.cx, z: s.cz, angle: s.angle, dist: s.type === 'sangsad' ? 150 : s.type === 'gulshanTowers' ? 120 : 82, lift: s.type === 'gulshanTowers' ? 40 : 26, look: s.type === 'gulshanTowers' ? 45 : 8 }));
    for (const v of lm.viaducts) for (const st of v.stations) list.push({ id: st.id, x: st.x, z: st.z, angle: st.heading + 0.9, dist: 60, lift: 16, look: 10 });
    for (const v of lm.viaducts) { const p = v.path.at(v.path.length * 0.45, {}); list.push({ id: v.id, x: p.x, z: p.z, angle: p.heading + 0.5, dist: 55, lift: 7, look: 8 }); }
    for (const u of lm.units) if (u.id.startsWith('lake-')) list.push({ id: u.id, x: u.cx, z: u.cz, angle: 0.6, dist: 120, lift: 45, look: 0 });
    return list;
  });
  console.log('landmarks:', targets.map((t) => t.id).join(', '));

  for (const t of targets) {
    if (only.length && !only.includes(t.id)) continue;
    for (const [suffix, turn] of [['', 0.35], ['-b', Math.PI - 0.5]]) {
      if (suffix && !arg('both', null)) continue;
      await page.evaluate(async ({ t, turn }) => {
        const BC = window.BC;
        BC.setPaused('shots', true);
        const a = t.angle + turn;
        const cx = t.x + Math.sin(a) * t.dist, cz = t.z + Math.cos(a) * t.dist;
        await BC.world.buildAround(t.x, t.z);
        BC.world.update(0, { x: t.x, z: t.z });
        BC.camera.position.set(cx, t.lift, cz);
        BC.camera.lookAt(t.x, t.look, t.z);
        BC.world.sky.update(BC.camera);
        BC.renderer.render(BC.scene, BC.camera);
      }, { t, turn });
      await page.waitForTimeout(120);
      await page.screenshot({ path: path.join(outDir, `${t.id}${suffix}.png`) });
    }
  }
  console.log(await page.evaluate(() => { const r = window.BC.renderer.info; return `last frame: ${r.render.calls} draw calls, ${Math.round(r.render.triangles / 1000)}k triangles, ${r.memory.textures} textures`; }));
  if (problems.length) console.log('CONSOLE ERRORS:\n' + problems.join('\n'));
  await browser.close();
  server.close();
  process.exit(problems.length ? 1 : 0);
})();
