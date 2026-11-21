// Packs the Kenney City Kit (Roads) street props (CC0) used by Session R2-1 into ONE small GLB
// (assets/street/street-props.glb). For every recipe in tools/street-kit/recipes.json:
//   - all parts are merged into one geometry (position, normal, COLOR) — the kit's palette
//     texture is baked into vertex colours (linear), so the game needs no texture at all and
//     can draw every prop with the shared vertex-colour prop material + InstancedMesh
//   - the model is scaled to its target height in metres and turned to face +z
//   - white palette cells (lamp bulbs) are split off into '<name>.glow'
//   - 'grey' recolours a model (Kenney lamps are lavender; Dhaka lamps are grey steel)
//
//   node tools/street-kit/pack-props.js --three <three@0.170.0 dir> --kit "<City Kit Roads>/Models/GLB format" \
//        [--out assets/street/street-props.glb] [--shot props.png]
// --shot also saves a picture of every packed prop in a row (to check the look).

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const threeDir = arg('three');
const kitDir = arg('kit');
const out = arg('out', path.join(ROOT, 'assets/street/street-props.glb'));
const shot = arg('shot', null);
const recipes = JSON.parse(fs.readFileSync(path.join(__dirname, 'recipes.json'), 'utf8')).props;
const MIME = { '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.png': 'image/png' };

const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><body style="margin:0"></body>'); return; }
  if (req.method === 'POST') {
    const target = u === '/shot' ? shot : out;
    const ws = fs.createWriteStream(target); req.pipe(ws); ws.on('finish', () => res.end('ok')); return;
  }
  const f = u.startsWith('/three/') ? path.join(threeDir, u.slice(7)) : u.startsWith('/kit/') ? path.join(kitDir, u.slice(5)) : null;
  if (!f || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

(async () => {
  if (!threeDir || !kitDir) { console.log('usage: --three <dir> --kit <GLB format dir>'); process.exit(1); }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 420 } });
  page.on('pageerror', (e) => console.log('[page error]', e.message));
  await page.goto(`http://localhost:${server.address().port}/`);
  await page.addScriptTag({ type: 'importmap', content: JSON.stringify({ imports: { three: '/three/build/three.module.js', 'three/addons/': '/three/examples/jsm/' } }) });
  const report = await page.evaluate(async ({ recipes, wantShot }) => {
    const THREE = await import('three');
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
    const { mergeGeometries } = await import('three/addons/utils/BufferGeometryUtils.js');
    const loader = new GLTFLoader();
    const pixels = new Map(); // texture image -> { data, w, h }
    const readTex = (tex) => {
      if (pixels.has(tex.image)) return pixels.get(tex.image);
      const c = document.createElement('canvas'); c.width = tex.image.width; c.height = tex.image.height;
      const g = c.getContext('2d'); g.drawImage(tex.image, 0, 0);
      const p = { data: g.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height };
      pixels.set(tex.image, p); return p;
    };
    const toLin = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));

    const root = new THREE.Group(); root.name = 'street-props';
    const report = [];
    for (const r of recipes) {
      const scene = (await loader.loadAsync(`/kit/${r.file}.glb`)).scene;
      scene.updateMatrixWorld(true);
      const solid = [], glow = [];
      const grey = r.grey ? new THREE.Color(r.grey) : null; // THREE.Color stores linear values
      scene.traverse((o) => {
        if (!o.isMesh) return;
        const m = Array.isArray(o.material) ? o.material[0] : o.material;
        const g = o.geometry.clone().applyMatrix4(o.matrixWorld).toNonIndexed();
        const n = g.attributes.position.count;
        const uv = g.attributes.uv;
        const tex = m.map ? readTex(m.map) : null;
        const col = new Float32Array(n * 3);
        const lum = new Float32Array(n);
        for (let i = 0; i < n; i++) {
          let rgb = [1, 1, 1];
          if (tex && uv) {
            // glTF UVs: (0,0) = top-left of the image (flipY false).
            const x = Math.min(tex.w - 1, Math.max(0, Math.floor((uv.getX(i) % 1 + 1) % 1 * tex.w)));
            const y = Math.min(tex.h - 1, Math.max(0, Math.floor((uv.getY(i) % 1 + 1) % 1 * tex.h)));
            const k = (y * tex.w + x) * 4;
            rgb = [tex.data[k] / 255, tex.data[k + 1] / 255, tex.data[k + 2] / 255];
          }
          col[i * 3] = toLin(rgb[0]) * m.color.r; col[i * 3 + 1] = toLin(rgb[1]) * m.color.g; col[i * 3 + 2] = toLin(rgb[2]) * m.color.b;
          lum[i] = Math.min(col[i * 3], col[i * 3 + 1], col[i * 3 + 2]); // the darkest channel
          if (grey && lum[i] <= (r.glow?.minLinear ?? 2)) {
            // Recolour (keep the shading): brightness relative to tintRef times the grey colour.
            const k = Math.min(1.4, (0.2126 * col[i * 3] + 0.7152 * col[i * 3 + 1] + 0.0722 * col[i * 3 + 2]) / r.tintRef);
            col[i * 3] = grey.r * k; col[i * 3 + 1] = grey.g * k; col[i * 3 + 2] = grey.b * k;
          }
        }
        // Split whole triangles: a triangle is "glow" when all its corners are (near) white.
        const pos = g.attributes.position.array, nor = g.attributes.normal.array;
        const pick = (bright) => {
          const P = [], N = [], C = [];
          for (let t = 0; t < n; t += 3) {
            const isBright = !!r.glow && lum[t] > r.glow.minLinear && lum[t + 1] > r.glow.minLinear && lum[t + 2] > r.glow.minLinear;
            if (isBright !== bright) continue;
            for (let k = t * 3; k < t * 3 + 9; k++) { P.push(pos[k]); N.push(nor[k]); C.push(col[k]); }
          }
          if (!P.length) return null;
          const b = new THREE.BufferGeometry();
          b.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
          b.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
          b.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
          return b;
        };
        const s = pick(false); if (s) solid.push(s);
        const gl = pick(true); if (gl) glow.push(gl);
      });
      // Scale to the target height, turn to face +z, stand on y = 0, centre the post on x/z = 0
      // (the post = the bottom of the model, so a lamp's arm sticks out from its base point).
      const all = mergeGeometries([...solid, ...glow]);
      all.computeBoundingBox();
      const bb = all.boundingBox;
      const scale = r.height / (bb.max.y - bb.min.y);
      const xf = new THREE.Matrix4().makeRotationY((r.rotY || 0) * Math.PI / 180)
        .multiply(new THREE.Matrix4().makeScale(scale, scale, scale))
        .multiply(new THREE.Matrix4().makeTranslation(0, -bb.min.y, 0));
      const finish = (list, name) => {
        if (!list.length) return null;
        const geo = mergeGeometries(list); geo.applyMatrix4(xf);
        const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
        mesh.name = name; root.add(mesh); return geo;
      };
      const sg = finish(solid, r.name);
      const gg = finish(glow, `${r.name}.glow`);
      sg.computeBoundingBox();
      report.push({ name: r.name, tris: sg.attributes.position.count / 3, glowTris: gg ? gg.attributes.position.count / 3 : 0,
        size: [sg.boundingBox.max.x - sg.boundingBox.min.x, sg.boundingBox.max.y, sg.boundingBox.max.z - sg.boundingBox.min.z].map((v) => +v.toFixed(2)),
        zRange: [+sg.boundingBox.min.z.toFixed(2), +sg.boundingBox.max.z.toFixed(2)] });
    }
    const glb = await new GLTFExporter().parseAsync(root, { binary: true });
    await fetch('/glb', { method: 'POST', body: glb });

    if (wantShot) {
      // A row of every prop, glow parts in bright yellow, on a grey floor.
      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(1400, 420); document.body.appendChild(renderer.domElement);
      const scene = new THREE.Scene(); scene.background = new THREE.Color('#9fb6c9');
      scene.add(new THREE.HemisphereLight('#ffffff', '#555555', 2.2));
      const sun = new THREE.DirectionalLight('#ffffff', 2); sun.position.set(3, 8, 6); scene.add(sun);
      let x = 0;
      for (const r of recipes) {
        for (const suffix of ['', '.glow']) {
          const src = root.getObjectByName(r.name + suffix);
          if (!src) continue;
          const m = new THREE.Mesh(src.geometry, suffix ? new THREE.MeshBasicMaterial({ color: '#fff27a' }) : new THREE.MeshLambertMaterial({ vertexColors: true }));
          m.position.x = x; m.rotation.y = -0.6; scene.add(m);
        }
        x += 4.2;
      }
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 40), new THREE.MeshLambertMaterial({ color: '#777' }));
      floor.rotation.x = -Math.PI / 2; scene.add(floor);
      const cam = new THREE.PerspectiveCamera(30, 1400 / 420, 0.1, 200);
      cam.position.set(x / 2 - 2, 4.5, 30); cam.lookAt(x / 2 - 2, 3, 0);
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
