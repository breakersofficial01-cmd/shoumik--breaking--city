// Bakes the facade atlas (assets/city/facades.jpg) from Downtown City MegaKit pieces (CC0,
// Quaternius). For every tile in facade-recipes.json it assembles a slice of wall from kit
// pieces, renders it straight on (orthographic) with soft lighting, and writes one 256 px tile.
// Wall materials are turned grey and lifted to near-white, so the game still tints each
// building with its own colour (vertex colours); glass and interiors keep their colours.
//
//   node tools/city-kit/bake-facades.js --three <three@0.170.0 dir> --kit "<kit>/Exports/glTF (Godot)" --out assets/city/facades.png
//
// The kit itself is NOT in the repo (244 MB); only the baked atlas is. Needs playwright.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const threeDir = arg('three');
const kitDir = arg('kit');
const out = arg('out', 'assets/city/facades.png');
const recipes = JSON.parse(fs.readFileSync(arg('recipes', path.join(__dirname, 'facade-recipes.json')), 'utf8'));
const MIME = { '.js': 'text/javascript', '.gltf': 'model/gltf+json', '.png': 'image/png', '.bin': 'application/octet-stream' };

const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><body style="margin:0;background:#000"></body>'); return; }
  const f = u.startsWith('/three/') ? path.join(threeDir, u.slice(7)) : u.startsWith('/kit/') ? path.join(kitDir, u.slice(5)) : null;
  if (!f || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

(async () => {
  await new Promise((r) => server.listen(0, r));
  const size = recipes.tileSize;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--js-flags=--max-old-space-size=8192'] });
  const page = await browser.newPage({ viewport: { width: size * recipes.tiles.length, height: size } });
  page.on('pageerror', (e) => console.log('[page error]', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('[page]', m.text()); });
  await page.goto(`http://localhost:${server.address().port}/`);
  await page.addScriptTag({ type: 'importmap', content: JSON.stringify({ imports: { three: '/three/build/three.module.js', 'three/addons/': '/three/examples/jsm/' } }) });

  const dataUrl = await page.evaluate(async (R) => {
    const THREE = await import('three');
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const { RoomEnvironment } = await import('three/addons/environments/RoomEnvironment.js');
    const S = R.tileSize, N = R.tiles.length;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(S * N, S);
    renderer.setScissorTest(true);
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);
    const env = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
    const loader = new GLTFLoader();
    const cache = new Map();
    const load = async (name) => {
      if (!cache.has(name)) cache.set(name, loader.loadAsync(`/kit/${name}.gltf`).then((g) => g.scene));
      return (await cache.get(name)).clone(true);
    };
    // Mean brightness of a material's colour texture (to lift each wall material to near-white).
    const meanLum = (m) => {
      const img = m.map?.image;
      let l = 0.6;
      if (img) {
        const c = document.createElement('canvas'); c.width = c.height = 32;
        const g = c.getContext('2d'); g.drawImage(img, 0, 0, 32, 32);
        const d = g.getImageData(0, 0, 32, 32).data; let s = 0;
        for (let i = 0; i < d.length; i += 4) s += (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
        l = s / (d.length / 4);
      }
      const c = m.color || new THREE.Color(1, 1, 1);
      return l * (0.299 * c.r + 0.587 * c.g + 0.114 * c.b);
    };
    const greyed = new WeakSet();
    const grey = (m) => {
      if (greyed.has(m)) return; greyed.add(m);
      const lift = 0.86 / Math.max(0.05, meanLum(m));
      m.onBeforeCompile = (sh) => {
        sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
          { float l = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
            l = clamp(l * ${lift.toFixed(4)}, 0.0, 1.0);
            diffuseColor.rgb = vec3(mix(l, 0.9, ${R.flatten})); }`);
      };
      m.customProgramCacheKey = () => 'grey' + lift.toFixed(4);
    };

    // Balcony front (no kit piece fits a Dhaka balcony): concrete parapet + dark iron grill,
    // with the shadowed balcony behind. Grey, so the game tints it with the balcony colour.
    const makeRail = (w) => {
      const g = new THREE.Group();
      const box = (x0, y0, z0, x1, y1, z1, c) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, metalness: c < 0x606060 ? 0.4 : 0 }));
        m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); g.add(m); return m;
      };
      box(-w, 0, -0.9, w, 1.2, -0.8, 0x3a3a3a);            // shadowed balcony behind
      box(-w, 0, -0.05, w, 0.5, 0.05, 0xdcdcdc);            // parapet
      box(-w, 0.5, -0.06, w, 0.54, 0.06, 0xeeeeee);         // parapet cap
      box(-w, 1.0, -0.02, w, 1.04, 0.02, 0x4a4a4a);         // top rail
      for (let x = -w; x <= w; x += 0.11) box(x - 0.012, 0.54, -0.012, x + 0.012, 1.0, 0.012, 0x4a4a4a);
      for (let x = -w + 0.33; x <= w; x += 0.66) box(x - 0.15, 0.7, -0.015, x + 0.15, 0.73, 0.015, 0x4a4a4a); // pattern bars
      return g;
    };
    const masks = [];   // per tile: meshes that are glass
    const views = [];
    // Dhaka shop bay: pillars, a light corrugated rolling shutter pulled half up, and the lit
    // shop inside (kit interior texture) below it.
    const makeShutter = async (w) => {
      const g = new THREE.Group();
      const tex = await new THREE.TextureLoader().loadAsync('/kit/T_lit_interior_1.png');
      tex.colorSpace = THREE.SRGBColorSpace;
      const inside = new THREE.Mesh(new THREE.PlaneGeometry(w, 2.2), new THREE.MeshBasicMaterial({ map: tex, name: 'FakeInterior' }));
      inside.material.color.setScalar(0.85);
      inside.position.set(0, 1.1, -0.6); g.add(inside);
      const mat = (c, name) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.35, name });
      const ribs = mat(0xd8d8d8, 'ShutterTint');
      for (let y = 2.2; y < 3.0; y += 0.08) {
        const r = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, w, 6), ribs);
        r.rotation.z = Math.PI / 2; r.position.set(0, y, 0.02); g.add(r);
      }
      const back = new THREE.Mesh(new THREE.BoxGeometry(w, 0.82, 0.02), mat(0xc4c4c4, 'ShutterTint')); back.position.set(0, 2.6, -0.02); g.add(back);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, 0.08), mat(0x9a9a9a, 'ShutterTint')); bar.position.set(0, 2.2, 0.03); g.add(bar);
      for (const x of [-w / 2 + 0.12, w / 2 - 0.12]) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.24, 3, 0.3), mat(0xe6e6e6, 'ShutterTint')); p.position.set(x, 1.5, 0); g.add(p);
      }
      const step = new THREE.Mesh(new THREE.BoxGeometry(w, 0.18, 0.5), mat(0xbdbdbd, 'ShutterTint')); step.position.set(0, 0.09, 0.1); g.add(step);
      return g;
    };
    for (const [i, t] of R.tiles.entries()) {
      const scene = new THREE.Scene();
      scene.background = new THREE.Color('#000');
      scene.environment = env;
      scene.environmentIntensity = 0.55 * R.exposure;
      // Light from the upper left so sills, frames and recesses cast short shadows.
      const sun = new THREE.DirectionalLight(0xffffff, 1.6 * R.exposure); sun.position.set(-2.2, 4.2, 3.2);
      sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); sun.shadow.bias = -0.0005; sun.shadow.radius = 3;
      Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 0.1, far: 20 });
      scene.add(sun);
      for (const [name, x = 0, y = 0, z = 0, rot = 0] of t.pieces) {
        const o = name === '@rail' ? makeRail(t.width) : name === '@shutter' ? await makeShutter(t.width) : await load(name);
        o.position.set(x, y, z); o.rotation.y = rot * Math.PI / 180;
        o.traverse((m) => {
          if (!m.isMesh) return;
          m.castShadow = m.receiveShadow = true;
          m.material = (Array.isArray(m.material) ? m.material : [m.material]).map((mat) => {
            const n = mat.name.replace(/^MI_/, '');
            mat = mat.clone(); mat.name = n;
            if (name === '@rail' || name === '@shutter') return mat;
            if (n === 'Glass') { mat.transparent = true; mat.opacity = R.glass.opacity; mat.color.set(R.glass.color); mat.metalness = 0.5; mat.roughness = 0.15; m.castShadow = false; }
            else if (!R.neutral.includes(n)) grey(mat);
            return mat;
          });
          if (m.material.length === 1) m.material = m.material[0];
        });
        scene.add(o);
      }
      const y0 = t.y0 || 0;
      const cam = new THREE.OrthographicCamera(-t.width / 2, t.width / 2, y0 + t.height, y0, 0.01, 20);
      cam.position.set(0, 0, 10); cam.lookAt(0, 0, 0);
      renderer.setViewport(i * S, 0, S, S); renderer.setScissor(i * S, 0, S, S);
      renderer.render(scene, cam);
      views.push({ scene, cam });
    }
    // Colour pass done. Copy it, then render a glass mask (white = glass, nearest surface wins).
    const colour = document.createElement('canvas'); colour.width = S * N; colour.height = S;
    colour.getContext('2d').drawImage(renderer.domElement, 0, 0);
    const black = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (const [i, { scene, cam }] of views.entries()) {
      scene.environment = null; scene.background = new THREE.Color(0);
      scene.traverse((m) => {
        if (!m.isMesh) return;
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        m.material = Array.isArray(m.material) ? mats.map((x) => (x.name === 'Glass' ? white : black)) : (mats[0].name === 'Glass' ? white : black);
      });
      renderer.setViewport(i * S, 0, S, S); renderer.setScissor(i * S, 0, S, S);
      renderer.render(scene, cam);
    }
    const mask = document.createElement('canvas'); mask.width = S * N; mask.height = S;
    mask.getContext('2d').drawImage(renderer.domElement, 0, 0);
    // Glass = the baked pixel mixed with a sky reflection (darker blue at the top of each pane
    // area, warm and bright lower down) plus a soft diagonal glint, per tile settings.
    const g = colour.getContext('2d');
    const img = g.getImageData(0, 0, S * N, S), m = mask.getContext('2d').getImageData(0, 0, S * N, S).data;
    const cols = R.tiles.map((t) => [new THREE.Color(t.reflectTop || R.glass.reflectTop).toArray(), new THREE.Color(t.reflectBottom || R.glass.reflectBottom).toArray()]);
    for (let y = 0; y < S; y++) for (let x = 0; x < S * N; x++) {
      const k = (y * S * N + x) * 4, a = m[k] / 255;
      if (a < 0.02) continue;
      const t = R.tiles[Math.floor(x / S)];
      const mix = (t.glassMix ?? R.glass.mix) * a;
      const fy = y / S, lx = (x % S) / S;
      const glint = Math.max(0, 1 - Math.abs((lx + fy * 0.6) - 0.55) / 0.12) * R.glass.glint;
      for (let c = 0; c < 3; c++) {
        const [top, bot] = cols[Math.floor(x / S)];
        const refl = (top[c] * (1 - fy) + bot[c] * fy) * 255 + glint * 255;
        img.data[k + c] = Math.min(255, img.data[k + c] * (1 - mix) + refl * mix);
      }
    }
    g.putImageData(img, 0, 0);
    return colour.toDataURL('image/png');
  }, recipes);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log(`wrote ${out} (${recipes.tiles.length} tiles of ${size} px: ${recipes.tiles.map((t) => t.name).join(', ')})`);
  await browser.close(); server.close();
})();
