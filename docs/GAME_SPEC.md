# Breaking City — Game Spec (living document)

What the game is and what exists **right now**. Updated at the end of every session.
Rules live in `/CLAUDE.md`; the build plan in `docs/SESSIONS.md`; how the code is organised
in `docs/HANDOFF.md`.

Status: **Session 4 of 8 done + Session 4.5 Part A** (engine, city, foundations, Shoumik, people,
vehicles, traffic, landmarks, MRT, posters; upgraded lighting, shadows, neon glow).

---

## 1. The idea
A free-roam, Vice-City-flavoured open world set in a compressed Dhaka, made for
**Breaking School** and **Breaking Biology**. You play **Shoumik**. The loop:

> study (Lesson Check / Quiz Class) → earn Taka → buy vehicles, homes, weapons, clothes →
> cause trouble → wanted stars → busted → pay bail, or study in jail to earn it.

Money only comes from answering lesson questions. YouTube links open outside the game.

## 2. What you can do today (after Session 4)
- Open the game → loading screen → "শুরু করতে ট্যাপ করুন" → you are Shoumik on a street corner
  in Shahbag at sunset.
- Walk, run, sprint and jump around the whole city. Buildings, poles, trees, lake edges and
  the city limits are solid.
- Look around with the chase camera; it swings back behind you when you let go.
- HUD: Shoumik's portrait, cash (starts at **৳৫০০**), 5 empty wanted stars, a rotating
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
  with their names in English and Bangla. Step into the pink ring at the door and press ঢোকো:
  "classes open soon" (Class Mode is Session 5).
- Posters everywhere (section 3c). Look at one that has a link and tap it (or the
  "পোস্টার খুলুন ↗" button, or F) to open the link.

Not in yet: classes, shops, weapons, wanted stars and police, health, day/night, real sound.
See `docs/SESSIONS.md`.

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
- Permanent warm sunset for now (purple → pink → orange sky, low orange sun). Day/night comes
  in Session 7.
- Buildings: window bays on street sides, blank plaster side walls, ground-floor shutters with
  blank coloured signboards, balconies, roof stair rooms, black water tanks, poles with
  sagging wire bundles, wires zig-zagging across Old Dhaka lanes.

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

All are unlocked for now (`data/outfits.json → unlocked`); the clothes shop (Session 5) can
lock and sell them.

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
| Punch | আঘাত | click (after clicking into the game) |
| Dance at a hangout spot | ঢোকো | E |
| Get into a vehicle / hire a ride | ঢোকো | E |
| Weapon | অস্ত্র (Session 6) | Q |
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

Phones must be in landscape; in portrait a "rotate your phone" screen shows and the game
pauses.

## 7. Language and fonts
- Default language Bangla. All UI text is in `data/strings.json` (`en` + `bn`). HUD numbers use
  Bangla digits when the game is in Bangla (`data/ui.json → hud.digits`).
- Bangla font: Li Ador Noirrit when its licensed file is installed
  (`data/ui.json → fonts.bn.fileInstalled`); until then Hind Siliguri (Google Fonts), then
  the device's Bangla font.
- The language switch button comes in Session 7 (`setLanguage()` already works).

## 8. Performance budget
Target: 30+ fps on a mid-range Android (4 GB RAM), landscape, Chrome.

| Quality | Sharpness cap | View distance | Notes |
|---|---|---|---|
| কম (low) | 0.8× | 210 m | no balconies, fewer props and wires; tone mapping only (no shadows, no bloom) |
| মাঝারি (medium, default) | 1.25× | 300 m | sun shadows (1024), bloom, colour grade |
| বেশি (high) | 2× | 430 m | soft sun shadows (2048), bloom, colour grade, 4× anti-aliasing |

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
`localStorage["breakingCity.save"]`, version 2: cash, player position, outfit, settings (quality,
language, blood), owned vehicles (`owned.vehicles` = list of `{ type, color }`), plus empty slots
for lessons, other owned items, stats and flags. Migrations in
`src/core/save.js`. Unreadable saves are backed up to `breakingCity.save.broken`.

## 10. Content
- Lessons: `data/lessons.json`, loaded and validated by the Content Service. One test lesson
  (`bio-bone-cartilage-01`, 3 Bangla questions). Google Sheet adapter is written and tested
  but switched off (`source.type: "local"`).
- Hangout spots: `data/hotspots.json`, also loaded and validated by the Content Service.
- Places (ride destinations + landmark plots): `data/places.json`, loaded at boot.
- Posters: `data/posters.json` through the Content Service (local now, Google Sheet later).
- Everything else that is tunable: `data/*.json` (each file starts with a `_comment`).
