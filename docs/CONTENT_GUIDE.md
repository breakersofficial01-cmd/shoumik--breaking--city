# Content Guide — lessons, questions, posters

This explains, in plain words, how game content is stored and updated.
Game code never reads these files directly; everything goes through
`src/content/ContentService.js`, so the storage can change (JSON → Google Sheet) without
touching gameplay code.

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
`"unlocked": false` hides an outfit until it is owned (shop comes in Session 5).

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
