# Breaking City — Game Spec (living document)

What the game is and what exists **right now**. Updated at the end of every session.
Rules live in `/CLAUDE.md`; the build plan in `docs/SESSIONS.md`; how the code is organised
in `docs/HANDOFF.md`.

Status: **all 8 sessions done — release 1.0** (+ Session 4.5 visual upgrade) (engine, city, foundations, Shoumik, people,
vehicles, traffic, landmarks, MRT, posters; upgraded lighting, shadows, neon glow; classes, money,
shops; weapons, wanted stars, police, busted / jail / wasted; day/night, monsoon rain,
load-shedding, sound, radio, Bangla signboards, profile card, reward codes, screenshots, full
settings, 17+ screen; installable offline app, automatic quality, privacy and credits pages).
Live at https://breakersofficial01-cmd.github.io/shoumik--breaking--city/ once `main` is published
(`docs/DEPLOY.md`).

---

## 1. The idea
A free-roam, Vice-City-flavoured open world set in a compressed Dhaka, made for
**Breaking School** and **Breaking Biology**. You play **Shoumik**. The loop:

> study (Lesson Check / Quiz Class) → earn Taka → buy vehicles, homes, weapons, clothes →
> cause trouble → wanted stars → busted → pay bail, or study in jail to earn it.

Money only comes from answering lesson questions. YouTube links open outside the game.

## 2. What you can do today (after Roadmap 2 · Session 5, 2026-11-26)
- **S5 — 3D people and animals:** on Medium/High the people near Shoumik are real animated 3D
  people in Dhaka clothes (lungi, panjabi, saree, salwar-kameez, hijab, shirt-pant, uniforms,
  Gen-Z streetwear) who walk, run, flee, cower, fall, dance, sit, fight and aim; the hotel waiter
  carries his tray in both hands. Stray dogs and cats, cows and goats (Old Dhaka + fields), crows
  on wires and roofs, ducks on lakes and ponds — they run or fly away from gunshots and cars.
  Section 5b.
- **S4 — hotels:** three big hotels — **Breaking Hotel** (Gulshan, with a bar + dance lounge),
  **Shoumik's Culinary** (Hatirjheel) and **Bengali Heritage** (Old Dhaka). Walk in through the
  sliding doors, sit at a free table, the waiter walks over, choose from a 58-item menu
  (Bangladeshi food, fast food, sweets, drinks, mocktails), pay, he brings the 3D dishes on a
  tray, eat to heal. Dance on the bar's glowing floor. Section 10g.
- **S3 — bigger world:** walk or drive out of the city into the **Northern Paddy Fields**
  (rice plots, ponds), the **Golden Sand Desert** (dunes, cacti, rock spires, an oasis), the
  **Coconut Coast** with a beach (umbrellas, canoes) and the **sea**, over the 9 m high
  **Buriganga Bridge** to the **Char Lands**, and up into the **Green Hills** at the edge (far
  mountains on the horizon). Six highways lead out. In the city: **Gulshan Lake** and pond
  parks (Ramna, Banani, Dhanmondi). Everything is on the map; the GPS leads along the highways;
  rickshaw/CNG rides go to the four city exits.
- **S2 — more cars and weapons:** 7 new vehicles — hatchback (৳25,000), pickup (৳45,000),
  microbus (৳55,000), box truck (৳80,000), luxury car (৳1,20,000) at the car showroom; police jeeps
  join chases next to the pickups; plain olive army trucks drive around Sher-e-Bangla Nagar.
  9 new weapons in every weapon shop: knife, heavy pistol, mini SMG, combat shotgun, carbine,
  bullpup rifle, marksman rifle, **grenades** (explode 2 s after the throw) and a **grenade
  launcher** (explodes on contact). Explosions throw and burn cars and are a crime.
- **G1 — faster start, real trees:** the game starts about 40 % faster on mobile data (models
  download while you sign in and while the city is built; all 3D models are compressed to half
  their size); the rest (trains, guns, later new areas) downloads gradually while you play.
  Real 3D trees near you on Medium/High: round trees, oaks and **coconut palms** (more palms in
  Gulshan and around the Dhanmondi / Hatirjheel lakes).
- **Roadmap 2 S1 — street look:** grey street lamps along every block that light up at night
  (glowing bulbs, warm light pools, real light near you on Medium/High), double lamps in the
  parks, benches, dustbins, green waste containers in the lanes, pole transformers, 17
  construction sites wrapped in bamboo scaffolding (some with a green net, fence, cones),
  14 steel foot overbridges over main roads, more street trees, and more Bangla signboards
  (upper-floor coaching / doctor boards, rooftop name boards). Section 3d.
- **Update 9:** sign up with your name, Bangladeshi phone number, class and a 4-digit PIN (one
  account per number), or sign in. New players start with **৳১,০০০ and a pistol with ৩০ bullets**.
  Your name is top-left (tap → your profile: health, money, vehicles, weapons, homes, lessons,
  Sign out). Tap the minimap (M) → **full map** with every shop, hospital, health pack and the two
  institutes; "show the way" draws a yellow GPS line. Police show on the maps while you are wanted.
  44 shops (16 weapon shops, restaurants, clothes, clinics); a price card at each shop; not enough
  money → YouTube classes / quiz offer + the way to Breaking School / Biology; class landing page;
  health packs (+25 %). Content and players live in the Google Sheet (section 12).

- Open the game → loading screen → "শুরু করতে ট্যাপ করুন" → you are Shoumik on a street corner
  in Shahbag at sunset.
- Walk, run, sprint and jump around the whole city. Buildings, poles, trees, lake edges and
  the city limits are solid.
- Look around with the chase camera; it swings back behind you when you let go.
- HUD: the player's name (Update 9; was Shoumik's portrait), cash (starts at **৳১,০০০**), 5 empty wanted stars, a rotating
  minimap, and the district name when you enter a new district.
- Gear button → graphics quality কম / মাঝারি / বেশি.
- Punch with আঘাত / mouse click. People fall, run, shout — and some hit back.
- Stand still and Shoumik folds his arms (his signature pose).
- Gear button → পোশাক: change between his 5 outfits.
- Find a hangout spot (TSC is one block east of the start, in the park) and press ঢোকো / E
  to dance with the crowd.
- Walk up to any vehicle and press ঢোকো / E to get in — a parked one, or one somebody is
  driving (the driver is thrown out). Drive, drift with the handbrake, reverse, crash, jump the
  yellow-and-black ramps in the parks. Press ঢোকো / E again to get out.
- Hire a waiting rickshaw (৳২০) or CNG (৳১০০) and be driven to any of 21 named places.
- Watch the traffic: rickshaws, CNGs, buses stopping at bus stops, jams at Shahbag and Farmgate.
- Progress (cash, position, quality, outfit, owned vehicles) saves itself every 30 seconds and
  when you leave.

- Visit 18 real Dhaka landmarks (section 3b) — hire a rickshaw/CNG to any of them.
- Watch MRT Line 6 trains run on the viaduct over Bijoy Sarani → Shahbag → Karwan Bazar →
  Motijheel and stop at its 4 stations; the elevated expressway runs down the east side.
- Breaking School (campus, Shahbag) and Breaking Biology Institution (Dhanmondi) glow in neon
  with their names in English and Bangla. Step into the pink ring at the door and press ঢোকো to
  open **Class Mode** (section 10b).
- Earn Taka in Class Mode (Lesson Check, Quiz Class) and spend it in 11 shops (section 10c):
  cars, bikes, homes, weapons (used from Session 6), clothes, tea and fuchka (heal).
- Health bar under the stars: punches, crashes, bullets, fire and blasts lower it; food and
  sleeping at home fill it. A blue armour bar appears under it after buying body armour.
- Weapons (section 10d): fists, cricket bat, machete, 7 guns and molotovs from the weapon shop.
  People bleed and die; vehicles can be shot until they burn and explode.
- Crimes give wanted stars; police come on foot, in pickups, with road blocks and a helicopter
  (section 10e). BUSTED → pay bail or study your way out of jail; WASTED → wake up at Dhaka
  Medical College.
- Posters everywhere (section 3c). Look at one that has a link and tap it (or the
  "পোস্টার খুলুন ↗" button, or F) to open the link.

- Session 7 (section 4b): the first launch shows a **17+ screen**. Time passes (1 game day = 24
  real minutes): golden sunset → purple dusk → neon night with lit windows and glowing Bangla shop
  signs → sunrise → blue day. Monsoon rain comes and goes (wet shiny roads, thunder). Now and then
  a district has **load-shedding** for 30 s (lights, signs and LED screens go dark, generators hum).
- Sound everywhere: guns, explosions, engines, horns and rickshaw bells, crowds, hawkers, crows,
  rain, thunder, police sirens. Volumes in Settings.
- In a car / CNG / bus: **radio** with 3 stations and DJ lines (R or the রেডিও button changes it).
- Tap Shoumik's portrait → **profile card** (name, colleges, stats, reward codes with Copy).
- Camera button (or P) → **screenshot** with a "Breaking City" watermark → Save / Share.
- Settings: graphics, sound + 4 volume sliders, বাংলা / English, button size, left-handed layout,
  blood, outfit, reset save.

- Settings → অ্যাপ: **install the game** on the home screen (Chrome/Edge; iPhone: Share → Add to
  Home Screen), open the **Privacy** and **Credits** pages.
- Installed or not, after one online visit the game **plays offline**; new versions and new
  lessons arrive by themselves on the next online launch.

What comes next: daily update prompts and the roadmap in `docs/HANDOFF.md §14`.

## 3. The city
A fixed-seed grid: **14 × 16 big blocks**, each 82 m with 14 m roads (about 1.36 × 1.55 km).
North is up on this sketch:

```
        col 0 ............ 6 | 7 ............ 13
row 0   Sher-e-Bangla Nagar  |  Gulshan / Banani
 ..     (Sangsad grounds,    |  (glass towers,
row 4    Chandrima Udyan)    |   wide plots)
        ---------------------+-------------------
row 5   Dhanmondi / Hatirjheel  (full width)
 ..     Dhanmondi Lake (west)      Hatirjheel water (east, 2 bridges)
row 8
        ---------------------+-------------------
row 9   Shahbag / Campus     |  Motijheel / Central
 ..     (red brick, green,   |  (tall offices)
row 12   Suhrawardy Udyan)   |
        ---------------------+-------------------
row 13  Old Dhaka (full width): narrow lanes, shutters, tangled wires
row 15
        ~~~~~~~~~~~~~~ Buriganga river ~~~~~~~~~~~~~~
```

| District | Feel | Lanes per block | Floors |
|---|---|---|---|
| Sher-e-Bangla Nagar | open, leafy, government | none | 3–9 |
| Gulshan / Banani | posh, glass towers | 1 | 5–18 (+towers) |
| Dhanmondi / Hatirjheel | apartments with balconies, lakes | 2×2 | 4–9 |
| Shahbag / Campus | red brick, trees, parks | 1 | 2–6 |
| Motijheel / Central | office canyon | 1 | 6–22 (+towers) |
| Old Dhaka | dense, narrow lanes, shops everywhere | 3×3 | 2–6 |

Building walls and streets use the look of the Downtown City MegaKit (CC0): real kit windows,
brick, trim, doors and asphalt baked into the facade and ground textures
(`assets/city/`, rebuilt with `tools/city-kit/`), tinted per building.

On Medium/High, four zones (start area, Breaking Biology, Shapla Chattar, Ahsan Manzil) have
real 3D kit buildings (`data/heroBuildings.json`).

**Around the city (Roadmap 2 S3, `data/terrain.json`, `src/world/terrain/`):** the land runs
from col −13 to 23 and row −12 to 27 (junction units; about 3.5 × 3.9 km):

```
            Green Hills (north edge) ~~~~~~~~~~~~~~~~~~~~~~~~~~~~
 Golden     |   Northern Paddy Fields (rows -12..0)   | coast | sea
 Sand       |   Northern Highway (col 7), lotus pond  | Marine Drive
 Desert     +--------- THE CITY (col 0..14) ----------+ beach |  Bay
 (cols      |  Desert Road (row 8) → oasis             Beach Road (row 6)
  -13..0)   +~~~~~~ Buriganga river ~~~ (bridge at col 3) ~~~~~~→ sea
            |   Char Lands (south bank) + Char Road
            Green Hills (south edge)
```
Zones, heights, colours, highways, the bridge, ponds, props per zone and the far mountains
are all in `data/terrain.json`. The countryside models are streamed (`data/streaming.json →
areas`). City water/park areas added: Gulshan Lake, Ramna Park, Banani Lake Park,
Dhanmondi Pond (`data/districts.json`, type `pond` = park with a stone-edged pond).

Totals: about 3,800 buildings, 2,400 electric poles, 3,400 trees, 3,000 roof tanks.
Everything about districts (size, colours, density, heights, lakes, parks, bridges) is in
`data/districts.json`; grid, sky, fog, props in `data/world.json`.

## 3b. Landmarks (Session 4)
Low-poly look-alikes, no official logos or crests. Where: `data/places.json → landmark`;
colours: `data/landmarks.json`. Block = (col, row) on the map above.

| Landmark | Block | Notes |
|---|---|---|
| Jatiya Sangsad Bhaban | Sangsad grounds (2–3, 1–2) | octagon + round towers, big circle/triangle openings, its lake, red-brick plaza with steps |
| Shaheed Minar | 3, 11 | five white frames (middle one bowed), red sun, red stepped platform |
| TSC | 3, 10 | vaulted auditorium, colonnade, cafeteria, little shrine, lawn |
| **Breaking School** | 2, 11 | 9-floor neon glass block, pink/cyan, sign on 4 sides, entrance ring |
| Dhaka University | 4, 12 | long white arts building, three-figure sculpture on a plinth |
| Curzon Hall | 5, 12 | red brick, pointed arches, domed kiosks |
| Dhaka Medical College | 6, 12 | cream colonial hospital, verandas, porch, red emergency canopy |
| BUET | 6, 11 | red-brick blocks with white bands, brick gate with name |
| Nilkhet | 1, 12 | rows of tin-roofed book stalls with colourful book piles |
| **Breaking Biology Institution** | 5, 7 | 8-floor neon glass block, green/yellow, entrance ring |
| Gulshan towers | 10, 2 | four glass towers (one round) on a shopping podium |
| Karwan Bazar | 9, 10 | open market sheds with crates and sacks, media tower |
| Shapla Chattar | 11, 11 | white water-lily fountain, bank towers |
| Notre Dame College | 12, 12 | cream arcaded college round a playing field |
| Sir Salimullah Medical College | 9, 15 | old ochre hospital with red tiled roofs + new ward block |
| Ahsan Manzil | 5, 15 | the pink palace: dome, arched verandas, grand stair |
| Lalbagh Fort | 2, 14 | red walls, gate, white tomb, three-domed mosque, hall, water channel |
| Sadarghat | 7, 15 | launch terminal, pontoons on the Buriganga, 3 river launches, country boats |

Also: paddle boats + lamp posts with fairy lights on the Dhanmondi Lake bridge; white arches
and coloured lights on the Hatirjheel bridges. **MRT Line 6** on pillars (path in
`data/landmarks.json → viaducts`), 4 stations with name boards, 2 trains that stop 7 s at each
station. **Elevated expressway** on pillars along column 13 and row 9 (scenery for now).
Landmark blocks keep their sidewalks, poles and wires, so people, ride stands and bus stops work
as before. Steps at the Sangsad plaza and Shaheed Minar can be walked and driven up.

## 3c. Posters (Session 4)
487 fixed slots + adverts on buses and some rickshaws (`data/posterSlots.json`):

| Kind | Shape | How many | Where |
|---|---|---|---|
| Roof billboard | wide 2:1 | 34 | roofs of 2–8-floor buildings facing a main road |
| LED screen | 16:9 | 16 | on a pole at busy junction corners; changes every 10 s |
| Wall poster | tall 2:3 | 40 | first floor of buildings facing a main road |
| Bus stop | tall 2:3 | 165 | back board of every bus shelter |
| Metro / flyover pillar | tall 2:3 | 232 | both sides of every pillar |
| Bus back panel | wide | every bus | above the rear window |
| Rickshaw back panel | wide (cropped) | ~45% of rickshaws | replaces the painted art |

Posters come from `data/posters.json` (dates, districts, weights, links; guide in
`posters/README.md`). Pictures load only near the player; small posters are drawn within
75 / 160 / 220 m (Low / Medium / High). Empty slots show "এখানে আপনার বিজ্ঞাপন".

## 3d. Street look (Roadmap 2, Session 1)
All placed by `src/world/street/` from `data/street.json`, with their own random numbers (the
buildings and old trees did not move). Count for the current city:

| Thing | How many | Where / notes |
|---|---|---|
| Street lamps | ~1,590 | every gap between two electric poles, arm over the road (Kenney model, grey) |
| Park double lamps | ~70 | grid in the parks (not the Sangsad grounds) |
| Benches | ~290 | inner side of the sidewalk facing the road, and in parks |
| Dustbins | ~340 | next to benches or at the kerb (green / yellow / blue) |
| Waste containers | ~240 | in the small lanes inside blocks |
| Pole transformers | ~180 | on some electric poles (2nd pole, platform, grey tank) |
| Construction sites | 17 | bamboo scaffolding on the road sides, half with a green net, site fence, cones, barriers |
| Foot overbridges | 14 | across main roads (never under the MRT / flyover, at landmarks or bus stops); stairs along the kerb are solid |
| Extra street trees | ~55 % of the gaps | where blockgen left none |

Night: bulbs glow and warm light pools appear on the ground as the windows light up; on
Medium 2 and High 6 real lights sit on the lamps nearest to Shoumik (`data/quality.json →
streetLights`, 0 on Low). Load-shedding turns the lamps off in the dark district.
Signboards: upper-floor boards on ~40 % of street walls without balconies (3+ floors) and big
rooftop name boards on ~12 % of 5+ floor buildings; 16 new names (`data/signboards.json`).
The footbridges cannot be climbed yet (NEXT.md).

## 4. Look
Sky: our own painted 360° sunset (`data/world.json → sky.painted`, `src/world/skyPainter.js`): orange horizon, gold-lit streaky clouds, purple top with faint stars.
- Target since Session 4.5 (owner-approved): **Gangstar Vegas-level mobile open world**.
  Models are still the code-built low-poly ones until real 3D art arrives (Parts B and C).
- Part A (done): filmic ACES tone mapping; strong warm sun with real shadows that follow the
  player (Medium 1024 px map, High 2048 soft; Low has none); neon strips, entrance rings and
  landmark name boards glow (bloom); colour grade (saturation, contrast, warmth, vignette);
  lakes and the river reflect the sunset sky. Every value is in `data/graphics.json`.
- Two 512×64 texture atlases painted in code, nearest filtering up close, distance fog, blob
  shadow under Shoumik and people (kept for contact shadows).
- Day and night since Session 7 (section 4b). A new game starts at the golden sunset (17:12).
- Buildings: window bays on street sides, blank plaster side walls, ground-floor shutters with
  Bangla shop signboards (Session 7), balconies, roof stair rooms, black water tanks, poles with
  sagging wire bundles, wires zig-zagging across Old Dhaka lanes.

## 4b. Day, night, rain, load-shedding and sound (Session 7)
- **Clock**: 1 game day = 24 real minutes (`data/dayNight.json → dayMinutes`), saved. Three painted
  skies (blue day, the sunset, purple night with stars and moon) blend into each other; the sun
  rises in the east and sets on the painted sunset side; at night a weak blue moon light.
- Every hour has a look key (sky blend, sun/moon colour, sky light, fog, exposure, neon strength,
  lit windows, shop-sign glow, bloom, reflections) — change them in `data/dayNight.json → keys`.
- **Night**: 40 % of the windows on code-built buildings glow warm (random per window), shops
  behind open shutters glow, Bangla shop-sign letters glow, neon and markers get brighter, bloom
  is stronger; 3D kit towers' glass glows softly.
- **Bangla signboards**: 40 shop names (`data/signboards.json`) painted once after the Bangla font
  loads; each shop board in the city shows one (some with a small English line), same every visit.
- **Monsoon rain** (`data/weather.json`): dry 3–7 min, rain 1.5–3.5 min, 14 s fade. Drops around
  the camera (900 / 2200 / 4000 by quality, one draw call), roads and walls darken, roads shine
  when looked along, grey fog closes in, weaker sun, thunder + lightning in heavy rain. Roads dry
  over a minute.
- **Load-shedding** (`data/dayNight.json → loadShedding`): every 2.5–6 min one district (half the
  time the one you are in) loses power for 30 s: windows, shop signs, LED screens, billboards and
  tower glass go dark there, a toast says "লোডশেডিং!", generators hum while you are inside.
- **Sound** (`data/audio.json`, all made in code — no files, nothing to license): 6 gun sounds,
  explosions, molotov glass, punches, crashes, engine of the vehicle you drive (pitch = speed),
  horns and random rickshaw bells, crowd murmur (louder near people), distant traffic, hawkers'
  calls, crows by day, rain, thunder, police sirens, fire, generators, UI clicks and a reward chime.
  Any sound can be replaced by a real recording: `data/assets.json → "sound.<id>"`.
- **Radio** (`data/radio.json`): in cars, CNGs, legunas, bikes and buses (not rickshaws/bicycles):
  ঢাকা বিটস ১০১.৫ (pop), নদী এফএম ৯২.০ (folk), নিয়ন নাইট ৮৮.৮ (synthwave). Music is generated in
  code; real tracks can be listed per station. A DJ line slides in every 22–40 s.
- Volumes: 4 buses (all, effects, music & radio, city sounds) in Settings; the game's sound pauses
  with the game.

## 5. Shoumik
**Medium/High (since Session 4.5 Part B): the real 3D Shoumik** — the owner's Rodin/Mixamo model
(maroon camp-collar shirt, beige trousers, cream loafers, black watch, quiff and full beard),
reduced from 618,812 to 20,000 triangles with a 1024² texture, rigged on the Mixamo skeleton,
32 animation clips, 4.2 MB (`assets/shoumik/shoumik.glb`). His idle is the **signature
arms-crossed pose** (built on Mixamo's breathing idle). Height 1.76 m. Rebuild tools:
`tools/shoumik-pipeline/`.
**Low (and if the file fails to load):** low-poly model made in code from `docs/CHARACTER.md`:
stocky, round face with his photo as a small face texture, black quiff, full beard, black watch
on the left wrist. About 2,000 triangles. Movement numbers in `data/player.json`: walk 1.9, run 4.6, sprint 8.2 m/s, jump
5.4 m/s.

| Outfit id | What | Unlocked |
|---|---|---|
| `casual_maroon` (default) | maroon oversized tee, khaki chinos, white sneakers | yes |
| `panjabi_navy` | navy panjabi, maroon cuffs, white pajama | yes |
| `panjabi_grey` | grey printed panjabi, black-and-white collar | yes |
| `doctor` | white apron, light shirt, stethoscope | yes |
| `polo_black` | black polo, cream-striped collar and sleeves | yes |

Free: `casual_maroon` and `panjabi_navy`. Sold in the clothes shop (Session 5): black polo ৳800,
grey panjabi ৳1,500, doctor's apron ৳2,500. Players who already wore one keep it (save v3).
Note: outfits only change the code-built model (Low); the 3D model on Medium/High has one outfit.

Animations of the code-built model (shared with every pedestrian): idle, arms-crossed idle,
walk, run, jump, fall, punch, melee swing, aim, shoot, enter/exit vehicle, sit, dance, knocked
down, cower, shout, hit, clap. Guns, melee weapons and vehicles that use them arrive in Sessions 3 and 6.

Clips in the real 3D model (Mixamo, owner-supplied): idleCrossed (signature), idle, walk, run,
sprint, jump, fall, land, fallOver, turnLeft/Right, punch, hit, hitWalking, batSwing,
pistolIdle, pistolAim, gunplay, shoot, throw, death, enterCar, exitCar, drive, sit, sitIdle,
dance, dance2, talk, dismiss, wave, victory. Which clip plays for each game action:
`data/player.json → model.glb.actions`. Outfits only change the code-built model for now.

## 5b. People
- **Pedestrians**: lungi, panjabi, shirt-pant, office wear, saree, salwar kameez, hijab,
  hawkers, rickshaw pullers, students, Gen-Z streetwear. Mix and crowd size per district in
  `data/pedestrians.json` (Old Dhaka and Motijheel are the busiest). 16 / 28 / 40 people around
  you on Low / Medium / High. All adults.
- **Behaviour**: walk sidewalks, wait and cross at corners, pause, make way for Shoumik. When
  somebody is hit nearby they run, cower or shout (Bangla speech bubbles). Brave ones fight
  back (3 punches to drop them).
- **Hangout spots** (`data/hotspots.json`): TSC (park, 8 dancers), Dhanmondi lakeside,
  Hatirjheel, Gulshan café. Dance mat, boombox, neon posts, Gen-Z dancers in time with the
  beat. Shoumik can join. No sexual content, no romance.
- **Real 3D people (Roadmap 2 S5)**: on Medium / High the 10 / 18 people nearest to Shoumik
  (within 30 / 42 m) are rigged 3D people (Kenney CC0 body + Mixamo animations: idle, walk, run,
  sit, dance ×2, clap, cower, fall down, hit, punch, aim, shoot, drive, shout, tray carrying);
  the rest and everyone on Low are code-built. Same looks as the code crowd (colours and clothing
  kinds of `data/pedestrians.json`, painted per person + added hair / hijab / lungi / saree /
  kameez / panjabi / bags / basket / gun pieces). The model streams in right after the start
  (602 KB, Medium/High). Settings `data/people.json`.
- **Animals (Roadmap 2 S5)**: stray dogs and cats on sidewalks; cows (Deshi, with the hump) and
  Black Bengal goats in Old Dhaka and the Northern Fields / Char Lands / coast / desert; house
  crows on wires and roof edges; ducks on city lakes, park ponds and village ponds. They wander,
  lie down, graze, swim; gunshots / explosions / crashes make them run or fly off; cars make them
  jump aside (never hurt — no gore for animals). At most 9 / 18 / 28 (Low / Medium / High),
  code-built and instanced (no download). Settings `data/animals.json`.

## 5c. Vehicles and traffic
| Vehicle | Top speed | Notes |
|---|---|---|
| Rickshaw | 22 km/h | painted art panel; can be hired (৳20) |
| Bicycle | 31 km/h | |
| CNG | 50 km/h | green three-wheeler; can be hired (৳100) |
| Leguna | 58 km/h | stops at bus stops |
| Motorbike | 112 km/h | leans into corners |
| Sedan | 108 km/h | real 3D body on Medium/High |
| Yellow cab | 104 km/h | real 3D body on Medium/High |
| SUV | 101 km/h | heavy, tough; real 3D body |
| Sports car | 155 km/h | fastest, best grip; 2 real 3D shapes |
| Local bus | 61 km/h | very heavy, dented, stops at bus stops |
| Police car | 126 km/h | navy/white real 3D car on Medium/High (pickup on Low); no logos; police AI in Session 6 |
| Ambulance | 108 km/h | real 3D body |

Real 3D bodies come from free CC0 packs (`assets/CREDITS.md`), switched by
`data/vehicles.json → realModels.useOn`. The MRT Line 6 trains also use a real 3D model on
Medium/High. Gun models are ready for Session 6 (`data/weapons.json`).

- **Driving**: arcade physics made for this game (no physics engine). Handbrake = drift.
  Buildings, poles, trees and lake edges are solid; kerbs are not. Kerb-high steps are driven
  over, anything taller is a wall.
- **Damage**: health per vehicle; crashes above 16 km/h cost health; under 50% smoke, under
  20% fire, at 0 it burns for 5 s and explodes (9 m blast).
- **Traffic**: left-hand driving, 2 lanes each way on the main roads (inner 1.7 m and outer
  4.4 m from the centre line). 7 / 12 / 18 AI vehicles around you on Low / Medium / High (more
  near a jam), plus 5 / 8 / 12 parked ones. Junctions alternate north-south and east-west
  traffic every 9 s. Jams: Shahbag (junction 3,10) and Farmgate (junction 8,9).
- **Rides**: a stand (rickshaw + CNG with waiting drivers) at each of the 21 places in
  `data/places.json`. Fares in `data/economy.json`.
- **Owned vehicles**: listed in the save; they appear on the road south of the Shahbag start
  junction (`data/vehicles.json → garage`) until homes exist.
- **Ramps**: Suhrawardy Udyan (2), Sangsad plaza (2), Chandrima Udyan (1) — `data/world.json → ramps`.

Junctions are numbered like the blocks on the map in section 3: junction (col, row) is the
north-west corner of block (col, row).

## 6. Controls
On foot:

| Action | Phone | Computer |
|---|---|---|
| Move | left joystick (appears where you touch) | W A S D / arrows |
| Camera | drag on the right side | click the game, then move the mouse (Esc frees it) |
| Sprint | দৌড় | Shift |
| Jump | লাফ | Space |
| Punch / swing / shoot / throw | আঘাত (guns lock on to the nearest target in front: red ring) | click (after clicking into the game); guns fire at the crosshair |
| Aim closer (over the shoulder) | – | hold the right mouse button |
| Dance at a hangout spot | ঢোকো | E |
| Get into a vehicle / hire a ride | ঢোকো | E |
| Next weapon | অস্ত্র | Q |
| Open the poster you look at | tap it, or the পোস্টার খুলুন button | F |
| Enter Breaking School / Biology (in the ring) | ঢোকো | E |

In a vehicle (the same buttons, with new labels):

| Action | Phone | Computer |
|---|---|---|
| Steer | left joystick left / right | A / D |
| Accelerate | গ্যাস, or joystick forward | W |
| Brake, then reverse | joystick back | S |
| Handbrake (drift) | ব্রেক | Space |
| Horn | হর্ন | H |
| Get out (brakes first if moving) | নামো | E |
| Radio: next station / off | রেডিও (only while driving) | R |

Anywhere: screenshot = camera button (left, under the gear) or P. Settings can make the touch
buttons small / normal / large and mirror them for left-handed players (buttons left, joystick right).

Phones must be in landscape; in portrait a "rotate your phone" screen shows and the game
pauses.

## 7. Language and fonts
- Default language Bangla. All UI text is in `data/strings.json` (`en` + `bn`). HUD numbers use
  Bangla digits when the game is in Bangla (`data/ui.json → hud.digits`).
- Bangla font: Li Ador Noirrit when its licensed file is installed
  (`data/ui.json → fonts.bn.fileInstalled`); until then Hind Siliguri (Google Fonts), then
  the device's Bangla font.
- Settings → ভাষা: বাংলা / English (saved). The 17+ screen has its own switch. Class Mode and the
  jail quiz stay in Bangla whatever the game language is (CLAUDE.md quiz rule).
- Shop signboards are always Bangla (with a small English line on some), like real Dhaka.

## 8. Performance budget
Target: 30+ fps on a mid-range Android (4 GB RAM), landscape, Chrome.

**Roadmap 2 S5 (3D people + animals).** Each real 3D person = 2 draw calls (body + clothes pieces;
High: ×2 with sun shadows) and one small skinned skeleton (32 bones, 17 clips shared); people
beyond 18 m animate every 2nd frame. Medium: ≤ 10 real people, no person shadows; High: ≤ 18 with
shadows; Low: none (nothing downloaded). Animals: ≤ 4 instanced draw calls per kind that is near
(dog, cat, cow, goat, crow, duck), ~20 matrices per animal per frame. Download: +602 KB after the
start on Medium/High. Measured (headless, Shahbag start corner, `tools/people-check.js --only counts`):
Medium 356 → 360 draw calls with 8 real people (triangles about the same: the Kenney body is ~1.6k
triangles, about as many as a code-built person), High 436 → 453 with 14 real people and their
shadows; Low unchanged (157 calls). **Real-phone FPS still to be measured by the owner.**

**Size and start time (G1, 2026-11-21).** All game files ≈ 16 MB (was 26 MB) (models 9.4 MB, meshopt-
compressed). Downloaded before playing: Low ≈ 3.5 MB, Medium ≈ 7.7 MB (+ three.js 0.7 MB from
the CDN). Start → playing at 8 Mbps mobile data (headless test, includes software drawing):
Low 7.5 s, Medium 13 s (before G1: 11.7 s / 20.5 s). Budget from now on: first play under ~15 MB,
whole game 150–250 MB, new areas load when you get near (`data/streaming.json`).
Real trees (Medium, start corner): +16 draw calls, +64k triangles (no tree shadows on Medium).

**Automatic quality (Session 8).** Until the player picks a quality in Settings, the game chooses:
weak devices (≤2 GB RAM, ≤4 CPU cores, or a known slow graphics chip — `data/performance.json`)
start on কম (Low), others on মাঝারি (Medium). While playing, a watchdog measures the real frame
rate every 6 s (after 8 s of warm-up); under 26 fps it steps down one level (High → Medium →
Low) and then lowers the picture resolution on Low in 10 % steps down to 60 %, each time with a
short toast. On Low the sky reflections are refreshed every 75 s instead of 25 s. A lost
graphics context (phone short on memory) shows a "Graphics paused — Reload" screen; the game is
saved first.

| Quality | Sharpness cap | View distance | Notes |
|---|---|---|---|
| কম (low) | 0.8× | 210 m | no balconies, fewer props and wires; tone mapping only (no shadows, no bloom) |
| মাঝারি (medium, default) | 1.25× | 300 m | sun shadows (1024), bloom, colour grade |
| বেশি (high) | 2× | 430 m | soft sun shadows (2048), bloom, colour grade, 4× anti-aliasing |

Roadmap 2 S1 (street look, headless 915×412, start corner, night): Low 143 → 162 draw calls, 70k → 94k
triangles; Medium 284 → 322 draw calls (shadow pass included), 474k → 560k triangles. Small street
props are merged into ONE mesh per chunk (+ 1 for the bulbs, + 1 for the light pools; scaffolding
and nets are instanced, only on chunks with a site); 2 or 6 real lights on Medium / High.

Session 7 (headless, software rendering, Medium, Shahbag start corner): ~217 draw calls (+10: one
Bangla-sign mesh per chunk), rain adds 1 draw call, the day/night look costs nothing per object
(uniforms on shared materials) plus one small reflection-map refresh every 25 s. Sound runs on the
browser's audio thread. **Real-phone FPS still to be measured by the owner.**

Session 4.5 Part A (headless, software rendering): Shahbag start corner about 89 draw calls on
Low, ~190 on Medium, ~210 on High (shadows draw nearby things a second time). In the software
renderer Medium/High are too slow for the time-based vehicle/poster tests, which pass on Low;
**real-phone FPS on Medium must be checked** — if it is under 30, use কম or tune
`data/quality.json`.

With landmarks and posters (Session 4) the headless test (software rendering, 915×412) shows about
84 draw calls / 64k triangles on Low and ~127 / 122k on Medium at the Shahbag start corner, the
busiest landmark area (Session 3: 57 on Low, ~100 on Medium);
each landmark is ≤3 draw calls and is only drawn within view distance; each visible poster is one.
All landmark geometry together is ~120k triangles but only a few landmarks are in view at once.
With traffic (Session 3) the headless test shows 57 draw calls / 72k triangles on Low and about 100 / 140k
on Medium at Shahbag; all vehicle code together takes about 0.4 ms per frame on a desktop CPU.
Each vehicle is one draw call, all wheels together are one, smoke and fire are two.
With people (Session 2) the headless test showed 54 draw calls / 43k triangles on Low and
96 / 143k on High at the start corner. Before people, measured in the headless test: 30–75 draw calls, 50–190k triangles in view (Old Dhaka is the
heaviest), about 9,700 collision boxes, whole-city layout generated in ~25 ms, a chunk meshed
in ~3 ms on a desktop CPU. Real-phone numbers still need to be measured by the owner.

## 9. Save
`localStorage["breakingCity.save"]`, version 5: cash, player position, outfit, settings (quality,
`qualityAuto` + `resolutionScale` (Session 8, automatic quality), language, blood, sound, volumes, control size, control layout, radio station), `clock` (time of
day), `rewards` (unlocked reward codes), `playSeconds`, `flags.ageOk` (17+ accepted), owned vehicles (`owned.vehicles` = list of `{ type, color }`), owned homes /
weapons / outfits, `health`, `home` (spawn point), `garage`, Lesson Check results per lesson
(`lessons[id] = { attempts, paid: [question ids], earned, best }`), Quiz Class stats (`classes`),
`ammo` (bullets per weapon), `weapon` (in his hand), `armour`, `wanted` (heat — a chase goes on
after a reload), `jail` (`{ owed, paid }` while in jail), `stats` (kills, policeKilled,
carsDestroyed, longestChase, busted, wasted, shotsFired) and flags. Migrations in
`src/core/save.js`. Unreadable saves are backed up to `breakingCity.save.broken`.

## 10. Content
- Lessons: `data/lessons.json`, loaded and validated by the Content Service. One test lesson
  (`bio-bone-cartilage-01`, 3 Bangla questions). Google Sheet adapter is written and tested
  but switched off (`source.type: "local"`).
- Hangout spots: `data/hotspots.json`, also loaded and validated by the Content Service.
- Places (ride destinations + landmark plots): `data/places.json`, loaded at boot.
- Posters: `data/posters.json` through the Content Service (local now, Google Sheet later).
- Everything else that is tunable: `data/*.json` (each file starts with a `_comment`).

## 10b. Class Mode (Session 5)
At the pink ring of **Breaking School** (Shahbag) or **Breaking Biology Institution** (Dhanmondi):
ঢোকো → a full-screen panel, always in Bangla with Bangla digits and the Bangla font; the game pauses.

| Choice | What happens |
|---|---|
| লেসন চেক | Lessons of that institute grouped by subject · chapter, badge নতুন / আবার চেষ্টা করো / সম্পন্ন. Lesson screen: reward, earned so far, **ইউটিউবে দেখো** (opens YouTube outside the game), চেক শুরু করো: 3 random questions, options shuffled (ক খ গ ঘ), 30 s each, instant সঠিক!/ভুল! with the right answer and explanation. ৳150 per right answer, each question pays once per player; 2 tries per lesson (a try counts when it starts). |
| কুইজ ক্লাস | Practice rounds of up to 10 questions from all that institute's lessons: ৳50 per right answer, ৳200 every 5 in a row, ৳300 for the first round of the day (`data/economy.json → quizClass`, optional daily cap). |
| ভর্তি হও | Opens `data/links.json → enrollBreakingSchool / enrollBreakingBiology` (empty now → "coming soon"). |

Today: one lesson (Breaking Biology, bone and cartilage, 3 questions); Breaking School has none
yet and says so. Hidden check: add `?admin=1` to the address → red **অ্যাডমিন** button → lesson /
question counts per institute, content sources, skipped rows with reasons.

## 10c. Shops and homes (Session 5)
Glowing rings with a floating name sign on sidewalk corners, coloured dots on the minimap
(edge dots point the way). Stand in a ring, press ঢোকো. Places: `data/shops.json`; prices:
`data/economy.json → prices`.

| Shop | Where (junction) | Sells |
|---|---|---|
| গুলশান কার শোরুম | Gulshan (9,1) | yellow cab ৳30,000 · sedan ৳40,000 · SUV ৳65,000 · sports car ৳1,50,000 |
| বাইক ও সাইকেলের দোকান | Karwan Bazar side (7,10) | bicycle ৳2,500 · motorbike ৳18,000 |
| প্রপার্টি অফিস | Motijheel (11,10) | Old Dhaka mess ৳12,000 · Dhanmondi flat ৳60,000 · Gulshan house ৳2,00,000 |
| গলির অস্ত্রের দোকান | Old Dhaka (6,14) | cricket bat ৳1,200 · machete ৳2,500 · pistol ৳5,000 … sniper ৳50,000 (7 guns) · molotov ×3 ৳3,000 · body armour ৳2,000 · ammo boxes ৳600–2,500 |
| পোশাকের দোকান | Nilkhet side (2,10) | the 3 locked outfits |
| চায়ের দোকান ×3 | TSC (4,10), Dhanmondi lake (1,6), Old Dhaka (8,14) | tea ৳10 (+15 health), tea + biscuit ৳15 (+25) |
| ফুচকার দোকান ×3 | Shahbag start (3,10), Dhanmondi (4,7), Motijheel (10,9) | fuchka ৳50 (+45), chotpoti ৳40 (+35) |

Bought vehicles appear at the garage of your home (or south of the Shahbag start corner when you
have none). A bought home gets a white ring: ঢোকো there = sleep (full health, game saved) and it
becomes your home (spawn point if the saved spot is unusable, garage for your vehicles). With
several homes, choose with "এখানে থাকো" in the property office or by sleeping there. Food is
refused at full health so you never pay for nothing.

## 10d. Weapons (Session 6)
All numbers in `data/weapons.json` (prices in `data/economy.json → prices.weapons`). Q / অস্ত্র
switches between the weapons he owns; the badge next to the minimap shows the weapon and bullets.

| Weapon | Kind | Damage | Notes |
|---|---|---|---|
| ঘুষি fists | melee | knock-down | always there; only kills someone already lying down |
| ক্রিকেট ব্যাট cricket bat | melee | 45 | knocks people down, dents cars |
| রামদা machete | melee | 75 | |
| পিস্তল pistol / রিভলভার revolver | gun | 34 / 70 | one shot per tap |
| এসএমজি SMG / রাইফেল assault rifle | gun | 22 / 38 | automatic while held |
| কাটা শটগান sawed-off / শটগান shotgun | gun | 8–9 pellets × 20–22 | short range |
| স্নাইপার sniper | gun | 160 | long range |
| মলোটভ molotov | throw | fire 45/s for 7 s | sets cars alight; 3 bottles per purchase |

- People have 100 life (police 120, the black-uniform unit 180, `data/combat.json`). Dead people lie
  in a spreading blood pool for 35 s. Running someone over faster than ~50 km/h kills.
- Phones: **aim assist** locks on to the best target in front of the camera (red ring).
  Computer: **free aim** at the crosshair; hold the right mouse button for a closer view.
- Bullets stop at walls; vehicles take damage and explode; the guns are real 3D models in his hand
  (code-built bat, machete and bottle).
- Settings → রক্ত (Blood) চালু / বন্ধ switches all blood off (pools and spray).

## 10e. Wanted stars and police (Session 6)
Crimes add heat (`data/economy.json → wanted.crimes`): punching someone 10, hitting someone with a
vehicle 30, carjacking 40, shots fired 15, murder 60, molotov 40, destroying a vehicle 50,
attacking police 45, killing a police officer / destroying a police vehicle 150, stealing a police
pickup 90. Stars at 30 / 120 / 300 / 600 / 1000 heat. When no police unit has seen him for 14 s
the stars blink and one star fades.

| Stars | Police (`data/police.json → levels`) |
|---|---|
| ★ | 2 officers on foot with batons — they run up and arrest him |
| ★★ | 4 officers with pistols |
| ★★★ | + 2 police pickups that chase and ram; the crew jumps out when he is on foot |
| ★★★★ | + the black-uniform unit with rifles, black pickups, road blocks ahead of him while he drives |
| ★★★★★ | everything + a helicopter with a spotlight and a gunner (it can be shot down) |

Counts are scaled by quality (`data/quality.json → police`: Low 0.6, Medium 0.85, High 1).
No real police names, crests or logos.

**BUSTED** (an officer holds him for 1.3 s while he is slow on foot, or his vehicle has stopped):
bail = ৳1,000 × stars. Enough cash → pay and walk out at Police HQ. Not enough → **jail**: his cash
goes towards the bail and he answers Lesson Check questions (Bangla, Bangla digits, 30 s each);
every right answer pays ৳250 of the bail (progress bar) until he walks out. Jail is saved.
**WASTED** (health 0): he wakes up at Dhaka Medical College, pays 10 % of his cash and loses his
weapons (`data/economy.json → wasted`).

## 10f. Profile card, reward codes, screenshots, 17+ (Session 7)
- **Profile card** (tap the HUD portrait): portrait, শৌমিক কুমার / Shoumik Kumar, Sir Salimullah
  Medical College, Ex-Notre Dame College (`data/profile.json`, more lines can be added), and stats:
  cash, lessons done, Taka from Lesson Check and Quiz Class, time played, vehicles, homes, kills,
  police, vehicles destroyed, longest chase, busted, wasted, shots fired.
- **Reward codes** (`data/rewards.json`, Content Service → Google Sheet later): a code unlocks after
  N lessons (a lesson counts once one of its questions was answered right). A toast + chime when
  unlocked; the code shows in the profile card with Copy (and an optional ↗ link). Locked ones
  show how many lessons are still needed. **The three codes in the file are samples.**
- **Screenshot**: camera button / P → the game view (no buttons) with a BREAKING CITY watermark and
  "Breaking School • Breaking Biology" → Save (download) or Share (phone share sheet, for
  Facebook / Instagram / TikTok).
- **17+ screen** on the first launch: what is in the game, "17 or older — play" / "under 17"
  (friendly no + links to lessons from `data/links.json` when filled). The game is paused behind
  it; it is saved and not asked again (even after a reset).

## 10g. Hotels, waiter and food (Roadmap 2, Session 4)
- **Where**: Breaking Hotel block (11,3), Shoumik's Culinary (11,8), Bengali Heritage (11,14),
  all facing north (`data/places.json`, look `data/landmarks.json → types`, builder
  `src/world/landmarks/hotels.js`). Ground floor = a hollow 60 × 48 m room with a door gap.
- **Inside** (`src/features/hotels/`, numbers `data/hotels.json`): lobby + restaurant tables
  (grid `tables.xs × zs`), kitchen door, serving counter; Breaking Hotel also a bar (9 stools,
  bartender) and a dance floor (10 dancers, boombox music). Diners sit at ~40 % of tables (max 16).
  Built only after the stream group `hotel-<id>` (food models) arrived; doors shut until then.
- **Meal**: sit (E) → waiter walks over → menu card (max 4 items, tabs per `cat`) → pay → kitchen
  (`waiter.kitchenSeconds`) → served on the table → each dish eaten in `order.eatSeconds` gives
  its `heal` → E = order more, Jump = stand up (food not yet eaten heals at once).
- **Menu** (`data/menu.json`): 58 items, kind food / drink, heal, icon, 3D `model` parts. Hotel
  menus: Bengali Heritage = Bangladeshi + traditional drinks; Breaking Hotel = fast food, sweets,
  mocktails / soft drinks (bar card: drinks + snacks); Shoumik's Culinary = a mix. Products sheet
  rows (kind food / drink, columns price, heal, active) override the data.
- No alcohol anywhere (mocktails only); all NPCs are adults; dancing is plain party dancing.

## 11. Release: app, offline, pages (Session 8)
- **Installable app** (`manifest.webmanifest`, icons in `assets/icons/`): name Breaking City,
  landscape, fullscreen, purple/sunset "BC" icon. Settings → অ্যাপ → install button when the
  browser offers it, otherwise a hint (iPhone: Share → Add to Home Screen; Chrome menu → Install app).
- **Offline play** (`sw.js`, settings in `data/pwa.json`): game code, data and content (lessons,
  posters, links, rewards) are fetched fresh when online (network first, 8 s timeout) and saved for
  offline; 3D models, pictures and sounds come from the saved copy first and refresh in the
  background; three.js (pinned version) is saved once. Releases need no version bump.
- **Privacy policy** (`privacy.html`) and **Credits** (`credits.html`), Bangla and English, text in
  `data/pages.json`, social buttons from `data/links.json`. Privacy in short: no accounts, no ads,
  no tracking; the save stays in the browser; third-party files (jsDelivr, Google Fonts, GitHub
  Pages) see the IP address like any website.
- **Publishing**: `docs/DEPLOY.md` (GitHub Pages from `main`).


## 12. Accounts, the Google Sheet, map and help (Update 9)
- **Accounts** (`src/core/account.js`, `src/ui/signIn.js`, `data/accounts.json`): sign up = name +
  BD mobile (`01[3-9]` + 8 digits) + class + 4-digit PIN ×2; sign in = phone + PIN. One account per
  number (checked on the phone and, when connected, in the sheet). Save key per account
  `breakingCity.save.<phone>`. `?autostart=1` plays as a local test player (`testAccount`).
- **Google Sheet** "Breaking City — Game Data"
  (https://docs.google.com/spreadsheets/d/1fIEDXo3xX3RwOJR04mcujVnXGp9Iw8fmHygVqw6Q0lE/edit):
  Products, Classes, Questions, Players, README. Connected through the Apps Script web app
  (`tools/sheets/Code.gs`) whose URL goes in `data/sheet.json → apiUrl` (empty = local files only).
- **Products** override name / price / picture / on-sale of shop items (content type `products`).
- **Full map** (`src/features/minimap/bigMap.js`, `data/mapView.json`), **GPS route** (`route.js`),
  **police on the map** (police feature → `map:blips` id `police`).
- **Shops**: 44 (16 weapons, 14 food incl. 8 restaurants, 5 clothes, 6 health, 2 vehicles, 1 property).
  Price card in the ring; unaffordable items → `earn:offer`.
- **earn feature**: the offer (YouTube classes, quiz, way to the institutes, way to the nearest
  weapon shop when out of bullets) and the class landing page → `class:start`.
- **Health**: 36 packs (+25 %, respawn 90 s), clinics (+25 % / +50 % / full).
- **Start**: ৳1,000 + pistol with 30 bullets (`data/economy.json → startCash, starter`).
- **Update 9b**: health 0 = dead → new session at the start point, only ৳500 cut, everything kept.
  After paying bail / finishing jail questions he is free: all police leave, no new stars for 60 s.
