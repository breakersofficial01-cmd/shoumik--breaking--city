// Packs the CC0 food models used by the hotels (Roadmap 2 S4) into ONE small GLB
// (assets/food/food.glb). Recipes: tools/food-kit/food.json.
//   - Kenney Food Kit 2.0 (GLB + one palette texture) and Quaternius Ultimate Food Pack (OBJ + MTL)
//   - every model becomes ONE child mesh named after its recipe: all parts merged, the palette
//     texture / MTL colours baked into vertex colours (linear), no texture in the game
//   - scaled so its widest side is `size` metres, standing on y = 0, centred on x/z = 0
//
//   node tools/food-kit/pack-food.js --three <three@0.170.0 dir> \
//        --kenney "<Food Kit>/Models/GLB format" --quat "<Ultimate Food Pack>/OBJ" \
//        [--out assets/food/food.glb] [--shot food.png]
// Then: node tools/compress-models.js --cli <gltf-transform>   (meshopt, like every GLB)

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const threeDir = arg('three');
const kenneyDir = arg('kenney');
const quatDir = arg('quat');
const out = arg('out', path.join(ROOT, 'assets/food/food.glb'));
const shot = arg('shot', null);
const recipes = JSON.parse(fs.readFileSync(path.join(__dirname, 'food.json'), 'utf8')).models;
const MIME = { '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.png': 'image/png', '.obj': 'text/plain', '.mtl': 'text/plain' };

const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><body style="margin:0"></body>'); return; }
  if (req.method === 'POST') {
    const ws = fs.createWriteStream(u === '/shot' ? shot : out); req.pipe(ws); ws.on('finish', () => res.end('ok')); return;
  }
  const roots = { '/three/': threeDir, '/kenney/': kenneyDir, '/quat/': quatDir };
  const pre = Object.keys(roots).find((p) => u.startsWith(p));
  const f = pre ? path.join(roots[pre], u.slice(pre.length)) : null;
  if (!f || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

(async () => {
  if (!threeDir || !kenneyDir || !quatDir) { console.log('usage: --three <dir> --kenney <GLB format dir> --quat <OBJ dir>'); process.exit(1); }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 500 } });
  page.on('pageerror', (e) => console.log('[page error]', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text()); });
  await page.goto(`http://localhost:${server.address().port}/`);
  await page.addScriptTag({ type: 'importmap', content: JSON.stringify({ imports: { three: '/three/build/three.module.js', 'three/addons/': '/three/examples/jsm/' } }) });
  const report = await page.evaluate(async ({ recipes, wantShot }) => {
    const THREE = await import('three');
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const { OBJLoader } = await import('three/addons/loaders/OBJLoader.js');
    const { MTLLoader } = await import('three/addons/loaders/MTLLoader.js');
    const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
    const { mergeGeometries } = await import('three/addons/utils/BufferGeometryUtils.js');
    const pixels = new Map();
    const readTex = (tex) => {
      if (pixels.has(tex.image)) return pixels.get(tex.image);
      const c = document.createElement('canvas'); c.width = tex.image.width; c.height = tex.image.height;
      const g = c.getContext('2d'); g.drawImage(tex.image, 0, 0);
      const p = { data: g.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height };
      pixels.set(tex.image, p); return p;
    };
    const toLin = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));

    async function loadSource(src) {
      const [pack, name] = src.split('/');
      if (pack === 'kenney') return { scene: (await new GLTFLoader().loadAsync(`/kenney/${name}.glb`)).scene, flipV: false };
      const mtl = await new MTLLoader().setPath('/quat/').loadAsync(`${name}.mtl`);
      mtl.preload();
      return { scene: await new OBJLoader().setMaterials(mtl).setPath('/quat/').loadAsync(`${name}.obj`), flipV: true };
    }

    const root = new THREE.Group(); root.name = 'food';
    const report = [];
    for (const r of recipes) {
      const { scene, flipV } = await loadSource(r.src);
      scene.updateMatrixWorld(true);
      const parts = [];
      scene.traverse((o) => {
        if (!o.isMesh) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        const g0 = o.geometry.clone().applyMatrix4(o.matrixWorld);
        if (!g0.attributes.normal) g0.computeVertexNormals();
        // OBJ meshes with several materials have groups: colour each group with its material.
        const groups = g0.groups.length ? g0.groups : [{ start: 0, count: g0.index ? g0.index.count : g0.attributes.position.count, materialIndex: 0 }];
        const g = g0.index ? g0.toNonIndexed() : g0;
        const n = g.attributes.position.count;
        const uv = g.attributes.uv;
        const col = new Float32Array(n * 3);
        for (const grp of groups) {
          const m = mats[grp.materialIndex] || mats[0];
          const tex = m.map ? readTex(m.map) : null;
          for (let i = grp.start; i < Math.min(n, grp.start + grp.count); i++) {
            let rgb = [1, 1, 1];
            if (tex && uv) {
              const u = (uv.getX(i) % 1 + 1) % 1, v = (uv.getY(i) % 1 + 1) % 1;
              const x = Math.min(tex.w - 1, Math.floor(u * tex.w));
              const y = Math.min(tex.h - 1, Math.floor((flipV ? 1 - v : v) * tex.h));
              const k = (y * tex.w + x) * 4;
              rgb = [toLin(tex.data[k] / 255), toLin(tex.data[k + 1] / 255), toLin(tex.data[k + 2] / 255)];
            }
            // m.color is linear already (three converts sRGB material colours on load).
            col[i * 3] = rgb[0] * m.color.r; col[i * 3 + 1] = rgb[1] * m.color.g; col[i * 3 + 2] = rgb[2] * m.color.b;
          }
        }
        const b = new THREE.BufferGeometry();
        b.setAttribute('position', g.attributes.position.clone());
        b.setAttribute('normal', g.attributes.normal.clone());
        b.setAttribute('color', new THREE.BufferAttribute(col, 3));
        parts.push(b);
      });
      const geo = mergeGeometries(parts);
      geo.computeBoundingBox();
      const bb = geo.boundingBox;
      const wide = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z);
      const s = r.size / wide;
      geo.applyMatrix4(new THREE.Matrix4().makeRotationY((r.rotY || 0) * Math.PI / 180)
        .multiply(new THREE.Matrix4().makeScale(s, s, s))
        .multiply(new THREE.Matrix4().makeTranslation(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2)));
      geo.computeBoundingBox();
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }));
      mesh.name = r.name; root.add(mesh);
      const sz = geo.boundingBox.getSize(new THREE.Vector3());
      report.push({ name: r.name, tris: geo.attributes.position.count / 3, size: [sz.x, sz.y, sz.z].map((v) => +v.toFixed(3)) });
    }
    const glb = await new GLTFExporter().parseAsync(root, { binary: true });
    await fetch('/glb', { method: 'POST', body: glb });

    if (wantShot) {
      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(1600, 500); document.body.appendChild(renderer.domElement);
      const scene = new THREE.Scene(); scene.background = new THREE.Color('#c9d6e2');
      scene.add(new THREE.HemisphereLight('#ffffff', '#666666', 2.4));
      const sun = new THREE.DirectionalLight('#ffffff', 2); sun.position.set(3, 8, 6); scene.add(sun);
      root.children.forEach((m, i) => {
        const c = new THREE.Mesh(m.geometry, new THREE.MeshLambertMaterial({ vertexColors: true }));
        c.scale.setScalar(0.3 / Math.max(0.05, m.geometry.boundingBox.max.y, (m.geometry.boundingBox.max.x - m.geometry.boundingBox.min.x) * 0.6));
        c.position.set((i % 12) * 0.42 - 2.3, 0, Math.floor(i / 12) * 0.5); c.rotation.y = -0.5; scene.add(c);
      });
      const cam = new THREE.PerspectiveCamera(30, 1600 / 500, 0.05, 50);
      cam.position.set(0, 1.4, 4.6); cam.lookAt(0, 0.1, 0.3);
      renderer.render(scene, cam);
      const blob = await new Promise((r) => renderer.domElement.toBlob(r, 'image/png'));
      await fetch('/shot', { method: 'POST', body: blob });
    }
    return report;
  }, { recipes, wantShot: !!shot });
  for (const r of report) console.log(JSON.stringify(r));
  console.log('wrote', out, (fs.statSync(out).size / 1024).toFixed(1), 'KB');
  await browser.close(); server.close();
})();
