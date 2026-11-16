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
