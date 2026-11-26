// Full-screen map (Session 9). Opens when the minimap is tapped (or M / map:open). North is up.
//   - drag to move, pinch or mouse wheel to zoom, ◎ = back to the player, + / − buttons
//   - every map:blips point is drawn with its icon; shops, clinics and the institutes get their
//     name written next to them (shops only when zoomed in enough: mapView.labelZoom)
//   - Breaking School and Breaking Biology are big pink 🎓 pins with quick "show the way" buttons
//   - tap a place → its name + distance + "Show the way" (a yellow GPS route on both maps)
//   - while wanted, police officers (blue) and cars / helicopter (red) blink on the map
//   - the legend can hide / show each group
//   - Roadmap 2 S6: a point with `action` { key, when(), run() } gets an extra button (bus stops and
//     stations while riding: "get off here")
// The game is paused while it is open, so it draws itself with requestAnimationFrame.

import { createOverlay, esc } from '../../ui/overlay.js';
import { t, pickName, formatNumber } from '../../ui/i18n.js';
import { fontStack } from '../../ui/fonts.js';
import { getLanguage } from '../../ui/i18n.js';

const GROUPS = ['school', 'hotels', 'weapons', 'food', 'outfits', 'vehicles', 'homes', 'home', 'health', 'healthpack', 'police', 'outskirts', 'transit'];

export class BigMap {
  /**
   * @param {object} game  @param {object} city  painted city (cityMap.js)
   * @param {object} mv  data/mapView.json  @param {Route} route  @param {Map} blips  id → points
   * @param {object} kinds  data/shops.json → kinds (legend icons)
   */
  constructor(game, city, mv, route, blips, kinds) {
    Object.assign(this, { game, city, mv, route, blips, kinds });
    this.zoom = mv.zoom.start;
    this.cx = 0;
    this.cz = 0;
    this.hidden = new Set();
    this.selected = null;
    this.pointers = new Map();
    this.raf = 0;
    this.ov = createOverlay(game, { id: 'big-map', reason: 'map', className: 'big-map', onClose: () => cancelAnimationFrame(this.raf) });
    this.ov.panel.addEventListener('click', (e) => this.onClick(e));
    window.addEventListener('resize', this._resize = () => { if (this.ov.isOpen) this.fit(); });
  }

  get isOpen() { return this.ov.isOpen; }

  open() {
    if (this.ov.isOpen) return;
    const p = this.game.player.position;
    this.cx = p.x;
    this.cz = p.z;
    this.selected = null;
    this.build();
    this.ov.open();
    this.fit();
    const loop = () => { this.draw(); this.raf = requestAnimationFrame(loop); };
    loop();
  }

  close() { this.ov.close(); }

  build() {
    const place = (id) => pickName(this.game.content.get('places').find((p) => p.id === id)?.name) || id;
    this.ov.panel.innerHTML = `
      <div class="bm-top">
        <h2>🗺 ${esc(t('map.title'))}</h2>
        ${this.mv.institutes.map((id) => `<button type="button" class="bm-go" data-go="${esc(id)}">🎓 ${esc(place(id))}</button>`).join('')}
        <span class="bm-gap"></span>
        <button type="button" data-zoom="1" aria-label="zoom in">＋</button>
        <button type="button" data-zoom="-1" aria-label="zoom out">－</button>
        <button type="button" data-me aria-label="me">◎</button>
        ${this.route.target ? `<button type="button" data-clear>✕ ${esc(t('map.clearRoute'))}</button>` : ''}
        <button type="button" class="bm-close" data-close>${esc(t('settings.close'))}</button>
      </div>
      <canvas class="bm-canvas"></canvas>
      <div class="bm-legend">${this.legendHtml()}</div>
      <div class="bm-info" hidden></div>`;
    this.canvas = this.ov.panel.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.bindPointers();
  }

  legendHtml() {
    const counts = new Map();
    for (const pts of this.blips.values()) for (const b of pts) counts.set(b.group, (counts.get(b.group) || 0) + 1);
    return GROUPS.filter((g) => counts.get(g)).map((g) => {
      const icon = g === 'school' ? '🎓' : g === 'hotels' ? '🏨' : g === 'outskirts' ? '🌾' : g === 'healthpack' ? '➕' : g === 'police' ? '🚓' : this.kinds[g]?.icon || '•';
      return `<button type="button" data-group="${g}" class="${this.hidden.has(g) ? 'off' : ''}">${icon} ${esc(t(`map.group.${g}`))} <small>${esc(formatNumber(counts.get(g)))}</small></button>`;
    }).join('');
  }

  fit() {
    const dpr = this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.round(r.width * dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * dpr));
  }

  /** World → canvas pixels. */
  project(x, z) {
    const k = this.zoom * this.dpr;
    return [this.canvas.width / 2 + (x - this.cx) * k, this.canvas.height / 2 + (z - this.cz) * k];
  }

  unproject(px, py) {
    const k = this.zoom * this.dpr;
    return [this.cx + (px - this.canvas.width / 2) / k, this.cz + (py - this.canvas.height / 2) / k];
  }

  setZoom(z, anchorPx = null) {
    const before = anchorPx ? this.unproject(...anchorPx) : null;
    this.zoom = Math.min(this.mv.zoom.max, Math.max(this.mv.zoom.min, z));
    if (before) {
      const after = this.unproject(...anchorPx);
      this.cx += before[0] - after[0];
      this.cz += before[1] - after[1];
    }
  }

  bindPointers() {
    const c = this.canvas;
    const pt = (e) => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) * this.dpr, (e.clientY - r.top) * this.dpr]; };
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { at: pt(e), start: pt(e), moved: 0 });
    });
    c.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      const now = pt(e);
      if (this.pointers.size === 1) {
        const k = this.zoom * this.dpr;
        this.cx -= (now[0] - p.at[0]) / k;
        this.cz -= (now[1] - p.at[1]) / k;
      } else if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const other = a === p ? b : a;
        const d0 = Math.hypot(p.at[0] - other.at[0], p.at[1] - other.at[1]);
        const d1 = Math.hypot(now[0] - other.at[0], now[1] - other.at[1]);
        if (d0 > 10) this.setZoom(this.zoom * (d1 / d0), [(now[0] + other.at[0]) / 2, (now[1] + other.at[1]) / 2]);
      }
      p.moved += Math.hypot(now[0] - p.at[0], now[1] - p.at[1]);
      p.at = now;
    });
    const up = (e) => {
      const p = this.pointers.get(e.pointerId);
      const single = this.pointers.size === 1;
      this.pointers.delete(e.pointerId);
      if (p && single && p.moved < 10 * this.dpr) this.tap(p.at);
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', (e) => this.pointers.delete(e.pointerId));
    c.addEventListener('wheel', (e) => { e.preventDefault(); this.setZoom(this.zoom * Math.exp(-e.deltaY * 0.0015), pt(e)); }, { passive: false });
  }

  /** Select the nearest named / routeable point under the finger. */
  tap([px, py]) {
    let best = null, bestD = 28 * this.dpr;
    for (const pts of this.blips.values()) {
      for (const b of pts) {
        if (this.hidden.has(b.group) || !(b.label || b.routeable)) continue;
        const [x, y] = this.project(b.x, b.z);
        const d = Math.hypot(x - px, y - py);
        if (d < bestD) { bestD = d; best = b; }
      }
    }
    this.selected = best;
    this.showInfo();
  }

  showInfo() {
    const box = this.ov.panel.querySelector('.bm-info');
    const b = this.selected;
    box.hidden = !b;
    if (!b) return;
    const p = this.game.player.position;
    const dist = Math.round(Math.hypot(b.x - p.x, b.z - p.z));
    box.innerHTML = `<b>${esc(b.icon || '•')} ${esc(pickName(b.label) || t(`map.group.${b.group}`))}</b>
      <small>${esc(t('map.distance', { m: formatNumber(dist) }))}</small>
      <button type="button" data-route>🧭 ${esc(t('map.showWay'))}</button>
      ${b.action && (!b.action.when || b.action.when()) ? `<button type="button" data-act>🚏 ${esc(t(b.action.key))}</button>` : ''}`;
  }

  onClick(e) {
    const el = e.target.closest('button');
    if (!el) return;
    const g = this.game;
    if (el.dataset.close !== undefined) return this.close();
    if (el.dataset.zoom) return this.setZoom(this.zoom * (el.dataset.zoom === '1' ? 1.5 : 1 / 1.5));
    if (el.dataset.me !== undefined) { this.cx = g.player.position.x; this.cz = g.player.position.z; return; }
    if (el.dataset.clear !== undefined) { this.route.clear(); this.build(); this.fit(); return; }
    if (el.dataset.group) {
      const k = el.dataset.group;
      if (this.hidden.has(k)) this.hidden.delete(k); else this.hidden.add(k);
      el.classList.toggle('off');
      return;
    }
    if (el.dataset.go) {
      const b = this.blips.get('institutes')?.find((x) => x.id === el.dataset.go);
      if (b) { this.selected = b; this.cx = b.x; this.cz = b.z; this.setRoute(b); }
      return;
    }
    if (el.dataset.route !== undefined && this.selected) this.setRoute(this.selected);
    // Roadmap 2 S6: a stop / station while riding → "get off here" (the ride shows the GPS too).
    if (el.dataset.act !== undefined && this.selected?.action) { this.selected.action.run(); this.close(); }
  }

  setRoute(b) {
    this.game.events.emit('route:set', { x: b.x, z: b.z, label: b.label, icon: b.icon });
    this.build();
    this.fit();
    this.showInfo();
  }

  draw() {
    const { ctx, canvas, city } = this;
    if (!ctx || !canvas.width) return;
    const k = this.zoom * this.dpr;
    const s = k / city.scale;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#1b1426';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(s, 0, 0, s, canvas.width / 2 - (this.cx - city.ox) * k, canvas.height / 2 - (this.cz - city.oz) * k);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(city.canvas, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    this.route.draw(ctx, (x, z) => this.project(x, z), 5 * this.dpr, this.mv.colors);

    const blink = Math.floor(performance.now() / 350) % 2 === 0;
    const font = fontStack(getLanguage());
    const labels = this.zoom >= this.mv.labelZoom;
    const order = [...this.blips.entries()].sort((a, b) => (a[0] === 'institutes') - (b[0] === 'institutes'));
    for (const [, pts] of order) {
      for (const b of pts) {
        if (this.hidden.has(b.group)) continue;
        const [x, y] = this.project(b.x, b.z);
        if (x < -60 || y < -60 || x > canvas.width + 60 || y > canvas.height + 60) continue;
        if (b.blink && !blink) ctx.globalAlpha = 0.45;
        this.drawPoint(ctx, b, x, y, font, labels || b.big);
        ctx.globalAlpha = 1;
      }
    }
    this.drawPlayer(ctx);
  }

  drawPoint(ctx, b, x, y, font, withLabel) {
    const d = this.dpr;
    const r = (b.big ? this.mv.bigIconSize : b.small ? 9 : this.mv.iconSize) * d / 2;
    const sel = this.selected === b;
    ctx.beginPath();
    ctx.arc(x, y, r + (sel ? 3 * d : 0), 0, Math.PI * 2);
    ctx.fillStyle = b.small && !b.icon ? b.color : 'rgba(20,12,40,0.88)';
    ctx.fill();
    ctx.lineWidth = (b.big || sel ? 3 : 2) * d;
    ctx.strokeStyle = sel ? '#ffffff' : b.color;
    ctx.stroke();
    if (b.icon && !b.small) {
      ctx.font = `${Math.round(r * 1.15)}px ${font}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.icon, x, y + d);
    } else if (b.icon) {
      ctx.fillStyle = b.color;
      ctx.font = `700 ${Math.round(r * 1.5)}px ${font}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('+', x, y + d);
    }
    if (withLabel && b.label) {
      const text = pickName(b.label);
      ctx.font = `700 ${Math.round((b.big ? 15 : 12) * d)}px ${font}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3 * d;
      ctx.strokeStyle = this.mv.colors.labelShadow;
      ctx.strokeText(text, x + r + 4 * d, y);
      ctx.fillStyle = b.big ? this.mv.colors.school : this.mv.colors.label;
      ctx.fillText(text, x + r + 4 * d, y);
    }
  }

  drawPlayer(ctx) {
    const p = this.game.player;
    const [x, y] = this.project(p.position.x, p.position.z);
    const d = this.dpr;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI - p.heading);
    ctx.beginPath();
    ctx.moveTo(0, -11 * d);
    ctx.lineTo(8 * d, 9 * d);
    ctx.lineTo(0, 4 * d);
    ctx.lineTo(-8 * d, 9 * d);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 2.5 * d;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this._resize);
    this.ov.dispose();
  }
}
