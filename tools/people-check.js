// People + animals check (Roadmap 2, Session 5) — a tool for Claude sessions, not part of the game.
// Boots the game headless and:
//   counts   – the real 3D people arrive only after their stream files; per quality: how many
//              people walk around, how many are real 3D (Low = none, Medium/High ≤ data/people.json)
//   gallery  – every archetype of data/pedestrians.json + police as real 3D people in a row (day)
//   actions  – one person per animation: idle, walk, run, sit, dance, clap, cower, down, hit,
//              punch, aim, shout — photographed mid-move
//   street   – the street crowd around Shoumik by day and by night
//   hotel    – inside Breaking Hotel: waiter with the tray in his hands, receptionist, diners,
//              bar dancers are real 3D people
//   police   – 2 stars: police on foot are real 3D people with their guns
//   animals  – dogs, cats, crows, cows / goats (Old Dhaka), ducks on a lake: counts per quality,
//              photos by day and night, a gunshot makes them run / fly away
// and fails on any console error.
//
//   node tools/people-check.js --three <dir of three@0.170.0> --out <folder> [--quality medium]
//        [--only counts,gallery,actions,street,hotel,police,animals]
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
const only = arg('only', 'counts,gallery,actions,street,hotel,police,animals').split(',');
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
  page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); if (/real people|animals/i.test(m.text())) console.log('  game:', m.text()); });
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
  const ui = (on) => page.evaluate((on) => { document.getElementById('ui').style.display = on ? '' : 'none'; const d = document.getElementById('debug-panel'); if (d) d.style.display = 'none'; }, on);
  await ui(false);
  const wait = (fn, a, timeout = 90000) => page.waitForFunction(fn, a, { timeout, polling: 250 }).then(() => true, () => false);
  const shot = (name) => page.screenshot({ path: path.join(outDir, `${name}.png`) });
  const hour = (h) => page.evaluate((h) => window.BC.events.emit('time:set', { hour: h }), h);
  const resume = () => page.evaluate(() => window.BC.setPaused('shots', false));
  /** Freeze the game and render from cam looking at look (world points). */
  const camAt = (cam, look) => page.evaluate(async ({ cam, look }) => {
    const BC = window.BC;
    BC.setPaused('shots', true);
    BC.camera.position.set(...cam);
    BC.camera.lookAt(...look);
    BC.world.update(0, { x: cam[0], z: cam[2] });
    BC.world.sky.update(BC.camera);
    BC.graphics.update(0, { x: cam[0], z: cam[2] });
    BC.graphics.render(0);
  }, { cam, look });
  const real = () => page.evaluate(() => {
    const c = window.BC.crowd;
    return { state: c.realState, people: c.people.size, real: c.real ? c.real.report().real : 0, slots: c.real ? c.real.slots.length : 0 };
  });
  const startStream = () => page.evaluate(() => { for (const id of ['model.people', 'image.people.skins']) window.BC.streamer.start(id); });

  // ---- counts ----
  if (only.includes('counts')) {
    console.log('--- counts');
    const r0 = await real();
    console.log('  at start:', JSON.stringify(r0));
    check(r0.real === 0, 'no real 3D people before the stream files are in (code-built crowd shown)');
  }
  await startStream();
  const loaded = quality === 'low' || await wait(() => window.BC.crowd.realState === 'ready', null, 60000);
  check(loaded, `3D people model loaded (${quality})`);
  if (only.includes('counts')) {
    const cfg = await page.evaluate(() => window.BC.config.get('people'));
    for (const q of ['low', 'medium', 'high']) {
      await page.evaluate((q) => window.BC.setQuality(q), q);
      await page.waitForTimeout(500);
      await page.evaluate(() => window.BC.crowd.checkReal());
      await wait((q) => window.BC.crowd.realState === 'ready' || q === 'low', q, 30000);
      await page.waitForTimeout(2500);
      const r = await real();
      const peds = await page.evaluate(() => window.BC.debugPeds.filter((p) => p.active).length);
      const want = await page.evaluate(() => window.BC.quality.pedestrians);
      console.log(`  ${q}: ${peds} pedestrians (quality ${want}), ${r.people} in the crowd, ${r.real} real 3D`);
      // (after lowering the quality, people already out walking leave only as they go out of range)
      check(peds > 0 && (q === 'low' || peds <= want), `${q}: pedestrians walk around (${peds}, quality ${want})`);
      check(r.real <= cfg.count[q], `${q}: real 3D people ≤ ${cfg.count[q]} (${r.real})`);
      if (q === 'low') check(r.real === 0, 'low: everyone is code-built');
      else check(r.real > 0, `${q}: some people near Shoumik are real 3D`);
      // Cost: draw calls / triangles of the last frame with and without the 3D people.
      const info = () => page.evaluate(() => { const i = window.BC.renderer.info.render; return { calls: i.calls, tris: i.triangles }; });
      const withReal = await info();
      if (q !== 'low') {
        await page.evaluate((q) => { window.__keep = window.BC.config.get('people').count[q]; window.BC.config.get('people').count[q] = 0; }, q);
        await page.waitForTimeout(1200);
        const without = await info();
        await page.evaluate((q) => { window.BC.config.get('people').count[q] = window.__keep; }, q);
        console.log(`  ${q} cost: ${withReal.calls} draw calls / ${withReal.tris} triangles with 3D people, ${without.calls} / ${without.tris} without`);
      } else console.log(`  ${q}: ${withReal.calls} draw calls / ${withReal.tris} triangles`);
    }
    await page.evaluate((q) => window.BC.setQuality(q), quality);
    await page.waitForTimeout(1500);
  }

  // A row of people in front of Shoumik (gallery / actions), animated by the test itself.
  const lineup = (list) => page.evaluate(async (list) => {
    const BC = window.BC;
    const base = location.pathname.replace(/\/[^/]*$/, '/');
    const { Animator } = await import(`${base}src/entities/people/animator.js`);
    const { buildLook } = await import(`${base}src/entities/people/looks.js`);
    const { Rng } = await import(`${base}src/core/rng.js`);
    const ped = BC.config.get('pedestrians'), pol = BC.config.get('police');
    const rng = new Rng(77);
    (window.__line || []).forEach((x) => BC.crowd.remove(x.person));
    const p = BC.player.position;
    const h = 0;
    const fx = Math.sin(h), fz = Math.cos(h), rx = Math.cos(h), rz = -Math.sin(h);
    const pc = BC.config.get('people');
    pc.count[BC.qualityName] = Math.max(list.length + 14, pc.count[BC.qualityName]);
    window.__line = list.map((it, i) => {
      const police = !ped.archetypes[it.arch];
      const arch = police ? pol.archetypes[it.arch] : ped.archetypes[it.arch];
      const look = buildLook(arch, police ? { ...ped.palettes, ...pol.palettes } : ped.palettes, rng);
      const anim = new Animator(look.dims, {});
      const person = BC.crowd.add(look, anim.pose, anim);
      const off = (i - (list.length - 1) / 2) * 1.25;
      const x = p.x + fx * 7 + rx * off, z = p.z + fz * 7 + rz * off;
      const y = BC.world.heightAt(x, z);
      Object.assign(person, { x, y, z, groundY: y, heading: h + Math.PI });
      if (it.action) anim.play(it.action, { variant: it.variant || 0 });
      return { person, anim, speed: it.speed || 0, action: it.action, variant: it.variant || 0 };
    });
    if (!window.__lineLoop) {
      window.__lineLoop = true;
      let last = performance.now();
      const tick = () => {
        const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
        if (!BC.paused) {
          for (const x of window.__line || []) {
            x.anim.update(dt, { speed: x.speed });
            if (x.action && !x.anim.current) x.anim.play(x.action, { variant: x.variant }); // repeat one-shots
          }
        }
        requestAnimationFrame(tick);
      };
      tick();
    }
    return { x: p.x, y: BC.world.heightAt(p.x, p.z + 7), z: p.z, fx, fz };
  }, list);
  const clearLine = () => page.evaluate(() => { (window.__line || []).forEach((x) => window.BC.crowd.remove(x.person)); window.__line = []; });
  const photoLine = async (name, at, n) => {
    const d = Math.max(4.2, n * 0.72);
    await camAt([at.x + 0.8, at.y + 1.5, at.z + 7 - d], [at.x, at.y + 0.9, at.z + 7]);
    await shot(name);
    await resume();
  };
  /** A quiet open spot: a plaza / park piece with 12 m of free ground ahead (no buildings, no traffic). */
  const toPlaza = () => page.evaluate(() => {
    const BC = window.BC, L = BC.world.layout, col = BC.world.collision;
    const free = (x, z) => { for (let k = -2; k <= 12; k += 1) for (const dx of [-4, 0, 4]) if (col.isBlocked(x + dx, z + k, 0.6)) return false; return true; };
    let at = null;
    for (const p of L.pieces) {
      if (!p.area || !(p.area.type === 'plaza' || p.area.type === 'park') || p.pond) continue;
      for (const [fx, fz] of [[0.5, 0.3], [0.3, 0.3], [0.7, 0.3], [0.5, 0.1]]) {
        const x = p.x + p.w * fx, z = p.z + p.d * fz;
        if (free(x, z)) { at = { x, z }; break; }
      }
      if (at) break;
    }
    at = at || { x: BC.player.position.x, z: BC.player.position.z };
    BC.events.emit('player:teleport', { x: at.x, z: at.z, heading: 0 });
    return at;
  });

  // ---- gallery ----
  if (only.includes('gallery') && quality !== 'low') {
    console.log('--- gallery');
    await hour(12);
    await toPlaza();
    await page.waitForTimeout(1500);
    const ped = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/pedestrians.json'), 'utf8'));
    const pol = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/police.json'), 'utf8'));
    const all = [...Object.keys(ped.archetypes), ...Object.keys(pol.archetypes || {})].filter((k) => !k.startsWith('_'));
    for (let k = 0; k * 7 < all.length; k++) {
      const part = all.slice(k * 7, k * 7 + 7).map((arch) => ({ arch }));
      const at = await lineup(part);
      await page.waitForTimeout(2500);
      const n = await page.evaluate(() => window.__line.filter((x) => x.person.real).length);
      check(n === part.length, `gallery ${k + 1}: ${part.length} people are real 3D (${n})`);
      await photoLine(`gallery-${k + 1}`, at, part.length);
      console.log('  ', part.map((x) => x.arch).join(', '));
    }
    await clearLine();
  }

  // ---- actions ----
  if (only.includes('actions') && quality !== 'low') {
    console.log('--- actions');
    await toPlaza();
    await page.waitForTimeout(800);
    const acts = [
      { arch: 'shirt_pant_man' }, { arch: 'kameez_woman', speed: 1.3 }, { arch: 'student_boy', speed: 5 },
      { arch: 'office_man', action: 'sit' }, { arch: 'genz_jacket', action: 'dance' }, { arch: 'genz_oversized', action: 'dance', variant: 1 },
      { arch: 'saree_woman', action: 'clap' }, { arch: 'hijab_woman', action: 'cower' }, { arch: 'lungi_man', action: 'down' },
      { arch: 'panjabi_man', action: 'hit' }, { arch: 'rickshaw_puller', action: 'punch' }, { arch: 'hawker', action: 'shout' },
    ];
    for (let k = 0; k * 6 < acts.length; k++) {
      const part = acts.slice(k * 6, k * 6 + 6);
      const at = await lineup(part);
      await page.waitForTimeout(3000);
      await photoLine(`actions-${k + 1}`, at, part.length);
      const playing = await page.evaluate(() => window.__line.map((x) => x.person.real?.cur?.name || '-'));
      console.log('   clips:', playing.join(', '));
      // Feet on the ground: the lowest foot / toe bone of standing clips is close to the floor.
      const feet = await page.evaluate(() => window.__line.filter((x) => x.person.real).map((x) => {
        const s = x.person.real, v = new window.BC.camera.position.constructor();
        s.root.updateMatrixWorld(true);
        let low = Infinity;
        for (const n of ['LeftFoot', 'RightFoot', 'LeftToes', 'RightToes']) { s.body.skeleton.getBoneByName(n).getWorldPosition(v); low = Math.min(low, v.y); }
        return { clip: s.cur.name, up: +(low - x.person.y).toFixed(2) };
      }));
      console.log('   feet above the ground:', feet.map((f) => `${f.clip} ${f.up}`).join(', '));
      for (const f of feet) if (['idle', 'walk', 'run', 'dance', 'clap', 'shout', 'hit', 'punch'].includes(f.clip)) check(f.up > -0.08 && f.up < 0.2, `${f.clip}: feet on the ground (${f.up} m)`);
      check(playing.every((c) => c !== '-'), `actions ${k + 1}: every person plays a 3D clip`);
    }
    await clearLine();
  }

  // ---- street ----
  if (only.includes('street')) {
    console.log('--- street');
    await page.evaluate(() => { const s = window.BC.player.spawn || window.BC.save.data.position; if (s) window.BC.events.emit('player:teleport', { x: s.x, z: s.z, heading: 0 }); });
    for (const [h, name] of [[12, 'day'], [21, 'night']]) {
      await hour(h);
      await page.waitForTimeout(3500);
      const near = await page.evaluate(() => {
        const BC = window.BC, p = BC.player.position;
        let best = null, bd = Infinity;
        for (const q of BC.crowd.people) {
          const d = Math.hypot(q.x - p.x, q.z - p.z);
          if ((q.real || BC.qualityName === 'low') && d < bd) { best = q; bd = d; }
        }
        return best ? { x: best.x, y: best.y, z: best.z, h: best.heading } : { x: p.x, y: p.y, z: p.z + 5, h: 0 };
      });
      await camAt([near.x + Math.sin(near.h) * 4 + 1.5, near.y + 1.7, near.z + Math.cos(near.h) * 4], [near.x, near.y + 1.0, near.z]);
      await shot(`street-${name}`);
      await resume();
    }
    await hour(12);
  }

  // ---- hotel ----
  if (only.includes('hotel') && quality !== 'low') {
    console.log('--- hotel');
    const id = 'breaking-hotel';
    const putLocal = (lx, lz, lh = Math.PI) => page.evaluate(({ id, lx, lz, lh }) => {
      const BC = window.BC, rt = BC.hotels.list.find((h) => h.hotel.id === id), s = rt.site;
      const c = Math.cos(s.angle), n = Math.sin(s.angle);
      BC.events.emit('player:teleport', { x: s.cx + lx * c + lz * n, z: s.cz - lx * n + lz * c, heading: lh + s.angle });
    }, { id, lx, lz, lh });
    const camLocal = (cam, look) => page.evaluate(({ id, cam, look }) => {
      const rt = window.BC.hotels.list.find((h) => h.hotel.id === id), s = rt.site;
      const c = Math.cos(s.angle), n = Math.sin(s.angle);
      const W = (p) => [s.cx + p[0] * c + p[2] * n, s.y + p[1], s.cz - p[0] * n + p[2] * c];
      return { cam: W(cam), look: W(look) };
    }, { id, cam, look });
    await putLocal(0, 40);
    check(await wait((id) => window.BC.hotels.list.find((h) => h.hotel.id === id).built, id, 60000), 'hotel inside built');
    for (let z = 19; z >= 10; z -= 1) { await putLocal(0, z); await page.waitForTimeout(100); }
    await wait(() => !!window.BC.hotels.inside, null, 10000);
    await putLocal(0, -2);
    await page.waitForTimeout(3000);
    // Send the waiter on a walk so he carries the tray while moving.
    await page.evaluate((id) => {
      const rt = window.BC.hotels.list.find((h) => h.hotel.id === id);
      const w = rt.people.servers.waiter, t = rt.place.tables[0];
      if (w && t) w.walk([{ x: t.x + 2, z: t.z + 2 }, { x: w.home.x, z: w.home.z }]);
    }, id);
    await page.waitForTimeout(700);
    const staff = await page.evaluate((id) => {
      const rt = window.BC.hotels.list.find((h) => h.hotel.id === id);
      const all = [...Object.values(rt.people.servers).filter(Boolean).map((s) => s.person), ...rt.people.people.map((p) => p.person)];
      const w = rt.people.servers.waiter;
      return {
        total: all.length, real: all.filter((p) => p.real).length,
        waiterReal: !!w?.person.real, waiterClip: w?.person.real?.cur?.name,
        waiterDist: w && Math.hypot(w.x - window.BC.player.position.x, w.z - window.BC.player.position.z),
        tray: w ? { tx: w.tray.position.x, ty: w.tray.position.y, tz: w.tray.position.z, x: w.x, z: w.z, y: w.y, h: w.heading } : null,
      };
    }, id);
    console.log('  hotel people:', JSON.stringify(staff));
    check(staff.real > 0, `hotel: staff and guests are real 3D (${staff.real}/${staff.total})`);
    check(staff.waiterReal && /carry/.test(staff.waiterClip || ''), `hotel: the waiter carries the tray (${staff.waiterClip})`);
    if (staff.tray) {
      const t = staff.tray;
      const dy = t.ty - t.y;
      check(dy > 0.8 && dy < 1.4 && Math.hypot(t.tx - t.x, t.tz - t.z) < 0.7, `hotel: the tray is in his hands (${dy.toFixed(2)} m up)`);
      await camAt([t.x + Math.sin(t.h + 0.7) * 2.6, t.y + 1.6, t.z + Math.cos(t.h + 0.7) * 2.6], [t.x, t.y + 1.0, t.z]);
      await shot('hotel-waiter'); await resume();
    }
    const v = await camLocal([0, 3.2, 14], [0, 1.2, -14]);
    await camAt(v.cam, v.look); await shot('hotel-restaurant'); await resume();
    const bar = await page.evaluate((id) => {
      const rt = window.BC.hotels.list.find((h) => h.hotel.id === id);
      const d = rt.place.danceSpots?.[0];
      return d ? { x: d.x, z: d.z, y: rt.place.y } : null;
    }, id);
    if (bar) {
      await camAt([bar.x + 4, bar.y + 2.4, bar.z + 4], [bar.x, bar.y + 1, bar.z]);
      await shot('hotel-bar-dancers'); await resume();
    }
    await putLocal(0, 40);
    await page.waitForTimeout(1500);
  }

  // ---- police ----
  if (only.includes('police') && quality !== 'low') {
    console.log('--- police');
    await page.evaluate(() => window.BC.events.emit('wanted:set', { stars: 2 }));
    const came = await wait(() => window.BC.debugPolice.officers().some((o) => o.person.real), null, 60000);
    check(came, 'police on foot come and are real 3D');
    const o = await page.evaluate(() => { const o = window.BC.debugPolice.officers().find((x) => x.person.real); return o && { x: o.x, y: o.y, z: o.z }; });
    if (o) { await camAt([o.x + 3, o.y + 1.8, o.z + 3], [o.x, o.y + 1, o.z]); await shot('police-on-foot'); await resume(); }
    await page.evaluate(() => { window.BC.events.emit('wanted:clear'); window.BC.events.emit('police:standDown'); });
    await page.waitForTimeout(1000);
  }

  // ---- animals ----
  if (only.includes('animals')) {
    console.log('--- animals');
    const A = await page.evaluate(() => !!window.BC.animals);
    check(A, 'animals feature is running');
    if (A) {
      const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/animals.json'), 'utf8'));
      for (const q of ['low', 'medium', 'high']) {
        await page.evaluate((q) => window.BC.setQuality(q), q);
        await page.waitForTimeout(3000);
        const r = await page.evaluate(() => window.BC.animals.report());
        console.log(`  ${q}:`, JSON.stringify(r));
        const max = cfg.quality[q].total;
        check(r.total <= max, `${q}: animals ≤ ${max} (${r.total})`);
        check(r.total > 0, `${q}: some animals around`);
      }
      await page.evaluate((q) => window.BC.setQuality(q), quality);
      const spots = await page.evaluate(() => window.BC.animals.testSpots());
      for (const s of spots) {
        await page.evaluate((p) => window.BC.events.emit('player:teleport', { x: p.x, z: p.z, heading: 0 }), s);
        await page.waitForTimeout(4500);
        for (const [h, tag] of [[12, 'day'], [20.5, 'night']]) {
          await hour(h);
          await page.waitForTimeout(400);
          const t = await page.evaluate((kinds) => window.BC.animals.nearest(kinds), s.kinds);
          check(!!t, `${s.label}: ${s.kinds.join('/')} nearby (${tag})`);
          if (!t) break;
          const d = t.kind === 'cow' ? 5 : t.kind === 'crow' ? 1.3 : t.kind === 'duck' || t.kind === 'cat' ? 2 : 3;
          await camAt([t.x + d, t.y + d * 0.45 + 0.4, t.z + d], [t.x, t.y + 0.3, t.z]);
          await shot(`animals-${s.label}-${tag}`);
          await resume();
          console.log(`  ${s.label} ${tag}: ${t.kind}`);
        }
      }
      await hour(12);
      // A gunshot next to the nearest animal: animals nearby run or fly off.
      const before = await page.evaluate(() => window.BC.animals.report());
      await page.evaluate(() => { const a = window.BC.animals.nearest(null); if (a) window.BC.events.emit('weapon:fired', { id: 'pistol', x: a.x + 2, z: a.z }); });
      await page.waitForTimeout(600);
      const after = await page.evaluate(() => window.BC.animals.report());
      console.log('  after a gunshot:', JSON.stringify(after));
      check(after.fleeing > 0 || before.total === 0, `animals flee from a gunshot (${after.fleeing} fleeing)`);
    }
  }

  const errs = problems.filter((p) => !/favicon|net::ERR/.test(p));
  if (errs.length) console.log('console errors:\n' + errs.join('\n'));
  check(errs.length === 0, 'no console errors');
  await browser.close();
  server.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall checks passed');
  process.exit(fails.length ? 1 : 0);
})();
