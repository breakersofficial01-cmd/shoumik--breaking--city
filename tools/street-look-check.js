// Street look check (Roadmap 2, Session 1) — a tool for Claude sessions, not part of the game.
// Boots the game headless and photographs the new street dressing by day and at night:
// a lamp-lined street, a construction site, a footbridge, a park, a bench + bin + transformer.
// Also checks: lamps / footbridges / sites exist, lamps glow at night and are off by day,
// real lights follow the player (Medium/High), the footbridge stairs block walking, and the
// game has no console errors.
//
//   node tools/street-look-check.js --three <dir of three@0.170.0> --out <folder> [--quality medium] [--only street,site,bridge,park,props]
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
const only = arg('only', 'street,site,bridge,park,props').split(',');
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
  page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); if (/street:/.test(m.text())) console.log('  game:', m.text()); });
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
  await page.evaluate(() => { document.getElementById('ui').style.display = 'none'; const d = document.getElementById('debug-panel'); if (d) d.style.display = 'none'; });

  // ---- what was planned
  const info = await page.evaluate(() => {
    const st = window.BC.world.street, L = window.BC.world.layout;
    const n = (k) => L.pieces.reduce((s, p) => s + (p.street ? p.street[k].length : 0), 0);
    const site = L.pieces.flatMap((p) => (p.content?.buildings || []).filter((b) => b.construction).map((b) => ({ ...b, py: p.y })))[0];
    const fob = st.plan.footbridges[0];
    const park = L.pieces.find((p) => p.street && p.street.lampDouble.length >= 4);
    const tr = L.pieces.find((p) => p.street && p.street.transformer.length && p.street.bench.length && p.street.bin.length);
    return {
      lamps: n('lamp'), parkLamps: n('lampDouble'), benches: n('bench'), bins: n('bin'), transformers: n('transformer'), dumpsters: n('dumpster'),
      scaffold: n('scaffold'), sites: st.plan.sites, bridges: st.plan.footbridges.length, heads: st.heads.length / 3,
      site: site && { x0: site.x0, z0: site.z0, x1: site.x1, z1: site.z1, h: site.h },
      fob: fob && { cx: fob.cx, cz: fob.cz, ux: fob.ux, uz: fob.uz, half: fob.half },
      park: park && { x: park.x + park.w / 2, z: park.z + park.d / 2 },
      props: tr && { t: tr.street.transformer[0], b: tr.street.bench[0] },
      lights: window.BC.streetLights?.lights.length ?? -1,
    };
  });
  console.log('planned:', JSON.stringify({ ...info, site: !!info.site, fob: !!info.fob, park: !!info.park, props: !!info.props }));
  check(info.lamps > 500, `street lamps placed (${info.lamps})`);
  check(info.bridges > 0, `footbridges placed (${info.bridges})`);
  check(info.sites > 0, `construction sites (${info.sites})`);
  check(info.heads >= info.lamps, `lamp bulbs known for lighting (${info.heads})`);
  check(quality === 'low' ? info.lights === 0 : info.lights > 0, `real street lights for ${quality} (${info.lights})`);

  /** Move Shoumik, set the hour, let the game run a moment, then photograph from a camera spot. */
  const shoot = async (name, at, cam, look, hour) => {
    await page.evaluate(({ at, hour }) => {
      const BC = window.BC; BC.setPaused('shots', false);
      BC.player.position.x = at.x; BC.player.position.z = at.z;
      BC.events.emit('time:set', { hour });
    }, { at, hour });
    await page.waitForTimeout(900);
    const state = await page.evaluate(async ({ at, cam, look }) => {
      const BC = window.BC; BC.setPaused('shots', true);
      await BC.world.buildAround(at.x, at.z);
      BC.world.update(0, { x: at.x, z: at.z });
      BC.camera.position.set(cam.x, cam.y, cam.z);
      BC.camera.lookAt(look.x, look.y, look.z);
      BC.world.sky.update(BC.camera);
      BC.graphics.update(0, { x: at.x, z: at.z });
      BC.graphics.render(0);
      const m = BC.world.street.materials;
      return { bulb: m.bulb.emissiveIntensity, pool: m.pool.visible, light: BC.streetLights?.lights[0]?.intensity ?? 0 };
    }, { at, cam, look });
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(outDir, `${name}.png`) });
    return state;
  };

  // A lamp-lined street: first lamp of a block in the middle of the city.
  if (only.includes('street')) {
    const lamp = await page.evaluate(() => {
      const L = window.BC.world.layout;
      const list = L.pieces.filter((q) => q.street && q.street.lamp.length > 6);
      const p = list[Math.floor(list.length / 2)];
      const o = p.street.lamp[1];
      return { x: o.x, z: o.z, fx: Math.sin(o.rot), fz: Math.cos(o.rot) };
    });
    // Stand on the road in front of the lamp, look along the street.
    const along = { x: -lamp.fz, z: lamp.fx };
    const at = { x: lamp.x + lamp.fx * 5, z: lamp.z + lamp.fz * 5 };
    const cam = { x: at.x - along.x * 14 + lamp.fx * 2, y: 3.2, z: at.z - along.z * 14 + lamp.fz * 2 };
    const look = { x: at.x + along.x * 30, y: 3, z: at.z + along.z * 30 };
    const day = await shoot('street-day', at, cam, look, 12);
    const night = await shoot('street-night', at, cam, look, 21.5);
    check(day.bulb < 0.05 && !day.pool, 'lamps are off by day');
    check(night.bulb > 1 && night.pool, `lamps glow at night (bulb ${night.bulb.toFixed(2)})`);
    if (quality !== 'low') check(night.light > 1, `real lights on at night (${night.light.toFixed(1)})`);
  }
  if (only.includes('site') && info.site) {
    const s = info.site, cx = (s.x0 + s.x1) / 2, cz = (s.z0 + s.z1) / 2;
    const L = await page.evaluate(({ cx, cz }) => { const p = window.BC.world.layout.pieceAt(cx, cz); return { x: p.x, z: p.z, w: p.w, d: p.d }; }, { cx, cz });
    // Find the road side nearest the site and look at it from across the road.
    const sides = [{ d: s.z0 - L.z, ox: 0, oz: -1 }, { d: L.z + L.d - s.z1, ox: 0, oz: 1 }, { d: s.x0 - L.x, ox: -1, oz: 0 }, { d: L.x + L.w - s.x1, ox: 1, oz: 0 }].sort((a, b) => a.d - b.d)[0];
    const fx = sides.ox ? (sides.ox > 0 ? s.x1 : s.x0) : cx, fz = sides.oz ? (sides.oz > 0 ? s.z1 : s.z0) : cz;
    // Stand on the far kerb of the road in front of the site, a bit to the side.
    const out = sides.d + 17;
    const at = { x: fx + sides.ox * (sides.d + 8), z: fz + sides.oz * (sides.d + 8) };
    const cam = { x: fx + sides.ox * out - sides.oz * 9, y: 2.2, z: fz + sides.oz * out + sides.ox * 9 };
    await shoot('construction-day', at, cam, { x: fx, y: Math.min(10, s.h / 2), z: fz }, 12);
  }
  if (only.includes('bridge') && info.fob) {
    const f = info.fob, acr = { x: f.uz, z: f.ux };
    const at = { x: f.cx - f.ux * 6, z: f.cz - f.uz * 6 };
    const cam = { x: f.cx - f.ux * 26 + acr.x * 3, y: 2.6, z: f.cz - f.uz * 26 + acr.z * 3 };
    await shoot('footbridge-day', at, cam, { x: f.cx, y: 4.5, z: f.cz }, 12);
    await shoot('footbridge-night', at, cam, { x: f.cx, y: 4.5, z: f.cz }, 21.5);
    // Walk into the stairs from the sidewalk: the player must not pass through them.
    const blocked = await page.evaluate(({ f }) => {
      const BC = window.BC, col = BC.world.collision;
      const side = f.half + 0.7; // middle of the stair strip
      const x = f.cx + f.ux * 6 + f.uz * side, z = f.cz + f.uz * 6 + f.ux * side;
      return col.isBlocked(x, z, 0.3);
    }, { f });
    check(blocked, 'footbridge stairs are solid');
  }
  if (only.includes('park') && info.park) {
    const p = info.park;
    await shoot('park-night', p, { x: p.x - 30, y: 7, z: p.z + 30 }, { x: p.x, y: 1, z: p.z }, 21.5);
  }
  if (only.includes('props') && info.props) {
    const { t, b } = info.props;
    const fx = Math.sin(t.rot + Math.PI / 2), fz = Math.cos(t.rot + Math.PI / 2);
    await shoot('transformer-day', { x: t.x + fx * 6, z: t.z + fz * 6 }, { x: t.x + fx * 9 + 3, y: 3, z: t.z + fz * 9 + 3 }, { x: t.x, y: 3.5, z: t.z }, 12);
    const bx = Math.sin(b.rot), bz = Math.cos(b.rot);
    await shoot('bench-day', { x: b.x + bx * 5, z: b.z + bz * 5 }, { x: b.x + bx * 4 + bz * 2, y: 1.7, z: b.z + bz * 4 - bx * 2 }, { x: b.x, y: 0.6, z: b.z }, 12);
  }

  if (problems.length) console.log('CONSOLE ERRORS:\n' + problems.join('\n'));
  console.log(problems.length || fails.length ? 'STREET LOOK CHECK FAILED' : 'STREET LOOK CHECK PASSED');
  await browser.close();
  server.close();
  process.exit(problems.length || fails.length ? 1 : 0);
})();
