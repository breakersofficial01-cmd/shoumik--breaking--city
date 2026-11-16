# Breaking City — Game Spec (living document)

What the game is and what exists **right now**. Updated at the end of every session.
Rules live in `/CLAUDE.md`; the build plan in `docs/SESSIONS.md`; how the code is organised
in `docs/HANDOFF.md`.

Status: **Session 2 of 8 done** (engine, city, foundations, Shoumik, people).

---

## 1. The idea
A free-roam, Vice-City-flavoured open world set in a compressed Dhaka, made for
**Breaking School** and **Breaking Biology**. You play **Shoumik**. The loop:

> study (Lesson Check / Quiz Class) → earn Taka → buy vehicles, homes, weapons, clothes →
> cause trouble → wanted stars → busted → pay bail, or study in jail to earn it.

Money only comes from answering lesson questions. YouTube links open outside the game.

## 2. What you can do today (after Session 2)
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
- Progress (cash, position, quality, outfit) saves itself every 30 seconds and when you leave.

Not in yet: vehicles, landmarks, posters, classes, shops, crime,
police, day/night, sound. See `docs/SESSIONS.md`.

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

Totals: about 3,800 buildings, 2,400 electric poles, 3,400 trees, 3,000 roof tanks.
Everything about districts (size, colours, density, heights, lakes, parks, bridges) is in
`data/districts.json`; grid, sky, fog, props in `data/world.json`.

Reserved for Session 4 landmarks: **Sangsad grounds** (2×2 block plaza). Other landmarks
will replace ordinary blocks using the same "areas" mechanism.

## 4. Look
- PS2-era: low-poly, vertex colours, two 512×64 texture atlases painted in code, nearest
  filtering up close, distance fog, no real-time shadows (blob shadow under Shoumik).
- Permanent warm sunset for now (purple → pink → orange sky, low orange sun). Day/night comes
  in Session 7.
- Buildings: window bays on street sides, blank plaster side walls, ground-floor shutters with
  blank coloured signboards, balconies, roof stair rooms, black water tanks, poles with
  sagging wire bundles, wires zig-zagging across Old Dhaka lanes.

## 5. Shoumik
Low-poly model made in code from `docs/CHARACTER.md`: stocky, round face with his photo as a
small face texture, black quiff, full beard, black watch on the left wrist. About 2,000
triangles. Movement numbers in `data/player.json`: walk 1.9, run 4.6, sprint 8.2 m/s, jump
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

Animations (shared with every pedestrian): idle, arms-crossed idle, walk, run, jump, fall,
punch, melee swing, aim, shoot, enter/exit vehicle, sit, dance, knocked down, cower, shout,
hit, clap. Guns, melee weapons and vehicles that use them arrive in Sessions 3 and 6.

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

## 6. Controls
| Action | Phone | Computer |
|---|---|---|
| Move | left joystick (appears where you touch) | W A S D / arrows |
| Camera | drag on the right side | click the game, then move the mouse (Esc frees it) |
| Sprint | দৌড় | Shift |
| Jump | লাফ | Space |
| Punch | আঘাত | click (after clicking into the game) |
| Dance at a hangout spot | ঢোকো | E |
| Weapon / Horn | অস্ত্র / হর্ন (used from Session 3+) | Q / H |

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
| কম (low) | 0.8× | 210 m | no balconies, fewer props and wires |
| মাঝারি (medium, default) | 1.25× | 300 m | |
| বেশি (high) | 2× | 430 m | smooth edges (after reload) |

With people (Session 2) the headless test shows 54 draw calls / 43k triangles on Low and
96 / 143k on High at the start corner. Before people, measured in the headless test: 30–75 draw calls, 50–190k triangles in view (Old Dhaka is the
heaviest), about 9,700 collision boxes, whole-city layout generated in ~25 ms, a chunk meshed
in ~3 ms on a desktop CPU. Real-phone numbers still need to be measured by the owner.

## 9. Save
`localStorage["breakingCity.save"]`, version 2: cash, player position, outfit, settings (quality,
language, blood), plus empty slots for lessons, owned items, stats and flags. Migrations in
`src/core/save.js`. Unreadable saves are backed up to `breakingCity.save.broken`.

## 10. Content
- Lessons: `data/lessons.json`, loaded and validated by the Content Service. One test lesson
  (`bio-bone-cartilage-01`, 3 Bangla questions). Google Sheet adapter is written and tested
  but switched off (`source.type: "local"`).
- Hangout spots: `data/hotspots.json`, also loaded and validated by the Content Service.
- Everything else that is tunable: `data/*.json` (each file starts with a `_comment`).
