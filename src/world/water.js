// Water: Dhanmondi Lake, Hatirjheel, Gulshan Lake, park ponds and the Buriganga river. One
// merged mesh for all of it, with a tiny ripple texture that scrolls slowly. Also the big dusty
// base plane under and around the city (lake bed, beyond the land).
// Roadmap 2 S3: with the countryside (terrain/) it also draws the sea, the countryside ponds
// and the river only as far as the sea (`extra` = terrain.waterShapes()).

import * as THREE from 'three';
import { hexToLinear } from './geoBuilder.js';
import { KIND } from './layout.js';

export class Water {
  /** @param {import('./layout.js').CityLayout} layout */
  /** @param {object} gfx  data/graphics.json */
  /** @param {{ riverX:[number,number], quads:Array, discs:Array }} [extra]  countryside water */
  constructor(layout, waterTexture, parent, gfx, extra = null) {
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
    const disc = (cx, cz, r, c) => {
      const seg = 28;
      const centre = n;
      pos.push(cx, w.level, cz); colr.push(c[0], c[1], c[2]); uv.push(cx / w.textureMetres, cz / w.textureMetres);
      n++;
      for (let k = 0; k < seg; k++) {
        const a = (k / seg) * Math.PI * 2;
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        pos.push(x, w.level, z); colr.push(c[0], c[1], c[2]); uv.push(x / w.textureMetres, z / w.textureMetres);
        idx.push(centre, centre + 1 + ((k + 1) % seg), centre + 1 + k); // counter-clockwise from above
      }
      n += seg;
    };
    for (const p of layout.pieces) {
      if (p.kind === KIND.WATER) quad(p.x, p.z, p.x + p.w, p.z + p.d, lake);
      if (p.pond) quad(p.pond.x0, p.pond.z0, p.pond.x1, p.pond.z1, lake); // park pond (layout.js)
    }
    if (layout.river?.side === 'south') {
      const [rx0, rx1] = extra?.riverX || [layout.minX - 1500, layout.maxX + 1500];
      quad(rx0, layout.maxZ, rx1, layout.maxZ + w.riverWidth, river);
    }
    for (const q of extra?.quads || []) quad(q.x0, q.z0, q.x1, q.z1, q.color);
    for (const d of extra?.discs || []) disc(d.x, d.z, d.r, lake);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    // Reflective water (Session 4.5): picks up the sunset sky through scene.environment,
    // which src/world/graphics/index.js fills with a small sky reflection map.
    const look = gfx.water;
    this.mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      map: waterTexture, vertexColors: true,
      roughness: look.roughness, metalness: look.metalness, envMapIntensity: look.envIntensity,
    }));
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

