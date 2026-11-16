// Water: Dhanmondi Lake, Hatirjheel and the Buriganga river. One merged mesh for all of it,
// with a tiny ripple texture that scrolls slowly. Also the big dusty base plane under and
// around the city (outskirts, lake bed).

import * as THREE from 'three';
import { hexToLinear } from './geoBuilder.js';
import { KIND } from './layout.js';

export class Water {
  /** @param {import('./layout.js').CityLayout} layout */
  constructor(layout, waterTexture, parent) {
    const world = layout.world;
    const w = world.water;
    this.cfg = w;
    this.texture = waterTexture;
    const lake = hexToLinear(w.lakeColor);
    const river = hexToLinear(w.riverColor);
    const pos = [], colr = [], uv = [], idx = [];
    let n = 0;
    const quad = (x0, z0, x1, z1, c) => {
      for (const [x, z] of [[x0, z0], [x0, z1], [x1, z1], [x1, z0]]) {
        pos.push(x, w.level, z);
        colr.push(c[0], c[1], c[2]);
        uv.push(x / w.textureMetres, z / w.textureMetres); // world-space UVs: pieces join seamlessly
      }
      idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
      n += 4;
    };
    for (const p of layout.pieces) {
      if (p.kind === KIND.WATER) quad(p.x, p.z, p.x + p.w, p.z + p.d, lake);
    }
    if (layout.river?.side === 'south') {
      quad(layout.minX - 1500, layout.maxZ, layout.maxX + 1500, layout.maxZ + w.riverWidth, river);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    this.mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: waterTexture, vertexColors: true }));
    this.mesh.name = 'water';
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    parent.add(this.mesh);

    // Base plane: far bank, outskirts beyond the city wall, and the lake bed.
    const g = world.ground;
    const base = new THREE.Mesh(
      new THREE.PlaneGeometry(g.baseSize, g.baseSize).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: g.baseColor }),
    );
    base.position.y = g.baseY;
    base.name = 'base-ground';
    base.updateMatrix();
    base.matrixAutoUpdate = false;
    parent.add(base);
    this.base = base;
  }

  update(dt) {
    this.texture.offset.x = (this.texture.offset.x + this.cfg.scrollSpeed[0] * dt) % 1;
    this.texture.offset.y = (this.texture.offset.y + this.cfg.scrollSpeed[1] * dt) % 1;
  }
}

