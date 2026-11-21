// Hotel check (Roadmap 2, Session 4) — a tool for Claude sessions, not part of the game.
// Boots the game headless and, for every hotel in data/hotels.json:
//   - checks the inside is only built after its stream group arrived (doors shut before)
//   - photographs the outside (day + night) and walks in (fade, indoor camera, inside state)
//   - sits at a free table, waits for the waiter, opens the menu card, orders two things,
//     checks the Taka paid, waits until the food is on the table, eats, checks the health gained
//   - Breaking Hotel: sits at the bar (mocktail), dances on the dance floor
// plus a gallery of every menu item's 3D dish (food.png) and its triangle count.
//
//   node tools/hotel-check.js --three <dir of three@0.170.0> --out <folder> [--quality medium] [--only gallery,breaking-hotel,...]
//
// Exit code 1 on console errors or a failed check.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
const threeDir = arg('three', null);
const outDir = arg('out', path.join(ROOT, 'shots'));
const quality = arg('quality', 'medium');
const HOTELS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/hotels.json'), 'utf8')).hotels.map((h) => h.id);
const only = arg('only', ['gallery', ...HOTELS].join(',')).split(',');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.glb': 'model/gltf-binary', '.webmanifest': 'application/json' };
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
  const fails = [];
  const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails.push(what); };
  page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); if (/hotel/.test(m.text())) console.log('  game:', m.text()); });
  page.on('pageerror', (e) => problems.push(e.stack || e.message));
  if (threeDir) {
    await page.route(/cdn\.jsdelivr\.net\/npm\/three@[^/]+\//, (route) => {
      const file = path.join(threeDir, route.request().url().replace(/^.*three@[^/]+\//, ''));
      if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: 'not found' });
      return route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(file) });
    });
  }
  await page.goto(`http://localhost:${server.address().port}${SUB}/?debug=1&autostart=1&quality=${quality}&hour=12`);
  await page.waitForFunction(() => window.BC && window.BC.running, null, { timeout: 120000 });
  const ui = (on) => page.evaluate((on) => { document.getElementById('ui').style.display = on ? '' : 'none'; const d = document.getElementById('debug-panel'); if (d) d.style.display = 'none'; }, on);
  await ui(false);
  const wait = (fn, arg, timeout = 90000) => page.waitForFunction(fn, arg, { timeout, polling: 250 }).then(() => true, () => false);

  // Headless frames are slow: speed the staff up so a meal fits in the test time (same code path).
  await page.evaluate(() => { const c = window.BC.config.get('hotels'); c.waiter.speed = 7; c.waiter.kitchenSeconds = 1; c.order.eatSeconds = 1; });
  const info = await page.evaluate(() => ({
    hotels: window.BC.hotels.list.map((rt) => ({ id: rt.hotel.id, built: rt.built, cx: rt.site.cx, cz: rt.site.cz })),
    food: !!window.BC.assets.url('model.food.kit'),
  }));
  console.log('hotels:', JSON.stringify(info.hotels));
  check(info.hotels.length === HOTELS.length, `all ${HOTELS.length} hotels stand in the city`);
  check(info.hotels.every((h) => !h.built), 'no hotel inside is built at the start (streamed later)');

  /** Shoumik to local hotel point (x, z) facing `heading` (local, 0 = towards the door side). */
  const putLocal = (id, lx, lz, lh = Math.PI) => page.evaluate(({ id, lx, lz, lh }) => {
    const BC = window.BC, rt = BC.hotels.list.find((h) => h.hotel.id === id), s = rt.site;
    const c = Math.cos(s.angle), n = Math.sin(s.angle);
    BC.events.emit('player:teleport', { x: s.cx + lx * c + lz * n, z: s.cz - lx * n + lz * c, heading: lh + s.angle });
  }, { id, lx, lz, lh });
  const camLocal = (id, cam, look) => page.evaluate(async ({ id, cam, look }) => {
    const BC = window.BC, rt = BC.hotels.list.find((h) => h.hotel.id === id), s = rt.site;
    const c = Math.cos(s.angle), n = Math.sin(s.angle);
    const W = (p) => [s.cx + p[0] * c + p[2] * n, s.y + p[1], s.cz - p[0] * n + p[2] * c];
    BC.setPaused('shots', true);
    const at = W(cam);
    await BC.world.buildAround(at[0], at[2]);
    BC.world.update(0, { x: at[0], z: at[2] });
    BC.camera.position.set(...at);
    BC.camera.lookAt(...W(look));
    BC.world.sky.update(BC.camera);
    BC.graphics.update(0, { x: at[0], z: at[2] });
    BC.graphics.render(0);
  }, { id, cam, look });
  const resume = () => page.evaluate(() => window.BC.setPaused('shots', false));
  const shot = (name) => page.screenshot({ path: path.join(outDir, `${name}.png`) });
  const hour = (h) => page.evaluate((h) => window.BC.events.emit('time:set', { hour: h }), h);

  for (const id of HOTELS) {
    if (!only.includes(id)) continue;
    console.log(`--- ${id}`);
    await hour(12);
    await putLocal(id, 0, 40);
    const built = await wait((id) => window.BC.hotels.list.find((h) => h.hotel.id === id).built, id, 60000);
    check(built, `${id}: inside built after its stream group arrived`);
    await page.waitForTimeout(800);
    await camLocal(id, [26, 9, 64], [0, 14, 0]); await shot(`${id}-outside-day`);
    await hour(21); await page.waitForTimeout(300);
    await camLocal(id, [26, 9, 64], [0, 14, 0]); await shot(`${id}-outside-night`);
    await resume(); await hour(19);

    // Walk in through the door.
    await putLocal(id, 0, 19);
    await page.waitForTimeout(600);
    for (let z = 18; z >= 10; z -= 1) { await putLocal(id, 0, z); await page.waitForTimeout(120); }
    const inside = await wait((id) => window.BC.hotels.inside?.hotel.id === id, id, 10000);
    check(inside, `${id}: walking in through the door counts as inside`);
    const cam = await page.evaluate(() => window.BC.cameraRig.mode === window.BC.cameraRig.cfg.indoor);
    check(cam, `${id}: indoor camera`);
    await page.waitForTimeout(1200);
    await shot(`${id}-lobby-chase`);
    await camLocal(id, [0, 3.2, 14], [0, 1.4, -14]); await shot(`${id}-restaurant`);
    await resume();

    // Sit at a free table and order.
    const tbl = await page.evaluate((id) => {
      const rt = window.BC.hotels.list.find((h) => h.hotel.id === id);
      const t = rt.place.tables.find((x) => !rt.people.dinerTables.has(x));
      return t && { x: t.x, z: t.z };
    }, id);
    check(!!tbl, `${id}: a free table`);
    if (!tbl) continue;
    await page.evaluate((t) => { window.BC.events.emit('player:teleport', { x: t.x + 1.6, z: t.z + 0.3, heading: 0 }); window.BC.events.emit('player:damage', { amount: 70 }); window.BC.economy.addCash(2000); }, tbl);
    await page.waitForTimeout(400);
    await page.evaluate(() => window.BC.events.emit('input:action'));
    const seated = await page.evaluate(() => !!window.BC.hotels.seat && window.BC.player.frozen);
    check(seated, `${id}: sat down (frozen on the chair)`);
    const choosing = await wait(() => window.BC.hotels.meal?.state === 'choosing', null, 90000);
    check(choosing, `${id}: the waiter walked to the table and the menu card opened`);
    if (!choosing) { console.log('  meal', await page.evaluate(() => { const m = window.BC.hotels.meal, s = m?.server; return JSON.stringify({ state: m?.state, s: s && { x: s.x, z: s.z, path: s.path } }); })); continue; }
    await ui(true);
    await shot(`${id}-menu`);
    const before = await page.evaluate(() => ({ cash: window.BC.economy.getCash(), hp: window.BC.player.health.value }));
    // Pick two things: one from the first tab, one drink.
    const picked = await page.evaluate(() => {
      const panel = document.querySelector('#hotel-menu .panel');
      const ids = [];
      const plus = () => panel.querySelector('[data-plus]');
      ids.push(plus().dataset.plus); plus().click();
      const drink = panel.querySelector('[data-tab="drink"]');
      if (drink) { drink.click(); ids.push(plus().dataset.plus); plus().click(); }
      return ids;
    });
    const expect = await page.evaluate((ids) => {
      const m = window.BC.config.get('menu').items, p = window.BC.config.get('economy').prices;
      return { price: ids.reduce((s, id) => s + p[m[id].kind][id], 0), heal: ids.reduce((s, id) => s + m[id].heal, 0) };
    }, picked);
    await page.evaluate(() => document.querySelector('#hotel-menu [data-order]').click());
    await ui(false);
    const after = await page.evaluate(() => window.BC.economy.getCash());
    check(before.cash - after === expect.price, `${id}: paid ৳${before.cash - after} for ${picked.join(' + ')} (expected ৳${expect.price})`);
    const served = await wait(() => window.BC.hotels.meal?.state === 'eating', null, 120000);
    check(served, `${id}: the waiter brought the order to the table`);
    const t = await page.evaluate(() => { const s = window.BC.hotels.seat; return { x: s.chair.x, z: s.chair.z, tx: s.table.x, tz: s.table.z, y: window.BC.hotels.seat.rt.site.y }; });
    await page.evaluate(({ t }) => {
      const BC = window.BC; BC.setPaused('shots', true);
      const dx = t.x - t.tx, dz = t.z - t.tz;
      BC.camera.position.set(t.tx + dx * 1.9 + dz * 0.6, t.y + 1.75, t.tz + dz * 1.9 - dx * 0.6);
      BC.camera.lookAt(t.tx, t.y + 0.8, t.tz);
      BC.graphics.render(0);
    }, { t });
    await shot(`${id}-table`);
    await resume();
    await page.waitForTimeout(1500);
    await shot(`${id}-eating-chase`);
    const done = await wait(() => window.BC.hotels.meal?.state === 'done', null, 90000);
    check(done, `${id}: ate everything`);
    const hp = await page.evaluate(() => window.BC.player.health);
    check(hp.value >= Math.min(hp.max, before.hp + expect.heal) - 1, `${id}: health ${before.hp} → ${hp.value} (+${expect.heal} expected)`);
    await page.evaluate(() => window.BC.events.emit('input:jump'));
    await page.waitForTimeout(300);
    check(await page.evaluate(() => !window.BC.hotels.seat && !window.BC.player.frozen), `${id}: stood up again`);

    // The bar and dance floor (only hotels with a bar).
    const hasBar = await page.evaluate((id) => !!window.BC.hotels.list.find((h) => h.hotel.id === id).place.stools.length, id);
    if (hasBar) {
      const st = await page.evaluate((id) => { const s = window.BC.hotels.list.find((h) => h.hotel.id === id).place.stools.find((x) => !x.taken); return s && { x: s.x, z: s.z }; }, id);
      await page.evaluate((s) => window.BC.events.emit('player:teleport', { x: s.x, z: s.z + 0.4, heading: 0 }), st);
      await page.waitForTimeout(300);
      await page.evaluate(() => window.BC.events.emit('input:action'));
      check(await page.evaluate(() => window.BC.hotels.seat?.kind === 'stool'), `${id}: sat at the bar`);
      const card = await wait(() => window.BC.hotels.meal?.state === 'choosing', null, 60000);
      check(card, `${id}: the bartender came over`);
      const drinksFirst = await page.evaluate(() => document.querySelector('#hotel-menu [data-tab].on')?.dataset.tab);
      check(drinksFirst === 'drink', `${id}: bar card opens on drinks (${drinksFirst})`);
      await page.evaluate(() => { const p = document.querySelector('#hotel-menu [data-plus="mint_mojito"]') || document.querySelector('#hotel-menu [data-plus]'); p.click(); document.querySelector('#hotel-menu [data-order]').click(); });
      check(await wait(() => window.BC.hotels.meal?.state === 'eating', null, 60000), `${id}: drink served on the counter`);
      await page.evaluate(() => window.BC.events.emit('input:jump'));
      await page.waitForTimeout(300);
      // Dance floor (local x 12…27, z −20…−3).
      await putLocal(id, 19, -10, -Math.PI / 2);
      await hour(22);
      await page.waitForTimeout(600);
      await page.evaluate(() => window.BC.events.emit('input:action'));
      await page.waitForTimeout(1500);
      check(await page.evaluate(() => window.BC.player.action === 'dance'), `${id}: dancing on the dance floor`);
      await shot(`${id}-dance-chase`);
      await camLocal(id, [9.5, 3.6, -1], [20, 0.8, -14]); await shot(`${id}-bar`);
      await resume();
      await page.evaluate(() => window.BC.events.emit('player:action', { name: 'dance', on: false }));
    }

    // Walk out.
    await putLocal(id, 0, 13, 0);
    await page.waitForTimeout(300);
    for (let z = 14; z <= 20; z += 1) { await putLocal(id, 0, z, 0); await page.waitForTimeout(120); }
    check(await wait(() => !window.BC.hotels.inside, null, 8000), `${id}: walked out again`);
  }

  // ---- every dish on a grid (and its size)
  if (only.includes('gallery')) {
    const stats = await page.evaluate(async (SUB) => {
      const THREE = await import('three');
      const { DishMaker, makeDish } = await import(`${SUB}/src/features/hotels/dishes.js`);
      const BC = window.BC;
      const items = BC.config.get('menu').items;
      const kit = await BC.assets.load('model.food.kit');
      const maker = new DishMaker(items, kit);
      const scene = new THREE.Scene(); scene.background = new THREE.Color('#2a2438');
      scene.add(new THREE.HemisphereLight('#ffffff', '#555566', 2.2));
      const sun = new THREE.DirectionalLight('#ffffff', 2.2); sun.position.set(2, 6, 4); scene.add(sun);
      const mats = { food: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), glass: new THREE.MeshStandardMaterial({ color: '#e8f6ff', transparent: true, opacity: 0.35, depthWrite: false }) };
      const ids = Object.keys(items), cols = 12, out = [];
      ids.forEach((id, i) => {
        const d = makeDish(maker, id, mats, 1);
        d.group.position.set((i % cols - (cols - 1) / 2) * 0.42, 0, Math.floor(i / cols) * 0.42);
        scene.add(d.group);
        const g = maker.get(id);
        out.push({ id, tris: ['base', 'food', 'glass'].reduce((s, k) => s + (g[k] ? g[k].attributes.position.count / 3 : 0), 0) });
      });
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 6), new THREE.MeshLambertMaterial({ color: '#f2ece0' }));
      floor.rotation.x = -Math.PI / 2; floor.position.z = 1; scene.add(floor);
      const cam = new THREE.PerspectiveCamera(32, 1100 / 620, 0.05, 50);
      cam.position.set(0, 2.6, 4.4); cam.lookAt(0, 0, 1.05);
      BC.setPaused('shots', true);
      BC.renderer.render(scene, cam);
      return out;
    }, SUB);
    await page.screenshot({ path: path.join(outDir, 'food.png') });
    await resume();
    const total = stats.reduce((s, x) => s + x.tris, 0);
    console.log(`dishes: ${stats.length}, triangles ${total} (biggest: ${stats.sort((a, b) => b.tris - a.tris).slice(0, 4).map((x) => `${x.id} ${x.tris}`).join(', ')})`);
    check(stats.length >= 58 && stats.every((x) => x.tris > 0), `every menu item has a 3D dish (${stats.length})`);
  }

  if (problems.length) { console.log('CONSOLE ERRORS:'); for (const p of problems) console.log('  ', p); }
  console.log(problems.length || fails.length ? `HOTEL CHECK FAILED (${fails.length} checks, ${problems.length} errors)` : 'HOTEL CHECK PASSED');
  await browser.close();
  server.close();
  process.exit(problems.length || fails.length ? 1 : 0);
})();
