# Changelog

## 2026-11-16 — Project setup (Claude Opus 5.5)
- Added project rules (`CLAUDE.md`), build plan (`docs/SESSIONS.md`) and content guide.
- Added `data/lessons.json` with one test lesson (Bone and Cartilage, YouTube n9wUkCiCyD8,
  3 questions), `data/features.json`, `data/links.json`.
- No game code yet. Next: Session 1.

## 2026-11-16 — Shoumik character (Claude Opus 5.5)
- Added `docs/CHARACTER.md` written from the owner's 8 reference photos (build, face, hair,
  beard, watch, 5 outfits with hex colours).
- Added `assets/shoumik/face.png` (face texture) and `assets/shoumik/portrait.png` (HUD).
- Session 2 now uses these files; photos no longer required.
- Fixed hosting sub-path to `/shoumik--breaking--city/`.

## 2026-11-16 — Bangla quiz + font (Claude Opus 5.5)
- Test lesson questions, options and explanations translated to Bangla.
- Added `data/ui.json` (Bangla default, Li Ador Noirrit font with Hind Siliguri fallback).
- New rules in CLAUDE.md: Bangla font loader, Class Mode fully in Bangla with Bangla digits.
- Font file not committed yet (licence check pending, see NEXT.md).

## 2026-11-16 — Session 1: engine, city and updatable foundations
The game now runs: open `index.html` from any static host and walk around the city.

Foundations
- `src/core/`: event bus, versioned save with migrations + autosave (30 s and on leaving),
  config loader for `data/*.json`, wallet (`cash:changed`), input, game loop, seeded RNG,
  debug panel (`?debug=1`).
- `src/content/`: Content Service with `LocalJsonAdapter` (on) and `GoogleSheetCsvAdapter`
  (written and tested, switched off), CSV parser, lesson validator. Bad rows are skipped and
  reported; order is network → cached copy → local JSON.
- `src/features/index.js` feature registry driven by `data/features.json`. Features built:
  `player`, `touchControls`, `hud`, `minimap`, `settings` (quality only for now).
- `src/assets/registry.js` asset registry with `data/assets.json` overrides.
- `src/ui/fonts.js` font loader + `src/ui/i18n.js` strings/Bangla digits. Loading screen and
  HUD use them.

World
- `index.html` with the Three.js import map (three@0.170.0), loading screen, Tap-to-start,
  rotate-to-landscape screen, notch safe areas, resize handling.
- Sunset sky dome, sun, warm lights, distance fog.
- City generator (fixed seed) from `data/districts.json` + `data/world.json`: 14×16 blocks,
  6 districts with their own palettes/density/heights, roads with markings and zebra
  crossings, raised sidewalks, lanes, ~3,800 buildings (balconies, shutters, blank signboards,
  stair rooms), roof tanks, poles and tangled wires, trees, Dhanmondi Lake, Hatirjheel (with
  two bridges), Buriganga river edge, Sangsad grounds reserved, two parks.
- Chunks with distance culling/unloading, merged geometry, instanced props, quality
  Low/Medium/High.
- Placeholder Shoumik (walk/run/sprint/jump, collision), Vice-City chase camera with wall
  avoidance, mobile joystick + buttons, keyboard/mouse, rotating minimap, HUD with ৳500.

Docs and tools
- New `docs/GAME_SPEC.md`, `docs/HANDOFF.md`, `tools/smoke-test.js`.
- New data files: `world, districts, economy, game, quality, player, camera, controls,
  strings, assets`. `features.json` gained the five Session 1 features; `ui.json` gained
  `hud`, `minimap`, `loading`.

Changed from the setup notes
- `data/ui.json → fonts.bn.fileInstalled` (false) was added. The custom font file is only
  requested when this is true, so a missing file no longer causes a failed download on every
  launch. Adding the font is now: put the file in place **and** set this to true.

Tested (headless Chromium, software GL): boot with zero console errors, keyboard and touch
movement, jump, collision, camera drag, quality switch, portrait pause, save → reload,
save migration v0→v1 and broken-save backup, Google Sheet adapter (online, cached offline,
local fallback, bad rows skipped). **Not tested on a real phone yet.**

Known issues / rough edges
- Frame rate on a real mid-range Android is unmeasured; Old Dhaka is the heaviest area.
- The camera circles when you only push sideways (classic Vice City behaviour); tune
  `data/camera.json → onFoot.followSpeed` if it feels wrong.
- Attack / Enter / Weapon / Horn buttons are visible but do nothing until later sessions.
- Trees and poles are solid but thin; the camera ignores them.
- Far chunks appear as hazy silhouettes and pop in at the edge of the view distance.
- iPhone Safari cannot go fullscreen, so the browser bar stays visible there.
- No sound, no day/night, no language button yet (planned sessions).

Next: Session 2 (real Shoumik model and people).

## 2026-11-16 — Session 2: Shoumik and people
Shoumik is now the real character and the streets are full of people.

Shoumik
- New low-poly model built in code (about 2,000 triangles, 12 draw calls): stocky build, round
  face, black quiff, full beard, black watch on the left wrist. His face photo
  (`assets/shoumik/face.png`) is shrunk to a 128 px PS2-style texture, tone-matched and
  feathered onto the front of the head. The old placeholder file is gone.
- Outfit system: `data/outfits.json` with all 5 outfits (`casual_maroon` default,
  `panjabi_navy`, `panjabi_grey`, `doctor` with stethoscope, `polo_black`). Pick one in
  Settings (gear) → পোশাক. The choice is saved. No logos.
- One shared skeleton + animator for him and every pedestrian (`src/entities/people/`):
  idle, arms-crossed signature idle (after 3.5 s standing), walk, run, jump, fall, punch,
  melee swing, aim, shoot, enter/exit vehicle, sit, dance (3 moves), knocked down, cower,
  shout, hit, clap.
- Attack button / mouse click = punch (left, right, left…). Other features start any
  animation with the `player:action` event; `?debug=1` + number keys 1–0 previews them.

People
- Pedestrians (`src/features/pedestrians/`): 16 kinds from `data/pedestrians.json` — lungi,
  panjabi, shirt-pant, office wear, saree, salwar kameez, hijab, hawkers with a basket on the
  head, rickshaw pullers with a gamcha, students with backpacks, four Gen-Z streetwear kinds
  (oversized tees, cargo pants, crop jackets, caps, bucket hats, chains, sneakers). Each
  district has its own mix and crowd density. All adults.
- They walk the sidewalks, wait and cross at corners, sometimes stop to look at their phone,
  step out of Shoumik's way. Punch one: he goes down (and later gets up and runs) or, if he is
  the brave type, puts his fists up and hits back; people nearby run, cower or shout in
  Bangla speech bubbles.
- Performance: one instanced "crowd" draws everybody in ~12 draw calls; a fixed pool of
  pedestrians is recycled around the player (16 / 28 / 40 by quality); far people are drawn
  simpler and animate less often.
- Hangout spots (`src/features/hotspots/`, `data/hotspots.json` through the Content Service):
  TSC, Dhanmondi lakeside, Hatirjheel, Gulshan café — a neon dance mat, a boombox and Gen-Z
  dancers moving in time to a placeholder beat (made in code, louder as you get closer).
  Stand on the spot and press ঢোকো / E to dance with them; move to stop.

Under the hood
- `CollisionWorld.dynamic` (moving circles), `Game.crowd`, HUD hint line (`prompt:show`),
  save format v2 (adds `outfit`, migration included), new events (see HANDOFF).
- New tool `tools/character-shots.js` (close-up screenshots of every outfit/animation);
  the smoke test now also checks that pedestrians exist.

Tested (headless Chromium): boot with zero console errors on low+touch and high, all 5
outfits, every animation, pedestrians walking/crossing, punch → knock-down / flee /
fight-back / calm down again, hotspot dancers, joining the dance, outfit saved.
**Not tested on a real phone. Sound could not be heard in the test machine.**

Known issues
- This work sits on top of Session 1, which was on its own branch and had not been merged into `main`; both are now together on this branch.
- Shoumik's face is a flat photo on a round head: fine from the front, flat from the side.
- No health yet: pedestrians' punches only shove Shoumik (health comes in Session 6).
- Pedestrians only use the main sidewalks, not the small lanes inside blocks (Old Dhaka's
  inner lanes are empty) and they do not avoid each other.
- Legs can poke through long kurtas/kameez when walking; far people have stiff limbs.
- Walkers squeeze past the single-row lakeside/café dancers rather than going round.
- The boombox beat is a simple placeholder; there is no sound on/off switch until Session 7.

Next: Session 3 (vehicles and traffic).

## 2026-11-16 — Session 3: vehicles and traffic
The streets now have traffic, and Shoumik can drive, ride, crash and jump.

Vehicles
- 11 low-poly vehicles built in code from `data/vehicles.json`: rickshaw (with a painted art
  panel on the back, 3 designs), bicycle, green CNG, leguna, motorbike, sedan, SUV, sports car,
  colourful dented local bus, police pickup (no logos), ambulance. Each has speed,
  acceleration, brake, handling, mass, health and paint colours.
- Get in / out with ঢোকো / E (with the enter and exit animations). If somebody is driving,
  Shoumik throws him out: the driver lands on the road, shouts, and either runs or fights.
- Arcade driving: accelerate, brake, reverse, handbrake drifts with tyre smoke, body lean,
  bikes lean into corners. The chase camera sits behind the vehicle (further back for a bus).
- Crashes push vehicles around and cost health: grey smoke → black smoke and flames →
  5 seconds of burning → explosion (hurts everything near it) → burnt wreck.
- 5 stunt ramps in Suhrawardy Udyan, the Sangsad plaza and Chandrima Udyan: hit one fast and
  the car flies.
- Hire a waiting rickshaw (৳20) or CNG (৳100): press ঢোকো next to it, choose one of 21 places
  and the driver takes you there. "পৌঁছে দাও ▶▶" skips the trip (it also skips by itself after
  30 s). There is a stand at every place.
- Empty vehicles are parked along the roads to take. Vehicles Shoumik **owns** are stored in
  the save and wait near the Shahbag start corner every time the game opens (homes with
  garages and the showroom come in Session 5).
- Horn button / H (placeholder sounds: bell, beep, car, bus, siren). Small display on top
  while driving: vehicle name, speed in km/h, health bar.

Traffic
- AI vehicles drive on the left in two lanes (cars inside, rickshaws / buses / CNGs outside),
  take junctions in a curve, wait their turn at junctions, keep a gap, honk when something
  blocks them, back off after a crash. Buses and legunas pull up at bus stops (shelters with a
  red roof on about every fifth road side).
- Each district has its own mix: Old Dhaka is mostly rickshaws, Gulshan cars and SUVs,
  Motijheel buses and CNGs. Farmgate and Shahbag are permanent jams (more vehicles, slower,
  shorter green time).
- People jump out of the way of fast vehicles ("সামলে!") and are knocked down when hit.

Under the hood
- `src/entities/vehicles/` (shared engine: fleet, physics, damage, models, AI driver),
  `src/entities/effects/particles.js`, `src/world/roads.js` (road graph, lanes, signals,
  routes, bus stops), `src/world/ramps.js`, features `vehicles` and `traffic`.
- New data: `data/vehicles.json`, `data/traffic.json`, `data/places.json` (through the Content
  Service). New numbers in `camera.json` (driving), `quality.json` (traffic, parked),
  `economy.json` (ride fares), `world.json` (ramps), `pedestrians.json` (reactions to vehicles).
- Touch buttons change their labels while driving (গ্যাস / ব্রেক / নামো). New events are
  listed in `docs/HANDOFF.md`. Save format is unchanged (still version 2).
- New tool `tools/vehicle-shots.js`: screenshots of every vehicle and an automatic test of
  driving, ramp jump, drift, carjacking, a hired ride, an explosion and one minute of traffic.

Tested (headless Chromium): zero console errors on Low + touch and on Medium; all the steps
above; a minute of traffic at Shahbag with no crashes, nobody stuck and nobody off his lane;
owned vehicles come back after a reload. Vehicle code costs about 0.4 ms per frame on a
desktop CPU. **Not tested on a real phone. Horn sounds could not be heard in the test machine.**

Known issues
- Sessions 1 and 2 were still on their own branches (not merged into `main`); this session
  was built on top of them, so this branch contains Sessions 1–3.
- Junctions have no visible traffic lights or police yet — vehicles simply take turns.
- Inside a closed vehicle Shoumik is hidden (dark glass) and while climbing in he is drawn
  through the door. Open vehicles (rickshaw, bikes) show him properly.
- Riders do not pedal or lean; two-wheelers never fall over; vehicles never roll over.
- AI drivers only use the main roads, not the small lanes inside blocks, and never overtake.
  A long bus cuts corners over the kerb.
- Parked cars stand half on the sidewalk (as in Dhaka) so that they do not block the slow lane.
- A hired ride is dropped about 14 m before the junction, earlier if traffic is queuing.
- No health for Shoumik yet: being run over or blown up only throws him (Session 6).
- Wrecks vanish after 45 s even while you look at them. No engine sounds until Session 7.
- The places in `data/places.json` are only names and junctions until Session 4 builds the
  landmarks; Session 4 may move them.

Next: Session 4 (real Dhaka landmarks and the poster system).

## 2026-11-17 — Session 4: real Dhaka landmarks and the poster system
Breaking City now looks like Dhaka: 18 landmarks, MRT Line 6 with moving trains, and adverts
everywhere that players can tap to open.

Landmarks (`src/world/landmarks/`, colours in `data/landmarks.json`, places in `data/places.json`)
- Low-poly look-alikes, no logos or crests: Jatiya Sangsad Bhaban (with its lake and brick plaza),
  Shaheed Minar, TSC, Dhaka University, Curzon Hall, Dhaka Medical College, BUET, Nilkhet book
  market, Gulshan glass towers, Karwan Bazar, Shapla Chattar, Notre Dame College, Sir Salimullah
  Medical College, Ahsan Manzil, Lalbagh Fort, Sadarghat (terminal, pontoons, launches, boats).
- **Breaking School** (campus, block 2,11) and **Breaking Biology Institution** (Dhanmondi, block
  5,7): big neon glass buildings, names in English + Bangla on every side, a glowing entrance
  ring. Stand in it and press ঢোকো → "classes open soon" (Class Mode is Session 5; the
  `entrance:enter` event is ready for it).
- Name boards in Bangla + English on every landmark (painted on a canvas after the fonts load).
- Dhanmondi Lake: paddle boats, lamp posts with fairy lights on the bridge. Hatirjheel: white
  arches and coloured lights on both bridges, boats.
- MRT Line 6 on pillars (Bijoy Sarani → Shahbag → Karwan Bazar → Motijheel) with 4 stations and
  2 trains that stop at every station (`src/features/metro/`). Elevated expressway on pillars
  down the east side. Pillars stand between the lanes and are solid; traffic is unaffected.
- A place gets a landmark with one `landmark` entry in `data/places.json`; the block keeps its
  sidewalks, poles and wires. Steps at Sangsad and Shaheed Minar can be walked and driven up.

Posters (`src/features/posters/`, content in `data/posters.json`, slots in `data/posterSlots.json`)
- 487 fixed slots: 34 roof billboards (2:1), 16 LED screens at junctions (16:9, change every 10 s),
  40 wall posters, 165 bus-stop posters and 232 metro/flyover pillar posters (2:3), plus adverts
  on the back of every bus and on ~45% of rickshaws.
- Posters show only between their start and end dates and in their districts; weighted daily pick;
  empty slots show "এখানে আপনার বিজ্ঞাপন". Loaded through the Content Service (ready for a sheet).
- Pictures load lazily near the player through the asset registry. Small posters are drawn within
  75 / 160 / 220 m by quality; billboards and LED screens as far as the city is drawn.
- Tap to open: look at a poster that has a link → "পোস্টার খুলুন ↗" button (or tap the poster, or
  F). The link opens in a new tab / app.
- 3 sample posters + 3 default posters in `posters/`, and `posters/README.md` (sizes, how to add one).

Under the hood
- Places now load at boot (the city layout needs the landmark plots). New config files
  `landmarks`, `posterSlots`; `quality.json` gained `posterDistance`; `controls.json` gained F
  (`open`); new strings `poster.*`, `entrance.*`. New features `posters`, `metro`, `entrances`.
  Save format unchanged (version 2).
- New tools: `tools/landmark-shots.js` (photos of every landmark) and `tools/poster-check.js`
  (posters, tap-to-open, LED rotation, train, entrance, vehicle adverts).
  `tools/vehicle-shots.js` drives and lines vehicles up north of the Sangsad lake now.

Tested (headless Chromium): zero console errors on Low + touch and on Medium; every landmark
photographed; poster check (one slot of every kind drawn, F opens the YouTube link, LED screen
changes, trains move, entrance prompt + note, bus and rickshaw adverts); the full Session 3
vehicle test (drive, ramp jump, drift, carjack, hired ride, explosion, a minute of traffic).
Draw calls at the Shahbag start corner: about 84 on Low, 127 on Medium.
**Not tested on a real phone.**

Known issues
- Landmarks are simplified look-alikes; some details (Sangsad's exact openings, Curzon Hall's
  domes, Ahsan Manzil's stair) are approximate. Nothing can be entered except the two Breaking
  entrance rings (and those only show a note until Session 5).
- The MRT deck and the expressway are scenery: you cannot walk, drive or ride on them yet. The
  viaduct crosses Dhanmondi Lake / Hatirjheel without pillars in the water.
- Draw calls went up (Low 57 → 84 at the busiest corner). Needs a real-phone check.
- Roof billboards can overlap a roof water tank or stair room; some wall posters cover windows.
- Rickshaw adverts crop the left and right of the 2:1 picture.
- Poster pictures stay in memory once loaded (fine for a few dozen posters).
- The Breaking School "admission" sample poster has no link yet: `data/links.json` is still empty.
- Sessions 1–3 were still on their own branches (not merged into `main`); this branch was built on
  top of the Session 3 branch, so it contains Sessions 1–4.

Next: Session 5 (classes, Lesson Check, money and shops).

## 2026-11-18 — Session 4.5 Part A: lighting and graphics upgrade (Claude Opus 5.5)
Owner approved moving the look from "PS2 era" to **Gangstar Vegas level** (rule changed in
`CLAUDE.md`; Session 4.5 added to `docs/SESSIONS.md`). Also: Sessions 1–4 were merged into `main`
(they were only on side branches), so GitHub Pages can show the game.

What changed on screen
- Filmic tone mapping (ACES) and a brighter exposure: punchier sunset colours.
- Real sun shadows from buildings, trees, poles, people, cars and Shoumik (Medium/High).
- Bloom: Breaking School / Breaking Biology neon, hotspot neon, entrance rings, landmark name
  boards and the sun glow.
- Colour grade: more saturation and warmth, slight contrast, soft vignette.
- Lakes and the Buriganga reflect the sunset sky.

Under the hood
- New `data/graphics.json` (all look values) and new `src/world/graphics/` (index, postfx,
  shadows, glow). `data/quality.json` levels gained `postfx`, `bloom`, `shadowMapSize`,
  `softShadows`, `msaa`. `game.graphics` renders the frame now.
- Glow materials marked with `markGlow()` in landmarks, hotspots and entrances.
- New tool `tools/look-shots.js`; `tools/landmark-shots.js` renders through `game.graphics`.
- Save format unchanged.

Tested (headless Chromium, software rendering): zero console errors on Low, Medium and High;
smoke test passes on all three; switching quality in-game works (shadows/bloom on and off).
Vehicle test and poster check pass completely on Low (27 m/s, ramp jump, drift, carjack, ride,
explosion, LED rotation, trains). On Medium/High the software renderer is too slow for their
real-time timers (speed, LED rotation), so those checks time out there — not a game bug, but
it means **Medium is noticeably heavier**. Not tested on a real phone.

Known issues
- Medium/High cost more GPU (shadow pass + bloom): check FPS on the owner's phone; switch to কম
  if it stutters.
- Very low sunset sun: shadows use a slightly higher sun angle than the sun you see.
- Shadowed roads are quite dark; tune `data/graphics.json → lighting.hemiIntensity`.
- Models are still code-built: the big jump in detail needs Parts B (real Shoumik) and C (cars,
  buildings).

Next: Session 4.5 Part B (real Shoumik GLB) when the owner sends the Mixamo files, else Session 5.

## 2026-11-19 — Session 4.5 Part B: the real 3D Shoumik (Claude Opus 5.5)
The owner sent Shoumik's 3D model rigged on Mixamo plus 31 animations (9 zips, ~2.6 GB of FBX).

- New `assets/shoumik/shoumik.glb` (4.2 MB): mesh reduced 618,812 → 20,000 triangles with a
  new 1024² texture baked from the 4K original, Mixamo skeleton, 32 clips (forward travel
  removed from walk/run/sprint etc.). New signature idle `idleCrossed`: arms crossed, built on
  top of Mixamo's breathing idle.
- New `src/entities/shoumik/glbModel.js`: plays the clips from the existing Animator's state
  (idle ↔ walk ↔ run ↔ sprint by speed with clip speed matched to his real speed, jump/fall,
  actions with their fades; upper-body-only actions while walking).
- `data/player.json → model.glb`: which qualities use it (Medium, High), height, brightness,
  clip names, action → clip map. `data/assets.json` registers `model.player.glb`. Low keeps the
  code-built Shoumik (no 4 MB download on weak phones). If the file fails, the code-built
  model is used.
- `src/entities/shoumik/model.js` exports `makeShoumikDims` (shared by both models).
- Tools: `tools/shoumik-shots.js` (close-ups of each state), `tools/shoumik-pipeline/` (the
  conversion: own mesh simplifier `qem.cpp`, UV/texture bake `bake.py`, clip export and GLB
  assembly).
- Save format unchanged.

Tested (headless Chromium, software rendering): smoke test passes on Low, Medium and High with
no console errors; close-ups of idle (arms crossed), walk, run, punch, aim, dance, jump and
seated on Medium and High; vehicle test passes fully on Low (19/19). On Medium the same
time-based vehicle checks as in Part A time out in the software renderer (not new).

Known issues
- Outfits do not change the 3D model yet (one outfit in the file).
- In vehicles he uses the driving pose even as a rickshaw passenger; enter/exit are short
  blends, not the long Mixamo door clips.
- 4.2 MB extra download on Medium/High (loads once, then cached by the browser).
- The owner's city kit (Quaternius Downtown City MegaKit, CC0) is received but not used yet
  (Part C).

## 2026-11-19 — Session 4.5 Part C (1): real cars, MRT train and gun models (Claude Opus 5.5)
Owner's asset packs, checked for licences first. Only free CC0 packs (Quaternius) are used;
see `assets/CREDITS.md`.

- **Real cars on Medium/High.** Sedan, yellow cab (new type `taxi`), SUV, sports car (2 shapes),
  police car and ambulance now use real 3D bodies (`assets/vehicles/*.glb`). Each body is merged
  into one mesh (same draw cost as before), painted from `data/vehicles.json`, fitted to the
  type's size, and its wheel positions come from the model (the game still spins its own
  wheels). Low quality and any failed file keep the code-built bodies. New code:
  `src/entities/vehicles/realModels.js`; switch: `data/vehicles.json → realModels.useOn`.
- Police type is now 4.6 m long (fits the police car model); SUV 4.6 × 2.05 m; ambulance
  5.3 × 2.2 m. Yellow cabs drive in the default mix, Motijheel and Gulshan.
- Bus, rickshaw, CNG, leguna, motorbike and bicycle stay code-built (no pack has a good Dhaka
  version; the bus keeps its poster panel).
- **MRT Line 6** cars use the train pack's high-speed model, recoloured to the Dhaka MRT
  livery from `data/landmarks.json → train.model` (front cars at both ends). Low = built cars.
- **Gun models**: 55 CC0 models (40 guns + accessories) in `assets/weapons/`, registered as
  `model.weapon.*`. `data/weapons.json` lists the 7 guns the game will use and how they sit in
  Shoumik's right hand (tuned on the `shoot` pose). Weapons gameplay is still Session 6.
- Train pack (steam, cargo, high-speed, track) and public-transport extras registered as
  `model.train.*` for later.
- Tools: `tools/metro-shots.js` (photos of the MRT), `tools/weapon-grip.js` (gun in hand).
- **Not used:** the "car 3d model" pack (21 vehicles). Most are extracted from commercial games
  (Forza Horizon, F1 2014/2015, FlatOut 2) or a company website; the rest have no licence and
  copy real brands. Kept out of the repo.

Tests: smoke test passes on Low / Medium / High; full vehicle test passes on Low. On Medium the
four time-based checks (ramp, drift, pedalling, explosion) still fail in the slow software
renderer only, as before this change.

## 2026-11-19 — Session 4.5 Part C (2): Downtown City MegaKit on every building and street (Claude Opus 5.5)
The owner's city pack (Quaternius Downtown City MegaKit, CC0) is now the look of the whole city,
on every quality level, at the SAME cost as before (no extra triangles or draw calls).

- **How:** the city's ~3,800 buildings are drawn as wall "bays" whose texture tile repeats once
  per floor. Instead of placing thousands of kit pieces (far too heavy for phones), the kit's
  real wall pieces are rendered into those tiles: `assets/city/facades.jpg` (8 tiles × 256 px,
  96 KB). Wall materials are baked grey so each building is still tinted with its own colour
  (red brick on campus, pastel plaster in Dhanmondi, ...).
  - Residential: six-pane brick window · Office: quoined double windows · Glass towers: kit
    curtain wall with a dusk-sky reflection and highlight · Old Dhaka: arched double windows ·
    Doors: arched kit door · Plain walls: kit plaster panels.
  - Shops: a Dhaka shop bay built for this (half-raised corrugated shutter over a lit shop
    inside, kit interior texture) — the kit has no shutters.
  - Balconies: concrete parapet with an iron grill.
- **Ground:** `assets/city/ground.jpg` keeps every road marking, zebra and the red/grey Dhaka
  pavers, now with the kit's real asphalt, concrete and dirt grain.
- Asset registry: texture files can set `wrapS` / `wrapT` / `anisotropy` in `data/assets.json`.
- Tools: `tools/city-kit/bake-facades.js` (+ `facade-recipes.json`: which kit pieces make each
  tile), `tools/city-kit/bake-ground.js` (+ `ground_detail.py`), `tools/street-shots.js` (eye-level
  photos of a building front in every district). The kit itself (244 MB) is not in the repo.
- Landmarks share the facade texture and were checked (Curzon Hall, DMC, Notre Dame, SSMC,
  Ahsan Manzil, Karwan Bazar).

Tests: smoke test passes on Low and High; landmark photos checked.

## 2026-11-19 — Session 4.5 Part C (3): 3D kit buildings in 4 zones (Claude Opus 5.5)
- On Medium/High, buildings in 4 zones are real 3D Downtown City MegaKit buildings: start area
  (Shahbag), Breaking Biology (Dhanmondi), Shapla Chattar (Motijheel), Ahsan Manzil (Old Dhaka).
  Brick blocks with pediment windows (spaced window–wall–window), stone cornices, arched doors,
  glass storefronts under the shop signs, and office curtain walls that reflect the sky.
- Built on the normal footprints, so collisions, shops and signs stay the same. Towers (> 7 floors)
  keep the textured look. Budget: 70–100k triangles per zone, one zone built at a time (built
  within 520 m, dropped beyond 760 m), ~7 draw calls per zone. Low: unchanged.
- Code: `src/world/hero/` (index.js = zones/merge/culling, design.js = pieces on a footprint);
  `buildingMesher.js` skips walls of hero buildings; `data/heroBuildings.json` (zones, styles,
  budgets); `data/quality.json → heroBuildings`. Pieces: `assets/city/kit-pieces.glb` (0.9 MB,
  17 kit pieces, interiors removed, 512 px textures), made by `tools/city-kit/pack-pieces.js`.
- Tool: `tools/hero-shots.js` (zone list + street/above photos).
Tests: smoke test passes on Low / Medium / High; vehicle test passes on Low.

## 2026-11-19 — Session 4.5 Part D: our own painted sunset sky (Claude Opus 5.5)
- New 360° sky made in code (`src/world/skyPainter.js`), painted ONCE at load into a texture, so
  it costs nothing per frame. Based on the owner's reference photos (colours and mood only):
  deep orange horizon glowing more on the sun side, peach → rose → purple-navy overhead,
  streaky sunset clouds lit gold from below, a soft halo around the sun, faint stars high up.
- Every number and colour in `data/world.json → sky.painted`; fog colour matched to the
  horizon. Reflections (water, glass, cars) use the same sky automatically.
- The poster-style images the owner sent were not used as files (not a 360° sky, unclear
  licence); only their colours guided the painting.
- Tool: `tools/sky-shots.js`. Tests: smoke test passes on Low and High.

## 2026-11-19 — Session 5: Classes, Lesson Check, money and shops (Claude Opus 5.5)
Shoumik can now study for Taka and spend it.

Class Mode (`src/features/classes/`)
- Opens from the pink ring at Breaking School and Breaking Biology Institution (pauses the game).
  Everything in Bangla with the Bangla font and Bangla digits, even if the game language is
  English (new `tl()`, `numIn()`, `moneyIn()` in `src/ui/i18n.js`).
- **Lesson Check:** lessons of that institute grouped by subject · chapter with
  নতুন / আবার চেষ্টা করো / সম্পন্ন badges. Lesson screen with reward and "earned so far", a big
  **ইউটিউবে দেখো** link that opens YouTube outside the game (no embed, no tracking), and
  চেক শুরু করো: 3 random questions, shuffled options (ক খ গ ঘ, real letters tracked), 30 s
  timer with a bar, instant ✔ সঠিক! / ✘ ভুল! / ⏰ সময় শেষ! with the right answer and explanation.
  Each question pays ৳150 once per player; 2 tries per lesson (a try counts when it starts, so
  closing half-way cannot be used to peek). Results saved per lesson; sends `lesson:completed`.
- **Quiz Class:** rounds of up to 10 questions from the institute's lessons; ৳50 per right
  answer, ৳200 every 5 in a row, ৳300 for the first round of the day; optional daily cap
  (`data/economy.json → quizClass.dailyCap`, 0 = none).
- **Enroll** opens `data/links.json → enrollBreakingSchool / enrollBreakingBiology` (still empty →
  "coming soon").
- **`?admin=1`**: red অ্যাডমিন button → lessons and questions per institute, where each content
  type loaded from, and every skipped row with its reason.
- The test lesson `bio-bone-cartilage-01` works end to end.

Shops (`src/features/shops/`, `data/shops.json`, prices in `data/economy.json → prices`)
- 11 shops as glowing rings with a floating Bangla name sign on sidewalk corners and coloured
  dots on the minimap (new `map:blips` event; far dots sit on the rim): car showroom (Gulshan),
  bike shop, property office (Motijheel), weapon shop (Old Dhaka), clothes shop, 3 tea stalls and
  3 fuchka stalls.
- Buying: vehicles (`vehicle:grant`), outfits (black polo, grey panjabi and doctor's apron are now
  sold; maroon tee and navy panjabi stay free; old saves keep the one they wore), weapons (owned
  list for Session 6), homes (Old Dhaka mess, Dhanmondi flat, Gulshan house), food (heals).
- Homes: a white ring at each owned home; sleeping there = full health + save + spawn point;
  owned vehicles park at that home's garage (`garage:changed`). Choose between homes in the
  property office.
- **Health:** new bar under the wanted stars. Punches and crashes lower it but never below 10 for
  now (knock-outs come with Session 6); food and sleep fill it.

Under the hood
- Save format **v3** (migration from v2): `health`, `home`, `garage`, `classes`; lesson results.
- `src/ui/overlay.js` (shared full-screen panel: pause, Esc, save on close, HTML escaping);
  `src/ui/panels.css` for the new screens (styles.css was over 400 lines).
- Settings rebuilds its outfit list when one is bought (`outfit:owned`).
- Fixed: `player:hit` without a position made Shoumik's position NaN (now only the hurt animation).
- New tool `tools/class-check.js` (Class Mode and shops end to end, 40+ checks).

Tests (headless Chromium, software rendering): class check passes on Low and Medium with no
console errors; smoke test passes on Low and Medium; vehicle test passes fully on Low (Medium
still shows the 4 known time-based failures of the slow software renderer).

Known issues
- Breaking School has no lessons yet (Class Mode says so); Breaking Biology has one lesson with
  3 questions, so Quiz Class repeats the same 3 questions. More lessons are needed in
  `data/lessons.json` (or the Google Sheet).
- Enroll links and the Li Ador Noirrit font file are still missing (Hind Siliguri is used).
- Bought outfits only show on Low (the 3D Shoumik has one outfit); guns can be bought but not used
  until Session 6; weapon names are shown as ids (pistol, smg…).
- No daily cap on Quiz Class by default — a player can practise the same questions for money.
