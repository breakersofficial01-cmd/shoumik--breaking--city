// Army check (Roadmap 2, Session 8) — a tool for Claude sessions, not part of the game.
// Boots the game headless and:
//   base     the cantonment is built only when Shoumik comes near (stream group), flat ground,
//            walls are solid, the zone name, the map blip, residents, a tank and a truck driving
//            round inside; photos of the gate, parade ground, yard and an overview
//   pass     the visitor pass at the guard post (E, Taka paid): inside with a pass = no star
//   gate     walking up to the gate: the guards shout a warning; inside without a pass = 1 star;
//            the guards come and arrest him → BUSTED (bail paid, out again, soldiers go back)
//   attack   shooting a soldier = 5 stars + the army alert: extra soldiers, army trucks and a tank
//            chase him; the tank turns its turret and fires shells that explode; sitting in a car
//            does not clear stars; WASTED still works (hospital screen)
//   counts   residents per quality (Low / Medium / High) match data/army.json → quality
//   night    photos of the gate and the parade ground at night
// and fails on any console error. Headless runs ~4× slow-motion (see tools/ride-check.js).
//
//   node tools/army-check.js --three <dir of three@0.170.0> --out <folder> [--quality medium] [--only base,pass,gate,attack,counts,night]
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
const only = arg('only', 'base,pass,gate,attack,counts,night').split(',');
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
  page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); if (/army/.test(m.text())) console.log('  game:', m.text()); });
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
  const report = () => page.evaluate(() => window.BC.army.report());
  const stars = () => page.evaluate(() => window.BC.army.stars);
  // A point in the base's own frame (metres from the pad centre, the gate on its −x side, see
  // data/army.json → base.angle) → teleport there, facing `deg` in the same frame (90 = into the gate).
  const goLocal = (x, z, deg = 90) => page.evaluate(({ x, z, deg }) => {
    const w = window.BC.army.toWorld(x, z);
    window.BC.events.emit('player:teleport', { x: w.x, z: w.z, heading: w.heading(deg) });
  }, { x, z, deg });
  // Photos: put the camera at a base-frame point [x, height, z] looking at another one.
  const look = (from, at) => page.evaluate(({ from, at }) => {
    const g = window.BC, a = g.army.toWorld(from[0], from[2]), b = g.army.toWorld(at[0], at[2]);
    const y = g.world.heightAt(a.x, a.z);
    g.cameraRig.lookOverride = { x: a.x, y: y + from[1], z: a.z, tx: b.x, ty: y + at[1], tz: b.z };
  }, { from, at });
  const unlook = () => page.evaluate(() => { window.BC.cameraRig.lookOverride = null; });
  await page.evaluate(() => {
    window.__ev = [];
    for (const n of ['toast:show', 'player:busted', 'player:died', 'army:alert', 'army:killed', 'crime:committed', 'explosion']) {
      window.BC.events.on(n, (p) => window.__ev.push({ n, p: JSON.parse(JSON.stringify(p || {})) }));
    }
    // The tool steers the camera for photos (the game keeps calling cameraRig.update).
    const rig = window.BC.cameraRig, cam = window.BC.camera;
    const orig = rig.update.bind(rig);
    rig.update = (...a) => { orig(...a); const o = rig.lookOverride; if (o) { cam.position.set(o.x, o.y, o.z); cam.lookAt(o.tx, o.ty, o.tz); } };
  });
  const events = (n) => page.evaluate((n) => window.__ev.filter((e) => e.n === n).map((e) => e.p), n);
  if (quality !== 'low') await page.evaluate(() => { for (const id of ['model.people', 'image.people.skins']) window.BC.streamer.start(id); });
  await page.evaluate(() => window.BC.economy.addCash(20000));
  const C = await page.evaluate(() => window.BC.config.get('army'));
  const ready = async () => { await page.evaluate(() => window.BC.army.build()); await wait(() => !!window.BC.army.base, null, 60000); };

  // ---------------------------------------------------------------- base
  if (only.includes('base')) {
    console.log('--- base');
    check(await page.evaluate(() => !window.BC.army.base), 'not built while Shoumik is in the city');
    await goLocal(-210, 0, 90); // the road outside the gate
    check(await wait(() => !!window.BC.army.base && window.BC.army.awake, null, 120000), 'built + awake when he comes near (stream group "cantonment")');
    const b = await page.evaluate(() => {
      const g = window.BC, a = g.army, pad = a.pad, w = g.world, L = a.toWorld;
      const hs = [[0, 0], [-100, -100], [100, 100], [-130, 0], [60, 90]].map(([x, z]) => { const p = L(x, z); return w.heightAt(p.x, p.z); });
      const blocked = (x, z) => { const p = L(x, z); return w.collision.isBlocked(p.x, p.z, 0.4); };
      const wallBlocked = blocked(-140, 60) && blocked(60, -140) && blocked(140, 0);
      const gateOpen = !blocked(-140, 0);
      const name = w.terrain.zoneAt(pad.cx, pad.cz)?.name?.en;
      const blip = g.features.get('minimap')?.blips?.get('cantonment')?.[0];
      return { hs, wallBlocked, gateOpen, name, blip: blip && { icon: blip.icon, label: blip.label }, colliders: a.base.colliders, lamps: a.base.lampCount, trees: a.base.treeCount };
    });
    console.log(`  heights ${b.hs.map((h) => h.toFixed(2)).join(' ')} · ${b.colliders} colliders · ${b.lamps} lamps · ${b.trees} trees`);
    check(b.hs.every((h) => Math.abs(h - b.hs[0]) < 0.05), 'the ground inside the wall is flat');
    check(b.wallBlocked && b.gateOpen, 'the wall is solid and the gate is open');
    check(b.name === C.name.en, `zone name "${b.name}"`);
    check(!!b.blip && b.blip.label?.bn === C.name.bn, `map blip ${b.blip?.icon} ${b.blip?.label?.bn}`);
    await page.waitForTimeout(3000);
    const r = await report();
    console.log(`  ${JSON.stringify(r)}`);
    check(r.guards > 0 && r.patrols > 0 && r.tanks > 0 && r.trucks > 0, 'guards, patrols, tanks and trucks are there');
    await look([-185, 6, 14], [-140, 3, 0]);
    await page.waitForTimeout(1500);
    await shot('gate');
    await look([-40, 22, 70], [-10, 0, -20]);
    await page.waitForTimeout(1200);
    await shot('parade');
    await look([40, 14, 70], [95, 1, 112]);
    await page.waitForTimeout(1200);
    await shot('yard');
    await look([-120, 70, 175], [0, 0, 0]);
    await page.waitForTimeout(1200);
    await shot('overview');
    await unlook();
    const moved = await page.evaluate(async () => {
      const u = window.BC.army.units;
      const t = u.tanks.find((x) => x.mode === 'loop'), d = u.drivers[0];
      const a = t && { x: t.v.x, z: t.v.z }, b = d && { x: d.v.x, z: d.v.z };
      await new Promise((r) => setTimeout(r, 9000));
      return { tank: t ? Math.hypot(t.v.x - a.x, t.v.z - a.z) : -1, truck: d ? Math.hypot(d.v.x - b.x, d.v.z - b.z) : -1 };
    });
    console.log(`  in 9 s: tank moved ${moved.tank.toFixed(1)} m, truck ${moved.truck.toFixed(1)} m`);
    check(moved.tank > 2 && moved.truck > 2, 'a tank and a truck drive round inside the base');
  }

  // ---------------------------------------------------------------- pass
  if (only.includes('pass')) {
    console.log('--- pass');
    await ready();
    const post = await page.evaluate(() => window.BC.army.base.gatePoints().post);
    await page.evaluate((p) => window.BC.events.emit('player:teleport', { x: p.x, z: p.z, heading: Math.PI / 2 }), post);
    check(await wait(() => window.BC.army.rules.promptOn, null, 20000), 'the guard post offers a visitor pass');
    await shot('pass-prompt');
    const c0 = await cash();
    await ev('input:action', {});
    check(await wait(() => window.BC.army.rules.hasPass, null, 10000), 'E buys the pass');
    const c1 = await cash();
    check(c0 - c1 === C.rules.pass.price, `paid ৳${c0 - c1} (price ৳${C.rules.pass.price})`);
    await goLocal(-60, 0, 90);
    await page.waitForTimeout(C.rules.graceSeconds * 1000 * 3);
    check((await stars()) === 0, 'inside with a pass: no star');
    await page.evaluate(() => { window.BC.army.rules.pass = 0; });
    await goLocal(-210, 0, 90);
    await page.waitForTimeout(1500);
  }

  // ---------------------------------------------------------------- gate (warning, 1 star, busted)
  if (only.includes('gate')) {
    console.log('--- gate');
    await ready();
    await goLocal(-210, 0, 90);
    await wait(() => window.BC.army.awake, null, 30000);
    await page.waitForTimeout(1500);
    await page.evaluate(() => { window.__ev = []; });
    await goLocal(-152, 0, 90);
    check(await wait(() => window.__ev.some((e) => e.n === 'toast:show' && e.p.key === 'army.warn'), null, 15000), 'the guards shout a warning at the gate');
    check((await stars()) === 0, 'no star yet (only a warning)');
    await page.waitForTimeout(800);
    await shot('gate-warning');
    await goLocal(-110, 0, 90);
    check(await wait(() => window.BC.army.stars === 1, null, 30000), 'inside without a pass = 1 star');
    check((await events('crime:committed')).some((c) => c.type === 'trespassArmy'), 'crime trespassArmy');
    check(await wait(() => window.BC.army.units.report().chasing > 0, null, 10000), 'guards come to arrest him');
    await page.waitForTimeout(1500);
    await shot('trespass');
    // He stands still: a soldier arrests him → BUSTED → pay the bail.
    const busted = await wait(() => window.__ev.some((e) => e.n === 'player:busted'), null, 150000);
    check(busted, 'a soldier arrests him: BUSTED');
    if (busted) {
      await page.waitForSelector('#jail-mode:not([hidden]) [data-act="pay"]', { timeout: 15000 }).catch(() => {});
      await shot('busted');
      await page.click('[data-act="pay"]').catch(() => {});
      check(await wait(() => !window.BC.paused && window.BC.army.stars === 0, null, 20000), 'bail paid: free, stars gone');
      check(await wait(() => window.BC.army.units.report().chasing === 0, null, 30000), 'the soldiers go back to their posts');
    }
  }

  // ---------------------------------------------------------------- attack (5 stars, trucks, tanks, shells, wasted)
  if (only.includes('attack')) {
    console.log('--- attack');
    await ready();
    await goLocal(-60, 40, 90);
    await wait(() => window.BC.army.awake, null, 30000);
    await page.waitForTimeout(2500);
    await page.evaluate(() => { window.__ev = []; window.BC.events.emit('wanted:clear'); });
    // Shoot a soldier (through his target, the way a bullet does).
    const hit = await page.evaluate(() => {
      const t = [...window.BC.targets.list].find((x) => x.kind === 'soldier' && !x.dead);
      return t ? t.onHit({ damage: 400, kind: 'bullet', by: 'player', dirX: 0, dirZ: 1 }) : null;
    });
    check(hit === 'killed', `a soldier is shot (${hit})`);
    check(await wait(() => window.BC.army.stars === 5, null, 10000), 'attacking a soldier = 5 stars');
    check(await wait(() => window.BC.army.alert, null, 5000), 'the army is on the alert');
    check((await events('army:killed')).some((k) => k.by === 'player'), 'army:killed by the player (kills stat)');
    // Keep him alive while the units come.
    await page.evaluate(() => { const g = window.BC; g.__keep = setInterval(() => g.events.emit('player:heal', { full: true }), 300); });
    check(await wait(() => window.BC.army.units.report().hunters > 0, null, 60000), 'extra soldiers come');
    check(await wait(() => window.BC.army.units.report().trucksChasing > 0, null, 90000), 'army trucks chase him');
    check(await wait(() => window.BC.army.units.report().tanksChasing > 0, null, 90000), 'a tank chases him');
    const tank0 = await page.evaluate(() => { const t = window.BC.army.units.tanks.find((x) => x.mode === 'chase'); const p = window.BC.player.position; return t && { d: Math.hypot(t.v.x - p.x, t.v.z - p.z) }; });
    check(await wait(() => window.BC.army.shells.fired > 0, null, 180000), 'the tank fires a shell');
    check(await wait(() => window.BC.army.shells.exploded > 0, null, 30000), 'the shell explodes');
    const tank1 = await page.evaluate(() => {
      const t = window.BC.army.units.tanks.find((x) => x.mode === 'chase'); if (!t) return null;
      const p = window.BC.player.position, v = t.v;
      const want = Math.atan2(p.x - v.x, p.z - v.z) - v.heading - t.yaw;
      return { d: Math.hypot(v.x - p.x, v.z - p.z), aim: Math.abs(Math.atan2(Math.sin(want), Math.cos(want))), sees: t.sees };
    });
    if (tank0 && tank1) console.log(`  tank: ${tank0.d.toFixed(0)} m → ${tank1.d.toFixed(0)} m from him, turret off-aim ${tank1.aim.toFixed(2)} rad`);
    check(!!tank1 && (tank1.aim < 0.5 || !tank1.sees), 'the turret points at him');
    check((await events('explosion')).some((e) => e.by === 'army'), 'explosion { by: army }');
    await page.evaluate(() => {
      const g = window.BC, t = g.army.units.tanks.find((x) => x.mode === 'chase'), v = t.v;
      const bx = v.x - Math.sin(v.heading) * 14 + Math.cos(v.heading) * 6, bz = v.z - Math.cos(v.heading) * 14 - Math.sin(v.heading) * 6;
      g.cameraRig.lookOverride = { x: bx, y: g.world.heightAt(bx, bz) + 5, z: bz, tx: v.x, ty: g.world.heightAt(v.x, v.z) + 1.5, tz: v.z };
    });
    await page.waitForTimeout(1200);
    await shot('tank');
    await unlook();
    await page.waitForTimeout(600);
    await shot('alert');
    // Sitting in a vehicle does not clear stars.
    const drove = await page.evaluate(async () => {
      const g = window.BC, p = g.player.position;
      const v = g.fleet.create('sedan', { x: p.x + 2.5, z: p.z, heading: 0 });
      if (!v) return null;
      await new Promise((r) => setTimeout(r, 300));
      g.events.emit('input:action');
      await new Promise((r) => setTimeout(r, 6000));
      return { mode: g.player.mode, stars: g.army.stars };
    });
    check(!!drove && drove.stars === 5, `in a vehicle the stars stay (${drove?.mode}, ${drove?.stars} stars)`);
    // WASTED: stop healing, take the damage.
    await page.evaluate(() => { clearInterval(window.BC.__keep); window.BC.events.emit('vehicle:forceExit'); });
    await page.waitForTimeout(2000);
    await page.evaluate(() => window.BC.events.emit('player:damage', { amount: 9999, by: 'army' }));
    check(await wait(() => window.__ev.some((e) => e.n === 'player:died'), null, 30000), 'WASTED (player:died)');
    await page.waitForSelector('#jail-mode:not([hidden]) [data-act="leave"]', { timeout: 20000 }).catch(() => {});
    await shot('wasted');
    await page.click('[data-act="leave"]').catch(() => {});
    check(await wait(() => !window.BC.paused && window.BC.army.stars === 0 && !window.BC.army.alert, null, 30000), 'after the hospital: free, the army stands down');
  }

  // ---------------------------------------------------------------- counts per quality
  if (only.includes('counts')) {
    console.log('--- counts');
    await ready();
    await goLocal(-210, 0, 90);
    await wait(() => window.BC.army.awake, null, 30000);
    for (const q of ['low', 'medium', 'high']) {
      await page.evaluate((q) => window.BC.setQuality(q), q);
      await page.waitForTimeout(2500);
      const r = await report();
      const Q = C.quality[q];
      const want = { soldiers: Q.gateGuards + Q.insideGuards + Q.patrols, tanks: Q.parkedTanks + Q.movingTanks, trucks: Q.parkedTrucks + Q.movingTrucks };
      console.log(`  ${q}: soldiers ${r.soldiers}/${want.soldiers} tanks ${r.tanks}/${want.tanks} trucks ${r.trucks}/${want.trucks}`);
      check(r.soldiers === want.soldiers && r.tanks === want.tanks && r.trucks === want.trucks, `${q}: residents match data/army.json`);
    }
    check(C.quality.low.movingTanks + C.quality.low.parkedTanks <= 1 && C.quality.low.alertTanks <= 1, 'Low: one tank near the player');
    await page.evaluate((q) => window.BC.setQuality(q), quality);
  }

  // ---------------------------------------------------------------- night
  if (only.includes('night')) {
    console.log('--- night');
    await ready();
    await ev('time:set', { hour: 21 });
    await goLocal(-210, 0, 90);
    await page.waitForTimeout(3000);
    await look([-185, 6, 14], [-140, 3, 0]);
    await page.waitForTimeout(1500);
    await shot('night-gate');
    await look([-40, 22, 70], [-10, 0, -20]);
    await page.waitForTimeout(1200);
    await shot('night-parade');
    await unlook();
  }

  const fps = await page.evaluate(() => document.getElementById('debug-panel')?.textContent?.match(/FPS \d+/)?.[0] || '');
  console.log(`  ${fps} (headless, software GL)`);
  check(problems.length === 0, `no console errors${problems.length ? `: ${problems.slice(0, 5).join(' | ')}` : ''}`);
  await browser.close();
  server.close();
  console.log(fails.length ? `\nARMY CHECK FAILED (${fails.length})` : '\nARMY CHECK PASSED');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
