# Breaking City — Project Rules (read automatically by Claude Code)

You are the lead developer of **Breaking City**, a browser-based 3D open-world game made for
**Breaking School** and **Breaking Biology**, ed-tech brands in Bangladesh. The owner is not a
programmer. Be practical, finish what you start, and keep the game runnable after every session.

Build sessions are listed in `docs/SESSIONS.md`. Content formats are in `docs/CONTENT_GUIDE.md`.
Always read `docs/GAME_SPEC.md`, `docs/CHANGELOG.md` and `docs/CHARACTER.md` (if present) first.

## Tech (do not change without the owner's approval)
- Three.js (pin ONE exact version via an import map from a CDN), plain JavaScript ES modules,
  no build step. Must run from static hosting (GitHub Pages) at a sub-path (`/breaking-city/`),
  so use relative paths everywhere.
- Visual style: early-2000s PS2 era like the original GTA Vice City. Low-poly models built in
  code, flat/vertex colours, small low-res textures, distance fog, neon glow at night, warm
  sunset grading. Not realistic, not pixel-perfect.
- Camera: third-person chase camera behind and slightly above the player, like Vice City.
  Swings behind vehicles when driving. Drag on the right half of the screen to look around.
- Performance: 30+ fps (aim 60) on a mid-range Android (4GB RAM) in Chrome, landscape. Also
  desktop browsers. InstancedMesh, merged static geometry, chunked city with distance culling,
  capped pixel ratio, Low/Medium/High quality.
- Physics: lightweight custom arcade physics. No heavy physics engine.
- Save: localStorage, versioned save format with migrations (`src/core/save.js`).

## Architecture rules (these keep the game updatable)
1. **Data-driven.** Every tunable number and every piece of content lives in `/data/*.json`
   (economy, vehicles, weapons, districts, places, posters, lessons, quiz, strings, links,
   features). No magic numbers in code.
2. **Content Service.** All content is loaded through `src/content/ContentService.js`, which uses
   swappable *adapters* (`LocalJsonAdapter` now, `GoogleSheetCsvAdapter` later). Game code never
   fetches content files directly. Each content type has a schema validator; bad rows are
   skipped and logged, never crash the game. Remote content is cached in localStorage and the
   local JSON is the offline fallback.
3. **Feature modules.** Each gameplay feature is a folder in `src/features/<name>/` exporting
   `{ id, init(game), update(dt), dispose() }`, registered in `src/features/index.js` and
   switchable on/off in `data/features.json`. New features = new folder, no rewrites.
4. **Event bus.** Features talk through `src/core/events.js` (e.g. `cash:changed`,
   `wanted:changed`, `lesson:completed`), not by importing each other.
5. **Asset registry.** All models/textures/sounds come through `src/assets/registry.js` so real
   art can replace placeholders without code changes.
6. **Strings.** All UI text in `data/strings.json` with `en` and `bn` keys.

## Folders
```
index.html  manifest.webmanifest  sw.js
src/main.js  src/core/  src/world/  src/entities/  src/content/  src/features/  src/ui/  src/assets/registry.js
data/*.json   posters/   assets/   tools/
docs/GAME_SPEC.md docs/SESSIONS.md docs/CONTENT_GUIDE.md docs/CHANGELOG.md docs/NEXT.md docs/CHARACTER.md docs/HANDOFF.md
```

## The game
- Free-roam, no missions. Vice-City-inspired but fully original: no Rockstar names, logos,
  fonts or music.
- City "Breaking City" = a compressed, simplified real Dhaka with real place names: Old Dhaka
  (Sir Salimullah Medical College, Ahsan Manzil, Lalbagh Fort, Sadarghat), Shahbag/Campus (Dhaka
  University, Curzon Hall, TSC, Shaheed Minar, Dhaka Medical College, BUET, Nilkhet,
  **Breaking School**), Dhanmondi/Hatirjheel (lake, bridges, cafés, **Breaking Biology
  Institution**), Motijheel/Central (Notre Dame College, Shapla Chattar, Karwan Bazar, Farmgate,
  Police HQ), Sher-e-Bangla Nagar (Jatiya Sangsad Bhaban), Gulshan/Banani. Everywhere: MRT Line 6
  on pillars, flyovers, painted rickshaws, green CNGs, legunas, crowded buses, tea and fuchka
  stalls, tangled wires, roof water tanks, Bangla signboards, crows. Never use official logos
  or crests of real institutions.
- Player: **SHOUMIK**. Hidden profile card: Shoumik Kumar, Sir Salimullah Medical College,
  Ex-Notre Dame College (more later). His look is defined in `docs/CHARACTER.md`.
- Currency: Taka (৳). Loop: study (Lesson Check / Quiz Class) → earn Taka → buy vehicles, homes,
  weapons, clothes → crimes → wanted stars → busted → pay bail, or if broke go to jail and study
  to earn the bail.
- Violence: Vice City level (guns, melee, blood splatter, NPC deaths, explosions, carjacking,
  police shootouts). 17+ age screen on first launch. Settings "Blood: On/Off" (On by default).
- People: varied Dhaka crowds plus Gen-Z hangout spots where stylish, attractive young adults
  dance in trendy outfits. All NPCs are adults. No nudity, no sexual acts, no sexual content.
- No romance, dating or sexual storylines, and no political or religious content.
- Billboards/posters: many slots across the city, driven by `data/posters.json` (date
  scheduling + tap-to-open links).

## YouTube rule (never break)
The game never embeds, autoplays or tracks YouTube and never pays for watching. A lesson's
YouTube link only opens externally (new tab / YouTube app). Money comes from answering the
lesson's questions correctly (Lesson Check), once per player per lesson.

## Controls
Mobile: left joystick (move/steer); right-half drag = camera; buttons Attack/Shoot,
Enter/Exit, Jump/Handbrake, Sprint/Accelerate, Weapon switch, Horn. HUD: cash + wanted stars
top-left, minimap top-right, Shoumik portrait (tap = profile card).
Desktop: WASD, mouse look, E, Space, Shift, Q, H, click to shoot.

## Working rules
1. Do only the requested session/task. Put extra ideas in `docs/NEXT.md`.
2. Keep files small and focused (prefer < 400 lines each).
3. Comment code clearly so another Claude model can continue it.
4. The game must load with no console errors. Test with `?debug=1` (FPS + logs).
5. Commit with a clear message at the end of each session.
6. Finish by updating `docs/CHANGELOG.md` and `docs/GAME_SPEC.md`, then tell the owner:
   (a) how to test on a phone in 5 steps or less, (b) known issues, (c) what comes next.
