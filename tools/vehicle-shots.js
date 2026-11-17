// Vehicle test + screenshots for Claude sessions (not part of the game).
// Boots the game headless, then:
//   1. lines every vehicle type up in the Sangsad plaza and saves close-up screenshots
//   2. gets into a vehicle, drives, jumps a ramp, drifts, gets out
//   3. carjacks an AI vehicle, hires a rickshaw ride, blows a vehicle up
//   4. watches the AI traffic at Shahbag from above for a minute and prints how it flows
// It fails on any console error or when a step does not behave.
//
//   node tools/vehicle-shots.js --three <dir of three@0.170.0> --out <folder> [--only gallery,drive,ride]
// (see tools/smoke-test.js for why --three is needed in a sandbox)

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
const outDir = arg('out', null);
const only = (arg('only', 'gallery,drive,jack,ride,boom,traffic')).split(',');
const quality = arg('quality', 'medium');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
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
  await new Promise((r) => server.listen(0, r));
  if (outDir) fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 915, height: 412 } });
  const problems = [];
  const fails = [];
  page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });
  page.on('pageerror', (e) => problems.push(e.stack || e.message));
  if (threeDir) {
    await page.route(/cdn\.jsdelivr\.net\/npm\/three@[^/]+\//, (route) => {
      const file = path.join(threeDir, route.request().url().replace(/^.*three@[^/]+\//, ''));
      if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: 'not found' });
      return route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(file) });
    });
  }
  const shot = async (name) => { if (outDir) await page.screenshot({ path: path.join(outDir, `${name}.png`) }); };
  const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${text}`); if (!ok) fails.push(text); };
  const wait = (ms) => page.waitForTimeout(ms);
  const state = () => page.evaluate(() => {
    const b = window.BC, v = b.player.vehicle;
    return { mode: b.player.mode, x: b.player.position.x, z: b.player.position.z, cash: b.economy.getCash(),
      v: v ? { type: v.type, speed: v.speed, y: v.y, health: v.health, state: v.state, air: v.airborne, slip: v.slip } : null };
  });

  try {
    await page.goto(`http://localhost:${server.address().port}${SUB}/?debug=1&autostart=1&quality=${quality}`);
    await page.waitForFunction(() => window.BC && window.BC.running, null, { timeout: 90000 });
    await wait(1500);

    // Helpers inside the page: teleport Shoumik, free camera.
    await page.evaluate(() => {
      const b = window.BC;
      window.T = {
        at(col, row) { const L = b.world.layout; return { x: L.minX + col * L.P + L.W / 2, z: L.minZ + row * L.P + L.W / 2 }; },
        tp(x, z, heading = 0) { const p = b.player; p.position.x = x; p.position.z = z; p.heading = heading; b.cameraRig.setTarget(p, 'onFoot', true); },
        cam(x, y, z, tx, ty, tz) { b.cameraRig.target = null; b.camera.position.set(x, y, z); b.camera.lookAt(tx, ty, tz); },
        clearNear(x, z, r) { for (const v of [...b.fleet.vehicles]) if (Math.hypot(v.x - x, v.z - z) < r) b.fleet.remove(v); },
      };
    });

    if (only.includes('gallery')) {
      const types = await page.evaluate(() => Object.keys(window.BC.config.get('vehicles').types));
      // Line them up on the open strip of the Sangsad plaza.
      await page.evaluate((list) => {
        const b = window.BC, c = window.T.at(3, 1.25); // north of the Sangsad lake (Session 4)
        window.T.tp(c.x - 30, c.z - 12);
        window.T.clearNear(c.x, c.z, 60);
        window.G = list.map((type, i) => b.fleet.create(type, { x: c.x + (i - list.length / 2) * 13, z: c.z, heading: 0.6 }));
      }, types);
      await wait(2500);
      for (let i = 0; i < types.length; i++) {
        await page.evaluate((k) => { const v = window.G[k], s = Math.max(1, v.T.size[0] / 3.2); window.T.cam(v.x + 2.0 * s, 1.1 + 0.5 * s, v.z + 2.9 * s, v.x, v.T.size[2] * 0.45, v.z); }, i);
        await wait(250);
        await shot(`type-${types[i]}`);
        await page.evaluate((k) => { const v = window.G[k], s = Math.max(1, v.T.size[0] / 3.2); window.T.cam(v.x - 2.2 * s, 1.1 + 0.4 * s, v.z - 2.8 * s, v.x, v.T.size[2] * 0.45, v.z); }, i);
        await wait(250);
        await shot(`type-${types[i]}-back`);
      }
      await page.evaluate(() => { const v = window.G[5]; window.T.cam(v.x, 14, v.z + 38, v.x, 0, v.z); });
      await wait(300);
      await shot('gallery');
      check(types.length >= 11, `${types.length} vehicle types built`);
      await page.evaluate(() => { for (const v of window.G) window.BC.fleet.remove(v); });
    }

    if (only.includes('drive')) {
      // A sports car on the plaza, east of the east-west ramp and facing it.
      await page.evaluate(() => {
        const b = window.BC, r = b.world.ramps.list.find((x) => x.id === 'sangsad-west');
        window.T.clearNear(r.x, r.z, 70);
        window.CAR = b.fleet.create('sports', { x: r.x + 62, z: r.z, heading: -Math.PI / 2, color: '#ff2e63' });
        window.T.tp(r.x + 62, r.z + 2.4, 0);
      });
      await wait(600);
      await shot('drive-0-prompt');
      const prompt = await page.evaluate(() => document.querySelector('.hud-prompt')?.textContent || '');
      check(prompt.length > 3, `enter hint shown: "${prompt}"`);
      await page.keyboard.press('KeyE');
      await wait(400);
      await shot('drive-1-entering');
      await wait(900);
      let s = await state();
      check(s.mode === 'vehicle' && s.v?.type === 'sports', 'Shoumik is in the sports car');
      await page.keyboard.down('KeyW');
      let top = 0, air = false, maxY = 0;
      for (let i = 0; i < 26; i++) {
        await wait(150);
        s = await state();
        if (!s.v) break;
        top = Math.max(top, s.v.speed); air = air || s.v.air; maxY = Math.max(maxY, s.v.y);
        if (i === 6) await shot('drive-2-speed');
        if (s.v.air && !fs.existsSync(path.join(outDir || '.', 'drive-3-jump.png'))) await shot('drive-3-jump');
      }
      check(top > 12, `reached ${top.toFixed(1)} m/s`);
      check(air && maxY > 1, `jumped the ramp (highest ${maxY.toFixed(2)} m)`);
      // Handbrake turn on the open plaza.
      await page.keyboard.up('KeyW');
      await page.evaluate(() => { const b = window.BC, c = window.T.at(3, 2), v = window.CAR; window.T.clearNear(c.x - 30, c.z - 72, 45); v.place(c.x - 60, c.z - 72, Math.PI / 2, b.world.heightAt(c.x - 60, c.z - 72)); v.health = v.T.health; }); // north of the Sangsad lake (Session 4)
      await page.keyboard.down('KeyW');
      await wait(2200);
      await page.keyboard.down('KeyA');
      await page.keyboard.down('Space');
      let slip = 0;
      for (let i = 0; i < 8; i++) { await wait(120); s = await state(); if (s.v) slip = Math.max(slip, s.v.slip); }
      await shot('drive-4-drift');
      await page.keyboard.up('Space'); await page.keyboard.up('KeyA'); await page.keyboard.up('KeyW');
      check(slip > 2, `drifted (sideways ${slip.toFixed(1)} m/s)`);
      await page.keyboard.down('KeyS'); await wait(2500); await page.keyboard.up('KeyS');
      s = await state();
      await page.keyboard.press('KeyE');
      await wait(2200);
      s = await state();
      check(s.mode === 'onFoot' && !s.v, 'got out again');
      await shot('drive-5-out');
    }

    if (only.includes('jack')) {
      // Back to the street: find an AI vehicle, stand next to it and take it.
      const found = await page.evaluate(() => {
        const b = window.BC, c = window.T.at(3, 10);
        window.T.tp(c.x + 9, c.z + 9);
        return true;
      });
      await wait(4000);
      const jack = await page.evaluate(() => {
        const b = window.BC, p = b.player.position;
        const list = b.fleet.vehicles.filter((v) => v.driver === 'ai').sort((m, n) => Math.hypot(m.x - p.x, m.z - p.z) - Math.hypot(n.x - p.x, n.z - p.z));
        const v = list[0];
        if (!v) return null;
        v.vx = v.vz = 0; v.brain.cruise = 0;
        const lx = Math.cos(v.heading), lz = -Math.sin(v.heading), w = v.T.size[1] / 2 + 0.9;
        window.T.tp(v.x + lx * w, v.z + lz * w, 0);
        window.JV = v;
        return { type: v.type, people: b.crowd.people.size };
      });
      check(!!jack && found, `found an AI vehicle to take (${jack?.type})`);
      await wait(400);
      await shot('jack-0-before');
      await page.keyboard.press('KeyE');
      await wait(700);
      await shot('jack-1-during');
      await wait(900);
      const s = await state();
      check(s.mode === 'vehicle' && s.v?.type === jack.type, 'carjacked it');
      const ejected = await page.evaluate(() => window.BC.debugPeds.some((p) => p.active && (p.state === 'down' || p.state === 'fight') && Math.hypot(p.x - window.JV.x, p.z - window.JV.z) < 6));
      check(ejected, 'the driver was thrown out next to it');
      await page.keyboard.press('KeyH');
      await page.keyboard.down('KeyW'); await wait(2500); await page.keyboard.up('KeyW');
      await shot('jack-2-driving');
      await page.keyboard.press('KeyE');
      await wait(3000);
      check((await state()).mode === 'onFoot', 'stopped and got out');
    }

    if (only.includes('ride')) {
      const before = await page.evaluate(() => {
        const b = window.BC, c = window.T.at(3, 10);
        window.T.tp(c.x + 9, c.z + 9);
        return b.economy.getCash();
      });
      await wait(2500);
      const stand = await page.evaluate(() => {
        const b = window.BC;
        const v = b.fleet.vehicles.find((x) => x.tags.stand && x.type === 'rickshaw');
        if (!v) return null;
        const lx = Math.cos(v.heading), lz = -Math.sin(v.heading);
        window.T.tp(v.x + lx * 1.4, v.z + lz * 1.4, 0);
        return { type: v.type };
      });
      check(!!stand, 'a rickshaw stand is waiting at Shahbag');
      await wait(500);
      await shot('ride-0-stand');
      await page.keyboard.press('KeyE');
      await wait(400);
      await shot('ride-1-menu');
      const places = await page.$$eval('#ride-menu .ride-places button', (els) => els.map((e) => e.textContent));
      check(places.length >= 15, `ride menu lists ${places.length} places`);
      await page.click('#ride-menu .ride-places button:nth-child(3)');
      await wait(2500);
      let s = await state();
      check(s.cash === before - 20, `fare paid: ৳${before} → ৳${s.cash}`);
      check(s.mode === 'vehicle' && s.v?.type === 'rickshaw', 'riding the rickshaw');
      const from = { x: s.x, z: s.z };
      await wait(5000);
      await shot('ride-2-riding');
      s = await state();
      check(Math.hypot(s.x - from.x, s.z - from.z) > 6, `the puller is pedalling (${Math.hypot(s.x - from.x, s.z - from.z).toFixed(0)} m so far)`);
      await page.click('#ride-skip');
      for (let i = 0; i < 100 && (await state()).mode !== 'onFoot'; i++) await wait(500);
      s = await state();
      const where = await page.evaluate(() => { const b = window.BC, j = b.world.roads.nearestJunction(b.player.position.x, b.player.position.z); return `${j.c},${j.r}`; });
      check(s.mode === 'onFoot', `arrived and stepped out near junction ${where}`);
      await wait(600);
      await shot('ride-3-arrived');
    }

    if (only.includes('boom')) {
      await page.evaluate(() => {
        const b = window.BC, p = b.player.position;
        const f = b.cameraRig.forward();
        window.BOOM = b.fleet.create('sedan', { x: p.x + f.x * 9, z: p.z + f.z * 9, heading: 1 });
        b.fleet.damage(window.BOOM, 150);
      });
      await wait(1200);
      await shot('boom-0-smoke');
      await page.evaluate(() => window.BC.fleet.damage(window.BOOM, 1000));
      await wait(2500);
      await shot('boom-1-fire');
      await wait(2900);
      await shot('boom-2-explosion');
      await wait(1500);
      const st = await page.evaluate(() => window.BOOM.state);
      check(st === 'wreck', 'the car burned, exploded and is a wreck');
      await shot('boom-3-wreck');
    }
    if (only.includes('traffic')) {
      await page.evaluate(() => { const c = window.T.at(3, 10); window.T.tp(c.x + 9, c.z + 9); });
      await wait(3000);
      await page.evaluate(() => { const c = window.T.at(3, 10); window.T.cam(c.x + 30, 42, c.z + 46, c.x, 0, c.z); });
      let moved = 0;
      for (let i = 0; i < 6; i++) {
        await wait(10000);
        const m = await page.evaluate(() => {
          const ai = window.BC.fleet.vehicles.filter((v) => v.driver === 'ai');
          const avg = ai.reduce((s, v) => s + v.speed, 0) / (ai.length || 1);
          return { n: ai.length, avg, still: ai.filter((v) => v.speed < 0.3).length, hurt: ai.filter((v) => v.health < v.T.health).length,
            blocked: ai.filter((v) => v.brain.blocked > 3).length, off: ai.filter((v) => Math.abs(v.brain.legs[0] ? ((v.x - v.brain.legs[0].ax) * v.brain.legs[0].fz - (v.z - v.brain.legs[0].az) * v.brain.legs[0].fx) : 0) > 2.5).length,
            fps: document.getElementById('debug-panel').textContent.split('\n')[0] };
        });
        moved += m.avg;
        console.log(`     traffic t=${(i + 1) * 10}s: ${m.n} AI, avg ${m.avg.toFixed(1)} m/s, standing ${m.still}, long-blocked ${m.blocked}, off-lane ${m.off}, damaged ${m.hurt}, ${m.fps}`);
        await shot(`traffic-${i + 1}`);
      }
      check(moved / 6 > 0.8, `traffic keeps moving (average ${(moved / 6).toFixed(1)} m/s over a minute)`);
    }
    console.log((await page.evaluate(() => document.getElementById('debug-panel').textContent)).replace(/\n/g, ' | '));
  } catch (err) {
    fails.push(err.message);
    console.log('FAIL:', err.message);
  }
  if (problems.length) console.log('FAIL: console errors:\n' + problems.join('\n'));
  await browser.close();
  server.close();
  const ok = !fails.length && !problems.length;
  console.log(ok ? 'VEHICLE TEST PASSED' : 'VEHICLE TEST FAILED');
  process.exit(ok ? 0 : 1);
})();
