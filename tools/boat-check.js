// Boat check (Roadmap 2, Session 7) — a tool for Claude sessions, not part of the game.
// Boots the game headless and:
//   ghats   every ghat in data/boats.json was placed (dry land + mooring spots), free country boats
//   drive   Buriganga ghat: E gets into a country boat, it moves on the river, steering into the
//           bank never leaves the water (bounces back), E steps out onto dry land
//   buy     the Hatirjheel boat club sells a speedboat and a yacht (Taka paid, save.owned.boats);
//           the boats then wait at another ghat (the beach) — drive the speedboat on the sea
//   ferry   Sadarghat: E at the ghat → pontoon → the launch comes alongside → E boards (fare),
//           passengers on deck, pick the Sea Mouth Ghat on the big map → arrive on the bank there
//   night   photos of a ghat and the launch at night
// and fails on any console error. Headless runs ~4× slow-motion (see tools/ride-check.js).
//
//   node tools/boat-check.js --three <dir of three@0.170.0> --out <folder> [--quality medium] [--only ghats,drive,buy,ferry,night]
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
const only = arg('only', 'ghats,drive,buy,ferry,night').split(',');
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
  page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); if (/boats:|ferry:/.test(m.text())) console.log('  game:', m.text()); });
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
  await page.evaluate(() => { const d = document.getElementById('debug-panel'); if (d) d.style.display = 'none'; });
  const wait = (fn, a, timeout = 240000) => page.waitForFunction(fn, a, { timeout, polling: 250 }).then(() => true, () => false);
  const shot = (name) => page.screenshot({ path: path.join(outDir, `${name}.png`) });
  const ev = (name, payload) => page.evaluate(({ name, payload }) => window.BC.events.emit(name, payload), { name, payload });
  const cash = () => page.evaluate(() => window.BC.save.data.cash);
  const pressE = () => ev('input:action', {});
  const click = (sel) => page.evaluate((sel) => document.querySelector(sel)?.click(), sel);
  const hold = (k, on) => page.evaluate(({ k, on }) => { window.BC.input.held[k] = on; }, { k, on });
  // The stick (move) may be reset by the input system: keep re-applying the test's value.
  const stick = (x, y) => page.evaluate(({ x, y }) => { window.__stick = { x, y }; }, { x, y });
  await page.evaluate(() => { const g = window.BC; const keep = () => { if (window.__stick) { g.input.move.x = window.__stick.x; g.input.move.y = window.__stick.y; } requestAnimationFrame(keep); }; keep(); });
  const toGhat = (id) => page.evaluate((id) => { const d = window.BC.boats.docks.find((x) => x.id === id); window.BC.events.emit('player:teleport', { x: d.land.x, z: d.land.z, heading: d.land.heading }); return !!d; }, id);
  const boat = () => page.evaluate(() => { const b = window.BC.boats.driving; return b && { type: b.type, x: b.x, z: b.z, speed: b.speed, water: window.BC.world.waterAt(b.x, b.z) }; });
  await page.evaluate(() => { for (const id of ['model.boats', 'model.people', 'image.people.skins']) window.BC.streamer.start(id); });
  check(await wait(() => window.BC.boats.kitState === 'ready', null, 120000), 'boat models (boats.glb) loaded');
  await page.evaluate(() => window.BC.economy.addCash(400000));

  // ---------------------------------------------------------------- ghats
  if (only.includes('ghats')) {
    console.log('--- ghats');
    const r = await page.evaluate(() => ({ want: window.BC.config.get('boats').docks.list.length, docks: window.BC.boats.docks.map((d) => ({ id: d.id, spots: d.spots.length, wet: window.BC.world.waterAt(d.land.x, d.land.z) })) }));
    for (const d of r.docks) console.log(`  ${d.id}: ${d.spots} mooring spots`);
    check(r.docks.length === r.want, `all ${r.want} ghats placed (${r.docks.length})`);
    check(r.docks.every((d) => d.spots > 0 && !d.wet), 'every ghat stands on dry land with mooring spots');
  }

  // ---------------------------------------------------------------- drive
  if (only.includes('drive')) {
    console.log('--- drive (Buriganga)');
    await toGhat('ghat-buriganga');
    check(await wait(() => window.BC.boats.list.some((b) => b.type === 'nouka' && b.tags.dock?.id === 'ghat-buriganga'), null, 30000), 'free country boats wait at the Buriganga ghat');
    await page.waitForTimeout(1500);
    await shot('ghat-buriganga');
    await pressE();
    check(await wait(() => !!window.BC.boats.driving && window.BC.player.mode === 'vehicle', null, 20000), 'E: Shoumik gets into the boat');
    const b0 = await boat();
    if (!b0) throw new Error('not in a boat — stopping the drive test');
    await stick(0, 1);
    await hold('sprint', true);
    await page.waitForTimeout(12000);
    const b1 = await boat();
    console.log(`  moved ${Math.hypot(b1.x - b0.x, b1.z - b0.z).toFixed(1)} m, speed ${b1.speed.toFixed(1)} m/s, on ${b1.water}`);
    check(Math.hypot(b1.x - b0.x, b1.z - b0.z) > 3 && !!b1.water, 'the boat moves on the river');
    await shot('drive-nouka');
    // Point it at the bank (north = the city side) and keep going: it must stay on the water.
    const off = await page.evaluate(async () => {
      const g = window.BC;
      const b = g.boats.driving;
      b.heading = Math.PI;
      let dry = 0;
      for (let i = 0; i < 80; i++) { await new Promise((r) => setTimeout(r, 250)); if (!g.world.waterAt(b.x, b.z)) dry++; }
      return { dry, z: b.z };
    });
    check(off.dry === 0, `driving into the bank never leaves the water (${off.dry} dry samples)`);
    await hold('sprint', false);
    await stick(0, 0);
    await wait(() => Math.abs(window.BC.boats.driving.speed) < 1, null, 60000);
    check(await page.evaluate(() => !!window.BC.boats.shore()), 'dry land is in reach at the bank');
    await pressE();
    check(await wait(() => !window.BC.boats.driving && window.BC.player.mode === 'onFoot', null, 20000), 'E: he steps out onto the bank');
    check(await page.evaluate(() => { const p = window.BC.player.position; return !window.BC.world.waterAt(p.x, p.z); }), 'standing on dry land');
    await page.waitForTimeout(1000);
    await shot('drive-out');
  }

  // ---------------------------------------------------------------- buy
  if (only.includes('buy')) {
    console.log('--- buy (Hatirjheel boat club)');
    const before = await cash();
    await ev('shop:open', { id: 'boat-shop' });
    await page.waitForTimeout(500);
    await shot('boat-shop');
    await click('[data-buy="speedboat"]');
    await page.waitForTimeout(300);
    await click('#shop-panel .panel-close');
    await ev('shop:open', { id: 'boat-shop' });
    await click('[data-buy="yacht"]');
    await page.waitForTimeout(300);
    await click('#shop-panel .panel-close');
    const prices = await page.evaluate(() => window.BC.config.get('economy').prices.boats);
    const paid = before - await cash();
    check(paid === prices.speedboat + prices.yacht, `speedboat + yacht paid (৳${paid})`);
    const owned = await page.evaluate(() => window.BC.save.data.owned.boats.map((b) => b.type));
    check(owned.includes('speedboat') && owned.includes('yacht'), `owned boats saved (${owned.join(', ')})`);
    await toGhat('ghat-beach');
    check(await wait(() => ['speedboat', 'yacht'].every((t) => window.BC.boats.list.some((b) => b.type === t && b.tags.dock?.id === 'ghat-beach')), null, 30000), 'his speedboat and yacht wait at the beach jetty');
    await page.waitForTimeout(1500);
    await shot('ghat-beach');
    await page.evaluate(() => { const b = window.BC.boats.list.find((x) => x.type === 'speedboat' && !x.driver); window.BC.boats.enter(b); });
    await stick(0, 1);
    await hold('sprint', true);
    await wait(() => window.BC.boats.driving?.speed > 15, null, 90000);
    const sea = await boat();
    console.log(`  speedboat on the ${sea.water}: ${sea.speed.toFixed(1)} m/s`);
    check(sea.water === 'sea' && sea.speed > 15, 'the speedboat runs fast on the sea');
    await page.waitForTimeout(1500);
    await shot('speedboat-sea');
    await hold('sprint', false);
    await stick(0.8, 0.6);
    await page.waitForTimeout(3000);
    await shot('speedboat-turn');
    await stick(0, 0);
    await page.evaluate(() => {
      const g = window.BC;
      g.events.emit('vehicle:forceExit');
      const y = g.boats.list.find((x) => x.type === 'yacht');
      g.events.emit('player:teleport', { x: y.x, z: y.z });
      g.boats.enter(y);
    });
    await stick(0, 1);
    await hold('sprint', true);
    await page.waitForTimeout(6000);
    await shot('yacht');
    await hold('sprint', false);
    await stick(0, 0);
    await ev('vehicle:forceExit', {});
    check(await page.evaluate(() => window.BC.player.mode === 'onFoot' && !window.BC.boats.driving), 'out of the yacht');
  }

  // ---------------------------------------------------------------- ferry
  if (only.includes('ferry')) {
    console.log('--- ferry (Sadarghat launch)');
    const st = await page.evaluate(() => { const s = window.BC.ferry.ride.stations[1]; return { id: s.id, foot: s.feet[0] }; });
    await ev('player:teleport', { x: st.foot.x, z: st.foot.z, heading: Math.PI });
    await page.waitForTimeout(800);
    await pressE();
    check(await wait(() => window.BC.ferry.ride.state === 'platform', null, 30000), 'E at Sadarghat: he waits on the pontoon');
    await page.evaluate(() => {
      const r = window.BC.ferry.ride, tr = r.trains[0], s = r.station.s;
      tr.dir = 1; tr.s = s - 50; tr.wait = 0; tr.hold = 0; tr.stoppedAt = null; tr.target = null;
    });
    check(await wait(() => { const r = window.BC.ferry.ride; return !!r.waitingTrain(r.station); }, null, 240000), 'the launch comes alongside');
    await page.waitForTimeout(1200);
    await shot('ferry-pontoon');
    const before = await cash();
    await pressE();
    check(await wait(() => window.BC.ferry.ride.state === 'riding', null, 30000), 'E: he boards the launch');
    const fare = await page.evaluate(() => window.BC.config.get('economy').fares.launch);
    const paid = before - await cash();
    check(paid === fare, `launch fare paid (৳${paid})`);
    const n = await page.evaluate(() => window.BC.ferry.passengers.count(window.BC.ferry.ride.unit));
    check(n > 0, `passengers on the launch (${n})`);
    await page.waitForTimeout(2500);
    await shot('ferry-inside');
    const picked = await page.evaluate(() => {
      window.BC.events.emit('map:open');
      const big = window.BC.features.get('minimap').bigMap;
      const b = big.blips.get('launch-ghats').find((x) => x.id === 'ghat-sea');
      big.selected = b; big.showInfo();
      const btn = document.querySelector('#big-map [data-act]');
      btn?.click();
      return !!btn;
    });
    check(picked, 'big map: "get off here" at the Sea Mouth Ghat');
    await click('#ride-hud [data-view]');
    await page.waitForTimeout(2500);
    await shot('ferry-outside');
    await click('#ride-hud [data-view]');
    for (let i = 0; i < 6; i++) {
      if (await page.evaluate(() => window.BC.ferry.ride.state !== 'riding')) break;
      await click('#ride-hud [data-skip]');
      await page.waitForTimeout(1200);
      await wait(() => { const r = window.BC.ferry.ride; return r.state !== 'riding' || !!r.train?.stoppedAt; }, null, 240000);
      await page.waitForTimeout(1500);
    }
    check(await wait(() => window.BC.ferry.ride.state === 'none' && window.BC.player.mode === 'onFoot', null, 90000), 'the ride ends at the Sea Mouth Ghat');
    const end = await page.evaluate(() => { const s = window.BC.ferry.ride.stations.find((x) => x.id === 'ghat-sea'); const p = window.BC.player.position; return Math.hypot(s.feet[0].x - p.x, s.feet[0].z - p.z); });
    check(end < 3, `on the bank at the Sea Mouth Ghat (${end.toFixed(1)} m)`);
    await page.waitForTimeout(1000);
    await shot('ferry-arrived');
  }

  // ---------------------------------------------------------------- night
  if (only.includes('night')) {
    console.log('--- night');
    await ev('time:set', { hour: 21 });
    await toGhat('ghat-hatirjheel');
    await page.waitForTimeout(3000);
    await shot('night-ghat-hatirjheel');
    const st = await page.evaluate(() => window.BC.ferry.ride.stations[1].feet[0]);
    await ev('player:teleport', { x: st.x, z: st.z, heading: Math.PI });
    await page.evaluate(() => { const r = window.BC.ferry.ride, tr = r.trains[0], s = r.stations[1].s; tr.dir = 1; tr.s = s - 20; tr.wait = 0; tr.hold = 0; tr.stoppedAt = null; tr.target = null; });
    await page.waitForTimeout(4000);
    await shot('night-launch');
    await ev('time:set', { hour: 12 });
  }

  console.log(problems.length ? `console errors:\n  ${problems.slice(0, 10).join('\n  ')}` : 'no console errors');
  if (problems.length) fails.push('console errors');
  await browser.close();
  server.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall boat checks passed');
  process.exit(fails.length ? 1 : 0);
})();
