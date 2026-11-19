# Handoff — how Breaking City is built (v4, after Session 4)

For the next Claude session. Read `/CLAUDE.md` first (rules), then this file, then
`docs/GAME_SPEC.md` (what exists) and `docs/CHANGELOG.md` (what changed last).

## 1. Run and test
- No build step. Any static server from the repo root works: `python3 -m http.server 8000`
  → `http://localhost:8000/?debug=1`.
- URL flags: `?debug=1` (FPS panel, logs, `window.BC` = the Game object), `?autostart=1`
  (skip the Tap-to-start button), `?quality=low|medium|high`, `?touch=1` (show touch controls
  on a computer).
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

## 2. Boot order (`src/main.js`)
1. `config.loadSome` (ui, strings, game, economy) → `save.load` → `initI18n`
2. `loadFonts` + `config.loadAll` (all other `data/*.json`)
3. `assets.configure` + procedural placeholder textures registered
4. `content.loadAll()` (lessons AND places through the Content Service — the layout needs places)
5. `new Game(canvas).init()` → renderer, `World` (layout with landmark plots, ramps, landmark
   plan, roads, materials, sky, water, chunks, collision, then landmark meshes — async, they
   wait for the fonts), `Input`, `ChaseCamera`, features, first chunks built
6. autosave starts → "Tap to start" → `game.start()` (frame loop)

Feature order (`src/features/index.js`): traffic → vehicles → player → pedestrians → hotspots →
posters → metro → entrances → the rest. The
`vehicles` feature steps the shared fleet (physics) and then puts Shoumik on his seat, so it must
run before `player` draws him; `traffic` only sets the AI's pedals and wheel before that.

Frame order (`Game.frame`): input → camera look → `features.update(dt)` → `crowd.update()` → camera →
`world.update` (chunks, water, sky) → render → input end-of-frame → debug panel.

## 3. Folder map
```
index.html                 import map (three@0.170.0 pinned), canvas, loading + rotate screens
src/main.js                boot
src/core/   events.js      event bus            config.js   loads data/*.json
            save.js        versioned save       economy.js  wallet → cash:changed
            game.js        renderer + loop      input.js    keyboard/mouse/touch state
            rng.js         seeded random        debug.js    ?debug=1 panel + log
src/content/ ContentService.js, validators.js, csv.js, adapters/{LocalJson,GoogleSheetCsv}Adapter.js
src/assets/  registry.js (asset ids + overrides), proceduralTextures.js (atlases)
src/world/   layout.js (piece grid) → blockgen.js (buildings/poles/trees DATA)
             geoBuilder.js, buildingMesher.js, groundMesher.js, props.js  (DATA → geometry)
             chunks.js (build/show/hide/unload), collision.js, water.js, sky.js, world.js (glue)
             roads.js (road graph: junctions, lanes, signals, routes, bus stops), ramps.js
  landmarks/ index.js (plan + build + cull), kit.js (modelling toolbox), signs.js (name-board
             atlas), civic.js campus.js oldDhaka.js modern.js (one builder per landmark),
             viaduct.js (MRT / flyover deck, pillars, stations, ViaductPath)
src/entities/ chaseCamera.js
  vehicles/  fleet.js (all vehicles; step + draw) vehicle.js physics.js damage.js driver.js (AI)
             models.js modelsCars.js modelsSmall.js shapes.js (VBuilder)
  effects/   particles.js (smoke / fire puffs)
  people/    skeleton.js (pose format, bones) animLocomotion.js animActions.js animator.js
             shapes.js (loft/ellipsoid helpers) partGeometry.js looks.js crowd.js (instancing)
  shoumik/   model.js head.js body.js faceTexture.js
src/features/ index.js (registry) + player/ (index.js, actions.js) pedestrians/ (index.js,
             navigation.js, brain.js, bubbles.js) hotspots/ (index.js, props.js, boombox.js)
             touchControls/ hud/ minimap/ settings/
             vehicles/ (index.js, boarding.js, rides.js, parked.js, horn.js) traffic/ (index.js, shelters.js)
             posters/ (index.js, slots.js, frames.js, library.js, schedule.js, vehicles.js)
             metro/ (MRT trains)  entrances/ (glowing markers at Breaking School / Biology)
             pedestrians/roadSense.js (people vs vehicles)
src/ui/      fonts.js, i18n.js, loading.js, styles.css
data/        every tunable number and all content
tools/       smoke-test.js, character-shots.js, vehicle-shots.js, landmark-shots.js, poster-check.js
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
| `quality:changed` | `{ quality }` | Game |
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
| `danger:raised` | `{ x, z, radius, source }` people nearby flee — **send this for gunshots, crashes, explosions** | pedestrians (later crime/vehicles) |
| `prompt:show` / `prompt:hide` | `{ id, key, vars? }` / `{ id }` one-line hint at the bottom of the HUD | anyone → hud |
| `hotspot:entered` / `hotspot:left` | `{ id }` | hotspots |
| `vehicle:entered` / `vehicle:exited` | `{ id, type, jacked?, passenger }` | vehicles |
| `vehicle:driverEjected` | `{ x, z, heading, archetype, angry, flee }` a driver is now on foot | vehicles, traffic → pedestrians |
| `vehicle:crashed` | `{ id, x, z, speed }` | fleet |
| `vehicle:burning` / `vehicle:exploded` | `{ id, x, z }` / `{ id, type, x, z, radius }` | fleet |
| `explosion` | `{ x, z, radius, power }` — **send this for any blast** (people nearby fall) | fleet (later weapons) |
| `vehicle:horn` | `{ id, x, z, kind, ai }` | vehicles, AI drivers → vehicles (plays it) |
| `vehicle:grant` | `{ type, color? }` Shoumik now owns a vehicle | *shops (Session 5)* → vehicles |
| `crime:committed` | `{ type: 'carjack' \| 'hitPedestrian', x, z }` | vehicles, pedestrians → *police (Session 6)* |
| `ride:started` / `ride:ended` | `{ type, place, fare }` / `{ type, place, arrived }` | vehicles |
| `traffic:adopt` | `{ id }` take over a vehicle that has a driver | vehicles → traffic |
| `controls:mode` | `{ mode: 'driving' \| 'onFoot' }` | vehicles → touchControls |
| `wanted:changed` | `{ stars }` | *listened to by hud; police feature will send it* |
| `lesson:completed` | *(Session 5)* | classes |
| `input:open` | – (F key) open the poster being looked at | Input → posters |
| `poster:opened` | `{ id, slot, link }` | posters |
| `metro:arrived` | `{ line, station }` a train stopped at a station | metro |
| `entrance:enter` | `{ id, place }` Shoumik pressed ঢোকো in a Breaking School / Biology marker | entrances → *classes (Session 5)* |

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

## 13. Notes for the next sessions
- **Session 4 is done** (the old notes below are kept for reference).
- **Session 5 (classes):** listen to `entrance:enter { id }` (`breaking-school` /
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
