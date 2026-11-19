// Combat effects shared by every feature that fights (weapons, police, pedestrians):
// blood spray + blood pools on the ground, bullet tracers, muzzle flashes, sparks and fire.
// One per game: get it with  const fx = await acquireCombatFx(game)  (it lives on
// game.combatFx and the Game updates it every frame).
//
//   fx.blood(x, y, z, dirX, dirZ)     a spray of drops (only when Blood is On)
//   fx.pool(x, z, size?)              a pool that spreads on the ground (only when Blood is On)
//   fx.tracer(ax, ay, az, bx, by, bz) a short bright line where a bullet flew
//   fx.flash(x, y, z)                 muzzle flash        fx.spark(x, y, z)   bullet hit a wall/car
//   fx.fire(x, y, z, size)            one flame puff (molotov fires)
//
// Blood follows save.data.settings.blood (Settings → Blood On/Off, event settings:blood { on }).
// Numbers: data/combat.json → blood, tracers. Draw calls: 4 (pools, tracers, 2 particle layers).

import * as THREE from 'three';
import { Particles } from './particles.js';
import { markGlow } from '../../world/graphics/glow.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _up = new THREE.Vector3(0, 0, 1);
const _hide = new THREE.Matrix4().makeScale(0, 0, 0);

/** An irregular round blob, drawn once on a small canvas. */
function makePoolTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.beginPath();
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const r = 22 + Math.sin(a * 3) * 4 + Math.sin(a * 7 + 1) * 3;
    g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
  }
  g.fill();
  for (let i = 0; i < 6; i++) {
    const a = i * 1.1;
    g.beginPath();
    g.arc(32 + Math.cos(a) * 26, 32 + Math.sin(a) * 26, 3 + (i % 3), 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class CombatFx {
  constructor(game, glowTexture) {
    this.game = game;
    this.cfg = game.config.get('combat');
    const B = this.cfg.blood, T = this.cfg.tracers;
    this.particles = new Particles(game.scene, glowTexture, 160);
    this.bloodOn = game.save.data.settings?.blood !== false;
    this.off = game.events.on('settings:blood', ({ on }) => {
      this.bloodOn = on !== false;
      if (!this.bloodOn) this.clearPools();
    });

    // Blood pools: flat blobs just above the ground.
    this.pools = [];
    this.poolNext = 0;
    const poolMat = new THREE.MeshBasicMaterial({
      map: makePoolTexture(), color: B.color, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    });
    this.poolMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), poolMat, B.decals);
    this.poolMesh.name = 'blood-pools';
    this.poolMesh.frustumCulled = false;
    this.poolMesh.userData.noCastShadow = true;
    this.poolMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < B.decals; i++) {
      this.poolMesh.setMatrixAt(i, _hide);
      this.pools.push({ t: 0, life: 0, x: 0, y: 0, z: 0, size: 0, rot: 0 });
    }
    game.scene.add(this.poolMesh);

    // Tracers: one stretched box per bullet, glowing.
    this.tracers = [];
    const trMat = markGlow(new THREE.MeshBasicMaterial({ color: T.color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }), 'glow');
    this.tracerMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(T.width, T.width, 1).translate(0, 0, 0.5), trMat, T.max);
    this.tracerMesh.name = 'bullet-tracers';
    this.tracerMesh.frustumCulled = false;
    this.tracerMesh.userData.noCastShadow = true;
    this.tracerMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.tracerMesh.count = 0;
    game.scene.add(this.tracerMesh);
  }

  blood(x, y, z, dirX = 0, dirZ = 0) {
    if (!this.bloodOn) return;
    const B = this.cfg.blood;
    for (let i = 0; i < B.spray; i++) {
      const r = () => Math.random() * 2 - 1;
      this.particles.emit('smoke', {
        x, y, z, vx: dirX * 2.2 + r() * 1.3, vy: 0.8 + Math.random() * 1.8, vz: dirZ * 2.2 + r() * 1.3,
        life: 0.35 + Math.random() * 0.25, size: [0.16, 0.06], color: B.sprayColor, lift: -9,
      });
    }
  }

  pool(x, z, size = null) {
    if (!this.bloodOn) return;
    const B = this.cfg.blood;
    const p = this.pools[this.poolNext];
    this.poolNext = (this.poolNext + 1) % this.pools.length;
    p.x = x; p.z = z;
    p.y = this.game.world.heightAt(x, z) + 0.025;
    p.size = size ?? B.poolSize[0] + Math.random() * (B.poolSize[1] - B.poolSize[0]);
    p.rot = Math.random() * Math.PI * 2;
    p.t = 0;
    p.life = B.poolSeconds;
  }

  clearPools() {
    for (const p of this.pools) p.life = 0;
  }

  tracer(ax, ay, az, bx, by, bz) {
    const T = this.cfg.tracers;
    if (this.tracers.length >= T.max) this.tracers.shift();
    this.tracers.push({ ax, ay, az, bx, by, bz, t: 0, life: T.seconds });
  }

  flash(x, y, z) {
    const T = this.cfg.tracers;
    this.particles.emit('fire', { x, y, z, life: T.flashSeconds * 2, size: [0.45, 0.15], color: T.flashColor });
  }

  spark(x, y, z) {
    const T = this.cfg.tracers;
    for (let i = 0; i < 3; i++) {
      this.particles.emit('fire', { x, y, z, vx: (Math.random() - 0.5) * 3, vy: Math.random() * 2.5, vz: (Math.random() - 0.5) * 3, life: 0.18, size: [0.14, 0.04], color: T.sparkColor, lift: -8 });
    }
  }

  fire(x, y, z, size = 1) {
    const colors = this.game.config.get('vehicles').effects.fireColors;
    this.particles.emit('fire', {
      x: x + (Math.random() - 0.5) * size, y, z: z + (Math.random() - 0.5) * size, vy: 1.6 + Math.random(),
      life: 0.5 + Math.random() * 0.3, size: [0.9 * size, 0.3 * size], color: colors[Math.floor(Math.random() * colors.length)],
    });
  }

  update(dt, camera) {
    this.particles.update(dt, camera);
    // Pools spread out over growSeconds, then shrink away at the very end of their life.
    const B = this.cfg.blood;
    let dirty = false;
    for (let i = 0; i < this.pools.length; i++) {
      const p = this.pools[i];
      if (p.life <= 0) {
        if (p.shown) { this.poolMesh.setMatrixAt(i, _hide); p.shown = false; dirty = true; }
        continue;
      }
      p.t += dt;
      if (p.t >= p.life) p.life = 0;
      const grow = Math.min(1, p.t / B.growSeconds);
      const fade = p.life - p.t < 3 ? Math.max(0, (p.life - p.t) / 3) : 1;
      const s = p.size * (0.25 + 0.75 * Math.sqrt(grow)) * fade;
      _q.setFromAxisAngle(_p.set(0, 1, 0), p.rot);
      _m.compose(_p.set(p.x, p.y, p.z), _q, _s.set(s, 1, s));
      this.poolMesh.setMatrixAt(i, _m);
      p.shown = true;
      dirty = true;
    }
    if (dirty) this.poolMesh.instanceMatrix.needsUpdate = true;

    // Tracers: from a to b, gone after a few hundredths of a second.
    let n = 0;
    for (const tr of this.tracers) {
      tr.t += dt;
      if (tr.t > tr.life) continue;
      _a.set(tr.ax, tr.ay, tr.az);
      _b.set(tr.bx, tr.by, tr.bz).sub(_a);
      const len = _b.length();
      if (len < 0.01) continue;
      _q.setFromUnitVectors(_up, _b.divideScalar(len));
      _m.compose(_a, _q, _s.set(1, 1, len));
      this.tracerMesh.setMatrixAt(n++, _m);
      this.tracers[n - 1] = tr;
    }
    this.tracers.length = n;
    this.tracerMesh.count = n;
    this.tracerMesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.off?.();
    this.particles.dispose();
    for (const m of [this.poolMesh, this.tracerMesh]) {
      m.geometry.dispose();
      m.material.map?.dispose();
      m.material.dispose();
      m.removeFromParent();
    }
  }
}

export async function acquireCombatFx(game) {
  if (!game.combatFx) {
    const glow = await game.assets.load('texture.glow');
    if (!game.combatFx) game.combatFx = new CombatFx(game, glow);
  }
  return game.combatFx;
}
