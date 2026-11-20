# Connect the game to the Google Sheet (5 minutes, once)

The sheet: **Breaking City — Game Data**
https://docs.google.com/spreadsheets/d/1fIEDXo3xX3RwOJR04mcujVnXGp9Iw8fmHygVqw6Q0lE/edit

| Tab | Who edits it | What it does |
|---|---|---|
| **Products** | you | name (English + Bangla), price, picture link, active TRUE/FALSE of everything sold in the game |
| **Classes** | you | one row per YouTube class: id, institute, subject, chapter, title, YouTube link, thumbnail link, description, Taka per right answer |
| **Questions** | you | questions per class (`class_id`) and topic, 4 options, answer A/B/C/D, explanation |
| **Players** | the game | one row per player (phone, name, class, cash, vehicles, weapons, homes, lessons done, the full save). The PIN is only stored as a hash. |

Keep the sheet **private** (do not "publish to web" or share it with "anyone with the link"):
the Players tab has phone numbers. The game talks to the sheet only through a small
**Apps Script web app** that you own; that app only gives out Products, Classes and Questions.

## Steps
1. Open the sheet → **Extensions → Apps Script**.
2. Delete what is in `Code.gs`, paste everything from `tools/sheets/Code.gs` (this folder), press 💾 Save.
3. **Deploy → New deployment** → ⚙ type **Web app** →
   *Execute as:* **Me** · *Who has access:* **Anyone** → **Deploy** → allow the permissions
   (Google says "unverified app" because it is your own script: Advanced → Go to … → Allow).
4. Copy the **Web app URL** (it ends in `/exec`).
5. Send Claude: `Connect the sheet. Web app URL: <the URL>` — Claude puts it in
   `data/sheet.json → apiUrl`. From then on:
   - classes, questions and prices come from the sheet (players get changes within 30 minutes),
   - sign-up checks that a phone number is used only once across all phones,
   - progress is saved to the Players tab every minute and when the game is closed,
   - a player can sign in on another phone and continue.

Until step 5 the game works from its own data files and accounts stay on each phone.

## Changing the script later
Edit `Code.gs` → **Deploy → Manage deployments → ✏ Edit → Version: New version → Deploy**.
The URL stays the same.

## Rules for editing the tabs
- Keep the first row (column names) exactly as it is. Add rows below.
- `product_id` must be an id the game knows (see the rows already there). A new kind of product
  (a new car model, a new gun) needs Claude to add it to the game first — then add its row here.
- `image_url` / `thumbnail_url`: a direct https link to a .jpg/.png (e.g. from your website or
  Google Drive "anyone with the link" → use a direct image link). Leave empty if none.
- `active`: FALSE hides a product / class / question without deleting it.
- Questions are in Bangla. `answer` is the letter of the right option (A, B, C or D).
- Do not edit the Players tab by hand unless you must (e.g. deleting a player who asked for it).
