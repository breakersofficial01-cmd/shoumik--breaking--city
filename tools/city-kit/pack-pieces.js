// Packs the Downtown City MegaKit pieces used by the 3D "hero" buildings into ONE small GLB
// (assets/city/kit-pieces.glb): each piece is a child named after its kit file.
//   - hidden interior parts are removed (FakeInterior / Interior* materials)
//   - textures shrink from 2048 PNG to <size> px JPEG (colour + normal; ORM dropped)
//   - materials keep their kit names without the MI_ prefix (RedBrick, Trim, Glass, ...)
//
//   node tools/city-kit/pack-pieces.js --three <three@0.170.0 dir> --kit "<kit>/Exports/glTF (Godot)" --out assets/city/kit-pieces.glb [--size 512]
// The piece list is data/heroBuildings.json → pieces (every piece any style uses).

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const threeDir = arg('three');
const kitDir = arg('kit');
const out = arg('out', path.join(ROOT, 'assets/city/kit-pieces.glb'));
const size = +arg('size', 512);
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/heroBuildings.json'), 'utf8'));
const MIME = { '.js': 'text/javascript', '.gltf': 'model/gltf+json', '.png': 'image/png' };

const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><body></body>'); return; }
  if (req.method === 'POST') { const ws = fs.createWriteStream(out); req.pipe(ws); ws.on('finish', () => res.end('ok')); return; }
  const f = u.startsWith('/three/') ? path.join(threeDir, u.slice(7)) : u.startsWith('/kit/') ? path.join(kitDir, u.slice(5)) : null;
  if (!f || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

(async () => {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--js-flags=--max-old-space-size=8192'] });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('[page error]', e.message));
  await page.goto(`http://localhost:${server.address().port}/`);
  await page.addScriptTag({ type: 'importmap', content: JSON.stringify({ imports: { three: '/three/build/three.module.js', 'three/addons/': '/three/examples/jsm/' } }) });
  const report = await page.evaluate(async ({ pieces, size }) => {
    const THREE = await import('three');
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
    const loader = new GLTFLoader();
    const shrunk = new Map();   // original texture image -> small JPEG-marked texture
    const small = (tex, colour) => {
      if (!tex) return null;
      if (shrunk.has(tex.image)) return shrunk.get(tex.image);
      const c = document.createElement('canvas'); c.width = c.height = size;
      c.getContext('2d').drawImage(tex.image, 0, 0, size, size);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.flipY = false;
      t.userData.mimeType = 'image/jpeg';
      shrunk.set(tex.image, t); return t;
    };
    const mats = new Map();     // kit material name -> one shared, simplified material
    const material = (m) => {
      const name = m.name.replace(/^MI_/, '');
      if (!mats.has(name)) {
        const s = new THREE.MeshStandardMaterial({
          name, color: m.color.clone(), map: small(m.map, true), normalMap: small(m.normalMap, false),
          roughness: name === 'Glass' ? 0.08 : 0.85, metalness: name === 'Glass' ? 0.9 : 0,
        });
        mats.set(name, s);
      }
      return mats.get(name);
    };
    const root = new THREE.Group(); root.name = 'kit-pieces';
    const report = [];
    for (const name of pieces) {
      const scene = (await loader.loadAsync(`/kit/${name}.gltf`)).scene;
      const piece = new THREE.Group(); piece.name = name;
      let tris = 0;
      scene.updateMatrixWorld(true);
      scene.traverse((o) => {
        if (!o.isMesh) return;
        const m = Array.isArray(o.material) ? o.material[0] : o.material;
        if (/Interior/.test(m.name)) return;           // hidden behind glass / walls
        const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld);
        for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
        tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
        piece.add(new THREE.Mesh(g, material(m)));
      });
      root.add(piece);
      report.push(`${name}: ${tris} tris`);
    }
    const glb = await new GLTFExporter().parseAsync(root, { binary: true });
    await fetch('/save', { method: 'POST', body: glb });
    return report.concat([`materials: ${[...mats.keys()].join(', ')}`]);
  }, { pieces: cfg.pieces, size });
  console.log(report.join('\n'));
  console.log(`wrote ${out} (${(fs.statSync(out).size / 1e6).toFixed(2)} MB)`);
  await browser.close(); server.close();
})();
