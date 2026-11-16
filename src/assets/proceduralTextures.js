// Placeholder textures painted in code (small + low-res on purpose: PS2 look).
// Registered in the asset registry, so real art can replace them via data/assets.json.
//
// ATLAS LAYOUT: both atlases are one row of 64x64 tiles. A tile repeats VERTICALLY
// (texture V wraps), so one tall quad can show many floors / many metres of road.
// Horizontally a quad always shows exactly one tile (see tileU()).
//
// Facade tiles are near-white so the building's vertex colour tints them.
// Ground tiles carry their own colour (vertex colour stays near white).

import * as THREE from 'three';
import { Rng } from '../core/rng.js';

export const TILE = 64;
export const ATLAS_COLS = 8;

/** Column index of each facade tile. */
export const FACADE = { PLAIN: 0, RESIDENTIAL: 1, OFFICE: 2, GLASS: 3, SHUTTER: 4, OLD: 5, DOOR: 6, RAIL: 7 };
/** Column index of each ground tile. */
export const GROUND = { ASPHALT: 0, ROAD: 1, ZEBRA: 2, LANE: 3, LOT: 4, SIDEWALK: 5, PLAZA: 6, GRASS: 7 };

/** U range [u0, u1] of an atlas column, inset one texel so neighbours don't bleed in. */
export function tileU(col) {
  const inset = 1 / (TILE * ATLAS_COLS);
  return [col / ATLAS_COLS + inset, (col + 1) / ATLAS_COLS - inset];
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Sprinkle darker/lighter pixels for a gritty, hand-made feel. */
function speckle(ctx, rng, x0, count, dark = 0.1, light = 0.06) {
  for (let i = 0; i < count; i++) {
    const x = x0 + rng.int(0, TILE - 1);
    const y = rng.int(0, TILE - 1);
    ctx.fillStyle = rng.chance(0.6) ? `rgba(0,0,0,${rng.range(0.02, dark)})` : `rgba(255,255,255,${rng.range(0.02, light)})`;
    ctx.fillRect(x, y, rng.int(1, 2), rng.int(1, 2));
  }
}

function finish(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;            // chunky pixels up close
  tex.minFilter = THREE.LinearMipmapLinearFilter; // no shimmer far away
  tex.generateMipmaps = true;
  return tex;
}

// ---------------------------------------------------------------- facade atlas

function wall(ctx, rng, x0) {
  ctx.fillStyle = '#f3f0ea';
  ctx.fillRect(x0, 0, TILE, TILE);
  speckle(ctx, rng, x0, 110);
  ctx.fillStyle = 'rgba(0,0,0,0.13)'; // floor slab line
  ctx.fillRect(x0, 0, TILE, 2);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(x0, 2, TILE, 1);
}

function glass(ctx, x, y, w, h, top = '#2c3e55', bottom = '#6f7f8f') {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
}

const facadePainters = {
  [FACADE.PLAIN](ctx, rng, x0) {
    wall(ctx, rng, x0);
    for (let i = 0; i < 3; i++) { // rain stains
      ctx.fillStyle = `rgba(60,50,40,${rng.range(0.03, 0.07)})`;
      ctx.fillRect(x0 + rng.int(4, 56), 3, rng.int(2, 5), rng.int(20, 58));
    }
  },
  [FACADE.RESIDENTIAL](ctx, rng, x0) {
    wall(ctx, rng, x0);
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; // sunshade slab above the window
    ctx.fillRect(x0 + 10, 11, 44, 4);
    ctx.fillStyle = '#4a4038';          // frame
    ctx.fillRect(x0 + 13, 15, 38, 32);
    glass(ctx, x0 + 15, 17, 34, 28);
    ctx.fillStyle = 'rgba(255,190,120,0.35)'; // sunset glint
    ctx.fillRect(x0 + 15, 17, 16, 9);
    ctx.fillStyle = 'rgba(225,225,215,0.75)'; // grill
    for (let gx = 21; gx < 49; gx += 7) ctx.fillRect(x0 + gx, 17, 1, 28);
    for (let gy = 24; gy < 45; gy += 7) ctx.fillRect(x0 + 15, gy, 34, 1);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';  // sill
    ctx.fillRect(x0 + 11, 47, 42, 2);
    ctx.fillStyle = 'rgba(60,50,40,0.1)';     // drip stain under the sill
    ctx.fillRect(x0 + 18, 49, 3, 13);
    ctx.fillRect(x0 + 40, 49, 2, 9);
  },
  [FACADE.OFFICE](ctx, rng, x0) {
    wall(ctx, rng, x0);
    ctx.fillStyle = '#3a3f45';
    ctx.fillRect(x0 + 2, 14, 60, 30);
    glass(ctx, x0 + 3, 15, 58, 28, '#22364c', '#5d7890');
    ctx.fillStyle = 'rgba(255,170,110,0.3)';
    ctx.fillRect(x0 + 3, 15, 28, 8);
    ctx.fillStyle = '#c9c9c4';
    for (let gx = 17; gx < 60; gx += 15) ctx.fillRect(x0 + gx, 15, 2, 28);
    ctx.fillStyle = 'rgba(0,0,0,0.1)';       // spandrel panel lines
    ctx.fillRect(x0 + 2, 50, 60, 1);
  },
  [FACADE.GLASS](ctx, rng, x0) {
    glass(ctx, x0, 0, TILE, TILE, '#5f8fa8', '#bfd5dc');
    ctx.fillStyle = 'rgba(255,200,140,0.35)';
    ctx.fillRect(x0 + 4, 6, 24, 22);
    ctx.fillStyle = 'rgba(20,40,60,0.25)';
    ctx.fillRect(x0 + 36, 34, 24, 26);
    ctx.fillStyle = '#e9e9e4';               // mullions
    ctx.fillRect(x0, 0, TILE, 3);
    ctx.fillRect(x0, 0, 2, TILE);
    ctx.fillRect(x0 + TILE - 2, 0, 2, TILE);
    ctx.fillRect(x0 + 31, 0, 2, TILE);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(x0, 3, TILE, 1);
  },
  [FACADE.SHUTTER](ctx, rng, x0) {
    ctx.fillStyle = '#e4e4e0';
    ctx.fillRect(x0, 0, TILE, TILE);
    for (let y = 8; y < TILE; y += 4) {      // corrugation
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(x0 + 3, y, TILE - 6, 1);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(x0 + 3, y + 1, TILE - 6, 1);
    }
    speckle(ctx, rng, x0, 70, 0.14);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';        // frame + roller box + lock
    ctx.fillRect(x0, 0, 3, TILE);
    ctx.fillRect(x0 + TILE - 3, 0, 3, TILE);
    ctx.fillRect(x0, 0, TILE, 7);
    ctx.fillRect(x0 + 29, 56, 6, 5);
    ctx.fillStyle = 'rgba(60,40,20,0.2)';     // dirt at the bottom
    ctx.fillRect(x0 + 3, 58, TILE - 6, 6);
  },
  [FACADE.OLD](ctx, rng, x0) {
    wall(ctx, rng, x0);
    for (const wx of [9, 37]) {              // two tall shuttered windows with arched tops
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(x0 + wx - 2, 10, 22, 3);
      ctx.fillStyle = '#4f4336';
      ctx.fillRect(x0 + wx, 14, 18, 36);
      ctx.fillRect(x0 + wx + 2, 12, 14, 2);
      ctx.fillStyle = '#6f8f7a';             // green louvred shutters
      ctx.fillRect(x0 + wx + 1, 15, 7, 34);
      ctx.fillRect(x0 + wx + 10, 15, 7, 34);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      for (let y = 17; y < 49; y += 3) ctx.fillRect(x0 + wx + 1, y, 16, 1);
    }
    ctx.fillStyle = 'rgba(70,50,30,0.12)';   // old damp patch
    ctx.fillRect(x0 + 26, 40, 12, 22);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';      // cornice
    ctx.fillRect(x0, 54, TILE, 2);
  },
  [FACADE.DOOR](ctx, rng, x0) {
    wall(ctx, rng, x0);
    ctx.fillStyle = '#3b2f26';
    ctx.fillRect(x0 + 20, 16, 24, 48);
    ctx.fillStyle = '#5a4636';
    ctx.fillRect(x0 + 22, 18, 9, 46);
    ctx.fillRect(x0 + 33, 18, 9, 46);
    ctx.fillStyle = '#d8c070';
    ctx.fillRect(x0 + 31, 40, 2, 3);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(x0 + 16, 12, 32, 4);
  },
  [FACADE.RAIL](ctx, rng, x0) {
    ctx.fillStyle = '#f0ede6';
    ctx.fillRect(x0, 0, TILE, TILE);
    speckle(ctx, rng, x0, 60);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';      // dark gaps between the bars
    for (let x = 4; x < TILE - 4; x += 6) ctx.fillRect(x0 + x, 8, 3, 40);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(x0, 0, TILE, 4);
    ctx.fillRect(x0, 52, TILE, 2);
  },
};

export function makeFacadeAtlas() {
  const canvas = makeCanvas(TILE * ATLAS_COLS, TILE);
  const ctx = canvas.getContext('2d');
  const rng = new Rng(4201);
  for (let col = 0; col < ATLAS_COLS; col++) facadePainters[col](ctx, rng, col * TILE);
  return finish(canvas);
}

// ---------------------------------------------------------------- ground atlas

function asphalt(ctx, rng, x0, base = '#3d3c40') {
  ctx.fillStyle = base;
  ctx.fillRect(x0, 0, TILE, TILE);
  speckle(ctx, rng, x0, 260, 0.15, 0.07);
}

const groundPainters = {
  [GROUND.ASPHALT](ctx, rng, x0) {
    asphalt(ctx, rng, x0);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';      // tar patch
    ctx.fillRect(x0 + 12, 20, 18, 11);
  },
  [GROUND.ROAD](ctx, rng, x0) {
    asphalt(ctx, rng, x0);
    ctx.fillStyle = 'rgba(232,228,214,0.85)'; // solid edge lines
    ctx.fillRect(x0 + 2, 0, 1, TILE);
    ctx.fillRect(x0 + TILE - 3, 0, 1, TILE);
    ctx.fillStyle = 'rgba(232,196,70,0.9)';   // double yellow centre
    ctx.fillRect(x0 + 30, 0, 1, TILE);
    ctx.fillRect(x0 + 33, 0, 1, TILE);
    ctx.fillStyle = 'rgba(232,228,214,0.8)';  // dashed lane dividers
    ctx.fillRect(x0 + 16, 6, 1, 26);
    ctx.fillRect(x0 + 47, 6, 1, 26);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';       // tyre wear in the lanes
    for (const lx of [8, 22, 39, 53]) ctx.fillRect(x0 + lx, 0, 4, TILE);
  },
  [GROUND.ZEBRA](ctx, rng, x0) {
    asphalt(ctx, rng, x0);
    ctx.fillStyle = 'rgba(236,232,220,0.88)';
    for (let x = 4; x < TILE - 4; x += 8) ctx.fillRect(x0 + x, 6, 4, TILE - 18);
    ctx.fillRect(x0 + 2, TILE - 6, TILE - 4, 2); // stop line
    speckle(ctx, rng, x0, 120, 0.25, 0.02);
  },
  [GROUND.LANE](ctx, rng, x0) {
    asphalt(ctx, rng, x0, '#55514c');
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.fillRect(x0 + 6, 10, 20, 14);
    ctx.fillRect(x0 + 34, 38, 22, 12);
    ctx.fillStyle = 'rgba(120,110,95,0.5)';   // open drain cover strip along one side
    ctx.fillRect(x0 + 2, 0, 5, TILE);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    for (let y = 0; y < TILE; y += 8) ctx.fillRect(x0 + 2, y, 5, 1);
  },
  [GROUND.LOT](ctx, rng, x0) {
    ctx.fillStyle = '#857660';
    ctx.fillRect(x0, 0, TILE, TILE);
    speckle(ctx, rng, x0, 240, 0.14, 0.1);
  },
  [GROUND.SIDEWALK](ctx, rng, x0) {
    ctx.fillStyle = '#b3a596';
    ctx.fillRect(x0, 0, TILE, TILE);
    for (let ty = 0; ty < 4; ty++) {          // red / grey paving blocks
      for (let tx = 0; tx < 4; tx++) {
        if ((tx + ty) % 2 === 0) {
          ctx.fillStyle = 'rgba(168,84,62,0.55)';
          ctx.fillRect(x0 + tx * 16, ty * 16, 16, 16);
        }
      }
    }
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    for (let i = 0; i < TILE; i += 16) {
      ctx.fillRect(x0 + i, 0, 1, TILE);
      ctx.fillRect(x0, i, TILE, 1);
    }
    speckle(ctx, rng, x0, 160, 0.16, 0.08);
  },
  [GROUND.PLAZA](ctx, rng, x0) {
    ctx.fillStyle = '#c4b8a4';
    ctx.fillRect(x0, 0, TILE, TILE);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (let i = 0; i < TILE; i += 32) {
      ctx.fillRect(x0 + i, 0, 1, TILE);
      ctx.fillRect(x0, i, TILE, 1);
    }
    speckle(ctx, rng, x0, 140, 0.1, 0.08);
  },
  [GROUND.GRASS](ctx, rng, x0) {
    ctx.fillStyle = '#5c8438';
    ctx.fillRect(x0, 0, TILE, TILE);
    for (let i = 0; i < 380; i++) {
      ctx.fillStyle = rng.chance(0.5) ? `rgba(30,60,20,${rng.range(0.1, 0.3)})` : `rgba(170,200,90,${rng.range(0.08, 0.22)})`;
      ctx.fillRect(x0 + rng.int(0, TILE - 1), rng.int(0, TILE - 2), 1, 2);
    }
  },
};

export function makeGroundAtlas() {
  const canvas = makeCanvas(TILE * ATLAS_COLS, TILE);
  const ctx = canvas.getContext('2d');
  const rng = new Rng(7733);
  for (let col = 0; col < ATLAS_COLS; col++) groundPainters[col](ctx, rng, col * TILE);
  return finish(canvas);
}

// ---------------------------------------------------------------- water + sun

/** Repeating ripple texture; the water material's colour tints it. */
export function makeWaterTexture() {
  const canvas = makeCanvas(TILE, TILE);
  const ctx = canvas.getContext('2d');
  const rng = new Rng(9117);
  ctx.fillStyle = '#d6d6d6';
  ctx.fillRect(0, 0, TILE, TILE);
  for (let i = 0; i < 46; i++) {
    const y = rng.int(0, TILE - 1);
    const x = rng.int(0, TILE - 1);
    const w = rng.int(5, 16);
    ctx.fillStyle = rng.chance(0.55) ? `rgba(255,236,200,${rng.range(0.25, 0.7)})` : `rgba(0,20,30,${rng.range(0.1, 0.3)})`;
    ctx.fillRect(x, y, w, 1);
    if (x + w > TILE) ctx.fillRect(0, y, x + w - TILE, 1); // wrap so it tiles
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

/** Soft round glow used for the sun. */
export function makeGlowTexture() {
  const size = 128;
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.22, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Register all procedural textures as asset placeholders. */
export function registerProceduralTextures(assets) {
  assets.registerDefault('texture.facades', makeFacadeAtlas);
  assets.registerDefault('texture.ground', makeGroundAtlas);
  assets.registerDefault('texture.water', makeWaterTexture);
  assets.registerDefault('texture.glow', makeGlowTexture);
}
