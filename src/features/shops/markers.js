// Shop / home markers: a glowing turning ring on the sidewalk with a light beam and a floating
// name sign (icon + name, drawn on a canvas after the fonts are ready — CLAUDE.md rule 7).
// Look: data/shops.json → marker (sizes) and kinds (colour, icon).

import * as THREE from 'three';
import { markGlow } from '../../world/graphics/glow.js';
import { fontStack, fontsReady } from '../../ui/fonts.js';
import { pickName, getLanguage } from '../../ui/i18n.js';
import { KIND } from '../../world/layout.js';

const CORNERS = { NE: [1, -1], NW: [-1, -1], SE: [1, 1], SW: [-1, 1] };

/** A free sidewalk point at a junction corner (tries the preferred corner first). */
export function cornerPoint(world, col, row, corner, radius) {
  const L = world.layout;
  const c = L.crossingCentre(col, row);
  const off = L.W / 2 + 2.2;
  const order = [corner, ...Object.keys(CORNERS).filter((k) => k !== corner)];
  for (const k of order) {
    const [sx, sz] = CORNERS[k] || CORNERS.NE;
    const x = c.x + sx * off;
    const z = c.z + sz * off;
    const piece = L.pieceAt(x, z);
    if (piece && piece.kind !== KIND.WATER && !world.collision.isBlocked(x, z, radius)) return { x, z, corner: k };
  }
  return null;
}

function makeLabel(text, icon, color, cfg) {
  const px = cfg.labelPixels;
  const canvas = document.createElement('canvas');
  canvas.width = px * 2;
  canvas.height = px / 2;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const draw = () => {
    const c = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    c.clearRect(0, 0, w, h);
    c.fillStyle = 'rgba(20, 12, 40, 0.82)';
    c.strokeStyle = color;
    c.lineWidth = h * 0.07;
    const r = h * 0.3;
    c.beginPath();
    c.roundRect(c.lineWidth, c.lineWidth, w - c.lineWidth * 2, h - c.lineWidth * 2, r);
    c.fill();
    c.stroke();
    let size = h * 0.42;
    c.font = `700 ${size}px ${fontStack(getLanguage())}`;
    const full = `${icon} ${text}`;
    while (c.measureText(full).width > w * 0.88 && size > 10) {
      size -= 2;
      c.font = `700 ${size}px ${fontStack(getLanguage())}`;
    }
    c.fillStyle = '#fff';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(full, w / 2, h * 0.54);
    tex.needsUpdate = true;
  };
  fontsReady().then(draw);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: true }));
  sprite.scale.set(cfg.labelWidth, cfg.labelWidth / 4, 1);
  sprite.userData.noCastShadow = true;
  return { sprite, redraw: draw };
}

/**
 * @param {object} game
 * @param {{x:number,z:number,name:object,kind:string}} spot
 * @param {object} cfg   data/shops.json → marker
 * @param {object} look  data/shops.json → kinds[kind]
 */
export function makeMarker(game, spot, cfg, look) {
  const group = new THREE.Group();
  group.name = `shop-${spot.id}`;
  const color = new THREE.Color(look.color);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(cfg.radius, 0.07, 4, 20), markGlow(new THREE.MeshBasicMaterial({ color }), 'marker'));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.12;
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(cfg.radius, cfg.radius, cfg.height, 14, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  beam.position.y = cfg.height / 2;
  for (const m of [ring, beam]) m.userData.noCastShadow = true;
  const label = makeLabel(pickName(spot.name), look.icon, look.color, cfg);
  label.sprite.position.y = cfg.labelHeight;
  group.add(ring, beam, label.sprite);
  group.position.set(spot.x, game.world.heightAt(spot.x, spot.z) + 0.04, spot.z);
  game.scene.add(group);
  return {
    group, ring, redraw: label.redraw,
    dispose() {
      group.removeFromParent();
      group.traverse((o) => { o.geometry?.dispose(); o.material?.map?.dispose(); o.material?.dispose(); });
    },
  };
}
