# Build Sessions (for Claude Fable 5.2)

The owner starts each session in Claude Code with a single line such as:
`Do Session 1 from docs/SESSIONS.md.`
Project rules are in `/CLAUDE.md` (loaded automatically). Do one session at a time.
If a session is cut off, the next chat says: `Continue Session X from docs/CHANGELOG.md.`

---

## Session 1 — Engine, city and updatable foundations
Foundations (most important — everything later depends on these):
- `src/core/events.js` event bus, `src/core/save.js` versioned save with migrations,
  `src/core/config.js` loads `data/*.json`.
- `src/content/ContentService.js` with `LocalJsonAdapter` working and `GoogleSheetCsvAdapter`
  written but switched off (reads two published CSV URLs, parses quoted CSV, maps rows to the
  same shape as `data/lessons.json`, caches in localStorage, falls back to local JSON on any
  error). Schema validators for lessons; invalid rows are skipped and logged.
- `src/features/index.js` feature registry reading `data/features.json`; each feature is a
  folder exporting `{ id, init(game), update(dt), dispose() }`.
- `src/assets/registry.js` asset registry.
- `src/ui/fonts.js` font loader reading `data/ui.json` (Bangla font with fallback, see
  CLAUDE.md rule 7). The loading screen and HUD already use it.

World:
- `index.html` with Three.js import map, renderer, resize + notch handling, "rotate to
  landscape" screen in portrait, loading screen.
- Sun + sky light, distance fog, warm Vice-style sunset look.
- City generator from `data/districts.json`: road grid, intersections, lane markings,
  sidewalks. Low-poly Dhaka-style buildings: mixed heights, concrete colours, balconies, shop
  shutters, roof water tanks, tangled wires between poles, blank signboards. District palettes
  and density. Dhanmondi Lake, Hatirjheel water, Buriganga river edge. Fixed seed.
- Chunks + distance culling + instancing. Quality Low/Medium/High.
- Placeholder Shoumik walking/running with building collision. Vice-City chase camera.
- Mobile joystick + buttons, desktop keyboard/mouse. Minimap. HUD with ৳500 start cash.
- Autosave every 30 s. `?debug=1` shows FPS and logs.
- Write `docs/GAME_SPEC.md` and `docs/HANDOFF.md` (first version: architecture and how to add
  a feature, a content type and a poster).

## Session 2 — Shoumik and people
Shoumik (the look is fully specified in `docs/CHARACTER.md`; the owner may also attach
reference photos in chat — use them only to refine details, never commit them to the repo):
- Low-poly Shoumik in code (about 1,500–3,000 triangles), PS2 style, stocky build, round face,
  black quiff hair, full beard, black wristwatch on the left wrist, default outfit
  `casual_maroon`. All 5 outfits from CHARACTER.md selectable through an outfit system
  (data in `data/outfits.json`), no brand logos.
- Head: map `assets/shoumik/face.png` on a slightly rounded front plane of the head, blending
  edges into skin and hair colours. HUD portrait and profile card use
  `assets/shoumik/portrait.png` in a circle.
- Code-driven animations: idle, idle arms-crossed (signature pose), walk, run, jump, punch,
  melee swing, aim/shoot, enter/exit vehicle, fall, dance.
- Update `docs/CHARACTER.md` if anything was refined.

People:
- Procedural low-poly adult pedestrians: lungi, panjabi, shirt-pant, saree, salwar kameez,
  hijab, office wear, hawkers, rickshaw pullers, students with backpacks, Gen-Z streetwear
  (oversized tees, cargo pants, sneakers, caps, crop jackets, bucket hats, chains).
- Walk sidewalks, cross roads, flee danger, shout, some fight back.
- Gen-Z hangout spots from `data/hotspots.json` (TSC, Hatirjheel, Gulshan café, Dhanmondi
  lakeside): stylish, attractive young adults dancing to music, boombox sound placeholder.
  Shoumik can join with the dance animation. All adults, no sexual content.
- Pooling and LOD for performance.

## Session 3 — Vehicles and traffic
- Vehicles from `data/vehicles.json` (low-poly; speed, acceleration, handling, mass, health,
  colours): rickshaw (painted art panel), bicycle, green CNG, leguna/tempo, motorbike, sedan
  (no real logos), SUV, sports car, colourful dented local bus, police pickup, ambulance.
- Enter/exit with animation; carjacking drags the driver out. Rickshaw/CNG rides cost ৳20/৳100
  and take you to a chosen landmark.
- Arcade driving: drift, handbrake, reverse, ramps, collision push + damage, smoke → fire →
  explosion at 0 health. Vice-City camera behind the vehicle.
- AI traffic on lanes, stops at intersections, honks when blocked, jams at Farmgate and
  Shahbag, buses stop at bus stops, rickshaw-heavy lanes in Old Dhaka.
- Pedestrians dive away and can be hit. Owned vehicles saved and respawned at home.

## Session 4 — Real Dhaka landmarks and poster system
- Landmarks from `data/places.json`, recognisable low-poly versions, no official logos:
  Jatiya Sangsad Bhaban, Shaheed Minar, Curzon Hall, Dhaka University, TSC, Dhaka Medical
  College, BUET, Ahsan Manzil, Lalbagh Fort, Sadarghat with boats, Hatirjheel bridges with
  lights, Dhanmondi Lake, Notre Dame College, Sir Salimullah Medical College, Karwan Bazar,
  Shapla Chattar, Nilkhet, Gulshan towers, MRT Line 6 with a moving train, flyovers.
- Breaking School and Breaking Biology Institution: big glowing buildings, names in English and
  Bangla, with an entrance marker.
- Poster system (`src/features/posters/`): at least 60 slots — highway/rooftop billboards (2:1),
  rotating LED screens at intersections (16:9, every 10 s), wall posters (2:3), bus/rickshaw
  back panels (2:1), metro pillars and bus stops (2:3).
- `data/posters.json`: id, image (in `/posters/`), shape, link, startDate, endDate, districts
  (or "all"), weight. Only show posters within dates; default poster fills empty slots. Loaded
  through ContentService so it can later come from a Google Sheet too.
- Lazy-load textures near the player. "Tap to open" when near and looking at a poster.
- 3 sample posters and `posters/README.md` (sizes, how to add one, in plain words).

## Session 4.5 — Visual upgrade to Gangstar Vegas level (owner-approved 2026-11-18)
Done in parts, each one leaves the game runnable:
- **Part A — Lighting and graphics (no new art needed):** filmic tone mapping, real sun
  shadows that follow the player, bloom so neon and the sunset glow, colour grading
  (saturation, contrast, warmth, vignette), water reflecting the sky, stronger neon. All values
  in `data/graphics.json`; per-quality switches in `data/quality.json`.
- **Part B — Real Shoumik:** owner supplies a Rodin/Meshy model rigged on Mixamo (FBX T-pose +
  animation FBXs). Convert to one compressed GLB, load through the asset registry, map the
  animations onto the existing animation names. Code-built Shoumik stays as the Low fallback.
- **Part C — Real cars and buildings:** owner supplies FBX/GLB packs (web-game licence).
  Swap sedan/SUV/sports car/motorbike/police/ambulance/bus models and add modern building and
  street-prop models district by district. Rickshaws, CNGs, legunas and landmarks stay
  code-built but get better materials. Compress (Draco/Meshopt, KTX2) and load per district;
  keep the first download small.

## Session 5 — Classes, Lesson Check, money and shops
Class Mode (`src/features/classes/`), opened at the entrance of Breaking School or Breaking
Biology Institution — a mobile-friendly HTML overlay:
1. **Lesson Check** — list lessons from ContentService filtered by `institute` and `active`,
   grouped by subject/chapter, showing done/not done.
   - Lesson screen: title, chapter, reward, a big **Watch on YouTube** button that opens
     `youtubeUrl` externally (new tab / YouTube app). Never embed or track the video.
   - **Start Check** button: picks `defaults.questionsPerAttempt` (3) random questions from
     that lesson, shuffles options (keeping track of the real letters), 30 s timer each.
   - Tap an option → instant green tick or red cross, the right answer and the explanation.
   - Each correct answer pays `rewardPerCorrect` Taka (emit `cash:changed`,
     `lesson:completed`). A lesson pays once per player; `maxAttempts` limits retries. Save
     results per lesson id.
   - Everything in Class Mode is in Bangla with the Bangla font from `data/ui.json`
     (see "Quiz language" in CLAUDE.md), including Bangla digits.
   - Test lesson: `bio-bone-cartilage-01` in `data/lessons.json` (one YouTube link, 3 questions
     on bone and cartilage). It must work end to end.
2. **Quiz Class** — free practice from all active questions of that institute, ৳50 per correct,
   ৳200 bonus for 5 in a row, ৳300 for the first class of the day.
3. **Enroll** — opens the enroll link from `data/links.json`.
- Add a hidden admin check at `?admin=1`: shows how many lessons/questions loaded, from which
  source, and any skipped rows with the reason.
- Shops (overlays): car showroom (Gulshan), bike shop, property office (Old Dhaka mess,
  Dhanmondi flat, Gulshan house — owned homes are save/spawn points with a garage), weapon shop
  (Old Dhaka back lane), clothes shop, tea and fuchka stalls (heal). Prices from
  `data/economy.json`. Purchases saved.

## Session 6 — Crime, weapons and police
- Weapons from `data/weapons.json`: fists, cricket bat, machete, pistol, shotgun, SMG,
  molotov. Aim assist on mobile, free aim on desktop. Ammo from the weapon shop.
- Health and armour. Blood splatter and pools (hidden when Blood is Off), NPC deaths, vehicle
  explosions, fire.
- Wanted stars 1–5 (values in `data/economy.json`); fade when out of police sight.
- Police: 1–2 stars foot police, 3 pickups that chase and ram, 4 armed black-uniform unit (no
  real logos) + roadblocks, 5 everything + helicopter.
- Busted → bail = ৳1000 × stars. Enough cash: pay, walk out at Police HQ. Not enough: jail,
  "Study Your Way Out" using Lesson Check / Quiz questions until bail is paid (progress bar).
- Wasted → wake at Dhaka Medical College, pay 10% of cash, lose weapons.
- Stats (kills, cars destroyed, longest chase) for the profile card.

## Session 7 — Vibe and polish
- Day/night (1 game day = 24 real minutes), neon and LED glow at night, pink/orange sunset.
  Monsoon rain with wet roads. Random load-shedding (a district dark for 30 s).
- Sound: engines, rickshaw bells, horns, crowds, hawkers, rain, crows, gunshots. Volumes.
- Vehicle radio: 3 stations, placeholder royalty-free tracks, DJ lines in Bangla/English.
- Bangla/English toggle from `data/strings.json`. Bangla signboards.
- Profile card (tap HUD portrait): Shoumik Kumar, Sir Salimullah Medical College, Ex-Notre
  Dame College + stats.
- Reward codes after N lessons (from JSON) with copy button.
- Screenshot button with "Breaking City" watermark.
- Settings: quality, control size/layout, sound, language, Blood On/Off, reset save.
- 17+ age screen on first launch.

## Session 8 — Release
- Installable PWA: manifest, icons, service worker for offline play. Content (lessons,
  posters, links) is network-first with cache fallback. New versions update automatically.
- Performance pass for a 4GB Android; auto Low quality on weak devices.
- Privacy policy page and credits page.
- `docs/DEPLOY.md`: GitHub Pages steps for a non-programmer.
- Final `docs/HANDOFF.md` for Claude Opus: architecture, conventions, how to add a feature,
  content type, poster, lesson; roadmap (Google Sheet lessons, Capacitor Android app, PC
  polish, better models, online save/leaderboards).

---

## Daily update prompts (Claude Opus 5.5)
- Feature: `Today's task: <one feature or fix>. Follow CLAUDE.md and docs/HANDOFF.md.`
- Poster: `Add poster posters/<file>, shape <wide|16:9|tall>, link <url>, from <date> to <date>, districts <all|names>.`
- Lessons from Google Sheet: `Connect lessons to the Google Sheet. Lessons CSV: <url>. Questions CSV: <url>.`
- New lesson (without sheet): `Add a lesson to data/lessons.json: title <>, institute <>, chapter <>, YouTube <url>, reward <>, questions: <paste>.`
- Bugs: `Fix only these bugs: 1) ... 2) ...`
