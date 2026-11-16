# Breaking City — Game Spec (living document)

What the game is and what exists **right now**. Updated at the end of every session.
Rules live in `/CLAUDE.md`; the build plan in `docs/SESSIONS.md`; how the code is organised
in `docs/HANDOFF.md`.

Status: **Session 1 of 8 done** (engine, city, foundations).

---

## 1. The idea
A free-roam, Vice-City-flavoured open world set in a compressed Dhaka, made for
**Breaking School** and **Breaking Biology**. You play **Shoumik**. The loop:

> study (Lesson Check / Quiz Class) → earn Taka → buy vehicles, homes, weapons, clothes →
> cause trouble → wanted stars → busted → pay bail, or study in jail to earn it.

Money only comes from answering lesson questions. YouTube links open outside the game.

## 2. What you can do today (after Session 1)
- Open the game → loading screen → "শুরু করতে ট্যাপ করুন" → you are Shoumik on a street corner
  in Shahbag at sunset.
- Walk, run, sprint and jump around the whole city. Buildings, poles, trees, lake edges and
  the city limits are solid.
- Look around with the chase camera; it swings back behind you when you let go.
- HUD: Shoumik's portrait, cash (starts at **৳৫০০**), 5 empty wanted stars, a rotating
  minimap, and the district name when you enter a new district.
- Gear button → graphics quality কম / মাঝারি / বেশি.
- Progress (cash, position, quality) saves itself every 30 seconds and when you leave.

Not in yet: real Shoumik model, people, vehicles, landmarks, posters, classes, shops, crime,
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

## 5. Player (placeholder)
Blocky Shoumik with the right colours and proportions from `docs/CHARACTER.md` (stocky, black
quiff, beard, maroon tee, khaki chinos, white sneakers, black watch on the left wrist).
Numbers in `data/player.json`: walk 1.9, run 4.6, sprint 8.2 m/s, jump 5.4 m/s.
Session 2 replaces the model; the movement code stays.

## 6. Controls
| Action | Phone | Computer |
|---|---|---|
| Move | left joystick (appears where you touch) | W A S D / arrows |
| Camera | drag on the right side | click the game, then move the mouse (Esc frees it) |
| Sprint | দৌড় | Shift |
| Jump | লাফ | Space |
| Attack / Enter / Weapon / Horn | আঘাত / ঢোকো / অস্ত্র / হর্ন (buttons exist, used from Session 3+) | click / E / Q / H |

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

Measured in the headless test: 30–75 draw calls, 50–190k triangles in view (Old Dhaka is the
heaviest), about 9,700 collision boxes, whole-city layout generated in ~25 ms, a chunk meshed
in ~3 ms on a desktop CPU. Real-phone numbers still need to be measured by the owner.

## 9. Save
`localStorage["breakingCity.save"]`, version 1: cash, player position, settings (quality,
language, blood), plus empty slots for lessons, owned items, stats and flags. Migrations in
`src/core/save.js`. Unreadable saves are backed up to `breakingCity.save.broken`.

## 10. Content
- Lessons: `data/lessons.json`, loaded and validated by the Content Service. One test lesson
  (`bio-bone-cartilage-01`, 3 Bangla questions). Google Sheet adapter is written and tested
  but switched off (`source.type: "local"`).
- Everything else that is tunable: `data/*.json` (each file starts with a `_comment`).
