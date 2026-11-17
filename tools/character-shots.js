// Screenshot helper for Claude sessions (not part of the game).
// Boots the game headless and saves close-up pictures of Shoumik in each outfit and
// animation, so a session can SEE what it changed.
//
//   node tools/character-shots.js --three <dir of three@0.170.0> --out <folder> [--only name]
//
// Shots are listed in SHOTS below: { name, outfit, action, yaw (0 = from the front),
// distance, height, wait (ms), eval (extra code run in the page) }.

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
const outDir = arg('out', 'shots');
const only = arg('only', null);
const query = arg('query', 'debug=1&autostart=1&quality=high');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };

const SHOTS = [
  { name: 'front', outfit: 'casual_maroon', yaw: 0, distance: 2.7 },
  { name: 'face', outfit: 'casual_maroon', yaw: 0.3, distance: 1.25, height: 1.5 },
  { name: 'face0', outfit: 'casual_maroon', yaw: 0, distance: 1.1, height: 1.52 },
  { name: 'sunface', outfit: 'casual_maroon', yaw: 0.2, distance: 0.9, height: 1.56, heading: -1.04 },
  { name: 'sunside', outfit: 'casual_maroon', yaw: 1.3, distance: 0.9, height: 1.56, heading: -1.04 },
  { name: 'sunfront', outfit: 'casual_maroon', yaw: -0.3, distance: 2.6, heading: -1.04 },
  { name: 'sunback', outfit: 'casual_maroon', yaw: 2.6, distance: 1.6, height: 1.4, heading: -1.04 },
  { name: 'side', outfit: 'casual_maroon', yaw: 1.4, distance: 2.7 },
  { name: 'back', outfit: 'casual_maroon', yaw: 2.7, distance: 2.7 },
  { name: 'crossed', outfit: 'casual_maroon', yaw: 0.35, distance: 2.5, wait: 6500 },
  { name: 'panjabi_navy', outfit: 'panjabi_navy', yaw: 0.4, distance: 2.7 },
  { name: 'panjabi_grey', outfit: 'panjabi_grey', yaw: -0.4, distance: 2.7 },
  { name: 'doctor', outfit: 'doctor', yaw: 0.3, distance: 2.7 },
  { name: 'polo_black', outfit: 'polo_black', yaw: -0.3, distance: 2.7 },
  { name: 'punch', outfit: 'casual_maroon', action: 'punch', yaw: 1.0, distance: 2.7, wait: 210 },
  { name: 'melee', outfit: 'casual_maroon', action: 'melee', yaw: 0.8, distance: 2.7, wait: 250 },
  { name: 'aim', outfit: 'polo_black', action: 'aim', yaw: 1.1, distance: 2.7, wait: 500 },
  { name: 'dance', outfit: 'casual_maroon', action: 'dance', yaw: 0.3, distance: 2.9, wait: 900 },
  { name: 'sit', outfit: 'casual_maroon', action: 'enterVehicle', yaw: 1.2, distance: 2.9, wait: 1300 },
  { name: 'down', outfit: 'casual_maroon', action: 'down', yaw: 1.2, distance: 3.2, wait: 900 },
  { name: 'cower', outfit: 'doctor', action: 'cower', yaw: 0.8, distance: 2.9, wait: 700 },
  { name: 'run', outfit: 'casual_maroon', yaw: 1.2, distance: 3.2, key: 'KeyW', wait: 900 },
  { name: 'jump', outfit: 'casual_maroon', yaw: 1.0, distance: 3.2, key: 'Space', wait: 260 },
];

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
  const page = await browser.newPage({ viewport: { width: 760, height: 620 } });
  page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE ERROR:', m.text()); });
  page.on('pageerror', (e) => console.log('PAGE ERROR:', e.stack || e.message));
  if (threeDir) {
    await page.route(/cdn\.jsdelivr\.net\/npm\/three@[^/]+\//, (route) => {
      const file = path.join(threeDir, route.request().url().replace(/^.*three@[^/]+\//, ''));
      if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: 'not found' });
      return route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(file) });
    });
  }
  await page.goto(`http://localhost:${server.address().port}${SUB}/?${query}`);
  await page.waitForFunction(() => window.BC && window.BC.running, null, { timeout: 90000 });
  await page.evaluate(() => { document.getElementById('ui').style.display = 'none'; document.getElementById('debug-panel').style.display = 'none'; });

  for (const s of SHOTS) {
    if (only && !only.split(',').includes(s.name)) continue;
    await page.evaluate((shot) => {
      const g = window.BC;
      g.events.emit('player:action', { name: 'hit', on: false });
      g.features.get('player') && g.player && (g.player.velocity.x = g.player.velocity.z = 0);
      if (shot.outfit) g.events.emit('outfit:set', { id: shot.outfit });
      if (shot.heading != null) g.player.heading = shot.heading;
      const rig = g.cameraRig;
      rig.mode = { ...g.config.get('camera').onFoot, distance: shot.distance || 2.7, targetHeight: shot.height || 1.0, followDelay: 999 };
      rig.distance = rig.mode.distance;
      rig.yaw = g.player.heading + Math.PI + (shot.yaw || 0);
      rig.pitch = shot.pitch ?? 0.08;
      if (shot.action) g.events.emit('player:action', { name: shot.action });
      if (shot.eval) eval(shot.eval);
    }, s);
    if (s.key) await page.keyboard.down(s.key);
    await page.waitForTimeout(s.wait || 350);
    await page.evaluate((shot) => {            // keep the camera where the shot wants it
      const g = window.BC;
      if (!shot.key) g.cameraRig.yaw = g.player.heading + Math.PI + (shot.yaw || 0);
    }, s);
    await page.waitForTimeout(60);
    await page.screenshot({ path: path.join(outDir, `${s.name}.png`) });
    if (s.key) await page.keyboard.up(s.key);
    await page.evaluate((shot) => {
      const g = window.BC;
      if (shot.action) g.events.emit('player:action', { name: shot.action, on: false });
    }, s);
    await page.waitForTimeout(s.action ? 900 : 100);
    console.log('saved', s.name);
  }
  await browser.close();
  server.close();
})();
