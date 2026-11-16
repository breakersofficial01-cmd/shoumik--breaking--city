# Handoff — how Breaking City is built (v1, after Session 1)

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
  and fails on any console error. (Cloud sandboxes usually cannot reach the CDN, hence
  `--three`.) Run it before every commit.
- Useful in the console with `?debug=1`:
  `BC.player.position`, `BC.economy.addCash(1000)`, `BC.setQuality('low')`,
  `BC.events.emit('wanted:changed', { stars: 3 })`, `BC.world.layout`, `BC.save.flush()`.

## 2. Boot order (`src/main.js`)
1. `config.loadSome` (ui, strings, game, economy) → `save.load` → `initI18n`
2. `loadFonts` + `config.loadAll` (all other `data/*.json`)
3. `assets.configure` + procedural placeholder textures registered
4. `content.loadAll()` (lessons through the Content Service)
5. `new Game(canvas).init()` → renderer, `World` (layout, materials, sky, water, chunks,
   collision), `Input`, `ChaseCamera`, features, first chunks built
6. autosave starts → "Tap to start" → `game.start()` (frame loop)

Frame order (`Game.frame`): input → camera look → `features.update(dt)` → camera →
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
src/entities/ shoumikPlaceholder.js (model + HumanoidAnimator), chaseCamera.js
src/features/ index.js (registry) + player/ touchControls/ hud/ minimap/ settings/
src/ui/      fonts.js, i18n.js, loading.js, styles.css
data/        every tunable number and all content
tools/       smoke-test.js
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
  `image.shoumik.portrait`, `image.shoumik.face`.

## 10. How to change the save format
See the header of `src/core/save.js`: bump `SAVE_VERSION`, add a migration from the old
version, add the field to `defaults()`. Features store live state with
`save.onBeforeSave((data) => { ... })`.

## 11. Notes for the next sessions
- **Session 2 (Shoumik + people):** replace the factory registered as `model.player` (keep
  the part names or extend `HumanoidAnimator`). Pedestrians should be instanced/pooled and
  spawn only in built chunks; sidewalks are the 3 m ring of every block piece
  (`world.grid.sidewalkWidth`). The player is a circle collider; dynamic obstacles are not in
  `CollisionWorld` yet (it is static-only) — add a small dynamic list rather than rebuilding
  the grid.
- **Session 3 (vehicles):** `ChaseCamera.setTarget(vehicle, 'driving')` + a `driving` block
  in `data/camera.json`. Roads are the pieces with `kind` CROSSING / ROAD_EW / ROAD_NS;
  lanes inside blocks are `patches` with `lane: true`. Kerbs are 0.15 m.
- **Session 4 (landmarks):** reserve space by adding an entry to `areas` in
  `data/districts.json` (type `plaza`/`park`), exactly like `sangsad-grounds`.
- **Session 7:** `Sky` already holds every light/fog/sky colour in one place for day/night;
  `setLanguage()` and the `language:changed` event already work; settings panel lives in
  `src/features/settings/`.
- Known rough edges are listed at the end of `docs/CHANGELOG.md`'s Session 1 entry.
