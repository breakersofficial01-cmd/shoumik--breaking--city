// Packs Kenney Car Kit models (CC0) for the game's real-vehicle system (Roadmap 2, Session 2).
// The kit paints every car from one small palette picture; the game repaints cars BY MATERIAL
// (data/vehicles.json → types.<id>.model: paint / second / colors). So this tool:
//   - reads the palette colour under every triangle and sorts it into a ROLE, one flat
//     material each: Paint (the car's main colour), Windows, Headlight, Taillight, Trim
//     (blue-grey plastic), Dark (tyres, bumpers), Light (white panels, cargo boxes)
//   - keeps the wheels as separate meshes named "wheel..." (the game finds wheels by name)
//   - writes ONE GLB per car: assets/vehicles/<out>.glb   (then run tools/compress-models.js)
// It prints the colours of each car (share of triangles) so you can name them in the recipe.
//
//   node tools/car-kit/pack-cars.js --three <three@0.170.0 dir> --kit "<Car Kit>/Models/GLB format" [--only truck]
// Recipes: tools/car-kit/cars.json (roles = { 'rrggbb': role } overrides one palette colour).

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const threeDir = arg('three');
const kitDir = arg('kit');
const only = arg('only', '');
const cars = JSON.parse(fs.readFileSync(path.join(__dirname, 'cars.json'), 'utf8')).cars.filter((c) => !only || c.file === only || c.out === only);

const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><body></body>'); return; }
  if (req.method === 'POST') {
    const file = path.join(ROOT, 'assets/vehicles', path.basename(u) + '.glb');
    const ws = fs.createWriteStream(file); req.pipe(ws); ws.on('finish', () => res.end('ok')); return;
  }
  const f = u.startsWith('/three/') ? path.join(threeDir, u.slice(7)) : u.startsWith('/kit/') ? path.join(kitDir, u.slice(5)) : null;
  if (!f || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

(async () => {
  if (!threeDir || !kitDir) { console.log('usage: --three <dir> --kit <GLB format dir>'); process.exit(1); }
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('[page error]', e.message));
  await page.goto(`http://localhost:${server.address().port}/`);
  await page.addScriptTag({ type: 'importmap', content: JSON.stringify({ imports: { three: '/three/build/three.module.js', 'three/addons/': '/three/examples/jsm/' } }) });
  const report = await page.evaluate(async (cars) => {
    const THREE = await import('three');
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
    const { mergeGeometries } = await import('three/addons/utils/BufferGeometryUtils.js');
    const loader = new GLTFLoader();
    const hex2 = (v) => Math.round(v * 255).toString(16).padStart(2, '0');
    const TAIL = ['e0463e', 'ed573f', 'd3363d', 'fa673f'];
    /** Kit palette colour → role. Kenney paints shading into the palette, so it goes by hue. */
    function roleOf(hex) {
      const c = new THREE.Color(`#${hex}`); // sRGB values are fine for sorting
      const hsl = c.getHSL({}, THREE.SRGBColorSpace);
      const [r, g, b] = [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
      if (TAIL.includes(hex)) return 'Taillight';
      if (r > 240 && g > 190 && b < 70) return 'Headlight';        // pure bright yellow
      if (hsl.l > 0.82 && b - r > 20) return 'Windows';           // pale blue glass
      if (hsl.l > 0.75 && hsl.s < 0.4) return 'Light';             // white / pale grey panels
      if (hsl.l < 0.27) return 'Dark';
      if (hsl.s < 0.22) return 'Trim';                             // blue-grey plastic, bumpers
      return 'Paint';
    }
    const out = [];
    for (const car of cars) {
      const scene = (await loader.loadAsync(`/kit/${car.file}.glb`)).scene;
      scene.updateMatrixWorld(true);
      const root = new THREE.Group(); root.name = car.out;
      const counts = {};
      scene.traverse((o) => {
        if (!o.isMesh) return;
        const m = o.material;
        let pixels = null;
        if (m.map) {
          const c = document.createElement('canvas'); c.width = m.map.image.width; c.height = m.map.image.height;
          const g = c.getContext('2d'); g.drawImage(m.map.image, 0, 0);
          pixels = { d: g.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height };
        }
        const geo = o.geometry.clone().applyMatrix4(o.matrixWorld).toNonIndexed();
        const uv = geo.attributes.uv, n = geo.attributes.position.count;
        // Colour of each triangle = palette pixel under its middle → a role (see roleOf).
        const groups = new Map(); // role -> [triangle start indices]
        const sums = {};          // role -> [r, g, b, n] (average colour of the role)
        for (let t = 0; t < n; t += 3) {
          let hex = 'ffffff';
          if (pixels && uv) {
            const u = (uv.getX(t) + uv.getX(t + 1) + uv.getX(t + 2)) / 3, v = (uv.getY(t) + uv.getY(t + 1) + uv.getY(t + 2)) / 3;
            const x = Math.min(pixels.w - 1, Math.max(0, Math.floor(((u % 1) + 1) % 1 * pixels.w)));
            const y = Math.min(pixels.h - 1, Math.max(0, Math.floor(((v % 1) + 1) % 1 * pixels.h)));
            const k = (y * pixels.w + x) * 4;
            hex = hex2(pixels.d[k] / 255) + hex2(pixels.d[k + 1] / 255) + hex2(pixels.d[k + 2] / 255);
          }
          const role = car.roles?.[hex] || roleOf(hex);
          if (!groups.has(role)) groups.set(role, []);
          groups.get(role).push(t);
          const sm = sums[role] || (sums[role] = [0, 0, 0, 0]);
          sm[0] += parseInt(hex.slice(0, 2), 16); sm[1] += parseInt(hex.slice(2, 4), 16); sm[2] += parseInt(hex.slice(4, 6), 16); sm[3]++;
        }
        const isWheel = /wheel/i.test(o.name);
        const parts = [], mats = [];
        for (const [role, tris] of groups) {
          const P = [], N = [];
          for (const t of tris) for (let k = 0; k < 3; k++) {
            P.push(geo.attributes.position.getX(t + k), geo.attributes.position.getY(t + k), geo.attributes.position.getZ(t + k));
            N.push(geo.attributes.normal.getX(t + k), geo.attributes.normal.getY(t + k), geo.attributes.normal.getZ(t + k));
          }
          const b = new THREE.BufferGeometry();
          b.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
          b.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
          parts.push(b);
          const name = role;
          const sm = sums[role];
          const avg = new THREE.Color().setRGB(sm[0] / sm[3] / 255, sm[1] / sm[3] / 255, sm[2] / sm[3] / 255, THREE.SRGBColorSpace);
          mats.push(new THREE.MeshStandardMaterial({ name, color: avg, roughness: 0.6 }));
          if (!isWheel) counts[name] = (counts[name] || 0) + tris.length;
        }
        const merged = mergeGeometries(parts, true); // one group per colour → one material each
        const mesh = new THREE.Mesh(merged, mats);
        mesh.name = isWheel ? `wheel-${o.name}` : (o.name || 'body');
        root.add(mesh);
      });
      const glb = await new GLTFExporter().parseAsync(root, { binary: true });
      await fetch(`/${car.out}`, { method: 'POST', body: glb });
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      out.push({ car: car.out, colours: Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${Math.round((v / total) * 100)}%`).join(', ') });
    }
    return out;
  }, cars);
  for (const r of report) console.log(`${r.car}: ${r.colours}`);
  await browser.close(); server.close();
})();
