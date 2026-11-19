// Session 7 check (not part of the game): day/night, rain, load-shedding, sounds, radio,
// profile card, reward codes, screenshot, settings and the 17+ screen — in headless Chromium.
// Saves screenshots and fails on any console error or failed check.
//
//   node tools/vibe-check.js --three <dir with three@0.170.0> --out <folder> [--quality medium]
//        [--only times,rain,power,signs,ui,sound]
//
// (Cloud sandboxes usually cannot reach the CDN, hence --three; see tools/smoke-test.js.)

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
const outDir = path.resolve(arg('out', 'shots'));
const quality = arg('quality', 'medium');
const only = arg('only', 'times,rain,power,signs,ui,sound').split(',');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary', '.ttf': 'font/ttf' };
fs.mkdirSync(outDir, { recursive: true });

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

let failures = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failures++; };

(async () => {
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 915, height: 412 } });
  const problems = [];
  page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });
  page.on('pageerror', (e) => problems.push(e.stack || e.message));
  if (threeDir) {
    await page.route(/cdn\.jsdelivr\.net\/npm\/three@[^/]+\//, (route) => {
      const rel = route.request().url().replace(/^.*three@[^/]+\//, '');
      const file = path.join(threeDir, rel);
      if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: 'not found' });
      return route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(file) });
    });
  }
  // Every run starts from a fresh save that has already passed the 17+ screen (it is tested on its own below).
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('vibe-keep')) {
      localStorage.clear();
      localStorage.setItem('breakingCity.save', JSON.stringify({ version: 5, cash: 500, flags: { ageOk: true }, settings: {} }));
    }
  });
  const base = `http://localhost:${server.address().port}${SUB}/?debug=1&autostart=1&quality=${quality}`;
  const boot = async (extra = '') => {
    await page.goto(base + extra);
    await page.waitForFunction(() => window.BC && window.BC.running, null, { timeout: 120000 });
    await page.keyboard.press('KeyZ'); // a "gesture" so audio may start (a canvas click would lock the mouse)
    await page.waitForTimeout(1500);
  };
  const shot = async (name) => { await page.screenshot({ path: path.join(outDir, `${name}.png`) }); console.log(`     shot ${name}.png`); };
  const settle = (ms = 2500) => page.waitForTimeout(ms);
  // Look along a street towards the west (sunset side) from a bit higher up.
  const pose = () => page.evaluate(() => {
    const B = window.BC; const p = B.player.position;
    B.events.emit('player:teleport', { x: p.x, z: p.z, heading: -Math.PI / 2 }); // face west
    B.cameraRig.yaw = -Math.PI / 2;
  });

  try {
    await boot();
    check(typeof window !== 'undefined' || true, 'game booted');
    const has = await page.evaluate(() => ({ clock: !!window.BC.clock, cycle: !!window.BC.world.sky.cycle, shading: !!window.BC.world.cityShading, audio: !!window.BC.audio }));
    check(has.clock && has.cycle && has.shading && has.audio, `clock, sky blend, city shading and audio exist (${JSON.stringify(has)})`);

    if (only.includes('times')) {
      for (const h of [8, 13, 17.4, 18.6, 21, 2]) {
        await page.evaluate((hour) => window.BC.events.emit('time:set', { hour }), h);
        await pose();
        await settle(1800);
        await shot(`time-${String(h).replace('.', '_')}`);
      }
      const hour = await page.evaluate(() => window.BC.clock.hour);
      check(Math.abs(hour - 2) < 0.2, `clock follows time:set (${hour.toFixed(2)})`);
      const night = await page.evaluate(() => window.BC.clock.night);
      check(night === true, 'it is night at 02:00');
      const t0 = await page.evaluate(() => window.BC.clock.hour);
      await settle(3000);
      const t1 = await page.evaluate(() => window.BC.clock.hour);
      check(t1 > t0, `the clock runs (${t0.toFixed(4)} → ${t1.toFixed(4)})`);
    }

    if (only.includes('rain')) {
      await page.evaluate(() => window.BC.events.emit('time:set', { hour: 16 }));
      await page.evaluate(() => window.BC.events.emit('weather:set', { rain: true }));
      await page.waitForFunction(() => window.BC.weather.rain > 0.95 && window.BC.weather.wet > 0.9, null, { timeout: 240000, polling: 500 });
      check(await page.evaluate(() => window.BC.scene.getObjectByName('rain').visible), 'rain drops are drawn');
      await pose();
      await shot('rain-day');
      await page.evaluate(() => window.BC.events.emit('time:set', { hour: 21 }));
      await settle(1500);
      await shot('rain-night');
      await page.evaluate(() => window.BC.events.emit('weather:thunder'));
      await settle(150);
      await shot('rain-lightning');
      await page.evaluate(() => window.BC.events.emit('weather:set', { rain: false }));
      await page.waitForFunction(() => window.BC.weather.rain < 0.01, null, { timeout: 240000, polling: 500 });
      check(true, 'rain stops');
    }

    if (only.includes('power')) {
      await page.evaluate(() => window.BC.events.emit('time:set', { hour: 21 }));
      const d = await page.evaluate(() => window.BC.world.districtAt(window.BC.player.position.x, window.BC.player.position.z).id);
      await pose();
      await settle(1500);
      await shot('power-before');
      await page.evaluate((district) => window.BC.events.emit('power:cutNow', { district }), d);
      await settle(1500);
      await shot('power-cut');
      const toast = await page.evaluate(() => document.querySelector('.hud-toast')?.textContent || '');
      check(toast.length > 3, `load-shedding toast shown: "${toast}"`);
    }

    if (only.includes('signs')) {
      await page.evaluate(() => window.BC.events.emit('time:set', { hour: 20 }));
      // Stand in a dense street in Old Dhaka facing a row of shops.
      await page.evaluate(() => {
        const B = window.BC; const L = B.world.layout;
        const c = L.crossingCentre(5, 14);
        B.events.emit('player:teleport', { x: c.x + 30, z: c.z + 3, heading: Math.PI });
        B.cameraRig.yaw = Math.PI;
      });
      await settle(4000);
      await settle(800);
      await shot('signs-night');
      await page.evaluate(() => window.BC.events.emit('time:set', { hour: 11 }));
      await settle(1200);
      await shot('signs-day');
    }
    if (only.includes('sound')) {
      const st = await page.evaluate(() => window.BC.audio.ctx?.state || 'none');
      check(st === 'running', `audio context runs after a tap (${st})`);
      const voices = await page.evaluate(async () => {
        const B = window.BC; const p = B.player.position;
        B.events.emit('weapon:fired', { id: 'pistol', x: p.x + 3, z: p.z });
        B.events.emit('explosion', { x: p.x + 10, z: p.z, radius: 6, power: 1 });
        B.events.emit('police:fired', { x: p.x - 5, z: p.z, rifle: true });
        B.audio.play('crow', { x: p.x + 5, z: p.z + 5 });
        B.audio.play('hawker', { x: p.x - 5, z: p.z + 5 });
        return B.audio.voices;
      });
      check(voices >= 4, `gunshot, explosion, police shot, crow and hawker play (${voices} voices)`);
      // Radio: pretend he got into a car, then a rickshaw.
      const radio = await page.evaluate(async () => {
        const B = window.BC;
        B.events.emit('vehicle:entered', { id: 1, type: 'sedan', passenger: false });
        await new Promise((r) => setTimeout(r, 400));
        const a = document.querySelector('.radio-banner').textContent;
        B.events.emit('input:radio');
        await new Promise((r) => setTimeout(r, 300));
        const b = document.querySelector('.radio-banner').textContent;
        const station = B.save.data.settings.radio;
        B.events.emit('vehicle:exited', { id: 1, type: 'sedan' });
        B.events.emit('vehicle:entered', { id: 2, type: 'rickshaw', passenger: false });
        await new Promise((r) => setTimeout(r, 300));
        const shown = document.querySelector('.radio-banner').classList.contains('show');
        B.events.emit('vehicle:exited', { id: 2, type: 'rickshaw' });
        return { a, b, station, rickshaw: shown };
      });
      check(radio.a.length > 3 && radio.b !== radio.a && radio.station === 1, `radio plays and R changes station ("${radio.a}" → "${radio.b}")`);
      check(!radio.rickshaw, 'no radio in a rickshaw');
      await page.evaluate(() => window.BC.events.emit('radio:set', { station: 0 }));
    }

    if (only.includes('ui')) {
      // Settings: language, sound, control size.
      await page.click('#settings-button');
      await settle(400);
      await shot('settings');
      await page.click('[data-lang="en"]');
      const title = await page.evaluate(() => document.querySelector('#settings-panel h2').textContent);
      check(title === 'Settings', `language switch to English ("${title}")`);
      await page.click('[data-sound="off"]');
      const muted = await page.evaluate(() => window.BC.save.data.settings.sound === false && window.BC.audio.buses.master.gain.value < 0.5);
      check(muted, 'sound off mutes the master bus');
      await page.click('[data-sound="on"]');
      await page.click('[data-size="large"]');
      const w = await page.evaluate(() => parseFloat(document.querySelector('.touch-attack').style.width));
      check(w > 80, `large buttons (${w}px)`);
      await page.click('[data-size="normal"]');
      await page.click('[data-reset]');
      const armed = await page.evaluate(() => document.querySelector('[data-reset]').classList.contains('armed'));
      check(armed, 'reset asks again before deleting');
      await page.click('[data-lang="bn"]');
      await page.click('#settings-panel .panel-close');
      // Reward code: fake one finished lesson.
      await page.evaluate(() => {
        const B = window.BC;
        B.save.data.lessons['test-lesson'] = { attempts: 1, paid: ['q1'], earned: 150, best: 1, lastAt: Date.now() };
        B.events.emit('lesson:completed', { id: 'test-lesson', institute: 'breaking-biology', correct: 1, total: 3, earned: 150, attempt: 1 });
      });
      await settle(600);
      const unlocked = await page.evaluate(() => Object.keys(window.BC.save.data.rewards || {}));
      check(unlocked.includes('first-lesson'), `reward code unlocked after one lesson (${unlocked.join(', ')})`);
      // Profile card.
      await page.click('.hud-portrait');
      await settle(400);
      await shot('profile-card');
      const card = await page.evaluate(() => document.querySelector('#profile-card').textContent);
      check(/Shoumik|শৌমিক/.test(card) && /BCITY-FIRST10/.test(card), 'profile card shows his name and the unlocked code');
      await page.click('#profile-card [data-copy]');
      await settle(300);
      const copied = await page.evaluate(() => document.querySelector('#profile-card [data-copy]').textContent);
      console.log(`     copy button says: ${copied}`);
      await page.click('#profile-card [data-close]');
      // Screenshot.
      await page.evaluate(() => window.BC.events.emit('time:set', { hour: 19.5 }));
      await settle(1200);
      await page.click('#photo-button');
      await page.waitForSelector('.photo-preview', { timeout: 10000 });
      await settle(800);
      const img = await page.evaluate(() => { const i = document.querySelector('.photo-preview'); return { w: i.naturalWidth, h: i.naturalHeight, src: i.src.slice(0, 20) }; });
      check(img.w > 100 && img.h > 100, `screenshot made (${img.w}x${img.h}, ${img.src}…)`);
      const dataUrl = await page.evaluate(async () => {
        const i = document.querySelector('.photo-preview');
        const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight;
        c.getContext('2d').drawImage(i, 0, 0); return c.toDataURL('image/jpeg', 0.85);
      });
      fs.writeFileSync(path.join(outDir, 'screenshot-watermark.jpg'), Buffer.from(dataUrl.split(',')[1], 'base64'));
      console.log('     shot screenshot-watermark.jpg');
      await page.click('#photo-panel [data-close]');

      // 17+ screen on a brand-new save.
      await page.evaluate(() => { window.BC.save.stopAutosave(); window.BC.save.memoryOnly = true; sessionStorage.setItem('vibe-keep', '1'); localStorage.clear(); });
      await boot('&agegate=1');
      await page.waitForSelector('#age-gate:not([hidden])', { timeout: 10000 });
      await shot('age-gate');
      const paused = await page.evaluate(() => window.BC.paused);
      check(paused, 'game is paused behind the 17+ screen');
      await page.click('#age-gate [data-no]');
      await shot('age-gate-under17');
      await page.click('#age-gate [data-back]');
      await page.click('#age-gate [data-yes]');
      const ok = await page.evaluate(() => ({ hidden: document.querySelector('#age-gate').hidden, flag: window.BC.save.data.flags.ageOk, paused: window.BC.paused }));
      check(ok.hidden && ok.flag === true && !ok.paused, `17+ accepted and saved (${JSON.stringify(ok)})`);
      await boot('&agegate=1');
      const again = await page.evaluate(() => document.querySelector('#age-gate').hidden);
      check(again, '17+ screen is not shown again after a reload');
    }
  } catch (err) {
    console.error(err);
    failures++;
  }

  const real = problems.filter((p) => !/favicon/.test(p));
  check(real.length === 0, `no console errors${real.length ? ':\n  ' + real.slice(0, 8).join('\n  ') : ''}`);
  await browser.close();
  server.close();
  console.log(failures ? `VIBE CHECK FAILED (${failures})` : 'VIBE CHECK PASSED');
  process.exit(failures ? 1 : 0);
})();
