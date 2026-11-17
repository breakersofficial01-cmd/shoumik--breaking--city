# Posters — how to add one (plain words)

Posters are the adverts you see around Breaking City: on roof billboards, on LED screens at
junctions, on walls, at bus stops, on metro pillars and on the back of buses and rickshaws.
Players can walk up to a poster and tap it to open its link (your website, a YouTube class,
an enrolment form…).

## 1. Make the picture

Pick one of the three shapes. A poster only appears in places of its own shape.

| Shape name | Proportions | Picture size to make | Where it appears |
|---|---|---|---|
| `wide` | 2 : 1 (twice as wide as tall) | **1024 × 512** (or 512 × 256) | roof billboards, back of buses, back of rickshaws |
| `16:9` | like a YouTube thumbnail | **1024 × 576** (or 512 × 288) | LED screens at junctions (they change every 10 seconds) |
| `tall` | 2 : 3 (portrait) | **512 × 768** (or 256 × 384) | wall posters, bus stops, metro pillars |

Tips
- Save as **.jpg** (smaller download). Keep each file under about **150 KB**.
- Use **big, bold text** — players see it from far away. One short line in Bangla is best.
- Keep important text away from the edges (the rickshaw panel cuts a little off the left and right).
- Never use the official logo or crest of a real institution you do not own.

## 2. Put the file in this folder

Copy the picture into this `posters/` folder, for example `posters/eid-offer.jpg`.

## 3. Add one line to `data/posters.json`

Inside the `"posters": [ ... ]` list, add a row like this (put a comma after the row before it):

```json
{ "id": "eid-offer-2026", "image": "posters/eid-offer.jpg", "shape": "wide", "link": "https://example.com/enroll", "startDate": "2026-12-01", "endDate": "2026-12-31", "districts": "all", "weight": 2, "active": true }
```

What each part means:

| Part | What to write |
|---|---|
| `id` | any short unique name, no spaces |
| `image` | the file name, starting with `posters/` |
| `shape` | `wide`, `16:9` or `tall` (see the table above) |
| `link` | the web address that opens when a player taps it. Leave `""` for none |
| `startDate`, `endDate` | first and last day to show it, written `YYYY-MM-DD`. Leave `""` for no limit |
| `districts` | `"all"`, or a list such as `["old-dhaka", "shahbag-campus"]` (ids are in `data/districts.json`) |
| `weight` | how often it is picked compared to other posters (2 = twice as often as 1) |
| `active` | `false` hides it without deleting the row |

That's it — reload the game. Each normal spot picks one poster per day; LED screens take turns.
Places with no matching poster show the "এখানে আপনার বিজ্ঞাপন" default poster
(`default-wide.jpg`, `default-16x9.jpg`, `default-tall.jpg` in this folder — you can replace
those pictures too, keeping the same file names).

A row with a mistake (wrong shape, bad date, missing image) is skipped and listed in the
browser console when the game is opened with `?debug=1`; it never breaks the game.

## Or ask Claude

Send a message like:
`Add poster posters/eid-offer.jpg, shape wide, link https://example.com, from 2026-12-01 to 2026-12-31, districts all.`

## The sample posters in this folder

| File | Shape | Link |
|---|---|---|
| `breaking-school-wide.jpg` | wide | none yet — add your enrolment link |
| `breaking-biology-tall.jpg` | tall | the bone & cartilage YouTube class |
| `breaking-city-led.jpg` | 16:9 | none |

Later the poster list can come from a Google Sheet, like the lessons (see `docs/CONTENT_GUIDE.md`).
