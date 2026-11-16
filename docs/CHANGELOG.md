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
