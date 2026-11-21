// Feature: streaming (Roadmap 2, G1). After the start, downloads the rest of the game bit by
// bit (MRT trains, all guns, later the new areas of Roadmap 2) while the frame rate is fine,
// so the first launch stays short. The work is in src/core/streamer.js (game.streamer, made by
// main.js, which also started the boot downloads). Settings: data/streaming.json.
//
// Sends: stream:loaded { group } when an area group is ready.   Debug: BC.streamer.report()

import { debugLine } from '../../core/debug.js';

let game = null;
let fps = 30;

export default {
  id: 'streaming',

  init(g) {
    game = g;
    if (!g.streamer) throw new Error('no streamer (main.js makes it)');
    g.streamer.afterStart(g.qualityName, g.events);
  },

  update(dt) {
    if (dt > 0) fps += (1 / dt - fps) * Math.min(1, dt * 2); // smoothed over about half a second
    const focus = game.player?.position || game.camera.position;
    game.streamer.update(dt, focus, fps, (c, r) => game.world.layout.crossingCentre(c, r));
    const r = game.streamer.report();
    debugLine('stream', `stream ${r.done} done · ${r.loading} loading · ${r.waiting} waiting${r.failed ? ` · ${r.failed} failed` : ''}`);
  },

  dispose() {},
};
