// Terrain tiles (Roadmap 2 S3): the countryside ground, drawn in square tiles like the city
// chunks. Only tiles within the view distance exist; near ones use the fine grid
// (data/terrain.json → cell, the same points as the gameplay height), far ones a coarse grid
// (farCell). A skirt along each tile edge hides cracks between fine and coarse neighbours.
// Tiles are built a few per frame (time budget), so walking out of the city never freezes.
//
// The material is one shared Lambert with vertex colours + a small shader patch that paints
// the paddy-field plots (with earth bunds between them) sharply per pixel — vertex colours
// alone would smear 1 m bunds across 8 m cells. The attribute `aField` says how much of the
// plot pattern a point gets (0 on roads, water, desert, hills).

import * as THREE from 'three';

const SKIRT = 4; // metres the skirt hangs below the edge

/** Shared terrain material (fields pattern + gentle variation). */
export function makeTerrainMaterial(cfg) {
  const F = cfg.types.fields;
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  const uniforms = {
    uPlot: { value: new THREE.Vector2(F.plot[0], F.plot[1]) },
    uBund: { value: F.bund },
    uPlotA: { value: new THREE.Color(F.colors.a) },
    uPlotB: { value: new THREE.Color(F.colors.b) },
    uPlotC: { value: new THREE.Color(F.colors.c) },
    uBundCol: { value: new THREE.Color(F.colors.bund) },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aField;\nvarying float vField;\nvarying vec3 vTerrainPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvField = aField;\nvTerrainPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying float vField;
varying vec3 vTerrainPos;
uniform vec2 uPlot;
uniform float uBund;
uniform vec3 uPlotA, uPlotB, uPlotC, uBundCol;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec2 p = vTerrainPos.xz;
  // Gentle large-scale light/dark so big areas never look flat.
  float wave = 0.5 + 0.25 * (sin(p.x * 0.071 + p.y * 0.023) + sin(p.y * 0.057 - p.x * 0.031));
  diffuseColor.rgb *= 0.93 + 0.12 * wave;
  if (vField > 0.01) {
    vec2 cellId = floor(p / uPlot);
    float h = fract(sin(dot(cellId, vec2(127.1, 311.7))) * 43758.5453);
    vec3 plot = h < 0.5 ? uPlotA : (h < 0.82 ? uPlotB : uPlotC);
    vec2 f = abs(fract(p / uPlot) - 0.5) * uPlot;
    vec2 edge = uPlot * 0.5 - f;
    float bund = 1.0 - smoothstep(uBund * 0.45, uBund, min(edge.x, edge.y));
    float rows = 0.5 + 0.5 * sin((h > 0.5 ? p.x : p.y) * 2.4 + h * 6.0);
    plot *= 0.9 + 0.1 * rows;
    plot = mix(plot, uBundCol, bund);
    diffuseColor.rgb = mix(diffuseColor.rgb, plot, clamp(vField, 0.0, 1.0));
  }
}`);
  };
  mat.customProgramCacheKey = () => 'terrain-fields-v1';
  return mat;
}

export class TerrainTiles {
  /**
   * @param {import('./field.js').TerrainField} field
   * @param {object} cfg  data/terrain.json
   * @param {THREE.Object3D} parent
   */
  constructor(field, cfg, parent) {
    this.field = field;
    this.cfg = cfg;
    this.material = makeTerrainMaterial(cfg);
    this.group = new THREE.Group();
    this.group.name = 'terrain-tiles';
    parent.add(this.group);
    const T = cfg.tile;
    const b = field.bounds;
    this.tiles = [];
    for (let z0 = Math.floor(b.z0 / T) * T; z0 < b.z1; z0 += T) {
      for (let x0 = Math.floor(b.x0 / T) * T; x0 < b.x1; x0 += T) {
        // A tile completely inside the city is never needed.
        const c = field.city;
        if (x0 >= c.x0 && x0 + T <= c.x1 && z0 >= c.z0 && z0 + T <= c.z1) continue;
        this.tiles.push({ x0, z0, x1: x0 + T, z1: z0 + T, mesh: null, lod: 0, dist: 0 });
      }
    }
    this.queue = [];
    this.stats = { built: 0, visible: 0 };
    this.budgetMs = 4;
  }

  distanceTo(t, x, z) {
    return Math.hypot(Math.max(t.x0 - x, 0, x - t.x1), Math.max(t.z0 - z, 0, z - t.z1));
  }

  /** Make the geometry of one tile with the given grid spacing. */
  buildGeometry(t, cell) {
    const f = this.field;
    const n = Math.round((t.x1 - t.x0) / cell);
    const m = n + 3; // sample grid with a one-point border ring (for smooth normals)
    const hs = new Float32Array(m * m);
    const near = cell === f.cell;
    for (let j = 0; j < m; j++) {
      for (let i = 0; i < m; i++) {
        const x = t.x0 + (i - 1) * cell, z = t.z0 + (j - 1) * cell;
        hs[j * m + i] = near ? f.gridHeight(Math.round(x / cell), Math.round(z / cell)) : f.sample(x, z).h;
      }
    }
    const count = (n + 1) * (n + 1);
    const pos = new Float32Array((count + 4 * (n + 1)) * 3);
    const nor = new Float32Array(pos.length);
    const col = new Float32Array(pos.length);
    const fld = new Float32Array(pos.length / 3);
    const o = { col: [0, 0, 0] };
    let v = 0;
    for (let j = 0; j <= n; j++) {
      for (let i = 0; i <= n; i++) {
        const x = t.x0 + i * cell, z = t.z0 + j * cell;
        const s = f.sample(x, z, o);
        const h = hs[(j + 1) * m + (i + 1)];
        pos[v * 3] = x; pos[v * 3 + 1] = h; pos[v * 3 + 2] = z;
        // Normal from the neighbours (central differences).
        const hl = hs[(j + 1) * m + i], hr = hs[(j + 1) * m + i + 2];
        const hu = hs[j * m + i + 1], hd = hs[(j + 2) * m + i + 1];
        let nx = hl - hr, ny = 2 * cell, nz = hu - hd;
        const len = Math.hypot(nx, ny, nz);
        nor[v * 3] = nx / len; nor[v * 3 + 1] = ny / len; nor[v * 3 + 2] = nz / len;
        col[v * 3] = s.col[0]; col[v * 3 + 1] = s.col[1]; col[v * 3 + 2] = s.col[2];
        fld[v] = s.field;
        v++;
      }
    }
    const idx = [];
    const c = f.city;
    const inCity = (x, z) => x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = t.x0 + i * cell, z = t.z0 + j * cell;
        if (inCity(x, z) && inCity(x + cell, z + cell)) continue; // hidden under the city
        const a = j * (n + 1) + i, b = a + 1, cc = a + (n + 1), d = cc + 1;
        idx.push(a, cc, b, b, cc, d); // diagonal b–c, like field.groundAt()
      }
    }
    // Skirts: copy each edge row down a few metres (hides cracks next to coarser tiles).
    const edge = (list) => {
      const start = v;
      for (const k of list) {
        pos[v * 3] = pos[k * 3]; pos[v * 3 + 1] = pos[k * 3 + 1] - SKIRT; pos[v * 3 + 2] = pos[k * 3 + 2];
        nor[v * 3] = nor[k * 3]; nor[v * 3 + 1] = nor[k * 3 + 1]; nor[v * 3 + 2] = nor[k * 3 + 2];
        col[v * 3] = col[k * 3]; col[v * 3 + 1] = col[k * 3 + 1]; col[v * 3 + 2] = col[k * 3 + 2];
        fld[v] = fld[k];
        v++;
      }
      for (let q = 0; q < list.length - 1; q++) {
        const a = list[q], b = list[q + 1], a2 = start + q, b2 = start + q + 1;
        idx.push(a, a2, b, b, a2, b2, a, b, a2, b, b2, a2); // both sides: no culling surprises
      }
    };
    const row = (j) => Array.from({ length: n + 1 }, (_, i) => j * (n + 1) + i);
    const colm = (i) => Array.from({ length: n + 1 }, (_, j) => j * (n + 1) + i);
    edge(row(0)); edge(row(n)); edge(colm(0)); edge(colm(n));

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aField', new THREE.BufferAttribute(fld, 1));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    return geo;
  }

  build(t, lod) {
    const cell = lod === 1 ? this.cfg.cell : this.cfg.farCell;
    const geo = this.buildGeometry(t, cell);
    if (t.mesh) {
      t.mesh.geometry.dispose();
      t.mesh.geometry = geo;
    } else {
      t.mesh = new THREE.Mesh(geo, this.material);
      t.mesh.name = 'terrain-tile';
      t.mesh.userData.noCastShadow = true;
      t.mesh.receiveShadow = true;
      t.mesh.matrixAutoUpdate = false;
      this.group.add(t.mesh);
      this.stats.built++;
    }
    t.lod = lod;
  }

  drop(t) {
    if (!t.mesh) return;
    this.group.remove(t.mesh);
    t.mesh.geometry.dispose();
    t.mesh = null;
    t.lod = 0;
    this.stats.built--;
  }

  /**
   * @param {{x:number, z:number}} focus  @param {number} view  quality view distance
   * @param {boolean} [all]  build everything wanted now (loading screen / tools)
   */
  update(focus, view, all = false) {
    const reach = view + this.cfg.viewMargin;
    this.queue.length = 0;
    let visible = 0;
    for (const t of this.tiles) {
      t.dist = this.distanceTo(t, focus.x, focus.z);
      const want = t.dist > reach ? 0 : t.dist < this.cfg.farDistance ? 1 : 2;
      if (t.mesh) t.mesh.visible = want > 0;
      if (want && t.mesh) visible++;
      if (want && want !== t.lod) this.queue.push(t);
      else if (!want && t.mesh && t.dist > reach + this.cfg.tile * 2) this.drop(t);
    }
    this.queue.sort((a, b) => a.dist - b.dist);
    const t0 = performance.now();
    for (const t of this.queue) {
      if (!all && performance.now() - t0 > this.budgetMs) break;
      this.build(t, t.dist < this.cfg.farDistance ? 1 : 2);
    }
    this.stats.visible = visible;
  }

  dispose() {
    for (const t of this.tiles) this.drop(t);
    this.material.dispose();
  }
}
