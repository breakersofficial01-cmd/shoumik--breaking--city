# Content Guide — lessons, questions, posters

This explains, in plain words, how game content is stored and updated.
Game code never reads these files directly; everything goes through
`src/content/ContentService.js`, so the storage can change (JSON → Google Sheet) without
touching gameplay code.

## 1. Lessons and questions

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
See `posters/README.md` (created in Session 4).

## 3. Everything else
Prices, vehicles, weapons, places, text: `data/*.json`. Each file has a `_comment` field
explaining it.
