# Content Guide — lessons, questions, posters

This explains, in plain words, how game content is stored and updated.
Game code never reads these files directly; everything goes through
`src/content/ContentService.js`, so the storage can change (JSON → Google Sheet) without
touching gameplay code.

## 0. The Google Sheet (Update 9) — the easiest way
Everything below can now be edited in the shared sheet **Breaking City — Game Data**
(https://docs.google.com/spreadsheets/d/1fIEDXo3xX3RwOJR04mcujVnXGp9Iw8fmHygVqw6Q0lE/edit) once it
is connected (`tools/sheets/README.md`, 5 minutes, once).
- **Products**: `product_id | kind | name_en | name_bn | price | image_url | model_url | description | active | notes | heal`.
  Roadmap 2 S4: kind `drink` and the `heal` column (food / drink only) are for the hotel menu.
  kind = vehicles, weapons, outfits, food, homes, health. Only ids the game knows work (the rows
  already there). `model_url` is noted for Claude (3D models need a code step).
- **Classes**: `class_id | institute | subject | chapter | title | youtube_link | thumbnail_url | description | reward_per_correct | language | active | notes`.
  institute = `breaking-school` or `breaking-biology`. One row = one class on the landing page.
- **Questions**: `class_id | topic | question_id | question | option_a | option_b | option_c | option_d | answer | explanation | active`.
  Bangla text; answer = A/B/C/D; at least 3 questions per class (a Lesson Check asks 3).
- **Players**: written by the game — do not edit by hand.
Players get changes on their next online launch (cached for `data/sheet.json → refreshMinutes`).
Bad rows are skipped (see `?admin=1`), never crash the game.

## 1. Lessons and questions

**Language:** write questions, options and explanations in **Bangla**. The game shows them in
the Bangla font (Li Ador Noirrit, set in `data/ui.json`). Scientific terms can keep the
English word in brackets, e.g. "তন্তুময় তরুণাস্থি (ফাইব্রোকার্টিলেজ)".

### Now: `data/lessons.json`
One lesson = one YouTube class + its questions. See the sample lesson
`bio-bone-cartilage-01` in that file.

Fields per lesson: `id` (unique, never change once live), `institute`
(`breaking-school` or `breaking-biology`), `subject`, `chapter`, `title`, `youtubeUrl`,
`rewardPerCorrect` (Taka), `active` (true/false), `questions`.

Fields per question: `id`, `question`, `options` (A, B, C, D), `answer` (one letter),
`explanation` (shown after answering).

How the game uses them (Session 5, Class Mode):
- A lesson shows only at its institute's entrance and only while `active` is true.
- **Lesson Check:** each try picks `questionsPerAttempt` (3) random questions, shuffles the
  options, `timePerQuestionSec` (30) each. Every question pays `rewardPerCorrect` **once per
  player** — a retry only pays for questions not yet answered right. `maxAttempts` (2) tries
  per lesson; a try counts as soon as it starts. **Never change a question `id` once live**
  (paid questions are stored by id). Write at least 3 questions per lesson; more is better —
  the extra ones make each try different and feed Quiz Class.
- **Quiz Class** uses every question of the institute's active lessons. Money: `data/economy.json
  → quizClass`.
- Enroll button: `data/links.json → enrollBreakingSchool` / `enrollBreakingBiology` (empty = "coming soon").
- Check what loaded: open the game with `?admin=1` and tap the red **অ্যাডমিন** button — it
  lists lessons and questions per institute, the source, and every skipped row with the reason.

### Later: Google Sheet (to be connected with Claude Opus)
Make one Google Sheet with **two tabs**:

**Tab "Lessons"**

| lesson_id | institute | subject | chapter | title | youtube_link | reward_per_correct | active |
|---|---|---|---|---|---|---|---|
| bio-bone-cartilage-01 | breaking-biology | Biology | Bone and Cartilage | Bone and Cartilage — Class 1 | https://youtu.be/n9wUkCiCyD8 | 150 | TRUE |

**Tab "Questions"**

| lesson_id | question_id | question | option_a | option_b | option_c | option_d | answer | explanation |
|---|---|---|---|---|---|---|---|---|
| bio-bone-cartilage-01 | q1 | Which type of cartilage forms the intervertebral discs? | Hyaline cartilage | Elastic cartilage | Fibrocartilage | Calcified cartilage | C | ... |

Rules:
- `lesson_id` in Questions must match a row in Lessons — that's how a question is attached
  to a lecture. Any number of questions per lesson; the game picks 3 at random each attempt
  (setting in `defaults`).
- `answer` is just the letter A/B/C/D.
- Set `active` to FALSE to hide a lesson without deleting it.

To connect: in Google Sheets, File → Share → Publish to web → choose each tab → CSV → copy the
two links. Then ask Claude Opus: *"Connect lessons to the Google Sheet. Lessons CSV: … Questions
CSV: …"*. Opus puts the links into `data/lessons.json → source.googleSheet` and sets
`source.type` to `googleSheet`. The game then loads the sheet at start (cached, refreshes every
hour) and falls back to the JSON file when offline.

Note: a published sheet is readable by anyone who finds the link, so answers are not secret.
Fine for in-game money; before real prizes, move questions to a private server.

### How the answer is judged
The game compares the letter the player tapped with `answer`. Options are shuffled on screen,
but the game tracks which letter each button is, so shuffling never breaks checking.
Correct → green + Taka added. Wrong → red + the right answer and explanation shown.
Each lesson pays once per player; `maxAttempts` limits retries.

## 2. Posters — `data/posters.json` and `/posters/`
Step-by-step guide with picture sizes: **`posters/README.md`**.

Each row: `id`, `image` (file in `posters/`), `shape` (`wide` 2:1, `16:9`, `tall` 2:3), `link`
(opens in a new tab when tapped; may be empty), `startDate` / `endDate` (`YYYY-MM-DD`, both days
included, empty = no limit), `districts` (`"all"` or a list of district ids), `weight`, `active`.
Posters only appear in slots of their own shape; empty slots show the default poster of that
shape (`settings.defaults`). Bad rows are skipped and logged.

Later as a Google Sheet tab "Posters" with the same column names (one row per poster);
`districts` as a comma-separated list. (The sheet adapter for posters is not written yet —
lessons first.)

## 2b. Reward codes — `data/rewards.json` (Session 7)
Codes players unlock by finishing lessons (shown in Shoumik's profile card with a Copy button).
Each row: `id` (unique), `lessonsRequired` (whole number ≥ 1 — a lesson counts once one of its
questions was answered right), `code` (the text they copy, e.g. a course coupon), `title` and `note`
(`{ "en": "…", "bn": "…" }`), `link` (optional: where to use the code, opens in a new tab),
`active`, `startDate` / `endDate` (`YYYY-MM-DD`, empty = no limit). Bad rows are skipped and logged.
**The three codes in the file are samples — replace them with real ones.** Loaded through the
Content Service, so it can become a Google Sheet tab "Rewards" with the same columns later.

## 2c. Radio, shop signs, sounds and the profile card (Session 7)
- **Radio** — `data/radio.json`: station names, style (`pop`, `folk`, `synth`), tempo, DJ lines
  (`en` + `bn`). To use real songs: put royalty-free files in `assets/audio/radio/`, add each to
  `data/assets.json` (`"sound.radio.myTrack": { "type": "sound", "url": "assets/audio/radio/my-track.mp3" }`)
  and list the ids in the station's `tracks`. Never use songs you do not have the rights to.
- **Shop signboards** — `data/signboards.json → names`: Bangla name + optional small English line
  (max 64 names, keep them short). `styles` = board / letter colours.
- **Sounds** — every sound is made in code. To replace one with a recording, add
  `"sound.<id>"` to `data/assets.json` (ids are the keys in `data/audio.json → sounds`, e.g.
  `sound.gun.pistol`, `sound.crow`, `sound.explosion`; horns: `sound.horn.bell`, `sound.horn.car`…).
- **Profile card** — `data/profile.json`: Shoumik's name and the lines under it (`facts`), and
  which stats are shown.
- **Time of day, rain, load-shedding** — `data/dayNight.json`, `data/weather.json` (every number
  has a `_comment`).

## 3. Everything else
Prices, vehicles, weapons, places, text: `data/*.json`. Each file has a `_comment` field
explaining it. Places and vehicles are described at the end of this guide.

## Hangout spots (dance spots) — `data/hotspots.json`
Each row in `hotspots` is one spot where young adults dance to a boombox:

| Field | Meaning |
|---|---|
| `id` | short unique name, e.g. `tsc` |
| `name` | `{ "en": "...", "bn": "..." }` |
| `col`, `row` | which city block (see the map in `docs/GAME_SPEC.md`; col 0 = west, row 0 = north) |
| `side` | which edge of that block: `N`, `S`, `E` or `W` |
| `along` | 0–1, how far along that edge |
| `inset` | metres in from the kerb (0.75 = on the sidewalk edge, 6 = inside a park) |
| `rows`, `dancers` | lines of dancers (1–3) and how many people (1–12) |
| `bpm` | speed of the music (70–150) |
| `active` | `false` hides the spot |

Bad rows are skipped and reported in the debug log, like lessons. Who dances and how loud the
music is are in `settings` in the same file.

## Shoumik's outfits — `data/outfits.json`
Change colours freely (hex codes). `style` must be one of `tee`, `polo`, `panjabi`, `doctor`.
`"unlocked": false` hides an outfit until it is bought in the clothes shop; give it a price in
`data/economy.json → prices.outfits` and add its id to the clothes shop's `stock` in `data/shops.json`.

## Shops, prices and homes — `data/shops.json` + `data/economy.json → prices`
- A shop = `id`, `kind` (`vehicles`, `homes`, `weapons`, `outfits`, `food`), `name` (en + bn), the
  road junction `col`/`row` and the `corner` it stands on (NE/NW/SE/SW), and `stock` (ids).
- Prices live in `data/economy.json → prices.<kind>.<id>`; an item without a price is not sold.
- Food: name and `heal` in `data/shops.json → food`. Homes: name, ring position and `garage`
  (junction + road direction where owned vehicles park) in `data/shops.json → homes`.
- Ring look and colours: `marker` and `kinds` in the same file.

## Hotel menu — `data/menu.json` + `data/hotels.json` (Roadmap 2 S4)
- A menu item: `"id": { "kind": "food" | "drink", "cat": "bd" | "fast" | "sweet" | "drink",
  "name": { "en", "bn" }, "heal": 40, "icon": "🍛", "model": [parts] }`; its price goes in
  `data/economy.json → prices.food` (or `prices.drink`). Model parts are explained in the
  `_comment` of `menu.json` (a plate / bowl / glass + a food-kit model or a code-built shape).
- Put the id into a hotel's `menu` (or `bar.menu`) list in `data/hotels.json`.
- Change price / name / heal / switch off from the Google Sheet: Products row with the same
  `product_id` and kind `food` or `drink`. Check with `node tools/hotel-check.js`.
- Drinks are always soft drinks, juices, lassi / borhani or mocktails (no alcohol).

## Places (ride destinations) — `data/places.json`
Every row is a named place. A hired rickshaw or CNG can take Shoumik to any place with
`"ride": true`, and each place gets its own rickshaw + CNG stand.

| Field | Meaning |
|---|---|
| `id` | short unique name, e.g. `nilkhet` |
| `name` | `{ "en": "...", "bn": "..." }` — shown in the ride menu |
| `col`, `row` | the **road junction** next to the place (junction 0,0 = north-west corner of the city; the map is in `docs/GAME_SPEC.md`) |
| `ride` | `false` hides it from the ride menu |

| `landmark` | optional — puts a landmark building there (see below) |

A place whose junction is inside a lake or park is ignored. Bad rows are skipped and logged.

**Landmarks.** `"landmark": { "type": "curzonHall", "block": [5, 12], "facing": "N" }`
- `type` = which model (17 are built: sangsad, shaheedMinar, shaplaChattar, curzonHall,
  dhakaUniversity, tsc, dhakaMedical, buet, notreDame, ssmc, ahsanManzil, lalbaghFort, sadarghat,
  nilkhet, gulshanTowers, karwanBazar, breakingSchool, breakingBiology). Their colours and a few
  sizes are in `data/landmarks.json → types` and are safe to change.
- `block` = the city BLOCK it stands on (block col,row is south-east of junction col,row), or
  `area` = a plaza from `data/districts.json` (Sangsad uses `sangsad-grounds`).
- `facing` = which way the front looks: `N`, `S`, `E`, `W`. One landmark per block.
- Moving a landmark = changing `block`. A brand-new kind of building needs code (ask Claude).

## Vehicles, traffic and fares
- `data/vehicles.json` → `types`: one block per vehicle. Safe things to change: `name`,
  `maxSpeed` (metres per second; ×3.6 = km/h), `acceleration`, `brake`, `handling` (0–1),
  `mass`, `health`, `colors` (hex codes). The `_comment` at the top explains every field.
- Ride fares: `data/economy.json` → `rides` (`rickshaw`, `cng`).
- How much traffic: `data/quality.json` → `traffic` and `parked` for each graphics level.
- Which vehicles drive in which district, the two jam junctions and the bus stops:
  `data/traffic.json`.
- Stunt ramps: `data/world.json` → `ramps` → `list` (`at` = junction position, `heading` in
  degrees).
- To give Shoumik a vehicle before the showroom exists, open the game with `?debug=1` and type
  in the browser console: `BC.events.emit('vehicle:grant', { type: 'sports' })`.
