// Feature: crime (Session 6). Turns crimes into wanted stars and keeps Shoumik's crime stats.
//
// Wanted level: every crime adds heat points (data/economy.json → wanted.crimes); the number
// of stars is how many wanted.starAt values the heat has passed (max 5). While stars are up and
// no police unit can see him (police:sight { seen: false }) for wanted.fadeSeconds, one star
// fades. Stars blink on the HUD while he is out of sight. Busted / wasted clear everything.
//
// Stats (save.data.stats, for the profile card in Session 7): kills, policeKilled,
// carsDestroyed, longestChase (seconds with stars up), busted, wasted, shotsFired.
//
// Events
//   listens  crime:committed { type }     police:sight { seen }     wanted:clear {}
//            combat:hit { by, police }    police:killed { by }      ped:killed { by }
//            vehicle:exploded { by, police }    weapon:fired    player:busted    player:died
//            wanted:set { stars }         (debug / testing: force a level)
//            wanted:amnesty { seconds }   (Update 9b: after bail / jail / a new life no crime counts for a while,
//                                          e.g. a car set on fire in the chase that explodes later)
//   sends    wanted:changed { stars, seen }    stats:changed { stats }

import { debugLine, log } from '../../core/debug.js';

let game = null;
let W = null;            // data/economy.json → wanted
let heat = 0;
let stars = 0;
let seen = false;         // police:sight; a fresh crime counts as seen for seenGraceSeconds
let unseen = 0;          // seconds out of police sight
let grace = 0;           // seconds a fresh crime counts as "seen" (police are on the way)
let chase = 0;           // seconds of the current chase
let assaultCooldown = 0;
let amnesty = 0;         // seconds in which crimes add no heat (after the penalty is paid)
let offs = [];

const stats = () => game.save.data.stats;

function bump(key, n = 1) {
  const s = stats();
  s[key] = (s[key] || 0) + n;
  game.events.emit('stats:changed', { stats: s });
}

function starsFor(h) {
  let n = 0;
  for (const at of W.starAt) if (h >= at) n++;
  return Math.min(game.config.get('game').wantedStarsMax, n);
}

function publish() {
  game.events.emit('wanted:changed', { stars, seen: seen || grace > 0 });
}

function setHeat(h) {
  heat = Math.max(0, Math.min(W.maxHeat, h));
  const next = starsFor(heat);
  if (next === stars) return;
  if (next > 0 && stars === 0) chase = 0;
  if (next === 0 && stars > 0) endChase();
  stars = next;
  unseen = 0;
  publish();
}

function endChase() {
  const s = stats();
  if (chase > (s.longestChase || 0)) {
    s.longestChase = Math.round(chase);
    game.events.emit('stats:changed', { stats: s });
  }
  chase = 0;
}

function onCrime({ type }) {
  const points = W.crimes[type];
  if (!points) return log.warn(`crime:committed — unknown crime "${type}"`);
  if (amnesty > 0) return; // he has just paid for his crimes: stay free
  grace = W.seenGraceSeconds;
  unseen = 0;
  setHeat(heat + points);
}

function clear() {
  if (stars > 0) endChase();
  heat = 0;
  stars = 0;
  unseen = 0;
  grace = 0;
  publish();
}

export default {
  id: 'crime',

  init(g) {
    game = g;
    W = g.config.get('economy').wanted;
    if (!g.save.data.stats) g.save.data.stats = {};
    heat = 0;
    stars = 0;
    // A chase continues after a reload (closing the game is not a way out).
    setHeat(Number.isFinite(g.save.data.wanted?.heat) ? g.save.data.wanted.heat : 0);
    g.save.onBeforeSave((data) => { data.wanted = { heat: Math.round(heat) }; });
    offs = [
      g.events.on('crime:committed', onCrime),
      g.events.on('wanted:clear', clear),
      g.events.on('wanted:amnesty', ({ seconds = 0 } = {}) => { amnesty = Math.max(amnesty, seconds); clear(); }),
      g.events.on('wanted:set', ({ stars: n = 0 }) => setHeat(n > 0 ? W.starAt[Math.min(n, W.starAt.length) - 1] : 0)),
      g.events.on('police:sight', ({ seen: s }) => {
        if (s === seen) return;
        seen = !!s;
        if (seen) unseen = 0;
        publish();
      }),
      g.events.on('combat:hit', ({ by, police }) => {
        if (by !== 'player' || !police || assaultCooldown > 0) return;
        assaultCooldown = 2;
        onCrime({ type: 'assaultPolice' });
      }),
      g.events.on('police:killed', ({ by }) => {
        if (by !== 'player') return;
        onCrime({ type: 'killPolice' });
        bump('kills');
        bump('policeKilled');
      }),
      g.events.on('ped:killed', ({ by }) => { if (by === 'player') bump('kills'); }),
      g.events.on('vehicle:exploded', ({ by, police }) => {
        if (by !== 'player') return;
        bump('carsDestroyed');
        onCrime({ type: police ? 'destroyPolice' : 'destroyVehicle' });
      }),
      g.events.on('weapon:fired', () => { stats().shotsFired = (stats().shotsFired || 0) + 1; }),
      g.events.on('player:busted', () => bump('busted')),
      g.events.on('player:died', () => bump('wasted')),
      g.events.on('game:started', publish), // the HUD starts after this feature
    ];
    publish();
  },

  update(dt) {
    assaultCooldown -= dt;
    amnesty = Math.max(0, amnesty - dt);
    if (stars === 0) { debugLine('wanted', 'stars 0'); return; }
    chase += dt;
    if (grace > 0) {
      grace -= dt;
      if (grace <= 0 && !seen) publish(); // start blinking
    }
    if (!seen && grace <= 0) {
      unseen += dt;
      if (unseen >= W.fadeSeconds) {
        unseen = 0;
        // One star fades: heat drops to the level of one star less.
        setHeat(stars >= 2 ? W.starAt[stars - 2] : 0);
      }
    }
    debugLine('wanted', `stars ${stars} heat ${Math.round(heat)} ${seen ? 'seen' : `unseen ${unseen.toFixed(0)}s`} chase ${chase.toFixed(0)}s`);
  },

  dispose() {
    offs.forEach((off) => off());
    offs = [];
  },
};
