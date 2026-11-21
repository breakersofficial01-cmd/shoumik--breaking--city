// Compress every GLB in assets/ with meshopt (EXT_meshopt_compression + quantised vertices).
// Files get 2-5x smaller, so the game starts faster on mobile data. The game reads them through
// src/assets/registry.js → gltfLoader() (MeshoptDecoder from the same pinned three.js).
//
//   npm i @gltf-transform/cli@4          (once, anywhere — e.g. a scratch folder)
//   node tools/compress-models.js --cli <path to node_modules/.bin/gltf-transform> [--dry] [--only shoumik]
//
// Files that are already compressed are skipped, so it is safe to run again after adding models.
// Keep the ORIGINAL download of a pack outside the repo: pack/bake tools (tools/street-kit,
// tools/city-kit, tools/shoumik-pipeline) read the originals, then run this again on their output.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const cli = arg('cli', 'gltf-transform');
const dry = process.argv.includes('--dry');
const only = arg('only', '');

/** Extensions used by a GLB (reads only its JSON chunk). */
function extensionsOf(file) {
  const b = fs.readFileSync(file);
  const len = b.readUInt32LE(12);
  return JSON.parse(b.slice(20, 20 + len)).extensionsUsed || [];
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.glb')) out.push(p);
  }
  return out;
}

let before = 0, after = 0, done = 0;
for (const file of walk(path.join(ROOT, 'assets'))) {
  if (only && !file.includes(only)) continue;
  const rel = path.relative(ROOT, file);
  const size = fs.statSync(file).size;
  if (extensionsOf(file).includes('EXT_meshopt_compression')) { console.log(`skip  ${rel} (already compressed)`); continue; }
  if (dry) { console.log(`would ${rel} (${(size / 1024).toFixed(0)} KB)`); continue; }
  const tmp = file + '.tmp.glb';
  execFileSync(cli, ['meshopt', file, tmp, '--level', 'medium'], { stdio: 'pipe' });
  const small = fs.statSync(tmp).size;
  fs.renameSync(tmp, file);
  before += size; after += small; done++;
  console.log(`ok    ${rel}  ${(size / 1024).toFixed(0)} KB → ${(small / 1024).toFixed(0)} KB`);
}
if (done) console.log(`\n${done} files: ${(before / 1048576).toFixed(2)} MB → ${(after / 1048576).toFixed(2)} MB`);
