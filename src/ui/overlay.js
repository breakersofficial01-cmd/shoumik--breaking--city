// Full-screen overlay helper used by Class Mode and the shops (and later menus).
//
//   const ov = createOverlay(game, { id: 'class-mode', reason: 'classes', className: 'class-mode' });
//   ov.panel.innerHTML = '...';   ov.open();   ov.close();
//
// While open the game is paused (game.setPaused(reason)), mouse-look is released and the
// keyboard Escape key closes it. Closing writes the save, so purchases / rewards are kept even
// if the phone kills the browser right after.

export function createOverlay(game, { id, reason, className = '', onClose = null, escape = true }) {
  const root = document.createElement('div');
  root.id = id;
  root.className = `overlay ${className}`.trim();
  root.hidden = true;
  const panel = document.createElement('div');
  panel.className = 'panel';
  root.appendChild(panel);
  game.ui.appendChild(root);

  const onKey = (e) => {
    if (escape && e.key === 'Escape' && !root.hidden) ov.close(); // escape: false = must use a button (jail)
  };
  window.addEventListener('keydown', onKey);

  const ov = {
    root,
    panel,
    get isOpen() { return !root.hidden; },
    open() {
      if (!root.hidden) return;
      root.hidden = false;
      game.setPaused(reason, true);
      document.exitPointerLock?.();
    },
    close() {
      if (root.hidden) return;
      root.hidden = true;
      game.setPaused(reason, false);
      game.save.flush();
      onClose?.();
    },
    dispose() {
      window.removeEventListener('keydown', onKey);
      if (!root.hidden) game.setPaused(reason, false);
      root.remove();
    },
  };
  return ov;
}

/** Escape text before putting it into innerHTML (content comes from sheets later). */
export function esc(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
