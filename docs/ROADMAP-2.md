# Roadmap 2 — bigger world, real models, things to fly, ride and enter

Agreed with the owner on 2026-11-21. Work through it ONE session at a time (CLAUDE.md working
rule 1). Each session: build, test (a tool in `tools/`), update CHANGELOG / GAME_SPEC / HANDOFF,
commit + push, then tell the owner how to test on a phone. Tick the box when a session is done.

## Owner's decisions
- **Free models only** (CC0: Quaternius, Kenney, Poly Pizza CC0 items). No paid packs, no ripped
  game models, no real brand / airline / army logos. Record every pack in `assets/CREDITS.md`.
- **Expand the city**: airport, cantonment, the Buriganga river usable by boats, and new land
  around the city (see Session 3).
- **Enterable buildings**: own homes, the three hotels, a few shops/restaurants, Breaking School,
  Breaking Biology, Police HQ. Entering = walk into the door → short fade → interior scene.
- **Army**: soldiers guard the cantonment gate and patrol inside; entering without permission =
  1 star; attacking soldiers = the army comes (5-star level, army trucks, **tanks**). Plain green
  uniforms, no real Bangladesh Army insignia or crests.
- Performance first: every model gets a Low-quality version / fallback; far things are hidden;
  mid-range Android must keep 30+ fps.

## Downloading the free packs
The cloud environment **`shoumik--breaking--city`** allows the download sites (kenney.nl,
quaternius.com, Google Drive download hosts, poly.pizza). Start sessions in that environment.
Checked 2026-11-21: quaternius.com answers; kenney.nl and poly.pizza answer when curl sends a browser
User-Agent (`-A "Mozilla/5.0"`). If a download is still blocked, ask the owner to download the ZIP and upload it.
Convert FBX/OBJ → GLB like Session 4.5 (see HANDOFF §9), keep files small (merge meshes,
flat colours, no big textures), add ids to `data/assets.json`.

## Sessions

- [ ] **S1 — Street look.** Street lamps that light up at night (glow + light pools, few real
  lights), benches, footbridges over main roads, more signboards, construction sites (barriers,
  cones, scaffolding), more street trees, dustbins, power transformers. Kenney City Kit (Roads),
  Quaternius props.
- [ ] **S2 — More cars and weapons.** 6–8 new vehicle types (pickup, van, microbus, truck, luxury
  car, police jeep, army truck) and 6+ new weapons (unused guns from the Ultimate Gun Pack,
  knife, grenade, grenade launcher). Add them to the shops and the Products sheet tab.
- [ ] **S3 — Bigger world.** Expand the map around today's city: **large green fields**, a
  **desert**, the **sea with a beach**, **mountains** at the edge, **ponds and lakes between the
  city blocks**, the river. Simple far-away terrain (low-poly), chunked like the city. New
  districts in `data/districts.json`; new places for rides and the map.
- [ ] **S4 — Three big hotels + bar.** "Shoumik's Culinary", "Breaking Hotel", "Bengali Heritage":
  large landmark buildings (on the map, with rides). Walk in → lobby + restaurant interior.
  **Waiter** NPC walks to your table and serves the food you order (menu from the Products sheet,
  kind `food`; eating heals). A **bar / dance lounge** inside one hotel where adults dance (reuse
  hotspots dancing; all NPCs adults; no sexual content — CLAUDE.md). Drinks default to soft
  drinks / mocktails / borhani / lassi unless the owner says otherwise.
- [ ] **S5 — Real 3D people and animals.** Animated men and women (Quaternius CC0) replace the
  code-built crowd on Medium/High (code crowd stays on Low); waiters, soldiers, pilots reuse
  them. Animals: stray dogs, cats, cows, goats, crows, ducks on lakes.
- [ ] **S6 — Ride with other people.** Board **buses** (at bus stops), the **MRT metro** (at
  stations) and **trains**; passengers sit inside; pick a stop on the map; get off anywhere.
- [ ] **S7 — Water.** Drivable **speedboat** and **yacht** (river, sea, Hatirjheel); a
  **launch / ship** at Sadarghat you can ride with passengers; boat shop.
- [ ] **S8 — Cantonment and army.** Walled cantonment with gate, barracks, parade ground,
  **tanks** (parked and moving; can chase at 5 stars), army trucks, soldiers.
- [ ] **S9 — Helicopters you can fly.** **Large buildings with rooftop helipads** where a
  helicopter waits; buy or take one; arcade controls on phone (up/down, turn, forward) and PC;
  far-city view for flying.
- [ ] **S10 — Airport and planes.** Airport with runway, terminal, hangars (expanded area);
  fly a small plane (arcade take-off / landing); later: ride a passenger plane between the
  airport and a far "town" stop.
- [ ] **S11 — Enter buildings.** Interiors for owned homes (sleep, wardrobe, garage door),
  shops, restaurants, Breaking School / Breaking Biology classrooms, Police HQ; a few apartments.

Order can change if the owner asks; S3 (bigger world) must come before S7–S10.
