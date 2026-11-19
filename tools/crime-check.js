// Crime, weapons and police check (Session 6) for Claude sessions (not part of the game).
// Boots the game headless with a fresh save and runs, checking every number:
//   weapon shop (pistol + ammo + armour), shooting a pedestrian dead with phone aim assist,
//   wanted stars from the crimes, police on foot / pickups / helicopter by star level, stars
//   fading out of sight, BUSTED with enough cash (pay bail → Police HQ), BUSTED without cash
//   (jail → study → released), jail kept after a reload, WASTED (hospital fee, weapons lost),
//   desktop free aim, the cricket bat, a molotov fire, a vehicle blown up, Blood Off.
// Fails on any console error or a wrong number. Saves screenshots into --out.
//
//   node tools/crime-check.js --three <dir with three@0.170.0> --out shots [--quality low]

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
const threeDir = arg('three', null);
const outDir = path.resolve(arg('out', 'shots'));
const quality = arg('quality', 'low');
fs.mkdirSync(outDir, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary' };
const SUB = '/shoumik--breaking--city';
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (!p.startsWith(SUB)) { res.writeHead(404); res.end(); return; }
  p = p.slice(SUB.length) || '/';
  if (p.endsWith('/')) p += 'index.html';
  fs.readFile(path.join(ROOT, p), (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(data);
  });
});

let failures = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failures++; };
const BN = /[০-৯]/;

(async () => {
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 915, height: 412 } });
  const problems = [];
  page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });
  page.on('pageerror', (e) => problems.push(e.stack || e.message));
  if (threeDir) {
    await page.route(/cdn\.jsdelivr\.net\/npm\/three@[^/]+\//, (route) => {
      const file = path.join(threeDir, route.request().url().replace(/^.*three@[^/]+\//, ''));
      return fs.existsSync(file) ? route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(file) }) : route.fulfill({ status: 404 });
    });
  }
  const url = `http://localhost:${server.address().port}${SUB}/?debug=1&autostart=1&quality=${quality}`;
  const boot = async () => {
    await page.goto(url);
    await page.waitForFunction(() => window.BC && window.BC.running, null, { timeout: 120000 });
  };
  const shot = (name) => page.screenshot({ path: path.join(outDir, `crime-${name}.png`) });
  const ev = (name, payload = {}) => page.evaluate(([n, p]) => window.BC.events.emit(n, p), [name, payload]);
  const cash = () => page.evaluate(() => window.BC.economy.getCash());
  const save = () => page.evaluate(() => JSON.parse(JSON.stringify(window.BC.save.data)));
  const wait = (ms) => page.waitForTimeout(ms);
  const police = () => page.evaluate(() => {
    const d = window.BC.debugPolice;
    return { officers: d.officers().filter((o) => o.state !== 'dead').length, cars: d.cars().length, heli: !!d.heli() };
  });

  /** Put a standing pedestrian `dist` metres in front of Shoumik and face the camera at him. */
  const placeVictim = (dist = 6, idx = -1) => page.evaluate(([d, i]) => {
    const BC = window.BC;
    const p = BC.player;
    const ped = i >= 0 ? BC.debugPeds[i] : BC.debugPeds.find((x) => x.active && x.state !== 'dead' && x.state !== 'down');
    if (!ped) return null;
    // Find a free direction around him.
    for (let a = 0; a < Math.PI * 2; a += 0.4) {
      const x = p.position.x + Math.sin(a) * d, z = p.position.z + Math.cos(a) * d;
      if (BC.world.collision.isBlocked(x, z, 0.5)) continue;
      if (BC.world.collision.raycast(p.position.x, p.position.z, Math.sin(a), Math.cos(a), d, 1) < d) continue;
      ped.x = x; ped.z = z; ped.state = 'pause'; ped.timer = 60; ped.speed = 0;
      p.heading = a;
      BC.cameraRig.yaw = a;
      BC.cameraRig.pitch = 0.05;
      return { idx: BC.debugPeds.indexOf(ped), life: ped.life };
    }
    return null;
  }, [dist, idx]);
  const tap = async (button = 'attack') => {
    await page.evaluate((b) => window.BC.input.setButton(b, true), button);
    await wait(80);
    await page.evaluate((b) => window.BC.input.setButton(b, false), button);
    await wait(380);
  };
  /** Open a shop panel and buy one item (returns the message shown). */
  const buy = async (shop, item) => {
    await ev('shop:open', { id: shop });
    await page.waitForSelector('#shop-panel:not([hidden]), .shop-list', { timeout: 4000 }).catch(() => {});
    const btn = await page.$(`[data-buy="${item}"]`);
    if (!btn) return 'no button';
    await btn.click();
    await wait(150);
    const msg = await page.evaluate(() => document.querySelector('.shop-msg')?.textContent || '');
    await page.keyboard.press('Escape');
    await wait(200);
    return msg;
  };
  const answerAll = async () => {
    // Answer the question on screen correctly (the real letter is found from the lesson data).
    return page.evaluate(() => {
      const q = document.querySelector('.class-question')?.textContent;
      const all = window.BC.content.get('lessons').flatMap((l) => l.questions);
      const real = all.find((x) => x.question === q);
      const btn = real && document.querySelector(`[data-act="answer"][data-id="${real.answer}"]`);
      btn?.click();
      return !!btn;
    });
  };

  try {
    await page.addInitScript(() => { if (!sessionStorage.getItem('kept')) { localStorage.clear(); sessionStorage.setItem('kept', '1'); } });
    await boot();
    const W = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/weapons.json'), 'utf8'));
    const E = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/economy.json'), 'utf8'));
    const pistol = W.weapons.find((w) => w.id === 'pistol');
    check(await page.evaluate(() => window.BC.player.weapon === null), 'starts with fists');

    // ---- weapon shop
    await page.evaluate(() => window.BC.economy.addCash(100000, 'test'));
    let c0 = await cash();
    await buy('weapon-shop', 'pistol');
    let s = await save();
    check(s.owned.weapons.includes('pistol'), 'pistol bought');
    check(c0 - (await cash()) === E.prices.weapons.pistol, `pistol cost ৳${E.prices.weapons.pistol}`);
    check(s.ammo.pistol === pistol.startAmmo, `pistol came with ${pistol.startAmmo} bullets (${s.ammo.pistol})`);
    await wait(300);
    check(await page.evaluate(() => window.BC.player.weapon?.id === 'pistol'), 'pistol is in his hand');
    check(await page.evaluate(() => (window.BC.player.model.getObjectByName('weapon-holder')?.children.length || 0) > 0), 'pistol model is attached to the hand');
    await buy('weapon-shop', 'ammo-pistol');
    s = await save();
    check(s.ammo.pistol === pistol.startAmmo + pistol.ammoPack, `ammo box adds ${pistol.ammoPack} (${s.ammo.pistol})`);
    await buy('weapon-shop', 'armour');
    check(await page.evaluate(() => window.BC.player.armour.value === window.BC.player.armour.max), 'armour full after buying');
    const badge = await page.textContent('#weapon-hud');
    check(/পিস্তল/.test(badge) && BN.test(badge), `weapon badge shows the pistol and bullets in Bangla (${badge.trim()})`);

    // ---- shoot a pedestrian (phone aim assist)
    await page.evaluate(() => { window.BC.input.usingTouch = true; });
    const victim = await placeVictim(6);
    check(!!victim, 'a pedestrian stands in front of him');
    await wait(300);
    check(await page.evaluate(() => !document.querySelector('#lock-marker').hidden), 'aim assist ring is on the pedestrian');
    for (let i = 0; i < 6; i++) {
      await tap();
      if (await page.evaluate((i2) => window.BC.debugPeds[i2].state === 'dead', victim.idx)) break;
      await placeVictim(6, victim.idx); // he ran: put him back in front
    }
    const dead = await page.evaluate((i2) => window.BC.debugPeds[i2].state, victim.idx);
    check(dead === 'dead', `pedestrian shot dead (${dead})`);
    s = await save();
    check(s.stats.kills === 1, `kills = 1 (${s.stats.kills})`);
    check(s.ammo.pistol < pistol.startAmmo + pistol.ammoPack, 'bullets were used');
    await wait(400);
    await shot('shot-dead');
    let stars = await page.evaluate(() => Number(document.querySelectorAll('.hud-stars span.on').length));
    check(stars >= 1, `murder gives wanted stars (${stars})`);

    // ---- police by level
    await wait(4000);
    let pol = await police();
    check(pol.officers > 0, `officers come after him (${pol.officers})`);
    await shot('police-foot');
    await ev('wanted:set', { stars: 3 });
    await wait(7000);
    pol = await police();
    check(pol.cars > 0, `3 stars: police pickups chase (${pol.cars})`);
    await shot('police-cars');
    await ev('wanted:set', { stars: 5 });
    await wait(3500);
    pol = await police();
    check(pol.heli, '5 stars: helicopter');
    await page.evaluate(() => { window.BC.cameraRig.pitch = 0.8; });
    await wait(1500);
    await shot('police-heli');

    // ---- stars fade when nobody sees him
    await ev('wanted:clear');
    await wait(2500);
    await ev('wanted:set', { stars: 2 });
    await page.evaluate(() => { const d = window.BC.debugPolice; for (const o of d.officers()) o.remove(); d.officers().length = 0; window.BC.player.frozen = true; });
    // Hide: no units, so after the grace + fade time one star must be gone.
    const fade = E.wanted.fadeSeconds + E.wanted.seenGraceSeconds + 5;
    await page.evaluate(() => { const B = window.BC; B._noSpawn = B.config.get('police').spawn.every; B.config.get('police').spawn.every = 999; });
    for (let t = 0; t < fade; t++) {
      // Keep the street empty of police so nobody can see him.
      await page.evaluate(() => { const d = window.BC.debugPolice; for (const o of d.officers()) o.remove(); d.officers().length = 0; });
      await wait(1000);
      if (process.env.DBG) console.log(t, await page.evaluate(() => document.querySelector('#debug-panel').textContent.split('\n').filter((x) => /stars/.test(x)).join(' | ')));
    }
    stars = await page.evaluate(() => document.querySelectorAll('.hud-stars span.on').length);
    check(stars === 1, `a star fades out of sight (2 → ${stars})`);
    await page.evaluate(() => { const B = window.BC; B.config.get('police').spawn.every = B._noSpawn; B.player.frozen = false; });

    // ---- BUSTED with enough cash
    await ev('wanted:clear');
    await wait(500);
    await ev('wanted:set', { stars: 2 });
    c0 = await cash();
    await ev('player:busted', { stars: 2 });
    await page.waitForSelector('#big-banner:not([hidden])', { timeout: 3000 });
    await shot('busted-banner');
    await page.waitForSelector('#jail-mode:not([hidden])', { timeout: 8000 });
    const bailText = await page.textContent('#jail-mode .panel');
    check(BN.test(bailText) && /জামিন/.test(bailText), 'bail screen is in Bangla with Bangla digits');
    await shot('bail');
    await page.click('[data-act="pay"]');
    await wait(500);
    check(c0 - (await cash()) === 2 * E.bail.perStar, `paid bail ৳${2 * E.bail.perStar}`);
    const hq = await page.evaluate(() => {
      const BC = window.BC;
      const pl = BC.content.get('places').find((p) => p.id === 'police-hq');
      const c = BC.world.layout.crossingCentre(pl.col, pl.row);
      return Math.hypot(BC.player.position.x - c.x, BC.player.position.z - c.z);
    });
    check(hq < 20, `walked out at Police HQ (${hq.toFixed(1)} m)`);
    check(await page.evaluate(() => !window.BC.player.frozen && !window.BC.paused), 'free to move again');

    // ---- BUSTED without cash → jail
    await page.evaluate(() => window.BC.economy.spend(window.BC.economy.getCash(), 'test'));
    await page.evaluate(() => window.BC.economy.addCash(500, 'test'));
    await ev('player:busted', { stars: 3 });
    await page.waitForSelector('#jail-mode:not([hidden]) [data-act="jail"]', { timeout: 8000 });
    await page.click('[data-act="jail"]');
    await wait(300);
    s = await save();
    check(s.jail && s.jail.owed === 3 * E.bail.perStar - 500, `jail: owes ৳${3 * E.bail.perStar - 500} (${s.jail?.owed})`);
    check((await cash()) === 0, 'his cash went towards the bail');
    await shot('jail');
    // Reload: still in jail.
    await page.evaluate(() => window.BC.save.flush());
    await boot();
    await wait(800);
    check(await page.evaluate(() => !document.querySelector('#jail-mode').hidden && !!window.BC.save.data.jail), 'still in jail after a reload');
    // Study until free.
    let rounds = 0;
    while (rounds < 12) {
      const done = await page.$('[data-act="leave"]');
      if (done) break;
      const start = await page.$('[data-act="study"]');
      if (start) { await start.click(); await wait(200); }
      const cell = await page.$('[data-act="cell"]');
      if (cell) { await cell.click(); await wait(200); rounds++; continue; }
      if (await page.$('.class-question')) {
        if (rounds === 0) await shot('jail-question');
        await answerAll();
        await wait(150);
        await page.click('[data-act="next"]');
        await wait(150);
      }
    }
    check(!!(await page.$('[data-act="leave"]')), 'bail paid by studying → released');
    await page.click('[data-act="leave"]');
    await wait(400);
    check(await page.evaluate(() => window.BC.save.data.jail === null && !window.BC.paused), 'out of jail');

    // ---- desktop free aim + bat + molotov
    await page.evaluate(() => window.BC.economy.addCash(60000, 'test'));
    await buy('weapon-shop', 'smg');
    await page.evaluate(() => { window.BC.input.usingTouch = false; });
    let v2 = await placeVictim(5);
    await wait(300);
    check(await page.evaluate(() => !document.querySelector('#crosshair').hidden), 'desktop shows a crosshair');
    for (let i = 0; i < 10; i++) {
      await page.evaluate(() => { const r = window.BC.cameraRig; r.yaw = window.BC.player.heading; r.pitch = 0.05; });
      await tap();
      if (await page.evaluate((i2) => window.BC.debugPeds[i2].state === 'dead', v2.idx)) break;
      await placeVictim(5, v2.idx);
    }
    check(await page.evaluate((i2) => window.BC.debugPeds[i2].state === 'dead' || window.BC.debugPeds[i2].life < 100, v2.idx), 'free aim hits what the crosshair points at');
    await buy('weapon-shop', 'bat');
    check(await page.evaluate(() => window.BC.player.weapon?.id === 'bat'), 'cricket bat in hand');
    v2 = await placeVictim(1.2);
    await wait(200);
    const lifeBefore = await page.evaluate((i2) => window.BC.debugPeds[i2].life, v2.idx);
    await tap();
    await wait(500);
    const lifeAfter = await page.evaluate((i2) => window.BC.debugPeds[i2].life, v2.idx);
    check(lifeAfter < lifeBefore, `bat hit (${lifeBefore} → ${lifeAfter})`);
    await shot('bat');
    await buy('weapon-shop', 'molotov');
    s = await save();
    check(s.ammo.molotov === W.weapons.find((w) => w.id === 'molotov').ammoPack, `molotovs bought (${s.ammo.molotov})`);
    await page.evaluate(() => { window.BC.input.usingTouch = true; });
    await placeVictim(8);
    await tap();
    await wait(1500);
    await shot('molotov');

    // ---- a vehicle blown up by him counts
    const before = (await save()).stats.carsDestroyed || 0;
    await page.evaluate(() => {
      const BC = window.BC;
      const p = BC.player.position;
      const v = BC.fleet.vehicles.filter((x) => x.state === 'ok' && x.driver !== 'player' && !x.tags.police && !x.tags.owned)
        .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
      v.tags.lastHitBy = 'player';
      BC.fleet.damage(v, 99999);
      BC._boom = { v, seen: [] };
      BC.events.on('vehicle:exploded', (e) => BC._boom.seen.push(e));
    });
    // Game time runs slower than real time in the software renderer: wait for the blast.
    await page.waitForFunction(() => window.BC._boom.seen.length > 0, null, { timeout: 30000 }).catch(() => {});
    await wait(300);
    if (process.env.DBG) console.log(await page.evaluate(() => JSON.stringify({ st: window.BC._boom.v.state, rm: window.BC._boom.v.removed, d: window.BC._boom.v.driver, seen: window.BC._boom.seen, stats: window.BC.save.data.stats, paused: window.BC.paused })));
    check(((await save()).stats.carsDestroyed || 0) >= before + 1, 'blown-up vehicle counted');

    // ---- WASTED
    await ev('wanted:clear');
    c0 = await cash();
    await ev('player:damage', { amount: 9999 });
    await page.waitForSelector('#big-banner.wasted:not([hidden])', { timeout: 3000 });
    await shot('wasted');
    await page.waitForSelector('#jail-mode:not([hidden])', { timeout: 8000 });
    await shot('hospital');
    const fee = Math.floor(c0 * E.wasted.feeShare);
    check(c0 - (await cash()) === fee, `hospital bill ৳${fee}`);
    s = await save();
    check(s.owned.weapons.length === 0 && Object.keys(s.ammo).length === 0, 'weapons lost');
    check(await page.evaluate(() => window.BC.player.health.value === window.BC.player.health.max && !window.BC.player.dead), 'full health again');
    const dmc = await page.evaluate(() => {
      const BC = window.BC;
      const pl = BC.content.get('places').find((p) => p.id === 'dhaka-medical');
      const c = BC.world.layout.crossingCentre(pl.col, pl.row);
      return Math.hypot(BC.player.position.x - c.x, BC.player.position.z - c.z);
    });
    check(dmc < 20, `woke up at Dhaka Medical College (${dmc.toFixed(1)} m)`);
    await page.click('[data-act="leave"]');

    // ---- Blood off
    await ev('settings:blood', { on: false });
    check(await page.evaluate(() => window.BC.combatFx.bloodOn === false), 'Blood Off stops blood');
    s = await save();
    check(s.stats.busted === 2 && s.stats.wasted === 1, `stats busted ${s.stats.busted}, wasted ${s.stats.wasted}`);
  } catch (err) {
    console.log('FAIL exception:', err.message);
    failures++;
  }
  if (problems.length) { console.log('FAIL console errors:\n' + problems.join('\n')); failures++; }
  await browser.close();
  server.close();
  console.log(failures ? `CRIME CHECK FAILED (${failures})` : 'CRIME CHECK PASSED');
  process.exit(failures ? 1 : 0);
})();
