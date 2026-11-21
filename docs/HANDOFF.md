# Handoff — how Breaking City is built (v13, after Roadmap 2 · S3 — bigger world)

For the next Claude session. Read `/CLAUDE.md` first (rules), then this file, then
`docs/GAME_SPEC.md` (what exists) and `docs/CHANGELOG.md` (what changed last).

All eight build sessions are done. From now on the owner sends **daily update prompts**
(`docs/SESSIONS.md → Daily update prompts`): one feature, one fix, a poster or a lesson at a
time. Quick map of this file:
- Run and test → §1 · boot → §2 · folders → §3 · gotchas → §4 · events → §5
- **Add a feature → §6 · a content type → §7 · a poster → §8 + `posters/README.md` ·
  a lesson → §7b + `docs/CONTENT_GUIDE.md` · an asset → §9 · change the save → §10**
- Release: offline app, automatic quality, privacy/credits pages, publishing → §12f, `docs/DEPLOY.md`
- **Update 9: accounts, the Google Sheet, full map + GPS, earn offer, health packs → §12g**
- **Roadmap 2 (current plan: `docs/ROADMAP-2.md`) · S1 street look: lamps, benches, bins,
  transformers, construction sites, footbridges, more signs → §12h**
- **G1 fast start: boot prefetch, streaming, compressed models, preload list, real trees → §12i**
- **S3 bigger world: terrain around the city, sea, desert, fields, hills, bridge, ponds → §12k**
- Roadmap → §14

## 1. Run and test
- No build step. Any static server from the repo root works: `python3 -m http.server 8000`
  → `http://localhost:8000/?debug=1`.
- URL flags: `?debug=1` (FPS panel, logs, `window.BC` = the Game object), `?autostart=1`
  (skip the Tap-to-start button; Update 9: also a local test player, no live Google Sheet unless `&sheet=1`), `?quality=low|medium|high` (also switches automatic quality
  off), `?touch=1` (show touch controls on a computer). Session 8: `?sw=0` (no service worker),
  `?sw=1` (service worker even in a test browser), `?autoquality=1` (automatic quality even in a
  test browser). Automated browsers (`navigator.webdriver`) get neither by default, so the older
  tools behave exactly as before.
- **Service worker while developing:** after the first visit the browser is controlled by `sw.js`.
  Code is network-first, so edits show on a normal reload; but big files (GLB, JPG, PNG, sounds)
  come from the offline copy first and only refresh in the background — reload twice after
  replacing one, or use `?sw=0`, or DevTools → Application → "Update on reload".
- Automated check: `node tools/smoke-test.js --three <path to an npm copy of three@0.170.0>
  --shot out.png`. It boots the game headless under the GitHub Pages sub-path, walks forward,
  and fails on any console error or if no pedestrians appear.
- Vehicles: `node tools/vehicle-shots.js --three <dir> --out <folder>` photographs every vehicle
  type and tests driving, the ramp jump, drifting, carjacking, a hired ride, an explosion and a
  minute of traffic (`--only gallery,drive,jack,ride,boom,traffic`). Run it after touching
  anything in `src/entities/vehicles/`, `src/world/roads.js` or the two features.
- Landmarks: `node tools/landmark-shots.js --three <dir> --out <folder> [--only tsc,sadarghat]`
  photographs every landmark, MRT station, viaduct, lake and a billboard/LED screen.
- Posters + gameplay: `node tools/poster-check.js --three <dir> --out <folder>` stands Shoumik
  at one slot of each kind, tests tap-to-open (F), LED rotation, the MRT train, the Breaking
  School entrance and the bus/rickshaw adverts.
- Crime + police (Session 6): `node tools/crime-check.js --three <dir> --out <folder> [--quality low]`
  buys a pistol / ammo / armour, shoots a pedestrian dead (phone aim assist), checks wanted stars,
  police on foot / pickups / helicopter, a star fading out of sight, BUSTED with and without cash
  (jail → study → released, jail kept after a reload), desktop free aim, the bat, a molotov, a
  blown-up car, WASTED (hospital bill, weapons lost) and Blood Off. Run it after touching weapons,
  crime, police, jail, player health or pedestrians.
- Session 7: `node tools/vibe-check.js --three <dir> --out <folder> [--quality medium] [--only times,rain,power,signs,sound,ui]`
  photographs six times of day, rain (day, night, lightning), load-shedding and the Bangla shop
  signs; plays guns / explosion / crow / hawker, the radio (R changes station, none in a
  rickshaw); clicks through Settings (English, sound off, big buttons, reset asks twice), unlocks a
  reward code, opens the profile card (Copy), takes a watermarked screenshot, and tests the 17+
  screen on a fresh save (`&agegate=1`; `?autostart=1` skips it so the other tools keep working).
  Run it after touching sky, graphics, audio, settings or any Session 7 feature.
- Release (Session 8): `node tools/release-check.js --three <dir> --out <folder> [--only pwa,pages,auto,lost]`
  registers the service worker (`?sw=1`), checks the offline copy and boots the game again with the
  network OFF; renders privacy/credits in both languages and the Settings → App row; checks the
  automatic quality (`?autoquality=1`) and the "graphics paused" screen after a lost WebGL context.
  Run it after touching `sw.js`, `src/core/pwa.js`, `data/pwa.json`, the pages or the boot.
- **After adding/removing a code file**: `node tools/make-preload.js` (updates the modulepreload
  list in index.html; `--check` tells if it is stale — a stale entry is a 404 in the console).
- **After adding a GLB**: `node tools/compress-models.js --cli <node_modules/.bin/gltf-transform>`
  (meshopt; `npm i @gltf-transform/cli@4` in a scratch folder). Already-compressed files are skipped.
- Bigger world (Roadmap 2 S3): `node tools/world-check.js --three <dir> --out <folder> [--quality medium] [--only stream,shots,ground,drive,map]`
  checks that the countryside models are only downloaded near the edge, photographs fields,
  desert, beach, bridge (day/night), hills, oasis, a city pond, Gulshan Lake and the city edge,
  compares the gameplay height with the drawn ground, tests sea/river/pond/edge collisions,
  drives a car over the bridge (slow headless: up to 3 minutes) and checks the map + GPS. Run it
  after touching `src/world/terrain/`, `data/terrain.json`, water, vehicle ground following or the map.
- Street look (Roadmap 2 S1): `node tools/street-look-check.js --three <dir> --out <folder> [--quality medium] [--only street,site,bridge,park,props]`
  photographs a lamp-lined street by day and night, a construction site, a footbridge (day/night),
  a park at night, a transformer and a bench; checks counts, lamps off by day / glowing at night,
  real lights on Medium/High (none on Low) and that the footbridge stairs are solid. Run it after
  touching `src/world/street/`, `src/features/streetLights/`, `data/street.json` or the signboards.
- Class Mode + shops (Session 5): `node tools/class-check.js --three <dir> --out <folder> [--quality low]`
  walks into the Breaking Biology ring, runs two Lesson Checks, two Quiz Class rounds and a
  time-out, buys food / a bicycle / an outfit / a pistol / a home, sleeps at home, opens the
  admin panel and reloads. Checks every Taka amount. Run it after touching classes, shops,
  economy, save or lessons.
- See what you changed: `node tools/character-shots.js --three <dir> --out <folder>` saves
  close-ups of Shoumik in every outfit and animation (`--only front,punch,doctor`). (Cloud sandboxes usually cannot reach the CDN, hence
  `--three`.) Run it before every commit.
- Useful in the console with `?debug=1`:
  `BC.player.position`, `BC.economy.addCash(1000)`, `BC.setQuality('low')`,
  `BC.events.emit('wanted:changed', { stars: 3 })`, `BC.world.layout`, `BC.save.flush()`,
  `BC.events.emit('outfit:set', { id: 'doctor' })`, `BC.events.emit('player:action', { name: 'aim' })`,
  `BC.debugPeds` (the pedestrian pool), `BC.crowd.people`. Number keys 1–0 play animations.
  Vehicles: `BC.fleet.vehicles`, `BC.player.vehicle`, `BC.fleet.create('bus', { x, z, heading })`,
  `BC.fleet.damage(v, 100)`, `BC.events.emit('vehicle:grant', { type: 'sports' })`, `BC.world.roads`.
  Session 4: `BC.world.landmarks` (sites, markers, viaducts), `BC.posters.slots`, `BC.metro.trains`.
  Session 5: `BC.features.get('classes').open({ id: 'breaking-biology' })`,
  `BC.events.emit('shop:open', { id: 'car-showroom' })`, `BC.features.get('shops').spots`,
  `BC.player.health`, `BC.save.data.lessons`, `?admin=1` (content report button).
  Session 6: `BC.events.emit('wanted:set', { stars: 3 })`, `BC.events.emit('wanted:clear')`,
  `BC.events.emit('weapon:owned', { id: 'smg' })`, `BC.events.emit('player:busted', { stars: 2 })`,
  `BC.events.emit('player:damage', { amount: 50 })`, `BC.targets.list`, `BC.debugPolice.officers()`,
  `BC.combatFx`, `BC.save.data.stats`.
  Session 7: `?hour=21` (start time), `?rain=1`, `BC.events.emit('time:set', { hour: 12 })`,
  `BC.clock.hour`, `BC.events.emit('weather:set', { rain: true })`, `BC.weather.rain`,
  `BC.events.emit('weather:thunder')`, `BC.events.emit('power:cutNow', { district: 'old-dhaka' })`,
  `BC.audio.play('crow')`, `BC.audio.ctx`, `BC.events.emit('radio:set', { station: 2 })`,
  `BC.events.emit('profile:open')`, `BC.rewards.list()`, `BC.world.cityShading`, `&agegate=1`.

## 2. Boot order (`src/main.js`)
1. `config.loadSome` (ui, strings, game, economy) → `save.load` → `initI18n`
2. `loadFonts` + `config.loadAll` (all other `data/*.json`)
3. `assets.configure` + procedural placeholder textures registered
4. `content.loadAll()` (lessons AND places through the Content Service — the layout needs places)
5. `new Game(canvas).init()` → renderer, `World` (layout with landmark plots, ramps, landmark
   plan, roads, materials, sky, water, chunks, collision, then landmark meshes — async, they
   wait for the fonts), `Input`, `ChaseCamera`, features, first chunks built
6. autosave starts → "Tap to start" → `game.start()` (frame loop)
7. Session 8: `registerServiceWorker(config.get('pwa'))` — after the start, so it never slows
   the first load. `Game.pickQuality()` runs inside step 5 (device check, see §12f).

Feature order (`src/features/index.js`): traffic → vehicles → player → pedestrians → hotspots →
posters → metro → entrances → classes → shops → weapons → crime → police → jail → dayNight →
weather → sound → radio → rewardCodes → profileCard → screenshot → ageGate → the rest.
`game.audio` (Session 7) is created in `Game.init` right before the features. The
`vehicles` feature steps the shared fleet (physics) and then puts Shoumik on his seat, so it must
run before `player` draws him; `traffic` only sets the AI's pedals and wheel before that.

Frame order (`Game.frame`): input → camera look → `features.update(dt)` → `crowd.update()` → `combatFx.update()` → camera →
`world.update` (chunks, water, sky) → render → input end-of-frame → debug panel.

## 3. Folder map
```
index.html                 import map (three@0.170.0 pinned), canvas, loading + rotate screens,
                           manifest + icon links (Session 8)
manifest.webmanifest       installable app: name, icons, landscape, fullscreen, relative start_url
sw.js                      service worker (offline + updates), settings from data/pwa.json via its URL
privacy.html credits.html  static pages drawn by src/pages/page.js from data/pages.json
src/pages/page.js          Session 8 pages (fonts + strings + links, no 3D)
src/main.js                boot
src/core/   events.js      event bus            config.js   loads data/*.json
            save.js        versioned save       economy.js  wallet → cash:changed
            game.js        renderer + loop      input.js    keyboard/mouse/touch state
            rng.js         seeded random        debug.js    ?debug=1 panel + log
            targets.js     everything that can be shot (game.targets)
            pwa.js         service worker registration + install prompt (Session 8)
            deviceCheck.js weak-device guess for the first quality (Session 8)
src/content/ ContentService.js, validators.js, csv.js, adapters/{LocalJson,GoogleSheetCsv}Adapter.js
src/assets/  registry.js (asset ids + overrides), proceduralTextures.js (atlases)
src/audio/   audio.js (AudioManager = game.audio: one context, buses, play/loop, file overrides),
             synth.js (every code-made sound: SYNTH one-shots, LOOPS beds)
src/world/   layout.js (piece grid) → blockgen.js (buildings/poles/trees DATA)
  street/    Roadmap 2 S1: index.js (StreetDressing = world.street: load, merge per chunk, materials),
             plan.js (what stands where: lamps, benches, bins, transformers, sites — DATA),
             footbridgePlan.js + footbridges.js, meshes.js (code-built benches, bins, transformers,
             bamboo scaffolding, nets, fallbacks)
             geoBuilder.js, buildingMesher.js, groundMesher.js, props.js  (DATA → geometry)
             chunks.js (build/show/hide/unload), collision.js, water.js, sky.js, world.js (glue)
             roads.js (road graph: junctions, lanes, signals, routes, bus stops), ramps.js
             cityShading.js (lit windows / sign glow / wet roads / load-shedding cut: shader patches),
             signboards.js (Bangla shop-name atlas + sign faces)
  landmarks/ index.js (plan + build + cull), kit.js (modelling toolbox), signs.js (name-board
             atlas), civic.js campus.js oldDhaka.js modern.js (one builder per landmark),
             viaduct.js (MRT / flyover deck, pillars, stations, ViaductPath)
src/entities/ chaseCamera.js
  vehicles/  fleet.js (all vehicles; step + draw) vehicle.js physics.js damage.js driver.js (AI)
             models.js modelsCars.js modelsSmall.js shapes.js (VBuilder)
  effects/   particles.js (smoke / fire puffs), combatFx.js (blood, tracers, flashes: game.combatFx)
  people/    skeleton.js (pose format, bones) animLocomotion.js animActions.js animator.js
             shapes.js (loft/ellipsoid helpers) partGeometry.js looks.js crowd.js (instancing)
  shoumik/   model.js head.js body.js faceTexture.js
src/features/ index.js (registry) + player/ (index.js, actions.js) pedestrians/ (index.js,
             navigation.js, brain.js, bubbles.js) hotspots/ (index.js, props.js, boombox.js)
             touchControls/ hud/ minimap/ settings/
             vehicles/ (index.js, boarding.js, rides.js, parked.js, horn.js) traffic/ (index.js, shelters.js)
             posters/ (index.js, slots.js, frames.js, library.js, schedule.js, vehicles.js)
             metro/ (MRT trains)  entrances/ (glowing markers at Breaking School / Biology)
             classes/ (index.js Class Mode controller, screens.js HTML, quiz.js engine,
               progress.js money rules + save, admin.js ?admin=1 report)
             shops/ (index.js rings + panels + homes, catalog.js what is sold / buy effects,
               markers.js ring + name sign + corner finder)
             pedestrians/roadSense.js (people vs vehicles)
             weapons/ (index.js inventory + attack, firing.js bullets, throwing.js molotovs,
               models.js gun/bat models, hud.js badge + crosshair + lock-on)
             crime/ (heat → wanted stars, fading, stats)
             police/ (index.js levels + sight + arrest, officers.js, pursuit.js pickups,
               roadblock.js, helicopter.js)
             jail/ (busted → bail / jail study, wasted → hospital; screens.js)
             dayNight/ (index.js clock + look, clock.js key blending + sun path, loadShedding.js)
             weather/ (rain drops, wetness, thunder)   sound/ (events + street → game.audio)
             radio/ (index.js stations + DJ banner, music.js code-made music)
             rewardCodes/  profileCard/  screenshot/  ageGate/  settings/ (rewritten in Session 7)
             autoQuality/ (Session 8: FPS watchdog that lowers quality / resolution)
             streetLights/ (Roadmap 2 S1: lamps glow at night, light pools, real lights nearby)
src/ui/      fonts.js, i18n.js (t, tl = fixed language, numIn/moneyIn), loading.js, overlay.js
             (createOverlay: pause + Esc + save on close, esc()), styles.css, panels.css (Session 5),
             combat.css (Session 6), vibe.css (Session 7), quiz.js + quizScreens.js (quiz engine + question screens, shared
             by classes and jail), bubbles.js (speech bubbles, shared by pedestrians and police),
             release.css + contextLost.js (Session 8), pages.css (privacy / credits pages)
data/        every tunable number and all content
tools/       street-look-check.js + street-kit/ (Roadmap 2 S1), release-check.js, make-icons.js (Session 8), smoke-test.js, vibe-check.js, crime-check.js, class-check.js, character-shots.js, vehicle-shots.js, landmark-shots.js, poster-check.js
posters/     poster pictures + README.md (how to add one)
```

## 4. Conventions that are easy to get wrong
- **Axes:** x = east, y = up, z = **south**. Grid row 0 / col 0 = north-west corner.
- **Heading / yaw:** radians, 0 faces +z, `forward = (sin a, cos a)`. A model that faces +z
  with `rotation.y = heading` is correct. Shoumik's left is +x.
- **Colours:** vertex colours are linear floats — always `hexToLinear('#rrggbb')`.
- **Walls:** `GeoBuilder.wall(a → b)` takes the two ground points left-to-right as seen from
  outside; the face then points at the viewer. `box()` shows the order for each side.
- **Atlases:** one row of 64 px tiles; a tile repeats vertically only. Tile ids are
  `FACADE.*` / `GROUND.*` in `proceduralTextures.js`. Large floors use `gb.tiled()`.
- **The piece grid** (`layout.js`): `(2*cols+1) × (2*rows+1)` pieces; even index = road,
  odd = block. `layout.pieceAt(x, z)`, `layout.piece(i, j)`, `layout.crossingCentre(col, row)`.
  Each block piece has `content = { buildings, patches, poles, wires, tanks, trees }`.
- **Never fetch content directly.** Tunables: `config.get('name')`. Content:
  `content.get('lessons')`.
- **No font names** outside `src/ui/fonts.js`. CSS uses `var(--font-ui|--font-bn|--font-en)`;
  canvas text uses `fontStack(lang)` after `await fontsReady()`.
- **No magic numbers** — add a key to the right `data/*.json` (and to `config.js → FILES`
  if it is a new file).
- Files stay under ~400 lines; split when they grow.

## 5. Events (the only way features talk)
| Event | Payload | Sent by |
|---|---|---|
| `game:ready`, `game:started` | – | Game |
| `game:paused` | `{ paused }` | Game (`setPaused(reason, bool)`) |
| `quality:changed` | `{ quality, auto }` (`auto` = lowered by the autoQuality watchdog) | Game |
| `pwa:installable` | `{ can }` the browser offers (or stopped offering) "install app" | `src/core/pwa.js` → settings |
| `screen:resized` | `{ width, height }` | Game |
| `cash:changed` | `{ cash, delta, reason }` | `economy.addCash / spend` |
| `save:written`, `save:reset` | `{ at }` / – | save |
| `content:loaded` | report `{ type, source, count, skipped }` | ContentService |
| `language:changed` | `{ language }` | i18n `setLanguage` |
| `player:spawned` | `{ x, z }` | player |
| `district:entered` | `{ district }` | player |
| `input:<action>` | – (jump, sprint, action, attack, weapon, horn) | Input |
| `profile:open` | – | hud (portrait tapped) |
| `player:action` | `{ name, on?, side?, beat?, variant?, duration? }` play/stop an animation on Shoumik | anyone → player |
| `player:actionChanged` | `{ name, on }` | player |
| `player:attack` | `{ x, z, heading, range, arc, kind, power }` a punch lands | player |
| `player:hit` | `{ x, z, power }` somebody hit Shoumik from (x, z) | pedestrians (later police) → player |
| `outfit:set` / `outfit:changed` | `{ id }` | settings (later clothes shop) → player / player |
| `ped:hit` | `{ x, z, down }` | pedestrians |
| `ped:killed` / `police:killed` | `{ x, z, by }` (`by` = 'player', 'police', 'traffic', null) | pedestrians / police → crime (stats, wanted) |
| `player:damage` | `{ amount, by?, x?, z? }` bullets, fire, blasts — armour takes `armourShare` first | police, weapons (fire) → player |
| `player:armour` / `armour:changed` | `{ amount \| full }` / `{ value, max }` | shops → player / player → hud |
| `player:died` | `{ x, z, by }` health reached 0 | player → jail, crime |
| `player:busted` | `{ stars }` | police → jail, crime |
| `player:teleport` / `player:revive` / `player:freeze` | `{ x, z, heading }` / – / `{ on }` | jail → player |
| `vehicle:forceExit` | – throw him out of any vehicle now | jail → vehicles |
| `crime:committed` | `{ type, x, z }` types: see `data/economy.json → wanted.crimes` | weapons, pedestrians, vehicles, police → crime |
| `wanted:set` / `wanted:clear` | `{ stars }` / – | debug, tests / jail → crime |
| `police:sight` | `{ seen }` can any police unit see him | police → crime |
| `combat:hit` | `{ kind, by, police, killed }` something was hit | weapons, pedestrians, police → crime |
| `weapon:changed` / `weapon:fired` | `{ id, ammo }` / `{ id, x, z }` | weapons |
| `weapon:ammo` / `weapons:lose` | `{ id, amount? }` an ammo box / – (wasted) | shops / jail → weapons |
| `settings:blood` | `{ on }` | settings → combatFx |
| `stats:changed` | `{ stats }` | crime |
| `jail:entered` / `jail:released` | `{ owed }` / `{ paid }` | jail |
| `danger:raised` | `{ x, z, radius, source }` people nearby flee — **send this for gunshots, crashes, explosions** | pedestrians (later crime/vehicles) |
| `prompt:show` / `prompt:hide` | `{ id, key, vars? }` / `{ id }` one-line hint at the bottom of the HUD | anyone → hud |
| `hotspot:entered` / `hotspot:left` | `{ id }` | hotspots |
| `vehicle:entered` / `vehicle:exited` | `{ id, type, jacked?, passenger }` | vehicles |
| `vehicle:driverEjected` | `{ x, z, heading, archetype, angry, flee, police? }` a driver is now on foot (police: true → the police feature makes him an officer) | vehicles, traffic → pedestrians, police |
| `vehicle:crashed` | `{ id, x, z, speed }` | fleet |
| `vehicle:burning` / `vehicle:exploded` | `{ id, x, z }` / `{ id, type, x, z, radius, by, police }` | fleet |
| `explosion` | `{ x, z, radius, power, by }` — **send this for any blast** (people nearby fall or die, Shoumik is hurt) | fleet, police (helicopter) |
| `vehicle:horn` | `{ id, x, z, kind, ai }` | vehicles, AI drivers → vehicles (plays it) |
| `vehicle:grant` | `{ type, color? }` Shoumik now owns a vehicle | *shops (Session 5)* → vehicles |
| `ride:started` / `ride:ended` | `{ type, place, fare }` / `{ type, place, arrived }` | vehicles |
| `traffic:adopt` | `{ id }` take over a vehicle that has a driver | vehicles → traffic |
| `controls:mode` | `{ mode: 'driving' \| 'onFoot' }` | vehicles → touchControls |
| `wanted:changed` | `{ stars, seen }` (stars blink while `seen` is false) | crime → hud, police |
| `lesson:completed` | `{ id, institute, correct, total, earned, attempt }` a Lesson Check finished | classes |
| `class:opened` / `class:closed` / `class:quizStarted` | `{ institute }` | classes |
| `player:heal` | `{ amount }` or `{ full: true }` | shops (food, sleeping) → player |
| `health:changed` | `{ value, max, delta }` | player → hud |
| `shop:open` | `{ id }` open a shop panel (tools / console) | anyone → shops |
| `shop:opened` / `shop:purchased` | `{ id, kind }` / `{ shop, kind, item, price }` | shops |
| `outfit:owned` | `{ id }` an outfit was bought (settings rebuilds its list) | shops → settings |
| `weapon:owned` | `{ id }` a weapon was bought (molotov: every purchase) | shops → weapons |
| `home:owned` / `home:changed` / `home:slept` | `{ id }` | shops |
| `garage:changed` | `{ col, row, dir }` owned vehicles move to the new home's garage | shops → vehicles |
| `map:blips` | `{ id, points: [{ x, z, color }] }` coloured dots on the minimap ([] removes) | shops (anyone) → minimap |
| `input:open` | – (F key) open the poster being looked at | Input → posters |
| `poster:opened` | `{ id, slot, link }` | posters |
| `metro:arrived` | `{ line, station }` a train stopped at a station | metro |
| `entrance:enter` | `{ id, place }` Shoumik pressed ঢোকো in a Breaking School / Biology marker | entrances → *classes (Session 5)* |
| `time:changed` / `time:night` | `{ hour, night }` once per game minute / `{ night }` when it flips | dayNight |
| `time:set` | `{ hour }` jump to a time (debug, tools) | anyone → dayNight |
| `weather:changed` | `{ rain }` 0..1 | weather → dayNight |
| `weather:set` / `weather:thunder` | `{ rain: bool }` / – | debug, tools → weather |
| `power:cut` | `{ district, rect: {x0,z0,x1,z1}, on }` load-shedding starts / ends | dayNight → posters, sound |
| `power:cutNow` | `{ district? }` start one now | debug, tools → dayNight |
| `toast:show` | `{ key, vars?, text?, seconds? }` short message under the top of the screen | anyone → hud |
| `police:fired` | `{ x, z, rifle }` an officer / gunner fired | police → sound |
| `input:radio` / `input:photo` | – (R / P keys, রেডিও touch button) | Input |
| `radio:available` / `radio:changed` / `radio:set` | `{ on }` / `{ station }` (-1 = off) / `{ station }` | radio / radio / anyone → radio |
| `settings:controls` | – control size or layout changed (save.data.settings) | settings → touchControls |
| `reward:unlocked` | `{ id }` | rewardCodes → profileCard |
| `screenshot:taken` | `{ width, height }` | screenshot |
| `police:standDown` | – every police unit, road block and the helicopter leave now (Update 9b) | jail → police |
| `wanted:amnesty` | `{ seconds }` clear the stars; no crime adds heat for that long (Update 9b) | jail → crime |
| `earn:offer` | `{ reason: 'money'\|'ammo', need?, price?, item?, target? }` show the "earn Taka" panel | shops → earn |
| `earn:landing` | `{ mode?: 'watch'\|'quiz', need? }` open the class landing page | anyone → earn |
| `class:start` | `{ lesson }` open Class Mode on that lesson's Lesson Check | earn (landing) → classes |
| `stream:loaded` | `{ group }` an `areas` group of data/streaming.json finished downloading (S3: zone ids → countryside props) | streaming → terrain |
| `route:set` / `route:clear` | `{ x, z, label?, icon? }` / – GPS line on both maps | earn, shops, big map → minimap |
| `map:open` / `input:map` | – open the full map (M key) | earn / Input → minimap |
| `weapon:empty` | `{ id }` the gun in his hand has no bullets | weapons → shops (way to the nearest weapon shop) |
| `map:blips` (Update 9) | points may also have `icon, label {en,bn}, group, big, small, pin, blink, routeable, id` | shops, healthPacks, police, minimap (institutes) |

Add new events to this table.

## 6. How to add a feature
1. Create `src/features/<id>/index.js`:
   ```js
   let game = null;
   export default {
     id: 'myFeature',
     async init(g) { game = g; /* build meshes / DOM, subscribe to g.events */ },
     update(dt) { /* every frame */ },
     dispose() { /* remove everything you added, unsubscribe */ },
   };
   ```
2. Add one line to `LOADERS` in `src/features/index.js` (order = init and update order).
3. Add `"myFeature": true` to `data/features.json`.
4. Put its numbers in `data/<something>.json`, its text in `data/strings.json`.
5. Read shared state from `game.player`, `game.world`, `game.input`; talk to other features
   with `game.events` only. HUD/overlay DOM goes inside `game.ui`. Pause the game with
   `game.setPaused('myFeature', true)` while a full-screen overlay is open.

`data/features.json` already lists later features (vehicles, police…); they are skipped
with a debug log until their folder and loader exist.

## 7. How to add a content type (e.g. posters, hotspots, reward codes)
1. Create `data/<type>.json` with a `source` block like `data/lessons.json`.
2. Write `validate<Type>(raw)` in `src/content/validators.js` returning
   `{ items, defaults, skipped: [{ id, reason }] }`. Skip bad rows, never throw.
3. Register it (in the feature's `init`, or next to lessons in the ContentService
   constructor): `content.registerType('posters', { localPath: 'data/posters.json', validate: validatePosters })`
   then `await content.load('posters')` and use `content.get('posters')`.
4. For a Google Sheet source, add a mapper like `mapSheetRowsToLessons` and an adapter (or
   extend `GoogleSheetCsvAdapter`); caching and fallback are already handled by
   `ContentService.loadRemote`.
5. Document the columns in `docs/CONTENT_GUIDE.md`.

## 7b. How to add a lesson (the most common daily task)
1. Owner prompt: `Add a lesson to data/lessons.json: title …, institute …, chapter …, YouTube …,
   reward …, questions: …`. Format and every field: `docs/CONTENT_GUIDE.md`.
2. Questions, options and explanations in **Bangla** (CLAUDE.md quiz rule); `language: "bn"`.
3. The YouTube link only opens externally — never embed it (CLAUDE.md YouTube rule).
4. Check: `?admin=1` → content report shows the lesson with 0 skipped rows, and
   `node tools/class-check.js` still passes. No service-worker step is needed: content is
   network-first, players get it on their next online launch.
5. Google Sheet instead of JSON: `data/lessons.json → source` (adapter already written, §7).

## 7c. How to add a poster
Owner prompt: `Add poster posters/<file>, shape <wide|16:9|tall>, link <url>, from <date> to
<date>, districts <all|names>.` → add a row to `data/posters.json` exactly as
`posters/README.md` describes (picture in `posters/`, size per shape as in that README, .jpg under ~150 KB).
Check with `node tools/poster-check.js`. Like lessons, no release step is needed.

## 8. Posters and landmarks: how it fits together
**Posters** (`src/features/posters/`):
- Content: `data/posters.json` (validator `validatePosters`, loaded in the feature's `init`).
  Where slots are: `data/posterSlots.json` (tunables, loaded by config).
- `slots.js` plans 480+ static slots once: roof billboards (2:1) and wall posters (2:3) on
  buildings facing main roads, LED screens (16:9) on junction corners, a poster on every bus
  shelter and on both sides of every viaduct pillar. A slot = `{ id, kind, shape, x, y, z,
  heading (direction it faces), w, h, district, tap }`.
- `frames.js` merges billboard legs / LED housings / wall borders into one mesh per 192 m cell.
- Each slot is one plane mesh, made lazily and drawn only within `quality.posterDistance`
  (billboards and LEDs: the full view distance). `schedule.js` picks one poster per slot per
  day (weighted, date + district filtered); LED screens rotate every `ledRotateSeconds`.
- `library.js` loads pictures lazily through the asset registry (`texture.poster.<id>`); until
  then the default picture of that shape is shown.
- `vehicles.js` gives buses a back panel and some rickshaws a poster on their art panel.
- Tap-to-open: look at a poster with a link within its `tap` distance → button + hint; F,
  the button, or a quick tap on the poster itself calls `window.open(link, '_blank')`.
- Owner's guide: `posters/README.md`.

**Landmarks** (`src/world/landmarks/`, part of the world, not a feature):
- `data/places.json` rows with a `landmark` block reserve a city block (layout.js keeps its
  sidewalk, poles, wires and street trees and leaves the inside empty) or use a plaza area.
- `Kit` is the modelling toolbox: local space +z = front, `box`, `prism`, `dome`, `vault`,
  `gable`, `arch`/`arcade` (painted openings), `columns`, `steps`, `beam`, `sign` (name board
  from the sign atlas), `solid` (collider), `platform` (walkable raised floor — part of
  `world.heightAt` via `ramps.surface`), `marker` (entrance). Three builders per landmark:
  lit (facade material), glow (unlit), sign (name-board atlas) → ≤3 draw calls each, culled by
  distance in `Landmarks.update`.
- New landmark: write a builder in one of the group files, add it to `BUILDERS` in
  `landmarks/index.js`, colours in `data/landmarks.json → types`, a `landmark` on a place.
- Viaducts (`viaduct.js`): `path` = junction list → rounded `ViaductPath` (`at(s, out, side)`,
  `nearest(x, z)`); deck sections of `sectionLength` m; pillars only on straight road pieces,
  on the centre line, with colliders (AI drivers keep their lanes); stations add platforms and
  legs on the sidewalks. The `metro` feature runs trains on `path` with `side` = track offset.

## 9. How to add or swap an asset
- Code asks for ids: `assets.registerDefault('model.player', factory)` then
  `await assets.load(id)` / `assets.instance(id)`.
- To replace a placeholder with a real file, add it to `data/assets.json`:
  `"model.player": { "type": "model", "url": "assets/shoumik/shoumik.glb" }` (types: image,
  texture, model, sound). If the file fails, the placeholder is used.
- Current ids: `texture.facades`, `texture.ground`, `texture.water`, `texture.glow`,
  `geometry.pole`, `geometry.tank`, `geometry.tree`, `model.player`,
  `image.shoumik.portrait`, `image.shoumik.face`, `texture.shoumik.face`,
  `geometry.person.<shape>` (tube, torso, skirt, head, hairShort, hairLong, hairBun, hijab,
  cap, bucket, box).
- **All GLBs are meshopt-compressed.** The registry's shared `gltfLoader()` reads them, and
  `plainAttributes()` turns the quantised vertex data back into Float32 at load time, so code that
  bakes node transforms into geometry (vehicles, metro, street props, trees) keeps working. Load
  GLBs ONLY through the registry (`assets.load(id)`), never with your own GLTFLoader.
- S2: `model.vehicle.kenney{Pickup,Van,Delivery,Flatbed,Luxury,Hatchback,Jeep}` = `assets/vehicles/kenney-*.glb`
  (Kenney Car Kit). Pack with `node tools/car-kit/pack-cars.js --three <dir> --kit "<Car Kit>/Models/GLB format"`
  (recipes `tools/car-kit/cars.json`), then `tools/compress-models.js`. Materials are ROLES
  (Paint, Windows, Headlight, Taillight, Trim, Dark, Light) — use them in `data/vehicles.json →
  types.<id>.model.paint / colors`. Wheels stay separate meshes named `wheel-…`.
- G1: `model.nature.trees` = `assets/nature/trees.glb` (child meshes oak, round, detailed, fat,
  palm, palmBend, palmDetailed; 1 m tall; repack with `pack-props.js --recipes tools/street-kit/trees.json`).
- Roadmap 2 S1: `model.street.props` = `assets/street/street-props.glb` (one GLB, child meshes
  `lamp`, `lamp.glow`, `lampDouble`, `lampDouble.glow`, `cone`, `barrier`, `fence`, `dumpster`;
  vertex colours, metres, +z = front). Code stand-ins in `src/world/street/meshes.js →
  makeFallbackKit`. Repack: `node tools/street-kit/pack-props.js --three <dir> --kit
  "<City Kit Roads>/Models/GLB format" [--shot props.png]` (models + sizes in
  `tools/street-kit/recipes.json`; Kenney download: see ROADMAP-2 "Downloading the free packs").
- Session 4: `texture.poster.<poster id>` (and `texture.poster.default-<shape>`) for every poster
  picture — an override in `data/assets.json` replaces the file without touching posters.json.
- Real 3D models should use MeshStandardMaterial (GLB default) so they pick up the sky
  reflections and tone mapping; they get shadows automatically.
- `model.player.glb` (Session 4.5 B) is the real rigged Shoumik. `src/features/player/index.js`
  loads it on the qualities in `data/player.json → model.glb.useOn` and wraps it in
  `GlbShoumikModel` (`src/entities/shoumik/glbModel.js`), which keeps the procedural Animator as
  the brain and turns its state (move, air, current action and its fade weight) into
  AnimationMixer weights; upper-body actions use split upper/lower copies of each clip. New
  game action → add it to `model.glb.actions`. Rebuild the GLB with `tools/shoumik-pipeline/`.
  Check it with `node tools/shoumik-shots.js --three <dir> --out shots --quality medium`.
- `model.player` is a factory object `{ create(outfit) }` returning a `ShoumikModel`. A
  rigged .glb cannot simply be dropped in: it would need a small adapter that maps our pose
  (see `skeleton.js`) onto its bones.

- Session 4.5 C: `model.vehicle.*` (assets/vehicles), `model.train.*` (assets/trains),
  `model.weapon.*` (assets/weapons). Licences in `assets/CREDITS.md` — only CC0 / clearly
  licensed packs; never game rips.
- MRT: `src/features/metro/model.js` merges the front/wagon train models into one recoloured
  geometry each (`data/landmarks.json → viaducts[].line.train.model`); photo check:
  `node tools/metro-shots.js --three <dir> --out shots`.
- Guns: `data/weapons.json → grips` place a gun on the right-hand bone (metres, degrees).
  Rotation was computed so the barrel points ahead in the `shoot` clip; check with
  `node tools/weapon-grip.js --three <dir> --out shots --clip shoot`.

- City look (Session 4.5 C2): `texture.facades` and `texture.ground` are files baked from the
  Downtown City MegaKit. Same tile layout as `proceduralTextures.js` (FACADE / GROUND columns),
  just 256 px per tile; the code-painted atlases are the fallback. To change a wall tile, edit
  `tools/city-kit/facade-recipes.json` (kit piece names and positions), run
  `node tools/city-kit/bake-facades.js --three <dir> --kit "<kit>/Exports/glTF (Godot)" --out <png>`,
  save it as `assets/city/facades.jpg`, and check with `node tools/street-shots.js`. Keep wall
  materials grey (they are tinted per building). The kit download is needed to rebake.

- 3D hero buildings (`src/world/hero/`): `world.loadHero()` loads `model.city.kitPieces` during
  loading (Medium/High), marks chosen buildings `b.hero = zoneId` (nearest first within each
  zone's triangle budget); `buildingMesher.js` then draws only roof, stair room and shop signs
  for them. Zone meshes are merged per kit material and built/dropped by distance. Add a zone or
  change a style in `data/heroBuildings.json`; new kit pieces must be added to its `pieces` list
  and repacked with `tools/city-kit/pack-pieces.js`. Check with `node tools/hero-shots.js`.

## 10. How to change the save format
See the header of `src/core/save.js`: bump `SAVE_VERSION`, add a migration from the old
version, add the field to `defaults()`. Features store live state with
`save.onBeforeSave((data) => { ... })`.

## 11. People: how it fits together
- **Pose** = `Float32Array(25)` of joint angles (`skeleton.js`, sign rules at the top).
  Animations are pure functions that fill a pose. `Animator` blends idle/walk/run/air and one
  action on top. `computeBones()` turns a pose into 11 matrices.
- **Shoumik** (`ShoumikModel`) has one mesh per bone that copies those matrices.
- **Everyone else** is drawn by `Crowd` (`game.crowd`, get it with `acquireCrowd(game)`):
  `crowd.add(look, pose)` returns a person `{ x, y, z, heading, far, visible }` you move
  yourself; `crowd.remove(person)`. A `look` comes from `buildLook(archetype, palettes, rng)`.
- **New animation**: add a function + entry in `animActions.js → ACTIONS`; it is then
  available to `animator.play(name)`, to `player:action`, and to the debug keys.
- **New kind of person**: add an archetype in `data/pedestrians.json` and put it in a
  district `mix`. New clothing kind: a case in `looks.js` (and maybe a shape in
  `partGeometry.js` + its `PER_PERSON` count).
- **New outfit for Shoumik**: add an entry to `data/outfits.json` using an existing `style`
  (tee, polo, panjabi, doctor); a new style needs cases in `entities/shoumik/body.js`.
- **New hangout spot**: one row in `data/hotspots.json` (see `docs/CONTENT_GUIDE.md`).
- **Moving obstacles**: `world.collision.dynamic.add({ x, z, r, owner })`, update x/z
  yourself, `.delete()` when gone; `resolveDynamic(pos, radius, self)` pushes out of them.
  Vehicles should use this and send `danger:raised`.

## 12. Vehicles: how it fits together
- **Fleet** (`game.fleet`, get it with `await acquireFleet(game)`): every vehicle in the world.
  `fleet.create(type, { x, z, heading, color? })`, `fleet.remove(v)`, `fleet.nearest(x, z, range, filter)`,
  `fleet.damage(v, hp)`, `fleet.setRider(v, look)`. `fleet.update(dt)` is called once a frame by the
  `vehicles` feature: physics → vehicle-vs-vehicle → damage/fire → meshes, wheels, riders, particles.
- **A vehicle** (`vehicle.js`): `x y z heading vx vz speed forwardSpeed`, `input { throttle, steer
  (+ = left), handbrake }`, `driver` (`null` parked | `'player'` | `'ai'` | `'ride'`), `state`
  (`ok` | `burning` | `wreck`), `health`, `T` (its type from `data/vehicles.json`), `tags` (notes
  for features: `owned`, `stand`, `slot`, `seg`, `riderArchetype`), `brain` (AI data). Whoever
  drives only writes `vehicle.input`.
- **Physics** (`physics.js`): engine/brake along the heading, steering by wheel angle limited by
  `lateralAccel`, then sideways speed decays by *grip* — handbrake = tiny grip = drift. A vehicle
  collides as 1–3 circles; the same circles are in `world.collision.dynamic` (marked
  `kind: 'vehicle'`, with `vx vz speed owner`) so people and Shoumik bump into vehicles and
  pedestrians can read traffic without importing anything.
- **Roads** (`game.world.roads`): junction `(c, r)`, direction `d` 0=N 1=E 2=S 3=W.
  `exits(c, r)`, `segment(c, r, d, offsetLeft)`, `signalGreen(c, r, d)`, `route(c0, r0, c1, r1)`,
  `nearestSegment(x, z)`, `nearestJunction(x, z)`, `jamAt(x, z)`, `busStops`. Left-hand traffic:
  a lane is `offset` metres to the LEFT of the direction of travel.
- **AI** (`driver.js`): `driver.attach(v, c, r, d, { route?, stopU?, cruise? })` then
  `driver.update(v, dt)` every frame → `'ok' | 'arrived' | 'stuck'`. Without a route it wanders.
  The path is a list of straight "legs" (segments + sampled junction curves) followed by
  aiming at a point a little ahead.
- **New vehicle type**: add a block to `data/vehicles.json → types` with an existing `style`,
  then add it to a `mix` in `data/traffic.json` / `parked.mix`. A new `style` = a builder
  function in `modelsCars.js` / `modelsSmall.js` + one line in `BUILDERS` (`models.js`).
- **Real 3D bodies** (`realModels.js`): types with `model` in `data/vehicles.json` get a GLB body
  on the qualities in `realModels.useOn`. `acquireFleet` waits for them (`loadVehicleModels`),
  then `VehicleLibrary.get()` builds body + wheel layout per paint colour: meshes named *Wheel*
  are dropped and become the wheel layout; the rest is merged with vertex colours (`paint`,
  `second`, `colors` per material name), turned so the 'Headlights' are at +z, and fitted to
  `size` (width and length exactly). New model = file in `assets/vehicles/`, id in
  `data/assets.json`, `model` block on the type. Check with `node tools/vehicle-shots.js --only gallery`.
- **Ramps** are part of the ground: `world.heightAt()` already includes them.
- **Particles**: `game.fleet.fx.emit('smoke' | 'fire', { x, y, z, vx, vy, vz, life, size: [from, to], color })`.

## 12b. Graphics: how the look is made (Session 4.5)
- `src/world/graphics/index.js` — `Graphics` (owned by `Game` as `game.graphics`). Sets tone
  mapping, overrides sun/sky light strength, builds the sky reflection map
  (`scene.environment`, used by every MeshStandardMaterial: the water now, GLB models later),
  and each frame calls `update(dt, focus)` + `render(dt)`. **Never call
  `renderer.render(scene, camera)` directly** for the main view — use `game.graphics.render()`
  so bloom and grading run. (Tools do the same.)
- `postfx.js` — EffectComposer: RenderPass → UnrealBloomPass → OutputPass (tone mapping +
  sRGB) → grade ShaderPass. Only on qualities with `postfx: true`.
- `shadows.js` — one shadow map that follows the player, snapped to texels. Every lit,
  opaque mesh is flagged automatically twice a second; ground and water only receive. Set
  `mesh.userData.noCastShadow = true` to stop something casting. The shadow sun is never lower
  than `shadows.minElevation` (the visible sun can be lower).
- `glow.js` — `markGlow(material, 'glow'|'sign'|'marker')` makes an unlit material brighter
  than white so it blooms. Use it for any new neon, lamp or screen material.
- Renderer counters (`renderer.info`) are reset once per frame by Graphics (several passes).
- Look check: `node tools/look-shots.js --three <three dir> --out shots --quality medium`.

## 12c. Classes, money and shops (Session 5)
- **Class Mode** opens on `entrance:enter { id }` (id = institute). Screens are HTML strings
  (`classes/screens.js`) with `data-act` buttons handled in one click handler (`classes/index.js`).
  Language is FIXED per screen: `L = lesson.language || ui.questionLanguage` and every text goes
  through `tl(L, key)`, numbers through `numIn(L, n)` / `moneyIn(L, n)` — never `t()` or
  `formatMoney()` there (they follow the game language). Font: `.class-mode .panel` uses
  `var(--font-bn)`.
- **Money rules** are all in `classes/progress.js`: per-question pay-once (`paid` ids), attempts
  counted at start (`beginLesson`), Quiz Class streak/daily/cap. Change numbers in
  `data/lessons.json → defaults` and `data/economy.json → quizClass`, not in code.
- **Timer** uses real time (`setInterval` + `performance.now`) because the game loop is paused
  while an overlay is open.
- **Shops**: `data/shops.json` (places, stock, food heal, homes) + `data/economy.json → prices`.
  `catalog.js` turns a buy into events (see the table). New shop kind = a case in
  `Catalog.nameOf / stateOf / buy` + a colour in `shops.json → kinds`.
- **Health** lives in the player feature (`game.player.health`, `save.data.health`, null = full);
  `player:hit` lowers it but never below `data/player.json → health.minFromHits` — Session 6
  should drop that floor and add knock-out / hospital.
- **Homes**: `save.data.home = { id, x, z }` (set when sleeping) and `save.data.garage` (used by
  `spawnOwned` in the vehicles feature). The player spawns at home only when the saved position
  is unusable — Session 6 should use `save.data.home` after being busted / knocked out.

## 12d. Weapons, crime, police, jail (Session 6)
- **Targets** (`src/core/targets.js`, `game.targets`): anything shootable registers
  `{ kind, x, y, z, r, h, police?, bleeds?, priority?, onHit(info) }` and moves it itself;
  `onHit` returns `'killed'` or `'hit'`. Pedestrians, officers and the helicopter do this.
  Weapons find hits with `targets.raycast()` (bullets), `bestInCone()` (phone aim assist) and
  `within()` (molotov fire). Vehicles are hit through `game.fleet` (their collision circles).
- **Combat effects** (`game.combatFx`, `acquireCombatFx(game)`): `blood`, `pool`, `tracer`,
  `flash`, `spark`, `fire`; blood obeys `save.data.settings.blood`.
- **Weapons feature** owns `save.data.ammo` and `save.data.weapon`, sets `game.player.weapon`
  (`null` = fists, the player's own punch code then runs) and `game.player.aimHeading` (he faces
  that way while aiming). Models go in his hand with `game.player.hand.attach(obj, grip)`
  (`hand.kind` = 'glb' uses `weapons.json → grips`, 'low' uses `lowGrips`). New weapon = an entry in
  `data/weapons.json → weapons` (+ `order`, + a price) with an existing `type`; a code-built model =
  a builder in `weapons/models.js → BUILDERS`. Melee swings reuse `player:attack` (with `damage`,
  `weapon`, `power` 3 = knock down).
- **Crime feature**: heat → stars; `wanted:changed { stars, seen }`; stats in `save.data.stats`.
  New crime = a key in `data/economy.json → wanted.crimes` + `crime:committed { type }`.
- **Police feature**: per star level `data/police.json → levels` (foot, armed, swat, cars,
  roadblocks, helicopter). Officers are drawn by the shared crowd (archetypes in police.json, extras
  `gun`, `vest` in `looks.js`). Police pickups have `driver = 'police'` and `tags.police` (traffic
  ignores them; boarding treats them like jacking). Sight (`police:sight`) 4× a second with
  `collision.raycast`. Busted = `player:busted`.
- **Jail feature**: `createOverlay(..., { escape: false })` (Esc cannot leave jail); questions come
  from every active lesson; the jail screen is drawn in a fixed language with Bangla digits
  (CLAUDE.md quiz rule). Release spot = a free sidewalk corner of a place's junction (`placeSpot`).
- **Player**: health has no floor any more; 0 → `player:died`. Armour in `game.player.armour`.
- Headless tests run game time slower than real time (frame time is capped at 50 ms): wait for
  events (e.g. `waitForFunction`) instead of fixed sleeps when checking timers.

## 12e. Day/night, rain, sound and the polish features (Session 7)
- **Sky** (`world/sky.js`): `enableCycle(renderer, skies)` paints the day and night skies (same
  painter as the sunset) and patches the dome material to blend 3 textures (`setSkyMix(day, sunset,
  night)`, `setTint(colour, mix)` for rain). `setSunDirection()` moves the disc, `setSunScale()`
  (moon). **Graphics** gained `setSunDirection` (shadows: `SunShadows.setDirection`),
  `refreshEnvironment()` (re-render the reflection map — dayNight does it every 25 s),
  `setBloomStrength`, `setExposure`. `glow.js → setGlowLevel(k)` scales every `markGlow` material.
- **dayNight** owns the lights/fog/exposure every frame. Others must NOT set `sky.sunLight`,
  `hemi`, `ambient`, `scene.fog` or exposure directly — send an event to dayNight instead (rain
  does: `weather:changed`). Its look is all in `data/dayNight.json → keys` (blended with smoothstep).
- **City shading** (`world/cityShading.js`, `game.world.cityShading`): `onBeforeCompile` patches on
  the shared facade, ground and sign materials (world position varyings). Windows: the lit areas
  per facade tile are `WINDOW_RECTS` (UV rectangles measured on `assets/city/facades.jpg` — update
  them if the facade atlas is re-baked with different window positions). `setWindows`,
  `setSigns`, `setWet`, `setCut(rect)`, `patchCut(material)` for any other glowing material that
  must go dark during load-shedding.
- **Signboards** (`world/signboards.js`): `SignAtlas` (one canvas for all names, an emissive copy
  with just the letters). `meshBuilding(…, signs)` adds a face per shop board into a 3rd GeoBuilder
  per chunk (one extra draw call per chunk). The sign choice is a hash of building seed/bay/side,
  so the city's Rng sequence (and look) is unchanged.
- **Audio** (`src/audio/`): use `game.audio.play(id, { x, z })` for one-shots (positional = level +
  stereo pan from the camera) and `game.audio.loop(id, bus)` → `{ set(level, pan), setRate, stop }`
  for beds. New sound = an entry in `data/audio.json → sounds/loops` with an existing `kind`, or a
  new recipe in `synth.js`. A real file = `data/assets.json → "sound.<id>"` (type sound) — played
  instead of the recipe, no code change (horns: `sound.horn.<kind>`). The boombox and horns now use
  the shared context (music / sfx buses). Settings → `audio.applySettings()`.
- **Radio**: `RadioMusic` is a 16-step sequencer per style (pop / folk / synth). Real tracks:
  add sound assets and list their ids in `data/radio.json → stations[].tracks`.
- **Shared read-only state** added: `game.clock { hour, night }`, `game.weather { rain, wet }`,
  `game.rewards { list(), lessonsDone(), copy() }`.
- **Settings → reset** calls `save.wipe()` (keeps settings + `flags.ageOk`, blocks later writes) and
  reloads the page.
- **Age gate** skips itself with `?autostart=1` (all test tools) unless `&agegate=1`.

## 12f. Release: offline app, automatic quality, pages (Session 8)
- **Service worker** (`sw.js`, registered by `src/core/pwa.js`): its settings are passed in its own
  URL (`sw.js?cfg=<data/pwa.json as JSON>`), so any change to `data/pwa.json` makes browsers
  install the new worker; `skipWaiting` + `clients.claim` → it takes over at once. Strategies:
  our HTML/JS/CSS/JSON = **network first** (8 s timeout → offline copy); our big files
  (`heavyExtensions`) = offline copy first + background refresh; `cacheFirstHosts` (three.js CDN,
  version-pinned) = offline copy only; `staleHosts` (Google Fonts) = copy first + refresh;
  everything else (YouTube, Google Sheets) is not touched. Old caches (other `cacheVersion`) are
  deleted on activate. **Releasing needs no version bump** — merge to main and players get the
  new code on their next online launch. Bump `cacheVersion` only to wipe every offline copy.
  A file that a Low player never loads (e.g. a Medium-only GLB) is not in their offline copy; the
  game's normal fallbacks (code-built models) cover that offline.
- **Install**: `beforeinstallprompt` is caught in `pwa.js` (imported at boot) → Settings → App
  shows the Install button (`pwa.install()`), else an iPhone hint (Share → Add to Home Screen) or
  the Chrome-menu hint. Icons: `assets/icons/*` from `tools/make-icons.js` (replace freely,
  same names/sizes). Manifest: fullscreen, landscape.
- **Automatic quality**: `Game.pickQuality()` → `?quality` > saved quality > device guess
  (`src/core/deviceCheck.js`, rules in `data/performance.json → weakDevice`: RAM, cores, slow GPU
  names) > `quality.json → default`. `save.data.settings.qualityAuto` is true while the game chose;
  only then does the `autoQuality` feature measure real FPS (after `warmupSeconds`, every
  `sampleSeconds`) and step High → Medium → Low, then lower `settings.resolutionScale` on Low
  (multiplies the pixel ratio in `Game.applyQuality`). A player's choice in Settings
  (`setQuality(name)` without `{auto:true}`) switches this off and resets the resolution.
  Both settings fields are filled in by `save.load()` defaults (no save-format bump needed).
- **Performance knobs added**: `quality.json → environmentRefreshSeconds` (Low 75 s: the PMREM
  sky-reflection refresh is the biggest periodic hitch). Everything else per level was already
  in `quality.json` (see its `_comment`).
- **Lost WebGL context** (phone reclaimed GPU memory): `Game.watchContextLoss()` saves, pauses and
  shows `src/ui/contextLost.js` (Reload button; optional auto reload:
  `data/performance.json → contextLostReloadSeconds`).
- **Privacy / Credits**: `privacy.html`, `credits.html` → `src/pages/page.js` loads `ui`,
  `strings`, `links`, `pages` (+ the save, read-only, for the language), fonts through `fonts.js`,
  and draws `data/pages.json`. `?lang=bn|en`. Linked from Settings → App. When the game starts
  collecting anything (leaderboards, analytics) update `data/pages.json → privacy` FIRST.
- **Publishing**: `docs/DEPLOY.md` (GitHub Pages from `main`, root folder; merge the session
  branch with a pull request).

## 12g. Accounts, the Google Sheet, map, earn, health (Update 9)
- **Boot** (`src/main.js`): `loadSome(ui, strings, game, economy, sheet, accounts)` → `account.init`
  → fonts → if nobody is signed in: `showSignIn()` (or the test account with `?autostart=1`) →
  `prepareSave()` (first account adopts the old `breakingCity.save`; a newer save from the sheet
  wins) → `save.load(gameCfg, economyCfg, account.saveKey(...))` → `content.configureSheet()` →
  content → `game.account = account` → Game.init → `account.startSync(save, game)`.
- **`src/core/account.js`** (`game.account`): `current { phone, name, classLevel, token }`,
  `signUp / signIn / signOut / syncNow / startSync`, local store `breakingCity.accounts` (salted
  SHA-256 of the PIN). With `data/sheet.json → apiUrl` it POSTs `text/plain` JSON (no CORS
  pre-flight) to the Apps Script: `signup`, `signin`, `save`. Error codes → `account.error.*` strings.
- **Apps Script** `tools/sheets/Code.gs` (owner deploys; steps `tools/sheets/README.md`). Test it
  without Google: `node tools/sheets/test-code-gs.js tools/sheets/Code.gs` (fake SpreadsheetApp) —
  run it after any change to the script. Players tab columns are `PLAYER_COLS` in the script.
- **Content from the sheet**: `src/content/adapters/SheetApiAdapter.js` (one GET `?action=content`
  for all types, memoised). A content file opts in with `"source": { "type": "sheetApi" }`
  (`lessons.json`, `products.json`); the URL lives only in `data/sheet.json`. Column mapping:
  `mapClassRows` (Classes + Questions → lessons with `thumbnail`, `description`, question `topic`)
  and `mapProductRows`. New tab = add it to `doGet` in Code.gs + a mapper + a content type.
- **Products** (`validateProducts`): `catalog.price(kind, id)` / `nameOf()` use the sheet row first.
  A brand-new item id still needs code/data (vehicles.json, weapons.json…) before its row works.
- **Map** (`src/features/minimap/`): `cityMap.js` paints the city once (shared), `index.js` = the
  minimap + blips + institutes, `bigMap.js` = full map overlay (own rAF loop because the game is
  paused), `route.js` = BFS route over `roads.route()` junctions. Look: `data/mapView.json`.
- **Shops** (`src/features/shops/`): `preview.js` price card; `itemButton` shows "need ৳X more"
  (`data-earn`); `onWeaponEmpty` → `route:set` + `earn:offer`. A shop can have its own `icon`.
  Kind `health` heals `share` of max health (`data/shops.json → health`).
- **earn** (`src/features/earn/`): offer panel + `landing.js` (fixed Bangla, Bangla digits;
  YouTube is a plain `<a target=_blank>` — never an iframe).
- **healthPacks**: two InstancedMeshes, seeded placement on junction corners, `player:heal { share }`.
- **Update 9b**: death = new session (`jail/index.js → newSession`, `economy.wasted.fee/respawn`);
  after bail / jail / death `setFree()` sends `police:standDown` + `wanted:amnesty { bail.freeSeconds }`.
- **Starter**: `data/economy.json → starter { weapon, ammo }` is put into `defaults()` in `save.js`.
- **Tests**: `node tools/session9-check.js --three <dir> --out <folder>` (mocks the web app). Run it
  after touching accounts, sheet, map, shops, earn, health packs or the HUD/profile.
- Privacy text (`data/pages.json → privacy`) now describes accounts — update it before collecting
  anything new.

## 12h. Street look (Roadmap 2, Session 1)
- **Plan first, meshes later.** `World.init` creates `world.street = new StreetDressing(world)`
  right after the shared materials and BEFORE `buildColliders` and any chunk: `StreetPlan`
  (`street/plan.js`) adds `piece.street = { lamp, lampDouble, bench, bin, dumpster, transformer,
  cone, barrier, fence, scaffold, net }` lists (items `{x, y, z, rot, sx?, sy?, tint?}`, `rot` =
  heading, model +z faces that way), pushes extra street trees into `piece.content.trees`, marks
  `building.construction = true`, plans footbridges and collects `plan.colliders`. It uses its own
  `Rng(hashInts(seed, i, j, 7001))` — never the block's Rng, so the city does not change.
- **Drawing** (`chunks.js` → `street.buildChunk(pieces, quality)`): all small kinds are baked into
  ONE merged geometry per chunk with the shared prop material (`mergeItems`), lamp bulbs into one
  more with `street.materials.bulb`, light pools are one InstancedMesh (`materials.pool`, additive,
  no fog), scaffold cells and nets are InstancedMeshes (nets: see-through `netMaterial`).
  `quality.propDensity` thins benches, bins and containers. Footbridges are Kit-built groups
  (`footbridges.js`) hidden beyond view distance + `viewMargin`.
- **Night** (`features/streetLights/`): every frame reads `world.cityShading.windows` (0 day → 1
  night, set by dayNight) and sets the bulb / pool intensity; on Medium/High it moves
  `quality.streetLights` PointLights to the nearest bulbs (`street.heads`, a flat xyz array)
  twice a second. The lights always exist (intensity 0 by day) so shaders compile once.
  Bulb and pool materials are `cityShading.patchCut` → dark during load-shedding.
- **Footbridges** (`footbridgePlan.js`): roads between two ordinary blocks, not under a viaduct
  path (`data/landmarks.json → viaducts[].path`), not at a stunt ramp or bus stop; the deck starts
  `fromPole` m after the middle electric pole so the stairs (along the kerb, 0.1–1.3 m from it)
  end before the next pole; small props and trees in that strip are removed; stairs are solid
  colliders. They are decoration for now — `heightAt` does not know them (a car under the deck
  would otherwise be lifted onto it). Making them walkable needs a height that depends on the
  current height (see NEXT.md).
- **More signboards** (`buildingMesher.js → extraSigns`): upper-floor and rooftop boards use
  `signs.atlas.pick(seed, 200|300 + bit, bit)` and `hashInts` chances (no Rng calls).
  Settings: `data/signboards.json → upper, roof`.

## 12i. Fast start + streaming (Roadmap 2, G1)
- **Boot prefetch** (`src/core/streamer.js`, made in `main.js`): the moment `config.loadAll()`
  finishes — before sign-in — `assets.configure()` runs and `streamer.prefetchBoot(quality)`
  starts every `data/streaming.json → boot` download (quality guessed from `?quality=` or the
  weak-device check). Later `assets.load(id)` calls get the same promise, so nothing downloads
  twice and nothing waits in a queue.
- **Features load in parallel**: `features/index.js` imports every feature module at once, then
  runs `init()` in the LOADERS order (order still matters for init and update).
- **modulepreload**: `index.html` lists every code file + the three.js add-ons used at boot
  (generated by `tools/make-preload.js`).
- **After the start** (`features/streaming/`): `afterStart` ids are fetched one or two at a time
  while FPS ≥ `idleFps`; `areas` groups `{ id, at:[col,row], radius, assets:[ids] }` are fetched
  when Shoumik is within `radius`, then `stream:loaded { group }` is sent. **New areas from
  Roadmap 2 S3/S7–S10 must register their models as an `areas` group** and build their meshes
  when that event arrives (or show a code-built stand-in until then).
- **Real trees** (`world/props.js → buildRealTrees`): per chunk one InstancedMesh per tree kind
  (kind = hash of the spot, weights per district, `data/world.json → props.tree.models`), only on
  qualities with `realTrees`; `chunks.js → treeDetail()` shows them in chunks closer than
  `nearDistance` and the simple trees elsewhere. `treeShadows` (High only) lets them cast shadows.
- Measured with `tools`-style throttling (8 Mbps, 80 ms): start → playing Low 11.7 → 7.5 s,
  Medium 20.5 → 13.0 s (headless software rendering; real phones draw faster).

## 12j. More cars and weapons (Roadmap 2, Session 2)
- New vehicle types (data/vehicles.json): `hatchback`, `pickup`, `microbus`, `truck`, `luxury`,
  `police_jeep`, `army_truck` — Kenney models on Medium/High, code-built bodies (style car /
  pickup / van) on Low. Prices `data/economy.json → prices.vehicles`; showroom stock
  `data/shops.json`; traffic weights per district `data/traffic.json → mix`.
- Police cars are picked from `data/police.json → car.types` (pickups and jeeps).
- Weapons (data/weapons.json): `knife` (melee, code-built), `heavyPistol`, `uzi`, `combatShotgun`,
  `carbine`, `bullpup`, `marksman` (Ultimate Gun Pack models already in assets/weapons),
  `grenade` (type throw, `fuse` seconds) and `launcher` (type gun with `projectile: true`: fires a
  shell through `throwing.js → launch()` that explodes on contact). Blast numbers:
  `blastRadius / blastDamage / blastVehicleDamage`.
- Explosions: `throwing.js → explode()` calls `fleet.blast(x, y, z, radius, damage, by)` (new:
  `damage.js → fireball() + blast()`, also used by exploding vehicles), sends `explosion { by:
  'player' }` (people / police / Shoumik react as before) and `crime:committed { type:
  'explosion' }` (heat in `data/economy.json → wanted.crimes.explosion`).
- Products tab rows for the new items: `tools/sheets/products-roadmap2-s2.csv` (paste into the
  sheet; the game sells them anyway — the sheet only overrides names / prices / pictures).
- Test: `tools/crime-check.js` now buys a knife, throws a grenade and fires the launcher.

## 12k. Bigger world (Roadmap 2, Session 3)
- **`world.terrain`** (`src/world/terrain/index.js`, made in `World.init` right after the road
  net, only when `data/terrain.json → enabled`). It sets `layout.openCity` (no city-limit
  walls; `groundMesher.js` draws a kerb face instead) and `layout.openEdges` (`"i,j,S"` = the
  bridge gap in the river railing). `Terrain.init(collision)` builds tiles, props, highways,
  bridge, backdrop and colliders (edge of the land, sea strips, river with the bridge gap,
  bridge parapets, ponds); `World.buildColliders` skips the old city-limit / river boxes.
- **`TerrainField`** (`field.js`, pure maths): `sample(x, z)` = height + colour + plot weight +
  prop class; layers: zones (fields / desert / coast, blended) → flat near the city → outer
  mountains → highways (flattened to the smooth mountain height) → ponds → beach + sea → river.
  `groundAt` interpolates the SAME grid as the mesh (cell 8 m, diagonal b–c), so feet and
  wheels sit exactly on the drawn ground. `deckAt` = the bridge deck. `zoneAt` names,
  `mapColor` for the map, `routeVia` for the GPS, `X(col)/Z(row)` junction units → metres.
- **Heights**: `world.heightAt` = layout + ramps + `terrain.heightAt` (0 inside the city).
  `world.terrainAt` = the land only: vehicles add it UNSMOOTHED next to the ramp height and it
  never launches them (`physics.js → followGround`); `fleet.js` tilts cars with it outside the city.
- **Tiles** (`tiles.js`): 192 m tiles, fine grid within `farDistance`, coarse beyond, skirts
  hide cracks, built in a 4 ms budget per frame. Shared material = Lambert + `onBeforeCompile`
  patch: per-pixel paddy plots with bunds where the `aField` attribute is > 0.
- **Props** (`props.js`): seeded per tile, only tiles within `props.nearDistance`; one
  InstancedMesh per kind for all near tiles; kinds = child meshes of `assets/nature/outskirts.glb`
  (repack: `pack-props.js --recipes tools/terrain-kit/outskirts.json --kit "<Nature Kit>/Models/GLTF format" --out assets/nature/outskirts.glb`,
  then `compress-models.js`), `tree:<kind>` from trees.glb, and `umbrella` (code). New kind =
  recipe + an entry in a zone list of `data/terrain.json → props`. Colliders for the kinds in
  `props.colliders`, added once per tile.
- **Streaming**: the props wait for `stream:loaded` of a group whose id is a zone id
  (`data/streaming.json → areas`). New countryside model files: add them to those groups.
- **Water** (`water.js`): `extra` from `terrain.waterShapes()` (sea quad, river x range, pond discs).
  City pond parks: `p.pond` rect (layout.js) → water quad, collider, grass ring + stone rim.
- **Far mountains** (`backdrop.js`): a ring centred on the camera (like the sky dome), low over
  the sea; coloured from `scene.fog.color` each time it changes.
- **Map**: `paintCityMap(layout, cfg, terrain)` covers the whole land; the canvas origin is
  `city.ox / city.oz` (no more `L.minX + margin`). Countryside blips: `minimap/index.js →
  countrysideBlips` (group `outskirts`).
- For S7 (boats): the sea collider strips are in `Terrain.addColliders`; water level
  `data/world.json → water.level`; `field.shoreX(z)`, `field.river`, `field.ponds`. Boats should
  ignore those colliders and use `field.sample(x, z).h < water.level` as "deep enough".

## 13. Notes for the next sessions (historical)
- **Session 4 is done** (the old notes below are kept for reference).
- **Session 5 is done** (notes below kept for reference).
- **Links (2026-11-19):** `data/links.json` now has both brands' YouTube, Facebook and Instagram
  (`breakingSchool*` = SSC, `breakingBiology*` = HSC); TikTok and enroll links are still empty.
  Use them on the Session 8 credits page.
- **Session 7 is done.** For Session 8: the service worker must cache `src/audio/`, `src/ui/vibe.css`
  and the new data files (`audio`, `dayNight`, `weather`, `radio`, `profile`, `signboards`,
  `rewards` — rewards is content: network-first like lessons/posters). The painted day/night skies
  cost two 1024×512 textures + one PMREM refresh every 25 s — on weak phones (auto Low) consider
  `environmentRefreshSeconds` 60+ and fewer rain drops. The age gate already blocks the game until
  answered; the privacy page should mention that nothing is sent anywhere (save is local).
- **Session 6 is done.** For Session 7 (done, kept for reference): the profile card can read `save.data.stats`
  (kills, policeKilled, carsDestroyed, longestChase seconds, busted, wasted, shotsFired) and should
  listen to `stats:changed`; Blood On/Off already exists in settings (keep it there); gunshot,
  siren and explosion sounds should listen to `weapon:fired`, `vehicle:horn { kind: 'siren' }`,
  `explosion`; the 17+ age screen should appear before the first gun is used too.
- **Session 6 (weapons):** owned guns are in `save.data.owned.weapons` (ids from
  `data/weapons.json`); the weapon shop already sells them (`weapon:owned`). Give them names in
  strings and use the `Q` / অস্ত্র button to cycle owned guns. Jail: Lesson Check/Quiz Class can be
  reused for "study to earn bail" — open Class Mode with `classes.open({ id })`.
- **Session 5 (classes, historical):** listen to `entrance:enter { id }` (`breaking-school` /
  `breaking-biology`) to open Class Mode; the entrances feature shows a "coming soon" note only
  while `game.features.get('classes')` is null. Markers are in `world.landmarks.markers`.
  Shops can be landmark blocks too (a new builder + a `landmark` on a place).
- **Session 4 (landmarks, historical):** reserve space by adding an entry to `areas` in
  `data/districts.json` (type `plaza`/`park`), exactly like `sangsad-grounds`. `data/places.json`
  already exists (id, name, junction col/row, ride) and is loaded by the vehicles feature through
  the Content Service — extend those rows with landmark fields rather than starting a new file,
  and move a place's junction if the landmark ends up elsewhere (ride stands follow). Two ramps
  stand on the Sangsad plaza edges (`data/world.json → ramps`): move them if the building needs
  the room. Poster slots: bus shelters are in `world.roads.busStops` (`sx, sz, heading`), a
  rickshaw's back panel is the child mesh named `art-panel`, buses have `T.backPanel`. MRT
  pillars / flyovers in the middle of a road must leave the lanes (1.7 m and 4.4 m from the
  centre line, vehicles up to 2.5 m wide) clear, or add colliders — AI drivers do not look for
  static obstacles.
- **Session 5 (shops):** sell a vehicle by sending `vehicle:grant { type, color }` after the
  payment; owned vehicles park at `data/vehicles.json → garage` — when homes exist, make that
  the home's garage position (see `spawnOwned` in `features/vehicles/index.js`).
- **Session 5 (shops):** sell outfits by setting `unlocked: false` in `data/outfits.json`
  and pushing ids into `save.data.owned.outfits`; then `outfit:set`.
- **Session 6 (police, weapons):** listen to `crime:committed` (carjack, hitPedestrian) for wanted
  stars. Police vehicles: `fleet.create('police_pickup', …)`, then drive them by writing
  `vehicle.input` (chase = steer at the player; `driver.js` only follows roads). Bullets and
  blasts hurt vehicles with `fleet.damage(v, hp)`; send `explosion` for molotovs. Shoumik's health
  should also listen to `vehicle:exploded` and to `player:hit` (power up to 3 from vehicles).
  `melee`, `aim`, `shoot`, `down`, `hit` animations are ready;
  pedestrians have `hp` and a `knockDown` — add death and blood there. Player health should
  listen to `player:hit`.
- **Session 7:** replace `hotspots/boombox.js` with real tracks; it already obeys
  `save.data.settings.sound === false`. `Sky` already holds every light/fog/sky colour in one place for day/night;
  `setLanguage()` and the `language:changed` event already work; settings panel lives in
  `src/features/settings/`.
- Known rough edges are listed at the end of `docs/CHANGELOG.md`'s Session 1 entry.

## 14. Roadmap (after the release)
Ordered by value for the owner. Each is one or a few daily prompts.
1. **Lessons from a Google Sheet** — `GoogleSheetCsvAdapter` + `mapSheetRowsToLessons` already
   exist and are tested; the owner publishes two tabs as CSV and sends
   `Connect lessons to the Google Sheet. Lessons CSV: <url>. Questions CSV: <url>.` Then set
   `data/lessons.json → source.type` to `"googleSheet"` and fill in the two CSV URLs. Same pattern later for posters
   (add a poster mapper) and reward codes.
2. **Real phone tuning** — once the owner reports FPS from their phone (`?debug=1`), tune
   `data/quality.json` / `data/performance.json` (weak GPU list, thresholds). Ideas: a
   "Medium-lite" level (bloom, no shadows), simpler far chunks, compressing `shoumik.glb`
   (meshopt/quantised keys, 4.2 MB → ~1.5 MB), hosting three.js in `/vendor/` (needs the
   owner's OK — tech rule says CDN).
3. **Android app (Capacitor)** — wrap the same static files: `npm create @capacitor/app`, copy the
   repo into `www/`, `npx cap add android`, set landscape + fullscreen in `AndroidManifest.xml`,
   open external links with the Browser plugin (keep the YouTube rule), build an AAB for the Play
   Store (17+ rating: violence). The service worker is not needed inside the app (files are local).
4. **PC polish** — key rebinding menu, gamepad support, mouse sensitivity slider, a pause menu
   on Esc, higher "Ultra" quality level for desktop GPUs.
5. **Better models** — Shoumik outfits on the GLB (texture recolour per outfit), rigged NPCs that
   share Mixamo clips, real rickshaw/CNG models from a licensed pack (record in
   `assets/CREDITS.md`), landmark details.
6. **Online save + leaderboards** — Update 9 added accounts + online save through the Google
   Sheet (§12g). Leaderboards can read the Players tab (cash, lessons_done). For many thousands of
   players move to Supabase (free tier): anonymous auth, a `saves` table keyed by
   user, a weekly "Top student" board from Lesson Check results (server-side checks before any
   real prize). Needs: a privacy page update first, a consent screen, and an owner-approved
   data plan. Keep localStorage as the offline save and sync on top (merge by `updatedAt`).
7. Smaller ideas live in `docs/NEXT.md`.

