// Bigger world check (Roadmap 2, Session 3) — a tool for Claude sessions, not part of the game.
// Boots the game headless and checks + photographs the land around the city:
//   - the countryside models are NOT downloaded at the start, only near the edge (streaming)
//   - fields, desert, beach + sea, hills, oasis, the river bridge, city ponds, Gulshan Lake,
//     and a view from the city edge (far mountains)
//   - the gameplay height matches the drawn ground, the sea / river / ponds block walking,
//     the bridge has a gap in the river and a deck high above the water
//   - a car is driven over the bridge to the south bank
//   - the map shows the countryside and the GPS line leads out along a highway
//
//   node tools/world-check.js --three <dir of three@0.170.0> --out <folder> [--quality medium] [--only stream,shots,ground,drive,map]
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
const only = arg('only', 'stream,shots,ground,drive,map').split(',');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.glb': 'model/gltf-binary', '.webmanifest': 'application/json' };
const SUB = '/shoumik--breaking--city';
const requested = [];

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (!p.startsWith(SUB)) { res.writeHead(404); res.end(); return; }
  p = p.slice(SUB.length) || '/';
  if (p.endsWith('/')) p += 'index.html';
  requested.push(p);
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
  const wait = (ms) => page.waitForTimeout(ms);
  page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); if (/terrain:/.test(m.text())) console.log('  game:', m.text()); });
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
  await wait(1500);
  await page.evaluate(() => {
    document.getElementById('ui').style.display = 'none';
    const d = document.getElementById('debug-panel'); if (d) d.style.display = 'none';
    const b = window.BC, f = b.world.terrain.field;
    window.T = {
      f,
      at(col, row) { return { x: f.X(col), z: f.Z(row) }; },
      tp(x, z, heading = 0) { const p = b.player; p.position.x = x; p.position.z = z; p.position.y = b.world.heightAt(x, z); p.heading = heading; b.cameraRig.setTarget(p, 'onFoot', true); },
    };
  });

  const info = await page.evaluate(() => {
    const t = window.BC.world.terrain, f = t.field;
    return { zones: f.zones.length, ponds: f.ponds.length, highways: f.highways.length, tiles: t.tiles.tiles.length, bridge: !!f.bridge };
  });
  console.log('planned:', JSON.stringify(info));
  check(info.zones >= 4 && info.ponds >= 6 && info.highways >= 4 && info.bridge, 'zones, ponds, highways and the bridge are planned');

  // ---- streaming: nothing from the countryside at the start
  if (only.includes('stream')) {
    check(!requested.some((p) => p.includes('outskirts.glb')), 'countryside models not downloaded at the start');
  }

  /** Teleport, let the game run (streaming, tiles), then photograph from a camera spot. */
  const shoot = async (name, at, cam, look, ms = 2500) => {
    await page.evaluate(({ at }) => { window.BC.setPaused('shots', false); window.T.tp(at.x, at.z); }, { at });
    await wait(ms);
    await page.evaluate(({ at, cam, look }) => {
      const BC = window.BC; BC.setPaused('shots', true);
      BC.world.terrain.update(at, BC.quality.viewDistance, BC.camera, true);
      BC.world.update(0, at);
      BC.cameraRig.target = null;
      BC.camera.position.set(cam.x, cam.y, cam.z);
      BC.camera.lookAt(look.x, look.y, look.z);
      BC.world.sky.update(BC.camera);
      BC.world.terrain.backdrop.update(BC.camera, BC.scene.fog, BC.world.sky.radius);
      BC.graphics.update(0, at);
      BC.graphics.render(0);
    }, { at, cam, look });
    await wait(150);
    await page.screenshot({ path: path.join(outDir, `${name}.png`) });
  };
  const g = (x, z) => page.evaluate(({ x, z }) => window.BC.world.heightAt(x, z), { x, z });

  if (only.includes('stream') || only.includes('shots')) {
    // Fields first: walking to the north edge must trigger the download.
    const fp = await page.evaluate(() => window.T.at(7, -3.5));
    await shoot('fields', fp, { x: fp.x - 60, y: (await g(fp.x, fp.z)) + 22, z: fp.z + 70 }, { x: fp.x + 20, y: 0, z: fp.z - 60 }, 4000);
    await page.evaluate(() => window.BC.setPaused('shots', false));
    await page.waitForFunction(() => window.BC.world.terrain.props.count() > 0, null, { timeout: 60000 }).catch(() => {});
    const st = await page.evaluate(() => ({ asked: window.BC.world.terrain.modelsAsked, props: window.BC.world.terrain.props.count() }));
    await shoot('fields', fp, { x: fp.x - 60, y: (await g(fp.x, fp.z)) + 22, z: fp.z + 70 }, { x: fp.x + 20, y: 0, z: fp.z - 60 }, 500);
    check(requested.some((p) => p.includes('outskirts.glb')), 'countryside models downloaded near the edge');
    check(st.asked && st.props > 50, `countryside props planted (${st.props})`);
  }

  if (only.includes('shots')) {
    const fp2 = await page.evaluate(() => window.T.at(7, -3.5));
    const P = await page.evaluate(() => {
      const f = window.T.f;
      const oasis = f.ponds.find((p) => p.id === 'oasis');
      const L = window.BC.world.layout;
      const ramna = L.pieces.find((p) => p.pond && p.area.id === 'ramna-park');
      const lake = L.pieces.find((p) => p.area?.id === 'gulshan-lake');
      return {
        desert: window.T.at(-6, 3), beachZ: f.Z(9), beachX: f.shoreX(f.Z(9)), bridge: f.bridge,
        hills: window.T.at(9, -7), oasis, ramna: { x: ramna.x + ramna.w / 2, z: ramna.z + ramna.d / 2 },
        lake: { x: lake.x + lake.w / 2, z: lake.z + lake.d / 2 }, edge: window.T.at(0, 9), river: f.river,
      };
    });
    const d = P.desert;
    await shoot('desert', d, { x: d.x + 50, y: (await g(d.x, d.z)) + 14, z: d.z + 40 }, { x: d.x - 40, y: 0, z: d.z - 30 });
    const bx = P.beachX - 40;
    await shoot('beach', { x: bx, z: P.beachZ }, { x: bx - 30, y: 7, z: P.beachZ + 40 }, { x: bx + 90, y: -2, z: P.beachZ - 60 });
    const B = P.bridge;
    const bridgeCam = { x: B.x + 170, y: 22, z: B.z0 + 60 };
    await shoot('bridge', { x: B.x, z: B.z0 + 40 }, bridgeCam, { x: B.x, y: 4, z: (B.z0 + B.landZ) / 2 });
    await shoot('bridge-deck', { x: B.x, z: B.z0 + 150 }, { x: B.x + 2, y: (await g(B.x, B.z0 + 120)) + 3, z: B.z0 + 120 }, { x: B.x, y: 5, z: B.z0 + 250 });
    const h = P.hills;
    await shoot('hills', h, { x: h.x, y: (await g(h.x, h.z)) + 25, z: h.z + 120 }, { x: h.x, y: 40, z: h.z - 200 });
    const o = P.oasis;
    await shoot('oasis', { x: o.x + o.r + 10, z: o.z }, { x: o.x + o.r + 45, y: (await g(o.x + o.r + 40, o.z)) + 10, z: o.z + 30 }, { x: o.x, y: 0, z: o.z });
    const r = P.ramna;
    await shoot('city-pond', { x: r.x, z: r.z - 45 }, { x: r.x - 40, y: 18, z: r.z - 50 }, { x: r.x, y: 0, z: r.z });
    const lk = P.lake;
    await shoot('gulshan-lake', { x: lk.x - 60, z: lk.z }, { x: lk.x - 70, y: 16, z: lk.z + 60 }, { x: lk.x + 10, y: 0, z: lk.z - 30 });
    const e = P.edge;
    await shoot('city-edge', { x: e.x + 20, z: e.z }, { x: e.x + 40, y: 6, z: e.z + 5 }, { x: e.x - 300, y: 10, z: e.z - 20 });
    await page.evaluate(() => window.BC.events.emit('time:set', { hour: 21 }));
    await shoot('bridge-night', { x: B.x, z: B.z0 + 40 }, bridgeCam, { x: B.x, y: 4, z: (B.z0 + B.landZ) / 2 }, 1500);
    await page.evaluate(() => window.BC.events.emit('time:set', { hour: 17.5 }));
    await shoot('fields-sunset', fp2, { x: fp2.x - 60, y: (await g(fp2.x, fp2.z)) + 22, z: fp2.z + 70 }, { x: fp2.x + 20, y: 0, z: fp2.z - 60 }, 1500);
    await page.evaluate(() => window.BC.events.emit('time:set', { hour: 12 }));
  }

  if (only.includes('ground')) {
    // The gameplay height must match the drawn triangles (raycast down onto the tile meshes).
    const res = await page.evaluate(async () => {
      const THREE = await import('three');
      const BC = window.BC, t = BC.world.terrain, f = t.field;
      const spots = [window.T.at(-5, 2), window.T.at(9, -4), window.T.at(16.5, 3), window.T.at(-9, -8), window.T.at(6, 23)];
      let worst = 0, n = 0;
      const rc = new THREE.Raycaster();
      for (const s of spots) {
        t.update(s, 300, BC.camera, true);
        const meshes = t.tiles.tiles.filter((x) => x.mesh && x.lod === 1).map((x) => x.mesh);
        for (let k = 0; k < 20; k++) {
          const x = s.x + (Math.random() - 0.5) * 120, z = s.z + (Math.random() - 0.5) * 120;
          if (f.deckAt(x, z) !== null || f.inCity(x, z)) continue;
          rc.set(new THREE.Vector3(x, 500, z), new THREE.Vector3(0, -1, 0));
          const hit = rc.intersectObjects(meshes, false)[0];
          if (!hit) continue;
          worst = Math.max(worst, Math.abs(hit.point.y - BC.world.heightAt(x, z)));
          n++;
        }
      }
      const col = BC.world.collision;
      const B = f.bridge, R = f.river;
      const midZ = (R.z0 + R.z1) / 2;
      const sea = f.shoreX(f.Z(5)) + 40;
      const pond = f.ponds.find((p) => p.id === 'lotus-pond');
      const ramna = BC.world.layout.pieces.find((p) => p.pond);
      return {
        worst, n,
        seaBlocked: col.isBlocked(sea, f.Z(5), 0.3),
        riverBlocked: col.isBlocked(B.x - 60, midZ, 0.3),
        bridgeOpen: !col.isBlocked(B.x, midZ, 0.3),
        railBlocked: col.isBlocked(B.x + B.half, midZ, 0.3),
        deck: BC.world.heightAt(B.x, midZ),
        pondBlocked: col.isBlocked(pond.x, pond.z, 0.3),
        cityPondBlocked: col.isBlocked((ramna.pond.x0 + ramna.pond.x1) / 2, (ramna.pond.z0 + ramna.pond.z1) / 2, 0.3),
        fieldsOpen: !col.isBlocked(f.X(7), f.Z(-1.5), 0.3),
        edgeWall: col.isBlocked(f.bounds.x0 - 1, f.Z(5), 0.3),
        zone: BC.world.areaAt(f.X(-6), f.Z(3))?.name?.en,
      };
    });
    console.log('ground:', JSON.stringify(res));
    check(res.n > 40 && res.worst < 0.08, `gameplay height matches the ground (${res.n} points, worst ${res.worst.toFixed(3)} m)`);
    check(res.seaBlocked, 'the sea blocks walking');
    check(res.riverBlocked, 'the river blocks walking');
    check(res.bridgeOpen && res.railBlocked, 'the bridge is open, its parapets are solid');
    check(res.deck > 7, `bridge deck high above the river (${res.deck.toFixed(1)} m)`);
    check(res.pondBlocked && res.cityPondBlocked, 'ponds (countryside and city park) block walking');
    check(res.fieldsOpen, 'the fields are open (no city wall any more)');
    check(res.edgeWall, 'the edge of the land is closed');
    check(res.zone === 'Golden Sand Desert', `zone name in the desert: ${res.zone}`);
  }

  if (only.includes('drive')) {
    // A car at the city end of the bridge, facing south: drive across.
    await page.evaluate(() => {
      const b = window.BC, B = window.T.f.bridge;
      for (const v of [...b.fleet.vehicles]) if (Math.hypot(v.x - B.x, v.z - B.z0) < 80) b.fleet.remove(v);
      window.CAR = b.fleet.create('hatchback', { x: B.x, z: B.z0 - 12, heading: 0, color: '#2ea0ff' });
      b.setPaused('shots', false);
      window.T.tp(B.x + 2.6, B.z0 - 12, 0);
    });
    await wait(600);
    await page.keyboard.press('KeyE');
    await wait(1500);
    const inCar = await page.evaluate(() => window.BC.player.mode);
    check(inCar === 'vehicle', 'got into the car at the bridge');
    await page.keyboard.down('KeyW');
    let maxY = 0, z = 0;
    // Headless software rendering runs game time slowly: allow up to ~3 minutes.
    for (let i = 0; i < 720; i++) {
      await wait(250);
      const s = await page.evaluate(() => { const v = window.CAR; return { y: v.y, z: v.z, x: v.x, speed: v.speed, land: window.T.f.bridge.landZ }; });
      if (i % 40 === 0) console.log(`  car z ${s.z.toFixed(0)} y ${s.y.toFixed(1)} speed ${s.speed.toFixed(1)}`);
      maxY = Math.max(maxY, s.y); z = s.z;
      if (s.y > 6 && !fs.existsSync(path.join(outDir, 'drive-bridge.png'))) {
        await page.evaluate(() => { const BC = window.BC; BC.graphics.render(0); });
        await page.screenshot({ path: path.join(outDir, 'drive-bridge.png') });
      }
      if (s.z > s.land + 20) break;
    }
    await page.keyboard.up('KeyW');
    const end = await page.evaluate(() => ({ land: window.T.f.bridge.landZ, x: window.CAR.x, B: window.T.f.bridge.x }));
    check(maxY > 7, `the car climbed onto the deck (highest ${maxY.toFixed(1)} m)`);
    check(z > end.land, `the car reached the south bank (z ${z.toFixed(0)} > ${end.land.toFixed(0)})`);
  }

  if (only.includes('map')) {
    const m = await page.evaluate(() => {
      const BC = window.BC, mm = BC.features.get('minimap');
      const f = window.T.f;
      BC.setPaused('shots', false);
      BC.events.emit('route:set', { x: f.X(-6), z: f.Z(3) });
      // The player is back in the city for the route check.
      window.T.tp(f.X(4), f.Z(8));
      mm.route.recalc();
      const pts = mm.route.points.length;
      const blips = mm.blips.get('countryside')?.length || 0;
      document.getElementById('ui').style.display = '';
      BC.events.emit('map:open');
      return { pts, blips };
    });
    await wait(800);
    await page.evaluate(() => { const b = window.BC.features.get('minimap').bigMap; if (!b.isOpen) b.open(); b.fit(); b.zoom = 0.2; b.cx = window.T.f.X(4); b.cz = window.T.f.Z(8); b.draw(); });
    await wait(300);
    await page.screenshot({ path: path.join(outDir, 'map.png') });
    check(m.blips >= 6, `countryside points on the map (${m.blips})`);
    check(m.pts > 4, `GPS line to the desert follows the roads + highway (${m.pts} points)`);
  }

  if (problems.length) console.log('CONSOLE ERRORS:\n' + problems.join('\n'));
  console.log(problems.length || fails.length ? 'WORLD CHECK FAILED' : 'WORLD CHECK PASSED');
  await browser.close();
  server.close();
  process.exit(problems.length || fails.length ? 1 : 0);
})();
