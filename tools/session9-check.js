// Session 9 check (not part of the game): accounts, the Google Sheet link, the full map + GPS,
// shops with prices, the earn offer + class landing page, health packs, out-of-bullets help,
// police on the map and the player's profile card.
//
//   node tools/session9-check.js --three <dir> --out <folder> [--quality low]
//
// The Apps Script web app is MOCKED here (same protocol as tools/sheets/Code.gs), so the test
// runs without the internet: data/sheet.json gets a fake apiUrl and every call to it is answered
// by mockSheet() below. Fails on any console error or a failed check.

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const threeDir = arg('three', null);
const outDir = arg('out', 'shots-s9');
const quality = arg('quality', 'low');
fs.mkdirSync(outDir, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary', '.ttf': 'font/ttf', '.webmanifest': 'application/manifest+json' };
const SUB = '/shoumik--breaking--city';
const API = 'https://script.google.com/macros/s/TEST/exec';

// ---- a tiny stand-in for the Apps Script web app
const players = new Map(); // phone -> { name, classLevel, salt, hash, token, save, summary }
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const calls = [];
function mockSheet(method, body) {
  if (method === 'GET') {
    return {
      ok: true,
      products: [{ product_id: 'tea', kind: 'food', name_en: 'Sheet Tea', name_bn: 'শিট চা', price: '12', active: 'TRUE' }],
      classes: [
        { class_id: 'bio-bone-cartilage-01', institute: 'breaking-biology', subject: 'জীববিজ্ঞান', chapter: 'অস্থি', title: 'অস্থি — শিট থেকে', youtube_link: 'https://youtu.be/n9wUkCiCyD8', thumbnail_url: '', description: 'শিটের বর্ণনা', reward_per_correct: '150', language: 'bn', active: 'TRUE' },
        { class_id: 'school-math-01', institute: 'breaking-school', subject: 'গণিত', chapter: 'বীজগণিত', title: 'বীজগণিত — ক্লাস ১', youtube_link: 'https://youtu.be/abc', thumbnail_url: '', description: 'সূত্র', reward_per_correct: '100', language: 'bn', active: 'TRUE' },
      ],
      questions: [1, 2, 3].flatMap((n) => [
        { class_id: 'bio-bone-cartilage-01', topic: 'অস্থি', question_id: `q${n}`, question: `প্রশ্ন ${n}?`, option_a: 'ক', option_b: 'খ', option_c: 'গ', option_d: 'ঘ', answer: 'A', explanation: 'কারণ', active: 'TRUE' },
        { class_id: 'school-math-01', topic: 'সূত্র', question_id: `m${n}`, question: `গণিত ${n}?`, option_a: '১', option_b: '২', option_c: '৩', option_d: '৪', answer: 'B', explanation: '', active: 'TRUE' },
      ]),
    };
  }
  const r = JSON.parse(body || '{}');
  calls.push(r.action);
  if (r.action === 'signup') {
    if (players.has(r.phone)) return { ok: false, error: 'exists' };
    const salt = crypto.randomUUID();
    const token = crypto.randomUUID();
    players.set(r.phone, { name: r.name, classLevel: r.classLevel, salt, hash: sha(salt + r.pin), token, save: '' });
    return { ok: true, token, profile: { phone: r.phone, name: r.name, classLevel: r.classLevel } };
  }
  if (r.action === 'signin') {
    const p = players.get(r.phone);
    if (!p) return { ok: false, error: 'notFound' };
    if (sha(p.salt + r.pin) !== p.hash) return { ok: false, error: 'badPin' };
    p.token = crypto.randomUUID();
    return { ok: true, token: p.token, profile: { phone: r.phone, name: p.name, classLevel: p.classLevel }, save: p.save };
  }
  if (r.action === 'save') {
    const p = players.get(r.phone);
    if (!p || p.token !== r.token) return { ok: false, error: 'badToken' };
    p.save = r.save;
    p.summary = r.summary;
    return { ok: true };
  }
  return { ok: false, error: 'unknownAction' };
}

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (!p.startsWith(SUB)) { res.writeHead(404); res.end(); return; }
  p = p.slice(SUB.length) || '/';
  if (p.endsWith('/')) p += 'index.html';
  fs.readFile(path.join(ROOT, p), (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    if (p === '/data/sheet.json') data = JSON.stringify({ ...JSON.parse(data), apiUrl: API, syncSeconds: 20 });
    res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(data);
  });
});

let failures = 0;
const check = (ok, what) => { console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}`); if (!ok) failures++; };

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
  await page.route(/script\.google\.com/, (route) => {
    const req = route.request();
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(mockSheet(req.method(), req.postData())) });
  });
  const base = `http://localhost:${server.address().port}${SUB}/?debug=1&sw=0&quality=${quality}`;
  const shot = async (name) => { await page.screenshot({ path: path.join(outDir, `${name}.png`) }); console.log(`     shot ${name}.png`); };
  const wait = (ms) => page.waitForTimeout(ms);
  const started = async () => {
    await page.waitForSelector('#loading-start:not([hidden])', { timeout: 120000 });
    await page.click('#loading-start');
    await page.waitForFunction(() => window.BC && window.BC.running, null, { timeout: 60000 });
    if (await page.$('#age-gate:not([hidden]) [data-yes]')) await page.click('#age-gate [data-yes]');
    await wait(800);
  };
  const BC = (fn, a) => page.evaluate(fn, a);

  try {
    // ---------------------------------------------------------- 1. sign up
    console.log('1. sign up');
    await page.goto(base);
    await page.waitForSelector('#account-screen .acc-form', { timeout: 60000 });
    await shot('01-signup');
    await page.fill('[name=name]', 'রাহিম');
    await page.fill('[name=phone]', '12345');
    await page.selectOption('[name=classLevel]', 'hsc-2');
    await page.fill('[name=pin]', '1234');
    await page.fill('[name=pin2]', '1234');
    await page.click('.acc-go');
    check(await page.isVisible('.acc-error'), 'a bad phone number is refused');
    await page.fill('[name=phone]', '+880 1712-345678');
    await page.click('.acc-go');
    await started();
    check(players.has('01712345678'), 'the account was created in the (mock) Players tab with a normalised number');
    check((await page.textContent('.hud-name span')) === 'রাহিম', 'the HUD shows the player name');
    const s0 = await BC(() => ({ cash: BC.economy.getCash(), w: BC.save.data.weapon, ammo: BC.save.data.ammo.pistol, key: BC.save.key }));
    check(s0.cash === 1000 && s0.w === 'pistol' && s0.ammo === 30, `new player: ৳1000 + pistol with 30 bullets (${JSON.stringify(s0)})`);
    check(s0.key.endsWith('.01712345678'), 'the save belongs to this phone number');
    const rep = await BC(() => ({ l: BC.content.getReport('lessons'), p: BC.content.getReport('products'), n: BC.content.get('lessons').length }));
    check(rep.l.source.startsWith('sheetApi') && rep.n === 2, `classes come from the sheet (${rep.l.source}, ${rep.n})`);
    check(rep.p.source.startsWith('sheetApi'), `products come from the sheet (${rep.p.source})`);
    await shot('02-hud-name');

    // ---------------------------------------------------------- 2. map + route
    console.log('2. full map + route');
    await page.click('#minimap');
    await page.waitForSelector('#big-map:not([hidden])');
    await wait(500);
    await shot('03-big-map');
    const groups = await page.$$eval('.bm-legend button', (b) => b.map((x) => x.dataset.group));
    check(['school', 'weapons', 'food', 'outfits', 'health', 'healthpack'].every((g) => groups.includes(g)), `map legend groups: ${groups.join(',')}`);
    await page.click('[data-go="breaking-biology"]');
    await wait(400);
    const routeLen = await BC(() => BC.features.get('minimap').route.points.length);
    check(routeLen > 2, `route to Breaking Biology has ${routeLen} points`);
    await page.click('[data-zoom="-1"]');
    await wait(400);
    await shot('04-big-map-route');
    await page.click('.bm-close');
    await wait(400);
    await shot('05-minimap-route');

    // ---------------------------------------------------------- 3. shops, price card, earn offer
    console.log('3. shops');
    const counts = await BC(() => BC.features.get('shops').spots.reduce((m, s) => { m[s.kind] = (m[s.kind] || 0) + 1; return m; }, {}));
    console.log('     shops placed', JSON.stringify(counts));
    check(Object.entries(counts).every(([k, n]) => k === 'weapons' || n < counts.weapons), 'weapon shops are the most of any kind');
    check(counts.health >= 5 && counts.outfits >= 4, 'clinics + clothes shops exist');
    const gun = await BC(() => { const s = BC.features.get('shops').spots.find((x) => x.id === 'gun-kalabagan') || BC.features.get('shops').spots.find((x) => x.kind === 'weapons'); BC.events.emit('player:teleport', { x: s.x, z: s.z, heading: 0 }); return s.id; });
    await wait(1200);
    check(await page.isVisible('.shop-preview'), `price card shows at ${gun}`);
    await shot('06-price-card');
    await BC(() => BC.economy.addCash(-BC.economy.getCash() + 100));
    await wait(300);
    await shot('07-price-card-broke');
    await page.keyboard.press('KeyE');
    await page.waitForSelector('#shop-panel:not([hidden])');
    await shot('08-shop-need-more');
    await page.click('#shop-panel [data-earn]');
    await page.waitForSelector('#earn-offer:not([hidden])');
    await shot('09-earn-offer');
    await page.click('#earn-offer [data-act="watch"]');
    await page.waitForSelector('#class-landing:not([hidden])');
    await wait(300);
    await shot('10-landing');
    const cards = await page.$$eval('.lp-card', (c) => c.length);
    check(cards === 2, `landing page lists ${cards} classes`);
    const yt = await page.$eval('.lp-watch', (a) => ({ href: a.href, target: a.target }));
    check(yt.target === '_blank' && yt.href.includes('youtu'), 'YouTube opens outside the game (link, new tab)');
    check((await page.$$('#class-landing iframe')).length === 0, 'no YouTube embed');
    await page.click('[data-filter="breaking-school"]');
    check((await page.$$eval('.lp-card', (c) => c.length)) === 1, 'filter by institute');
    await page.click('.lp-quiz');
    await page.waitForSelector('#class-mode:not([hidden]) .class-option');
    await shot('11-quiz-from-landing');
    // answer all 3 (answer B = right for the maths class)
    for (let i = 0; i < 3; i++) {
      await page.click('.class-option[data-id="B"]');
      await page.click('[data-act="next"]');
      await wait(200);
    }
    const cash2 = await BC(() => BC.economy.getCash());
    check(cash2 === 100 + 300, `right answers pay (cash now ${cash2})`);
    await page.keyboard.press('Escape'); // leave Class Mode
    await wait(300);

    // ---------------------------------------------------------- 4. sheet price override
    const tea = await BC(() => { const sh = BC.features.get('shops'); return sh.spots.find((x) => x.id === 'tea-tsc') ? null : null; });
    void tea;
    const teaRow = await BC(() => BC.content.get('products').find((p) => p.id === 'tea'));
    check(teaRow?.price === 12, 'Products tab price override is loaded (tea ৳12)');

    // ---------------------------------------------------------- 5. out of bullets
    console.log('4. out of bullets');
    await BC(() => { BC.economy.addCash(-BC.economy.getCash() + 50); BC.save.data.ammo.pistol = 0; BC.events.emit('weapon:empty', { id: 'pistol' }); });
    await page.waitForSelector('#earn-offer:not([hidden])');
    const ammoRoute = await BC(() => BC.features.get('minimap').route.target);
    check(!!ammoRoute, 'route to the nearest weapon shop is set');
    check(await page.isVisible('#earn-offer [data-act="quiz"]'), 'broke → quiz / YouTube offered');
    await shot('12-out-of-bullets');
    await page.click('#earn-offer .panel-close');

    // ---------------------------------------------------------- 6. health pack
    console.log('5. health packs');
    const hp = await BC(() => { const k = BC.features.get('healthPacks').packs[0]; BC.events.emit('player:damage', { amount: 60 }); const before = BC.player.health.value; BC.events.emit('player:teleport', { x: k.x, z: k.z, heading: 0 }); return { before, n: BC.features.get('healthPacks').packs.length }; });
    await wait(1200);
    const hpAfter = await BC(() => BC.player.health.value);
    check(hpAfter - hp.before === 25, `health pack heals 25% (${hp.before} → ${hpAfter}, ${hp.n} packs)`);
    await shot('13-health-pack');

    // ---------------------------------------------------------- 7. police on the map
    console.log('6. police on the map');
    await BC(() => BC.events.emit('wanted:set', { stars: 3 }));
    await wait(7000);
    const pol = await BC(() => BC.features.get('minimap').blips.get('police')?.length || 0);
    check(pol > 0, `police on the map: ${pol}`);
    await shot('14-police-minimap');
    await page.keyboard.press('KeyM');
    await page.waitForSelector('#big-map:not([hidden])');
    await wait(600);
    await shot('15-police-big-map');
    await page.keyboard.press('KeyM');
    await BC(() => BC.events.emit('wanted:clear'));
    await wait(1500);

    // ---------------------------------------------------------- 8. profile + sync + sign out / in
    console.log('7. profile, sync, sign out and in');
    await page.click('.hud-name');
    await page.waitForSelector('#profile-card:not([hidden])');
    await shot('16-profile');
    check((await page.textContent('#profile-card')).includes('রাহিম'), 'profile shows the name');
    await BC(() => BC.account.syncNow());
    const synced = players.get('01712345678');
    check(!!synced.save && synced.summary?.cash === 50, `progress reached the Players tab (cash ${synced.summary?.cash})`);
    await page.click('[data-signout]');
    await page.click('[data-signout]');
    await page.waitForSelector('#account-screen .acc-form', { timeout: 60000 });
    check(await page.isVisible('.acc-known button'), 'sign-in lists the player known on this phone');
    await page.click('.acc-known button');
    await page.fill('[name=pin]', '9999');
    await page.click('.acc-go');
    await page.waitForSelector('.acc-error:not([hidden])');
    check(true, 'a wrong PIN is refused');
    await page.fill('[name=pin]', '1234');
    await page.click('.acc-go');
    await started();
    check((await BC(() => BC.economy.getCash())) === 50, 'progress is back after signing in');

    // ---------------------------------------------------------- 9. another phone: same number cannot sign up twice, sign in brings the save
    console.log('8. another phone');
    await BC(() => { BC.save.stopAutosave(); BC.save.memoryOnly = true; BC.account.stopSync(); localStorage.clear(); });
    await page.goto(base);
    await page.waitForSelector('#account-screen .acc-form');
    await page.fill('[name=name]', 'Someone');
    await page.fill('[name=phone]', '01712345678');
    await page.selectOption('[name=classLevel]', 'class-9');
    await page.fill('[name=pin]', '1111');
    await page.fill('[name=pin2]', '1111');
    await page.click('.acc-go');
    await page.waitForSelector('.acc-error:not([hidden])');
    check((await page.textContent('.acc-error')).length > 0 && await page.isVisible('[data-mode="signin"].on'), 'the same number cannot sign up twice → sign in');
    await page.fill('[name=pin]', '1234');
    await page.click('.acc-go');
    await started();
    check((await BC(() => BC.economy.getCash())) === 50, 'signing in on a new phone brings the progress from the sheet');
  } catch (err) {
    failures++;
    console.log('FAIL:', err.stack || err.message);
    await shot('zz-error').catch(() => {});
  }
  if (problems.length) { failures++; console.log('FAIL: console errors:\n' + problems.join('\n')); }
  await browser.close();
  server.close();
  console.log(failures ? `SESSION 9 CHECK FAILED (${failures})` : 'SESSION 9 CHECK PASSED');
  process.exit(failures ? 1 : 0);
})();
