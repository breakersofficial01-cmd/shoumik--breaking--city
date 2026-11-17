// Moving poster slots: the back of buses (a 2:1 panel above the rear window) and the painted
// back panel of some rickshaws. Vehicles come and go all the time (traffic is recycled), so
// every half second new ones are looked at once and given a poster (or not).
// Numbers: data/posterSlots.json → vehicles.

import * as THREE from 'three';
import { hashInts } from '../../core/rng.js';

const RICKSHAW_PANEL_ASPECT = 0.66 / 0.86; // height / width of the art panel (entities/vehicles/models.js)

export class VehiclePosters {
  constructor(game, cfg, pick) {
    this.game = game;
    this.cfg = cfg;
    this.pick = pick;          // (shape, district, seed) -> poster or null
    this.slots = new Set();    // live vehicle slots
    this.timer = 0;
    this.panelGeo = new THREE.PlaneGeometry(1, 1).rotateY(Math.PI); // faces backwards
  }

  /** Look at vehicles we have not seen yet. */
  scan(dt) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = this.cfg.checkEverySeconds;
    for (const s of this.slots) if (s.vehicle.removed) this.slots.delete(s);
    const fleet = this.game.fleet;
    if (!fleet) return;
    for (const v of fleet.vehicles) {
      if (v.tags.posterChecked) continue;
      v.tags.posterChecked = true;
      const roll = (hashInts(v.id, 0x9057) % 1000) / 1000;
      const district = this.game.world.districtAt(v.x, v.z)?.id || '';
      if (v.T.artPanel && roll < this.cfg.rickshawShare) {
        const mesh = v.mesh.getObjectByName('art-panel');
        if (mesh) this.add(v, mesh, 'rickshaw', district, RICKSHAW_PANEL_ASPECT);
      } else if (v.T.backPanel && roll < this.cfg.busShare) {
        const p = this.cfg.busPanel;
        const mesh = new THREE.Mesh(this.panelGeo);
        mesh.name = 'poster-panel';
        mesh.scale.set(p.width, p.height, 1);
        mesh.position.set(0, p.y, -v.T.size[0] / 2 - p.back);
        v.mesh.add(mesh);
        this.add(v, mesh, 'bus', district, p.height / p.width);
      }
    }
  }

  add(v, mesh, kind, district, aspect) {
    const poster = this.pick('wide', district, hashInts(v.id, 77));
    if (!poster && kind === 'rickshaw') return; // keep the painted art instead of an empty advert
    this.slots.add({
      id: `${kind}-${v.id}`, kind, shape: 'wide', vehicle: v, mesh, poster, tap: this.cfg.tap,
      keep: Math.min(1, 0.5 / aspect), // share of the 2:1 picture's width that fits the panel
      original: mesh.material,
    });
  }

  /** World position + facing of a vehicle slot (for tap-to-open). */
  where(s, out) {
    s.mesh.getWorldPosition(out);
    out.heading = s.vehicle.heading + Math.PI; // panels face backwards
    return out;
  }

  dispose() {
    for (const s of this.slots) {
      if (s.kind === 'bus') s.mesh.removeFromParent();
      else s.mesh.material = s.original;
    }
    this.slots.clear();
    this.panelGeo.dispose();
  }
}
