// Class Mode + shops check (Session 5) for Claude sessions (not part of the game).
// Boots the game headless, walks Shoumik into the Breaking Biology ring, and runs:
//   lesson list → lesson → Start Check (2 right, 1 wrong: +2×reward), second attempt (all right:
//   only the not-yet-paid question pays), lesson is then "done"; Quiz Class round (+per correct + daily bonus); a time-out;
//   Bangla digits / font on screen; food heals; buying a bicycle, an outfit, a weapon, a home;
//   sleeping at home; the ?admin=1 panel; a reload keeps everything.
// Fails on any console error or a wrong number. Saves screenshots into --out.
//
//   node tools/class-check.js --three <dir with three@0.170.0> --out shots [--quality low]

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
  // External links must open outside the game: count window.open / new pages instead of following them.
  const url = `http://localhost:${server.address().port}${SUB}/?debug=1&autostart=1&admin=1&quality=${quality}`;
  const boot = async () => {
    await page.goto(url);
    await page.waitForFunction(() => window.BC && window.BC.running, null, { timeout: 120000 });
  };
  const shot = (name) => page.screenshot({ path: path.join(outDir, `${name}.png`) });
  const cash = () => page.evaluate(() => window.BC.economy.getCash());
  const click = (sel) => page.click(sel);
  const text = (sel) => page.textContent(sel);

  try {
    await page.addInitScript(() => { if (!sessionStorage.getItem('kept')) { localStorage.clear(); sessionStorage.setItem('kept', '1'); } });
    await boot();

    // ---- walk into the Breaking Biology ring and press Enter
    const marker = await page.evaluate(() => window.BC.world.landmarks.markers.find((m) => m.id === 'breaking-biology'));
    check(!!marker, 'Breaking Biology entrance marker exists');
    await page.evaluate((m) => { const p = window.BC.player.position; p.x = m.x; p.z = m.z; }, marker);
    await page.waitForTimeout(800);
    await page.evaluate(() => window.BC.events.emit('input:action'));
    await page.waitForSelector('#class-mode:not([hidden])', { timeout: 5000 });
    check(await page.evaluate(() => window.BC.paused), 'game is paused in Class Mode');
    const font = await page.evaluate(() => getComputedStyle(document.querySelector('#class-mode .panel')).fontFamily);
    check(/Hind Siliguri|Noirrit|Bengali/.test(font), `Class Mode uses the Bangla font (${font})`);
    await shot('class-home');

    // ---- Lesson Check, attempt 1: all correct
    const lesson = await page.evaluate(() => window.BC.content.get('lessons').find((l) => l.id === 'bio-bone-cartilage-01'));
    await click('[data-act="lessons"]');
    await shot('class-lessons');
    check((await text('.class-lesson')).includes('নতুন'), 'lesson shows "নতুন" (not done)');
    await click('[data-act="lesson"][data-id="bio-bone-cartilage-01"]');
    const yt = await page.$eval('.class-youtube', (a) => ({ href: a.href, target: a.target }));
    check(yt.href === lesson.youtubeUrl && yt.target === '_blank', 'Watch on YouTube is an external link (new tab), not embedded');
    check(!(await page.$('iframe')), 'no iframe / embedded video anywhere');
    check(BN.test(await text('#class-mode .panel')), 'lesson screen uses Bangla digits');
    await shot('class-lesson');

    // pattern(question) -> true = answer right. Attempt 1 gets q3 wrong.
    const answerAll = async (pattern) => {
      for (let i = 0; i < 3; i++) {
        await page.waitForSelector('.class-question');
        const q = await text('.class-question');
        const real = lesson.questions.find((x) => x.question === q.trim());
        const right = pattern(real);
        const letter = right ? real.answer : ['A', 'B', 'C', 'D'].find((l) => l !== real.answer);
        if (i === 0 && pattern(lesson.questions[0]) !== pattern(lesson.questions[2])) {
          const timer = await text('[data-timer]');
          check(/সেকেন্ড/.test(timer) && BN.test(timer), `timer in Bangla (${timer.trim()})`);
          await shot('class-question');
        }
        await click(`.class-option[data-id="${letter}"]`);
        const fb = await text('[data-feedback]');
        check(fb.includes(right ? 'সঠিক!' : 'ভুল!'), `feedback "${right ? 'সঠিক!' : 'ভুল!'}" + explanation shown`);
        if (!right) await shot('class-feedback-wrong');
        else await shot('class-feedback-right');
        await click('[data-act="next"]');
      }
    };
    let before = await cash();
    await click('[data-act="start"]');
    await answerAll((q) => q.id !== 'q3');
    await page.waitForSelector('.class-score');
    await shot('class-result');
    check((await cash()) - before === 300, `attempt 1 (2 of 3 right) paid ৳300 (got ${(await cash()) - before})`);

    // ---- attempt 2: all right, but only q3 is new → ৳150; then the lesson is done
    await click('[data-act="lessons"]');
    check((await text('.class-lesson')).includes('আবার'), 'lesson shows "আবার চেষ্টা করো" after attempt 1');
    await click('[data-act="lesson"]');
    before = await cash();
    await click('[data-act="start"]');
    await answerAll(() => true);
    await page.waitForSelector('.class-score');
    check((await cash()) - before === 150, `attempt 2 paid only the new question ৳150 (got ${(await cash()) - before})`);
    check((await text('#class-mode .panel')).includes('আবার টাকা দেওয়া হয় না'), 'result explains repeats pay once');
    await click('[data-act="lessons"]');
    check((await text('.class-lesson')).includes('সম্পন্ন'), 'lesson is "সম্পন্ন" after max attempts');
    await click('[data-act="lesson"]');
    check(await page.$eval('[data-act="start"]', (b) => b.disabled), 'Start Check is disabled when no attempts are left');
    const saved = await page.evaluate(() => window.BC.save.data.lessons['bio-bone-cartilage-01']);
    check(saved && saved.attempts === 2 && saved.paid.length === 3 && saved.earned === 450, 'lesson result saved (2 attempts, 3 paid, ৳450)');

    // ---- Quiz Class: 3 questions right = 3×50 + 300 first-of-day
    await click('[data-act="lessons"]');
    await click('[data-act="home"]');
    before = await cash();
    await click('[data-act="quiz"]');
    for (let i = 0; i < 3; i++) {
      await page.waitForSelector('.class-question');
      const q = await text('.class-question');
      const real = lesson.questions.find((x) => x.question === q.trim());
      await click(`.class-option[data-id="${real.answer}"]`);
      await click('[data-act="next"]');
    }
    await page.waitForSelector('.class-score');
    await shot('class-quiz-result');
    check((await cash()) - before === 450, `Quiz Class paid 3×৳50 + ৳300 daily (got ${(await cash()) - before})`);
    before = await cash();
    await click('[data-act="quiz"]');
    for (let i = 0; i < 3; i++) {
      await page.waitForSelector('.class-question');
      const q = await text('.class-question');
      const real = lesson.questions.find((x) => x.question === q.trim());
      await click(`.class-option[data-id="${real.answer}"]`);
      await click('[data-act="next"]');
    }
    await page.waitForSelector('.class-score');
    check((await cash()) - before === 150, `second round: no daily bonus again (got ${(await cash()) - before})`);

    // ---- time-out
    await page.evaluate(() => { window.BC.config.get('economy').quizClass.timePerQuestionSec = 1; });
    await click('[data-act="quiz"]');
    await page.waitForTimeout(1800);
    check((await text('[data-feedback]')).includes('সময় শেষ'), 'time-out shows "সময় শেষ!"');
    await click('[data-act="quit"]');
    await page.evaluate(() => { window.BC.config.get('economy').quizClass.timePerQuestionSec = 30; });
    await click('[data-act="close"]');
    check(!(await page.evaluate(() => window.BC.paused)), 'leaving Class Mode resumes the game');

    // ---- shops
    const spots = await page.evaluate(() => window.BC.features.get('shops').spots.map((s) => ({ id: s.id, kind: s.kind, x: s.x, z: s.z })));
    const listed = await page.evaluate(() => window.BC.config.get('shops').shops.length);
    check(spots.length === listed, `all ${listed} shops placed (${spots.length})`);
    if (spots.length !== listed) console.log('     missing:', (await page.evaluate(() => window.BC.config.get('shops').shops.map((s) => s.id))).filter((id) => !spots.some((s) => s.id === id)).join(', '));
    await page.evaluate(() => window.BC.economy.addCash(300000));
    // food: full health → refused; hurt → heals
    await page.evaluate(() => window.BC.events.emit('shop:open', { id: 'fuchka-shahbag' }));
    before = await cash();
    await click('[data-buy="fuchka"]');
    check((await cash()) === before && (await text('.shop-msg')).length > 0, 'food is not sold at full health');
    await page.evaluate(() => { for (let i = 0; i < 6; i++) window.BC.events.emit('player:hit', { power: 2 }); });
    const hurt = await page.evaluate(() => window.BC.player.health.value);
    await click('[data-buy="fuchka"]');
    const healed = await page.evaluate(() => window.BC.player.health.value);
    check(hurt < 100 && healed === Math.min(100, hurt + 45) && before - (await cash()) === 50, `fuchka ৳50 heals +45 (${hurt} → ${healed})`);
    await shot('shop-food');
    await click('#shop-panel .panel-close');
    // bicycle
    const vBefore = await page.evaluate(() => window.BC.save.data.owned.vehicles.length);
    await page.evaluate(() => window.BC.events.emit('shop:open', { id: 'bike-shop' }));
    await click('[data-buy="bicycle"]');
    check((await page.evaluate(() => window.BC.save.data.owned.vehicles.length)) === vBefore + 1, 'bicycle bought → owned vehicle');
    await shot('shop-bikes');
    await click('#shop-panel .panel-close');
    // outfit
    await page.evaluate(() => window.BC.events.emit('shop:open', { id: 'clothes-shop' }));
    await click('[data-buy="polo_black"]');
    check(await page.evaluate(() => window.BC.save.data.owned.outfits.includes('polo_black') && window.BC.player.outfit === 'polo_black'), 'polo bought and worn');
    await shot('shop-clothes');
    await click('#shop-panel .panel-close');
    // weapon
    await page.evaluate(() => window.BC.events.emit('shop:open', { id: 'weapon-shop' }));
    // (Session 9: every new player already owns a pistol, so buy the revolver)
    await click('[data-buy="revolver"]');
    check(await page.evaluate(() => window.BC.save.data.owned.weapons.includes('revolver')), 'revolver bought');
    await click('#shop-panel .panel-close');
    // home
    await page.evaluate(() => window.BC.events.emit('shop:open', { id: 'property-office' }));
    await click('[data-buy="dhanmondi-flat"]');
    await shot('shop-homes');
    const home = await page.evaluate(() => ({ home: window.BC.save.data.home, garage: window.BC.save.data.garage }));
    check(home.home?.id === 'dhanmondi-flat' && home.garage?.col === 3, 'Dhanmondi flat bought, garage moved there');
    await click('#shop-panel .panel-close');
    const homeSpot = await page.evaluate(() => window.BC.features.get('shops').spots.find((s) => s.homeId === 'dhanmondi-flat'));
    check(!!homeSpot, 'home ring placed');
    await page.evaluate((s) => { const p = window.BC.player.position; p.x = s.x; p.z = s.z; }, homeSpot);
    await page.waitForTimeout(600);
    await page.evaluate(() => window.BC.events.emit('player:hit', { power: 3 }));
    await page.evaluate(() => window.BC.events.emit('input:action'));
    await page.waitForSelector('#shop-panel:not([hidden])');
    check((await page.evaluate(() => window.BC.player.health.value)) === 100, 'sleeping at home restores full health');
    await click('#shop-panel .panel-close');
    await page.waitForTimeout(400);
    await page.evaluate(() => { window.BC.cameraRig.yaw += 0; });
    await shot('world-home-ring');

    // a shop ring in the world
    const shopSpot = spots.find((s) => s.id === 'clothes-shop');
    await page.evaluate((s) => { const p = window.BC.player.position; p.x = s.x + 4; p.z = s.z + 4; }, shopSpot);
    await page.waitForTimeout(1500);
    await shot('world-shop-ring');

    // ---- admin
    await click('#admin-button');
    const adminText = await text('#admin-panel');
    check(/লেসন|Lessons/.test(adminText) && /local/.test(adminText), 'admin panel shows lesson counts and the source');
    await shot('admin');
    await click('#admin-panel .panel-close');

    // ---- reload keeps everything
    await page.evaluate(() => window.BC.save.flush());
    const cashSaved = await cash();
    await boot();
    const after = await page.evaluate(() => ({ cash: window.BC.economy.getCash(), lesson: window.BC.save.data.lessons['bio-bone-cartilage-01'], homes: window.BC.save.data.owned.homes, homeSpots: window.BC.features.get('shops').spots.filter((s) => s.homeId).length, version: window.BC.save.data.version }));
    check(after.cash === cashSaved && after.lesson?.attempts === 2 && after.homes.includes('dhanmondi-flat') && after.homeSpots === 1 && after.version === 5, 'reload keeps cash, lesson result and home (save v5)');
  } catch (err) {
    failures++;
    console.log('FAIL', err.message);
    await shot('error').catch(() => {});
  }
  for (const p of problems) console.log('console error:', p);
  await browser.close();
  server.close();
  const ok = failures === 0 && problems.length === 0;
  console.log(ok ? 'CLASS CHECK PASSED' : `CLASS CHECK FAILED (${failures} checks, ${problems.length} console errors)`);
  process.exit(ok ? 0 : 1);
})();
