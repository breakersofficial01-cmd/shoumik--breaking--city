// Feature: entrances. A glowing, turning ring in front of Breaking School and Breaking
// Biology Institution (positions: world.landmarks.markers, set by the landmark builder).
// Stand in it and press ঢোকো / E:
//   - sends  entrance:enter { id, place }  — Class Mode (Session 5, feature "classes") opens on it
//   - until that feature exists a short "classes open soon" note is shown.
// Look: data/landmarks.json → marker.

import * as THREE from 'three';
import { markGlow } from '../../world/graphics/glow.js';
import { pickName, t } from '../../ui/i18n.js';

let game = null;
let cfg = null;
let markers = [];
let inside = null;
let note = null;
let noteTimer = null;
let time = 0;
let offs = [];

function makeMarker(m) {
  const group = new THREE.Group();
  group.name = `entrance-${m.id}`;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(cfg.radius, 0.09, 4, 20), markGlow(new THREE.MeshBasicMaterial({ color: cfg.color }), 'marker'));
  ring.rotation.x = Math.PI / 2;
  const inner = new THREE.Mesh(new THREE.TorusGeometry(cfg.radius * 0.62, 0.06, 4, 16), markGlow(new THREE.MeshBasicMaterial({ color: cfg.color2 }), 'marker'));
  inner.rotation.x = Math.PI / 2;
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(cfg.radius, cfg.radius, cfg.height, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: cfg.color, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  beam.position.y = cfg.height / 2;
  group.add(ring, inner, beam);
  group.position.set(m.x, m.y + 0.05, m.z);
  game.scene.add(group);
  return { ...m, group, ring, inner };
}

function showNote(text) {
  note.textContent = text;
  note.hidden = false;
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => { note.hidden = true; }, 4000);
}

export default {
  id: 'entrances',

  init(g) {
    game = g;
    cfg = g.config.get('landmarks').marker;
    markers = (g.world.landmarks?.markers || []).map(makeMarker);
    note = document.createElement('div');
    note.className = 'entrance-note';
    note.hidden = true;
    g.ui.appendChild(note);
    offs = [
      g.events.on('input:action', () => {
        if (!inside || game.player?.mode !== 'onFoot') return;
        g.events.emit('entrance:enter', { id: inside.id, place: inside.place });
        if (!game.features?.get('classes')) showNote(t('entrance.soon'));
      }),
    ];
  },

  update(dt) {
    const p = game.player?.position;
    if (!p) return;
    time += dt;
    let here = null;
    for (const m of markers) {
      const d = Math.hypot(m.x - p.x, m.z - p.z);
      m.group.visible = d < cfg.visibleDistance;
      if (!m.group.visible) continue;
      m.ring.rotation.z = time * cfg.spin * Math.PI * 2;
      m.inner.rotation.z = -time * cfg.spin * Math.PI * 3;
      const bob = Math.sin(time * 2.2) * cfg.bob;
      m.ring.position.y = 0.15 + bob + cfg.bob;
      m.inner.position.y = 0.55 + bob + cfg.bob;
      if (d < cfg.enterRadius && game.player.mode === 'onFoot') here = m;
    }
    if (here !== inside) {
      inside = here;
      if (inside) game.events.emit('prompt:show', { id: 'entrance', key: 'entrance.prompt', vars: { place: pickName(inside.place.name) } });
      else game.events.emit('prompt:hide', { id: 'entrance' });
    }
  },

  dispose() {
    offs.forEach((off) => off());
    offs = [];
    for (const m of markers) m.group.removeFromParent();
    markers = [];
    note?.remove();
    clearTimeout(noteTimer);
    game.events.emit('prompt:hide', { id: 'entrance' });
  },
};
