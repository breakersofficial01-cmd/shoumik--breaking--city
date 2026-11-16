# Handoff — how Breaking City is built (v2, after Session 2)

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
- See what you changed: `node tools/character-shots.js --three <dir> --out <folder>` saves
  close-ups of Shoumik in every outfit and animation (`--only front,punch,doctor`). (Cloud sandboxes usually cannot reach the CDN, hence
  `--three`.) Run it before every commit.
- Useful in the console with `?debug=1`:
  `BC.player.position`, `BC.economy.addCash(1000)`, `BC.setQuality('low')`,
  `BC.events.emit('wanted:changed', { stars: 3 })`, `BC.world.layout`, `BC.save.flush()`,
  `BC.events.emit('outfit:set', { id: 'doctor' })`, `BC.events.emit('player:action', { name: 'aim' })`,
  `BC.debugPeds` (the pedestrian pool), `BC.crowd.people`. Number keys 1–0 play animations.

## 2. Boot order (`src/main.js`)
1. `config.loadSome` (ui, strings, game, economy) → `save.load` → `initI18n`
2. `loadFonts` + `config.loadAll` (all other `data/*.json`)
3. `assets.configure` + procedural placeholder textures registered
4. `content.loadAll()` (lessons through the Content Service)
5. `new Game(canvas).init()` → renderer, `World` (layout, materials, sky, water, chunks,
   collision), `Input`, `ChaseCamera`, features, first chunks built
6. autosave starts → "Tap to start" → `game.start()` (frame loop)

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
src/entities/ chaseCamera.js
  people/    skeleton.js (pose format, bones) animLocomotion.js animActions.js animator.js
             shapes.js (loft/ellipsoid helpers) partGeometry.js looks.js crowd.js (instancing)
  shoumik/   model.js head.js body.js faceTexture.js
src/features/ index.js (registry) + player/ (index.js, actions.js) pedestrians/ (index.js,
             navigation.js, brain.js, bubbles.js) hotspots/ (index.js, props.js, boombox.js)
             touchControls/ hud/ minimap/ settings/
src/ui/      fonts.js, i18n.js, loading.js, styles.css
data/        every tunable number and all content
tools/       smoke-test.js, character-shots.js
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
| `prompt:show` / `prompt:hide` | `{ id, key }` / `{ id }` one-line hint at the bottom of the HUD | anyone → hud |
| `hotspot:entered` / `hotspot:left` | `{ id }` | hotspots |
| `wanted:changed` | `{ stars }` | *listened to by hud; police feature will send it* |
| `lesson:completed` | *(Session 5)* | classes |

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

## 8. How to add a poster (system arrives in Session 4)
Planned shape, so Session 4 only has to fill it in:
- Image file in `/posters/`, row in `data/posters.json` (`id, image, shape, link, startDate,
  endDate, districts, weight`) loaded as a content type (section 7).
- `src/features/posters/` creates the slots. Buildings already carry **blank signboards**
  (see `buildingMesher.js`, "signboard per shop") and the layout exposes every building
  (`piece.content.buildings` with `front` sides and height) to hang billboards on.
- Poster textures must go through the asset registry and be lazy-loaded near the player;
  any Bangla text drawn on a canvas waits for `fontsReady()`.
Until then there is nothing for the owner to do for posters.

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
- `model.player` is a factory object `{ create(outfit) }` returning a `ShoumikModel`. A
  rigged .glb cannot simply be dropped in: it would need a small adapter that maps our pose
  (see `skeleton.js`) onto its bones.

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

## 12. Notes for the next sessions
- **Session 3 (vehicles):** animations `enterVehicle` (holds the seated pose), `sit`,
  `exitVehicle` exist — play them with `player:action` and set `game.player.mode = 'driving'`
  (the player feature then stops moving him; place him yourself). Pedestrians need a
  "dive away / get hit" reaction: add states in `pedestrians/brain.js`. Rickshaw pullers
  exist as an archetype. `ChaseCamera.setTarget(vehicle, 'driving')` + a `driving` block
  in `data/camera.json`. Roads are the pieces with `kind` CROSSING / ROAD_EW / ROAD_NS;
  lanes inside blocks are `patches` with `lane: true`. Kerbs are 0.15 m.
- **Session 4 (landmarks):** reserve space by adding an entry to `areas` in
  `data/districts.json` (type `plaza`/`park`), exactly like `sangsad-grounds`.
- **Session 5 (shops):** sell outfits by setting `unlocked: false` in `data/outfits.json`
  and pushing ids into `save.data.owned.outfits`; then `outfit:set`.
- **Session 6 (weapons):** `melee`, `aim`, `shoot`, `down`, `hit` animations are ready;
  pedestrians have `hp` and a `knockDown` — add death and blood there. Player health should
  listen to `player:hit`.
- **Session 7:** replace `hotspots/boombox.js` with real tracks; it already obeys
  `save.data.settings.sound === false`. `Sky` already holds every light/fog/sky colour in one place for day/night;
  `setLanguage()` and the `language:changed` event already work; settings panel lives in
  `src/features/settings/`.
- Known rough edges are listed at the end of `docs/CHANGELOG.md`'s Session 1 entry.
