// Ride check (Roadmap 2, Session 6) — a tool for Claude sessions, not part of the game.
// Boots the game headless and:
//   bus    stands at a bus stop → a bus comes → E boards (fare paid) → rides two stops (⏩) →
//          gets off; photos inside + outside; police stop the bus at 2 stars
//   metro  walks into an MRT station (stairs) → waits on the platform → boards → picks a station
//          on the big map ("get off here") → arrives there on the street; photos
//   train  walks onto Kamalapur's platform → boards → gets off at the next station (Jump)
//   counts passengers inside per quality (low / medium / high) and how many are real 3D
//   night  photos of the train station and a bus at night
// and fails on any console error. The headless browser renders only ~5 frames a second and the game
// caps a frame at 0.05 s, so game time runs ~4× slower than real time: the waits are long.
//
//   node tools/ride-check.js --three <dir of three@0.170.0> --out <folder> [--quality medium] [--only bus,metro,train,counts,night]
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
const only = arg('only', 'bus,metro,train,counts,night').split(',');
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
  page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); if (/buses:|railway:|metro:/.test(m.text())) console.log('  game:', m.text()); });
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
  const fare = (id) => page.evaluate((id) => window.BC.config.get('economy').fares[id], id);
  const state = () => page.evaluate(() => ({ mode: window.BC.player.mode, riding: !!window.BC.ride, x: window.BC.player.position.x, y: window.BC.player.position.y, z: window.BC.player.position.z }));
  const pressE = () => ev('input:action', {});
  const click = (sel) => page.evaluate((sel) => document.querySelector(sel)?.click(), sel);
  const hud = () => page.evaluate(() => ({ next: document.querySelector('#ride-hud .rh-bn')?.textContent, en: document.querySelector('#ride-hud .rh-en')?.textContent, dest: document.querySelector('#ride-hud .rh-dest')?.textContent }));
  const toDoor = () => page.evaluate(() => {
    const s = window.BC.buses.service, v = s.bus, c = window.BC.buses.cabin;
    const d = c.doors.find((x) => x.side > 0 && x.z > 0);
    const x = v.x + Math.cos(v.heading) * (d.x + 1.2) + Math.sin(v.heading) * d.z, z = v.z - Math.sin(v.heading) * (d.x + 1.2) + Math.cos(v.heading) * d.z;
    window.BC.events.emit('player:teleport', { x, z, heading: v.heading });
  });
  // Real 3D people and trains are streamed (Medium/High): start them now.
  await page.evaluate(() => { for (const id of ['model.people', 'image.people.skins', 'model.train.highSpeedFront', 'model.train.highSpeedWagon', 'model.train.locomotivePassengerWagon']) window.BC.streamer.start(id); });
  if (quality !== 'low') check(await wait(() => window.BC.crowd.realState === 'ready', null, 240000), '3D people model loaded');
  await page.evaluate(() => window.BC.economy.addCash(5000));

  // ---------------------------------------------------------------- bus
  if (only.includes('bus')) {
    console.log('--- bus');
    const stop = await page.evaluate(() => {
      const R = window.BC.world.roads;
      const s = R.busStops.find((b) => b.c >= 3 && b.c <= 11 && b.r >= 3 && b.r <= 12) || R.busStops[0];
      return { id: s.id, sx: s.sx, sz: s.sz, heading: s.heading, name: s.name };
    });
    console.log(`  stop ${stop.id}: ${stop.name.bn} / ${stop.name.en}`);
    await ev('player:teleport', { x: stop.sx, z: stop.sz, heading: stop.heading });
    check(await wait(() => !!window.BC.buses.service, null, 15000), 'standing at a stop calls a bus');
    check(await wait(() => window.BC.buses.service?.state === 'atStop', null, 300000), 'the bus drives up and stops at the stop');
    await page.waitForTimeout(1500);
    await shot('bus-arrives');
    await toDoor();
    await page.waitForTimeout(400);
    const before = await cash();
    await pressE();
    check(await wait(() => window.BC.buses.service?.state === 'riding', null, 30000), 'E at the door: Shoumik gets on');
    const paid = before - await cash();
    check(paid === await fare('bus'), `bus fare paid: ৳${paid} (economy.json → fares.bus)`);
    const bp = await page.evaluate(() => ({ n: window.BC.buses.passengers.count(window.BC.buses.service.unit), mode: window.BC.player.mode, sit: window.BC.player.vehicle?.id === window.BC.buses.service.bus.id }));
    check(bp.mode === 'vehicle' && bp.sit, 'he is in the bus (mode vehicle, player.vehicle = the bus)');
    check(bp.n > 0, `passengers inside the bus (${bp.n})`);
    await page.waitForTimeout(1500);
    const h = await hud();
    console.log(`  HUD next stop: ${h.next} · ${h.en}`);
    check(!!h.next && h.next !== '—', 'HUD shows the next stop (Bangla first, English second)');
    await shot('bus-inside');
    await click('#ride-hud [data-view]');
    await page.waitForTimeout(1500);
    await shot('bus-outside');
    await click('#ride-hud [data-view]');
    // Two stops: skip to the first (stay on), then ask to get off and skip to the second.
    for (let k = 0; k < 2; k++) {
      const next = await page.evaluate(() => window.BC.buses.upcoming(1)[0]?.id);
      if (k === 1) await click('#ride-hud [data-off]');
      await click('#ride-hud [data-skip]');
      await page.waitForTimeout(1500);
      const ok = await wait((id) => window.BC.buses.service?.lastStop?.id === id || (!window.BC.ride && window.BC.player.mode === 'onFoot'), next, 240000);
      check(ok, `stop ${k + 1} reached (${next})`);
      if (k === 0) check(await page.evaluate(() => !!window.BC.ride), 'still riding after the first stop');
    }
    check(await wait(() => !window.BC.ride && window.BC.player.mode === 'onFoot', null, 15000), 'got off at the second stop (on foot again)');
    const at = await state();
    const near = await page.evaluate(({ x, z }) => {
      const s = window.BC.world.roads.busStops.reduce((a, b) => (Math.hypot(b.sx - x, b.sz - z) < Math.hypot(a.sx - x, a.sz - z) ? b : a));
      return { id: s.id, d: Math.hypot(s.sx - x, s.sz - z) };
    }, at);
    check(near.d < 12, `standing next to stop ${near.id} (${near.d.toFixed(1)} m)`);
    await page.waitForTimeout(1500);
    await shot('bus-got-off');

    // Police: 2 stars → the bus is stopped and he is pushed out.
    await wait(() => !window.BC.buses.service, null, 90000); // the old bus leaves
    const st2 = await page.evaluate(() => { const p = window.BC.player.position; return window.BC.world.roads.busStops.reduce((a, b) => (Math.hypot(b.sx - p.x, b.sz - p.z) < Math.hypot(a.sx - p.x, a.sz - p.z) ? b : a)); });
    await ev('player:teleport', { x: st2.sx, z: st2.sz, heading: st2.heading });
    await page.evaluate(() => { window.BC.economy.addCash(0); });
    const came = await wait(() => window.BC.buses.service?.state === 'atStop', null, 300000);
    if (came) {
      await toDoor();
      await page.waitForTimeout(300);
      await pressE();
      await wait(() => window.BC.buses.service?.state === 'riding', null, 30000);
      await ev('wanted:set', { stars: 2 });
      const stopped = await wait(() => !window.BC.ride && window.BC.player.mode === 'onFoot', null, 180000);
      check(stopped, 'with 2 stars the police stop the bus and push him out');
      await ev('wanted:clear', {});
    } else check(false, 'a second bus came for the police test');
  }

  // ---------------------------------------------------------------- metro
  if (only.includes('metro')) {
    console.log('--- metro');
    const st = await page.evaluate(() => { const s = window.BC.metro.rides[0].stations[0]; return { id: s.id, foot: s.feet[0] }; });
    await ev('player:teleport', { x: st.foot.x, z: st.foot.z, heading: 0 });
    await page.waitForTimeout(500);
    await pressE();
    check(await wait(() => window.BC.metro.rides[0].state === 'platform', null, 30000), 'E at the stairs: Shoumik waits on the platform');
    const y = (await state()).y;
    check(y > 8, `he stands up on the platform (y ${y.toFixed(1)} m)`);
    await page.waitForTimeout(800);
    await shot('metro-platform');
    // Bring the soonest train close (the test does not wait minutes).
    await page.evaluate(() => {
      const r = window.BC.metro.rides[0];
      const { train } = r.soonest(r.station);
      const s = r.station.s;
      train.dir = train.s < s ? 1 : -1;
      train.s = s - train.dir * 50;
      train.wait = 0; train.hold = 0; train.stoppedAt = null; train.target = null;
    });
    check(await wait(() => { const r = window.BC.metro.rides[0]; return !!r.waitingTrain(r.station); }, null, 240000), 'a train stops at the platform');
    await page.waitForTimeout(1200);
    await shot('metro-train-in');
    const before = await cash();
    await pressE();
    check(await wait(() => window.BC.metro.rides[0].state === 'riding', null, 30000), 'E: he gets on the train');
    const mpaid = before - await cash();
    check(mpaid === await fare('metro'), `metro fare paid (৳${mpaid})`);
    const mp = await page.evaluate(() => { const r = window.BC.metro.rides[0]; return window.BC.metro.passengers.count(r.unit); });
    check(mp > 0, `passengers in his car (${mp})`);
    await page.waitForTimeout(2500);
    await shot('metro-inside');
    // Pick the station furthest away on the big map.
    const dest = await page.evaluate(() => {
      const r = window.BC.metro.rides[0];
      const here = r.station;
      const far = r.stations.reduce((a, b) => (Math.abs(b.s - here.s) > Math.abs(a.s - here.s) ? b : a));
      window.BC.events.emit('map:open');
      const big = window.BC.features.get('minimap').bigMap;
      const blip = big.blips.get('metro-stations').find((b) => b.id === far.id);
      big.selected = blip;
      big.showInfo();
      const btn = document.querySelector('#big-map [data-act]');
      const had = !!btn;
      btn?.click();
      return { id: far.id, had, open: big.isOpen };
    });
    check(dest.had, 'big map: a station shows "এখানে নামবো / Get off here" while riding');
    check(!dest.open, 'tapping it closes the map');
    const h = await hud();
    console.log(`  HUD: next ${h.next} · ${h.en} | ${h.dest}`);
    check(!!h.dest && h.dest.length > 3, 'HUD shows the picked station');
    check(await page.evaluate(() => !!window.BC.features.get('minimap').route.target), 'the GPS shows the way to it');
    await click('#ride-hud [data-view]');
    await page.waitForTimeout(2000);
    await shot('metro-outside');
    await click('#ride-hud [data-view]'); // back to the inside view (the choice is kept between rides)
    for (let i = 0; i < 8; i++) {
      if (await page.evaluate(() => window.BC.metro.rides[0].state !== 'riding')) break;
      await click('#ride-hud [data-skip]');
      await page.waitForTimeout(1200);
      await wait(() => { const r = window.BC.metro.rides[0]; return r.state !== 'riding' || !!r.train?.stoppedAt; }, null, 180000);
      await page.waitForTimeout(1500);
    }
    check(await wait(() => window.BC.metro.rides[0].state === 'none' && window.BC.player.mode === 'onFoot', null, 90000), 'the ride ends at the picked station');
    const end = await page.evaluate((id) => { const st = window.BC.metro.rides[0].stations.find((s) => s.id === id); const p = window.BC.player.position; return Math.min(...st.feet.map((f) => Math.hypot(f.x - p.x, f.z - p.z))); }, dest.id);
    check(end < 3, `on the street at the stairs of ${dest.id} (${end.toFixed(1)} m)`);
    await page.waitForTimeout(1000);
    await shot('metro-arrived');
  }

  // ---------------------------------------------------------------- train
  if (only.includes('train')) {
    console.log('--- train');
    const st = await page.evaluate(() => { const r = window.BC.railway.rides[0]; return r.stations[0].platform(); });
    await ev('player:teleport', { x: st.x, z: st.z, heading: st.heading });
    await page.waitForTimeout(800);
    const y = (await state()).y;
    check(y > 0.5, `standing on Kamalapur's platform (y ${y.toFixed(2)} m)`);
    await shot('train-station');
    await page.evaluate(() => {
      const r = window.BC.railway.rides[0];
      const train = r.trains[0];
      const s = r.stations[0].s;
      train.dir = 1; // towards Coconut Coast / Sobujpur
      train.s = s - train.dir * 50;
      train.wait = 0; train.hold = 0; train.stoppedAt = null; train.target = null;
    });
    check(await wait(() => { const r = window.BC.railway.rides[0]; return !!r.waitingTrain(r.stations[0]); }, null, 240000), 'the train stops at Kamalapur');
    await page.waitForTimeout(1500);
    await shot('train-in');
    const before = await cash();
    await pressE();
    check(await wait(() => window.BC.railway.rides[0].state === 'riding', null, 30000), 'E: he gets on the train');
    const tpaid = before - await cash();
    check(tpaid === await fare('train'), `train fare paid (৳${tpaid})`);
    const tp = await page.evaluate(() => { const r = window.BC.railway.rides[0]; return window.BC.railway.passengers.count(r.unit); });
    check(tp > 0, `passengers in his coach (${tp})`);
    await page.waitForTimeout(2500);
    await shot('train-inside');
    await click('#ride-hud [data-view]');
    await page.waitForTimeout(2500);
    await shot('train-outside');
    await click('#ride-hud [data-view]');
    await wait(() => !window.BC.railway.rides[0].train.stoppedAt, null, 240000); // it leaves Kamalapur
    const next = await page.evaluate(() => window.BC.railway.rides[0].train.nextStation()?.id);
    check(!!next, `HUD knows the next station (${next})`);
    await ev('input:jump', {});
    check(await page.evaluate(() => window.BC.rider.offQueued), 'Jump: he will get off at the next station');
    for (let i = 0; i < 4; i++) {
      if (await page.evaluate(() => window.BC.railway.rides[0].state !== 'riding')) break;
      await click('#ride-hud [data-skip]');
      await page.waitForTimeout(1200);
      await wait(() => { const r = window.BC.railway.rides[0]; return r.state !== 'riding' || !!r.train?.stoppedAt; }, null, 240000);
      await page.waitForTimeout(1500);
    }
    check(await wait(() => window.BC.railway.rides[0].state === 'none' && window.BC.player.mode === 'onFoot', null, 90000), `got off at ${next}`);
    const on = await page.evaluate((id) => { const st = window.BC.railway.rides[0].stations.find((s) => s.id === id); const p = window.BC.player.position; return st.onPlatform(p.x, p.z, 1); }, next);
    check(on, 'standing on that station\'s platform');
    await page.waitForTimeout(1500);
    await shot('train-arrived');
  }

  // ---------------------------------------------------------------- counts
  if (only.includes('counts')) {
    console.log('--- passengers per quality');
    const want = await page.evaluate(() => window.BC.config.get('transit').passengers.count);
    for (const q of ['low', 'medium', 'high']) {
      await page.evaluate((q) => window.BC.setQuality(q), q);
      const n = await page.evaluate(() => {
        const P = window.BC.railway.passengers;
        const u = window.BC.railway.rides[0].trains[0].units[1];
        window.BC.events.emit('player:teleport', u.pose({}));
        P.setUnits([]);
        P.setUnits([u]);
        return P.count(u);
      });
      await page.waitForTimeout(2500);
      const real = await page.evaluate(() => { const P = window.BC.railway.passengers; let k = 0; for (const e of P.units.values()) for (const r of e.riders) if (r.person.real) k++; return k; });
      console.log(`  ${q}: ${n} passengers in a train car (data: ${want[q].car}), ${real} drawn as real 3D`);
      check(n === want[q].car, `${q}: ${want[q].car} passengers per car`);
      if (q === 'low') check(real === 0, 'low: passengers are code-built');
    }
    await page.evaluate((q) => window.BC.setQuality(q), quality);
  }

  // ---------------------------------------------------------------- night
  if (only.includes('night')) {
    console.log('--- night');
    await ev('time:set', { hour: 21 });
    const st = await page.evaluate(() => window.BC.railway.rides[0].stations[0].platform());
    await ev('player:teleport', { x: st.x, z: st.z, heading: st.heading });
    await page.waitForTimeout(2500);
    await shot('night-train-station');
    const stop = await page.evaluate(() => { const R = window.BC.world.roads; return R.busStops.filter((b) => b.c >= 3 && b.c <= 11 && b.r >= 3 && b.r <= 12)[3]; });
    await ev('player:teleport', { x: stop.sx, z: stop.sz, heading: stop.heading });
    if (await wait(() => window.BC.buses.service?.state === 'atStop', null, 300000)) {
      await page.waitForTimeout(1000);
      await shot('night-bus');
      await toDoor();
      await page.waitForTimeout(300);
      await pressE();
      if (await wait(() => window.BC.buses.service?.state === 'riding', null, 30000)) {
        await page.waitForTimeout(2000);
        await shot('night-bus-inside');
      }
    }
    await ev('time:set', { hour: 12 });
  }

  console.log(problems.length ? `console errors:\n  ${problems.slice(0, 10).join('\n  ')}` : 'no console errors');
  if (problems.length) fails.push('console errors');
  await browser.close();
  server.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall ride checks passed');
  process.exit(fails.length ? 1 : 0);
})();
