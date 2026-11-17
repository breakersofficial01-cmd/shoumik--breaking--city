// Poster / landmark gameplay check for Claude sessions (not part of the game).
// Boots the game headless and, with screenshots in --out:
//   1. stands Shoumik in front of one slot of every kind (billboard, led, wall, busStop, pillar)
//   2. checks "look at a poster with a link → button appears → F opens the link" (window.open is stubbed)
//   3. checks an LED screen changes poster after ledRotateSeconds
//   4. checks the MRT train moves, and the entrance marker at Breaking School shows its prompt + note
// Exit code 1 on any failure or console error.
//
//   node tools/poster-check.js --three <dir of three@0.170.0> --out <folder>

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const arg = (n, f) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : f; };
const threeDir = arg('three', null);
const outDir = arg('out', path.join(ROOT, 'shots'));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' };
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
  await page.goto(`http://localhost:${server.address().port}${SUB}/?debug=1&autostart=1&quality=medium`);
  await page.waitForFunction(() => window.BC && window.BC.running, null, { timeout: 120000 });
  await page.evaluate(() => { window.__opened = []; window.open = (url) => { window.__opened.push(url); return null; }; });

  // Put Shoumik `dist` metres in front of a point, facing it, camera snapped behind him.
  const standAt = (x, z, heading, dist) => page.evaluate(async ({ x, z, heading, dist }) => {
    const BC = window.BC, p = BC.player;
    p.position.x = x + Math.sin(heading) * dist;
    p.position.z = z + Math.cos(heading) * dist;
    p.position.y = BC.world.heightAt(p.position.x, p.position.z);
    p.heading = heading + Math.PI;
    BC.cameraRig.yaw = p.heading;
    BC.cameraRig.setTarget(p, 'onFoot', true);
    await BC.world.buildAround(p.position.x, p.position.z);
  }, { x, z, heading, dist });

  // 1) One slot of each kind (nearest to the start so it is quick).
  const picks = await page.evaluate(() => {
    const p = window.BC.player.position, out = {};
    for (const s of window.BC.posters.slots) {
      const d = Math.hypot(s.x - p.x, s.z - p.z);
      if (!out[s.kind] || d < out[s.kind].d) out[s.kind] = { d, x: s.x, z: s.z, heading: s.heading, id: s.id, w: s.w };
    }
    return out;
  });
  const counts = await page.evaluate(() => { const c = {}; for (const s of window.BC.posters.slots) c[s.kind] = (c[s.kind] || 0) + 1; return c; });
  console.log('slots:', JSON.stringify(counts));
  for (const [kind, s] of Object.entries(picks)) {
    const dist = { billboard: 26, led: 9, wall: 6, busStop: 3.2, pillar: 6 }[kind] || 8;
    await standAt(s.x, s.z, s.heading, dist);
    await page.evaluate(() => { const pc = window.BC.cameraRig; pc.pitch = 0.05; });
    await page.waitForTimeout(1400);
    if (kind === 'billboard') await page.evaluate(() => { window.BC.cameraRig.pitch = -0.2; });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(outDir, `poster-${kind}.png`) });
    const shown = await page.evaluate((id) => { const s = window.BC.posters.slots.find((x) => x.id === id); return s.mesh?.visible ? s.mesh.material.map?.image?.src?.split('/').pop() : 'not drawn'; }, s.id);
    console.log(`${kind}: ${s.id} shows ${shown}`);
    if (!shown || shown === 'not drawn') fails.push(`${kind} slot is not drawn`);
  }

  // 2) Tap-to-open: the Breaking Biology poster (tall, has a link) — find a tall slot showing it.
  const linked = await page.evaluate(() => {
    const p = window.BC.player.position;
    const list = window.BC.posters.slots.filter((s) => s.poster?.link && s.kind !== 'pillar');
    list.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
    const s = list[0];
    return s && { x: s.x, z: s.z, heading: s.heading, id: s.id, kind: s.kind, link: s.poster.link };
  });
  if (!linked) fails.push('no slot shows a poster with a link');
  else {
    await standAt(linked.x, linked.z, linked.heading, linked.kind === 'busStop' ? 3 : 5);
    await page.waitForTimeout(1500);
    const btn = await page.evaluate(() => { const b = document.querySelector('.poster-open'); return b && !b.hidden ? b.textContent : null; });
    await page.screenshot({ path: path.join(outDir, 'poster-tap.png') });
    await page.keyboard.press('KeyF');
    await page.waitForTimeout(200);
    const opened = await page.evaluate(() => window.__opened.slice());
    console.log(`tap-to-open at ${linked.id}: button "${btn}", opened ${JSON.stringify(opened)}`);
    if (!btn) fails.push('open button did not appear');
    if (opened[0] !== linked.link) fails.push('F did not open the link');
  }

  // 3) LED rotation.
  const ledPick = picks.led;
  await standAt(ledPick.x, ledPick.z, ledPick.heading, 9);
  const shownLed = () => page.evaluate((id) => window.BC.posters.slots.find((x) => x.id === id).mesh.material.map?.image?.src?.split('/').pop(), ledPick.id);
  const before = await shownLed();
  let after = before;
  for (let i = 0; i < 30 && after === before; i++) { await page.waitForTimeout(1000); after = await shownLed(); } // game time runs slower headless
  console.log(`LED rotation: ${before} → ${after}`);
  if (before === after) fails.push('LED screen did not change poster');

  // 4) Train and entrance.
  const train = await page.evaluate(async () => {
    const BC = window.BC;
    const v = BC.world.landmarks.viaducts.find((x) => x.kind === 'rail');
    const st = v.stations[1];
    const p = BC.player.position;
    p.x = st.x + 30; p.z = st.z + 12;
    BC.cameraRig.setTarget(BC.player, 'onFoot', true);
    await BC.world.buildAround(p.x, p.z);
    const a = BC.metro.trains.map((t) => t.s);
    await new Promise((r) => setTimeout(r, 4000));
    return BC.metro.trains.map((t, i) => +Math.abs(t.s - a[i]).toFixed(1));
  });
  console.log('train moved (m in 3 s):', train);
  if (!train.some((d) => d > 0.5)) fails.push('no MRT train moved');

  const ent = await page.evaluate(async () => {
    const BC = window.BC;
    const m = BC.world.landmarks.markers.find((x) => x.id === 'breaking-school');
    if (!m) return null;
    const p = BC.player.position;
    p.x = m.x; p.z = m.z + 7; p.y = BC.world.heightAt(p.x, p.z);
    BC.player.heading = Math.PI;
    BC.cameraRig.yaw = Math.PI;
    BC.cameraRig.setTarget(BC.player, 'onFoot', true);
    await BC.world.buildAround(p.x, p.z);
    return { x: m.x, z: m.z };
  });
  if (!ent) fails.push('no entrance marker at Breaking School');
  else {
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(outDir, 'entrance-approach.png') });
    await page.evaluate(({ x, z }) => { const p = window.BC.player.position; p.x = x; p.z = z; }, ent);
    await page.waitForTimeout(500);
    const prompt = await page.evaluate(() => document.querySelector('.hud-prompt')?.textContent);
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(300);
    const note = await page.evaluate(() => { const n = document.querySelector('.entrance-note'); return n && !n.hidden ? n.textContent : null; });
    await page.screenshot({ path: path.join(outDir, 'entrance.png') });
    console.log(`entrance: prompt "${prompt}", note "${note}"`);
    if (!prompt || !note) fails.push('entrance prompt or note missing');
  }
  // 5) Adverts on the back of a bus and a rickshaw (vehicles made right behind Shoumik).
  const veh = await page.evaluate(async () => {
    const BC = window.BC, p = BC.player.position;
    p.x = -372; p.z = 230; p.y = BC.world.heightAt(p.x, p.z);
    const seg = BC.world.roads.nearestSegment(p.x, p.z);
    const lane = BC.world.roads.segment(seg.c, seg.r, seg.d, 4.4);
    const at = (u) => ({ x: lane.ax + lane.fx * u, z: lane.az + lane.fz * u, heading: lane.heading });
    const bus = BC.fleet.create('bus', at(40));
    let rick = null;
    for (let i = 0; i < 12 && !rick; i++) { // only some rickshaws carry an advert
      const r = BC.fleet.create('rickshaw', at(52 + i * 0.01));
      await new Promise((res) => setTimeout(res, 1200));
      if ([...BC.posters.vehicleSlots].some((s) => s.vehicle === r)) rick = r; else BC.fleet.remove(r);
    }
    const back = at(40 - 12);
    p.x = back.x; p.z = back.z; BC.player.heading = lane.heading;
    BC.cameraRig.yaw = lane.heading;
    BC.cameraRig.setTarget(BC.player, 'onFoot', true);
    await new Promise((res) => setTimeout(res, 1500));
    const kinds = [...BC.posters.vehicleSlots].filter((s) => s.vehicle === bus || s.vehicle === rick).map((s) => `${s.kind}:${s.poster?.id || 'default'}`);
    return { kinds, rick: !!rick };
  });
  await page.screenshot({ path: path.join(outDir, 'poster-vehicles.png') });
  console.log('vehicle adverts:', JSON.stringify(veh));
  if (!veh.kinds.some((k) => k.startsWith('bus'))) fails.push('the bus has no advert panel');
  if (!veh.rick) fails.push('no rickshaw got an advert');
  console.log((await page.evaluate(() => document.getElementById('debug-panel').textContent)).replace(/\n/g, ' | '));
  if (problems.length) fails.push('console errors:\n' + problems.join('\n'));
  console.log(fails.length ? 'FAIL:\n- ' + fails.join('\n- ') : 'POSTER CHECK PASSED');
  await browser.close();
  server.close();
  process.exit(fails.length ? 1 : 0);
})();
