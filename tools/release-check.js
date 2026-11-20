// Release check (Session 8). Not part of the game.
//
//   node tools/release-check.js --three <dir with three@0.170.0> [--out <folder>] [--only pwa,pages,auto,lost]
//
//   pwa    service worker registers (?sw=1), caches the game, then the game boots again with the
//          network switched OFF (offline play); manifest + icons are valid.
//   pages  privacy.html + credits.html render in Bangla and English with no console errors;
//          Settings shows the App row with working Privacy / Credits links.
//   auto   ?autoquality=1 in the (slow, software-rendered) test browser: the device check starts
//          on Low, and the FPS watchdog lowers the resolution with a toast.
//   lost   a lost WebGL context shows the "graphics paused" screen with a Reload button.
// Fails on any console error. Screenshots go to --out (if given).

process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1'; // lets context.route see the service worker's fetches
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
const only = (arg('only', 'pwa,pages,auto,lost')).split(',');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary', '.webmanifest': 'application/manifest+json' };
const SUB = '/shoumik--breaking--city';
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (!p.startsWith(SUB)) { res.writeHead(404); res.end('outside sub-path'); return; }
  p = p.slice(SUB.length) || '/';
  if (p.endsWith('/')) p += 'index.html';
  fs.readFile(path.join(ROOT, p), (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(data);
  });
});

let failures = 0;
const check = (ok, label) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`); if (!ok) failures += 1; };
const shot = async (page, name) => { if (outDir) await page.screenshot({ path: path.join(outDir, `${name}.png`) }); };

async function newContext(browser, opts = {}) {
  const context = await browser.newContext({ viewport: { width: 915, height: 412 }, ...opts });
  // three.js from the local copy (the sandbox usually cannot reach the CDN); Google Fonts blocked
  // quietly (the game falls back to the device font, as it would offline).
  await context.route(/cdn\.jsdelivr\.net\/npm\/three@[^/]+\//, (route) => {
    const rel = route.request().url().replace(/^.*three@[^/]+\//, '');
    const file = path.join(threeDir, rel);
    if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: 'not found' });
    return route.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(file) });
  });
  await context.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  return context;
}

function watchErrors(page, list) {
  page.on('console', (m) => { if (m.type() === 'error') list.push(m.text()); });
  page.on('pageerror', (e) => list.push(e.stack || e.message));
}

const base = () => `http://localhost:${server.address().port}${SUB}/`;
const waitGame = (page) => page.waitForFunction(() => window.BC && window.BC.running, null, { timeout: 120000 });

async function testPwa(browser) {
  const context = await newContext(browser);
  const page = await context.newPage();
  const errors = [];
  watchErrors(page, errors);
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
  check(manifest.start_url === './' && manifest.scope === './', 'manifest uses relative start_url/scope');
  check(manifest.icons.every((i) => fs.existsSync(path.join(ROOT, i.src))), 'manifest icons exist');
  await page.goto(`${base()}?debug=1&autostart=1&sw=1&quality=low`);
  await waitGame(page);
  const reg = await page.evaluate(async () => {
    const r = await Promise.race([navigator.serviceWorker.ready, new Promise((res) => setTimeout(() => res(null), 30000))]);
    if (!r) return { scope: 'not registered', script: '' };
    return { scope: r.scope, script: r.active?.scriptURL || '' };
  });
  check(reg.scope.endsWith(`${SUB}/`), `service worker scope is the game folder (${reg.scope})`);
  check(reg.script.includes('sw.js?cfg='), 'service worker gets data/pwa.json in its URL');
  // First visit is not controlled yet; reload once so every file goes through the worker.
  await page.reload();
  await waitGame(page);
  await page.waitForTimeout(1500);
  const stats = await page.evaluate(async () => {
    const names = await caches.keys();
    const c = await caches.open(names.find((n) => n.startsWith('breaking-city-')));
    const keys = (await c.keys()).map((r) => r.url);
    return { names, count: keys.length, three: keys.some((u) => u.includes('three.module')), lessons: keys.some((u) => u.endsWith('data/lessons.json')), glb: keys.some((u) => u.endsWith('.glb')), controlled: !!navigator.serviceWorker.controller };
  });
  check(stats.controlled, 'page is controlled by the service worker');
  check(stats.count > 50, `files saved for offline: ${stats.count}`);
  check(stats.three && stats.lessons, 'three.js and the lessons are in the offline copy');
  // Offline: the whole game must boot again from the cache.
  await context.setOffline(true);
  await page.reload();
  await waitGame(page);
  await page.waitForTimeout(1000);
  const people = await page.evaluate(() => window.BC.crowd?.people.size ?? -1);
  check(people > 0, `offline boot works (people on the street: ${people})`);
  await shot(page, 'pwa-offline');
  await context.setOffline(false);
  check(errors.length === 0, `no console errors${errors.length ? ':\n  ' + errors.join('\n  ') : ''}`);
  await context.close();
}

async function testPages(browser) {
  const context = await newContext(browser);
  const page = await context.newPage();
  const errors = [];
  watchErrors(page, errors);
  for (const id of ['privacy', 'credits']) {
    for (const lang of ['bn', 'en']) {
      await page.goto(`${base()}${id}.html?lang=${lang}`);
      await page.waitForSelector('#page h1', { timeout: 20000 });
      const info = await page.evaluate(() => ({ h1: document.querySelector('h1').textContent, sections: document.querySelectorAll('section').length, social: document.querySelectorAll('.social').length, back: document.querySelector('.back').getAttribute('href') }));
      check(info.sections >= 4 && info.back === './', `${id} (${lang}): "${info.h1}", ${info.sections} sections`);
      if (id === 'credits') check(info.social >= 6, `credits (${lang}) shows ${info.social} social buttons`);
      await shot(page, `page-${id}-${lang}`);
    }
  }
  await page.click('.lang');
  check((await page.evaluate(() => document.documentElement.lang)) === 'bn', 'language button switches the page');
  // The App row in Settings.
  await page.goto(`${base()}?debug=1&autostart=1&quality=low`);
  await waitGame(page);
  await page.click('#settings-button');
  const row = await page.evaluate(() => ({ privacy: document.querySelector('[data-page="privacy"]')?.getAttribute('href'), note: document.querySelector('.install-note')?.textContent }));
  check(row.privacy?.startsWith('privacy.html?lang='), `Settings links to the privacy page (${row.privacy})`);
  check(!!row.note, `install note: "${row.note}"`);
  await page.evaluate(() => document.querySelector('#settings-panel .panel').scrollTo(0, 99999));
  await shot(page, 'settings-app-row');
  check(errors.length === 0, `no console errors${errors.length ? ':\n  ' + errors.join('\n  ') : ''}`);
  await context.close();
}

async function testAuto(browser) {
  const context = await newContext(browser);
  const page = await context.newPage();
  const errors = [];
  watchErrors(page, errors);
  await page.goto(`${base()}?debug=1&autostart=1&autoquality=1`);
  await waitGame(page);
  const first = await page.evaluate(() => ({ q: window.BC.qualityName, auto: window.BC.save.data.settings.qualityAuto }));
  check(first.q === 'low' && first.auto === true, `software-rendered test browser starts on Low automatically (${first.q})`);
  // Make the watchdog quick, then wait for one sample.
  await page.evaluate(() => { const w = window.BC.config.get('performance').watchdog; w.warmupSeconds = 0.5; w.sampleSeconds = 2; w.downgradeBelowFps = 1000; });
  await page.waitForFunction(() => (window.BC.save.data.settings.resolutionScale || 1) < 1, null, { timeout: 30000 }).catch(() => {});
  const after = await page.evaluate(() => ({ scale: window.BC.save.data.settings.resolutionScale, toast: document.body.textContent.includes('শার্পনেস') }));
  check(after.scale < 1, `watchdog lowered the resolution on Low (×${after.scale})`);
  check(after.toast, 'a toast told the player');
  // A player's own choice switches the watchdog off and restores full resolution.
  await page.evaluate(() => window.BC.setQuality('medium'));
  const manual = await page.evaluate(() => ({ auto: window.BC.save.data.settings.qualityAuto, scale: window.BC.save.data.settings.resolutionScale }));
  check(manual.auto === false && manual.scale === 1, 'choosing a quality in Settings turns the automatic mode off');
  check(errors.length === 0, `no console errors${errors.length ? ':\n  ' + errors.join('\n  ') : ''}`);
  await context.close();
}

async function testLost(browser) {
  const context = await newContext(browser);
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/CONTEXT_LOST|context lost/i.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.stack || e.message));
  await page.goto(`${base()}?debug=1&autostart=1&quality=low`);
  await waitGame(page);
  await page.evaluate(() => window.BC.renderer.getContext().getExtension('WEBGL_lose_context').loseContext());
  await page.waitForSelector('#context-lost', { timeout: 10000 }).catch(() => {});
  const info = await page.evaluate(() => ({ shown: !!document.getElementById('context-lost'), paused: window.BC.paused, text: document.querySelector('#context-lost button')?.textContent }));
  check(info.shown && info.paused, `context lost: friendly screen shown, game paused (button "${info.text}")`);
  await shot(page, 'context-lost');
  check(errors.length === 0, `no console errors${errors.length ? ':\n  ' + errors.join('\n  ') : ''}`);
  await context.close();
}

(async () => {
  if (!threeDir) { console.log('usage: node tools/release-check.js --three <dir> [--out <folder>]'); process.exit(2); }
  if (outDir) fs.mkdirSync(outDir, { recursive: true });
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const tests = { pwa: testPwa, pages: testPages, auto: testAuto, lost: testLost };
  for (const name of only) {
    console.log(`--- ${name}`);
    try { await tests[name](browser); } catch (err) { check(false, `${name}: ${err.message}`); }
  }
  await browser.close();
  server.close();
  console.log(failures ? `RELEASE CHECK FAILED (${failures})` : 'RELEASE CHECK PASSED');
  process.exit(failures ? 1 : 0);
})();
