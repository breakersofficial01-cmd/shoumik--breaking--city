// Chunk manager: the city is drawn in square chunks. Only chunks near the player exist as
// meshes; far ones are hidden and then thrown away. New chunks are built a little per frame
// so the game never freezes. Each chunk = merged static geometry (2 draw calls) + instanced
// props + wires.

import * as THREE from 'three';
import { hashInts } from '../core/rng.js';
import { GeoBuilder } from './geoBuilder.js';
import { meshBuilding } from './buildingMesher.js';
import { meshGroundPiece } from './groundMesher.js';
import { buildProps, buildWires } from './props.js';

export class ChunkManager {
  /**
   * @param {import('./layout.js').CityLayout} layout
   * @param {object} shared  materials + prop geometries (made in world.js)
   */
  constructor(layout, shared, parent) {
    this.layout = layout;
    this.world = layout.world;
    this.shared = shared;
    this.group = new THREE.Group();
    this.group.name = 'city-chunks';
    parent.add(this.group);
    this.quality = null;
    this.span = this.world.chunk.cells * 2; // pieces per chunk side
    this.nx = Math.ceil(layout.nI / this.span);
    this.nz = Math.ceil(layout.nJ / this.span);
    /** @type {Array<object>} */
    this.chunks = [];
    for (let cj = 0; cj < this.nz; cj++) {
      for (let ci = 0; ci < this.nx; ci++) {
        const i0 = ci * this.span, j0 = cj * this.span;
        const i1 = Math.min(layout.nI, i0 + this.span) - 1;
        const j1 = Math.min(layout.nJ, j0 + this.span) - 1;
        this.chunks.push({
          ci, cj, i0, j0, i1, j1,
          minX: layout.px(i0), minZ: layout.pz(j0),
          maxX: layout.px(i1) + layout.pw(i1), maxZ: layout.pz(j1) + layout.pw(j1),
          node: null, dist: 0,
        });
      }
    }
    this.queue = [];
    this.stats = { built: 0, visible: 0 };
  }

  setQuality(quality) {
    const rebuild = this.quality && (
      this.quality.propDensity !== quality.propDensity || this.quality.balconies !== quality.balconies ||
      this.quality.wires !== quality.wires || this.quality.wireStrandScale !== quality.wireStrandScale);
    this.quality = quality;
    if (rebuild) this.disposeAll();
  }

  /** Distance from a point to a chunk's rectangle (0 when inside). */
  distanceTo(chunk, x, z) {
    const dx = Math.max(chunk.minX - x, 0, x - chunk.maxX);
    const dz = Math.max(chunk.minZ - z, 0, z - chunk.maxZ);
    return Math.hypot(dx, dz);
  }

  buildChunk(chunk) {
    const { layout, world, shared, quality } = this;
    const facades = new GeoBuilder();
    const ground = new GeoBuilder();
    const lists = { poles: [], tanks: [], trees: [] };
    const wires = [];
    for (let j = chunk.j0; j <= chunk.j1; j++) {
      for (let i = chunk.i0; i <= chunk.i1; i++) {
        const p = layout.piece(i, j);
        meshGroundPiece(ground, layout, p);
        const c = p.content;
        if (!c) continue;
        const palette = layout.districts[p.district].palette;
        for (const b of c.buildings) meshBuilding(facades, b, world.buildings, palette, p.y, quality);
        for (const x of c.poles) lists.poles.push(x);
        for (const x of c.tanks) lists.tanks.push(x);
        for (const x of c.trees) lists.trees.push(x);
        for (const x of c.wires) wires.push(x);
      }
    }
    const node = new THREE.Group();
    node.name = `chunk-${chunk.ci}-${chunk.cj}`;
    if (!ground.isEmpty) node.add(new THREE.Mesh(ground.build(), shared.groundMaterial));
    if (!facades.isEmpty) node.add(new THREE.Mesh(facades.build(), shared.facadeMaterial));
    for (const mesh of buildProps(lists, world, shared, quality, layout.kerb)) node.add(mesh);
    const lines = buildWires(wires, world, shared, quality, hashInts(layout.seed, chunk.ci, chunk.cj, 9));
    if (lines) node.add(lines);
    node.traverse((o) => { o.matrixAutoUpdate = false; });
    chunk.node = node;
    this.group.add(node);
    this.stats.built++;
  }

  disposeChunk(chunk) {
    if (!chunk.node) return;
    this.group.remove(chunk.node);
    chunk.node.traverse((o) => {
      // Shared prop geometries and all materials are reused, so only free per-chunk geometry.
      if (o.isInstancedMesh) o.dispose();
      else if (o.geometry) o.geometry.dispose();
    });
    chunk.node = null;
    this.stats.built--;
  }

  disposeAll() {
    for (const c of this.chunks) this.disposeChunk(c);
    this.queue.length = 0;
  }

  /** Decide which chunks are needed around (x, z); show/hide/queue/unload. */
  refresh(x, z) {
    const view = this.quality.viewDistance;
    const unload = view + this.world.chunk.unloadMargin;
    this.queue.length = 0;
    let visible = 0;
    for (const c of this.chunks) {
      c.dist = this.distanceTo(c, x, z);
      if (c.dist <= view) {
        if (c.node) { c.node.visible = true; visible++; }
        else this.queue.push(c);
      } else if (c.node) {
        c.node.visible = false;
        if (c.dist > unload) this.disposeChunk(c);
      }
    }
    this.queue.sort((a, b) => a.dist - b.dist);
    this.stats.visible = visible;
  }

  /** Call every frame: builds queued chunks within the quality's time budget. */
  update(x, z) {
    this.refresh(x, z);
    if (this.queue.length === 0) return;
    const start = performance.now();
    do {
      this.buildChunk(this.queue.shift());
    } while (this.queue.length && performance.now() - start < this.quality.chunkBuildMs);
  }

  /** Build everything in view right now (loading screen). Yields so the bar can move. */
  async buildAround(x, z, onProgress) {
    this.refresh(x, z);
    const total = this.queue.length || 1;
    let done = 0;
    while (this.queue.length) {
      this.buildChunk(this.queue.shift());
      onProgress?.(++done / total);
      await new Promise((r) => setTimeout(r, 0));
    }
    this.refresh(x, z);
  }
}
