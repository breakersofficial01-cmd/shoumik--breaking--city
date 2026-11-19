# Putting Breaking City online (GitHub Pages)

The game is a plain website: no build step and no server code. GitHub Pages hosts it free
at:

**https://breakersofficial01-cmd.github.io/shoumik--breaking--city/**

You only need a web browser and your GitHub login. Everything is done on github.com.

---

## A. First time only: switch on GitHub Pages (2 minutes)

1. Open https://github.com/breakersofficial01-cmd/shoumik--breaking--city
2. Click **Settings** (top bar, gear icon) → **Pages** (left menu).
3. Under **Build and deployment** → **Source**, choose **Deploy from a branch**.
4. Under **Branch**, choose **main** and folder **/ (root)**, then click **Save**.
5. Wait 1–3 minutes, then refresh the page. A green box shows the address above.
   Open it — the game loads.

That is all. The empty file `.nojekyll` in the repo tells GitHub to serve the files as
they are (keep it).

## B. Every time Claude finishes a session: publish it

Claude works on its own branch (named like `claude/...`). The website shows the **main**
branch, so the new work must be merged into main:

1. Open the repository on github.com. A yellow bar usually says
   *"claude/... had recent pushes"* → click **Compare & pull request**.
   (No bar? Click **Pull requests** → **New pull request**, set *base* = `main`,
   *compare* = the `claude/...` branch.)
2. Click **Create pull request**, then **Merge pull request** → **Confirm merge**.
3. Wait 1–3 minutes. GitHub Pages republishes by itself
   (you can watch it under the **Actions** tab: a green tick = live).
4. Open the game. Players get the new version automatically the next time they open
   the game while online — nobody has to reinstall or clear anything.

Tip: you can also just tell Claude *"create a pull request to main"* and then press
**Merge** yourself.

## C. Check it on your phone (5 steps)

1. Open the address above in **Chrome** on your Android phone, turn the phone sideways.
2. Tap **শুরু করতে ট্যাপ করুন** and play for a minute.
3. Open **Settings (gear) → অ্যাপ → গেমটি ইনস্টল করো** (or Chrome menu ⋮ → *Install app*).
   The game icon appears on your home screen.
4. Open the game from the home-screen icon once while online (it saves itself for offline).
5. Turn on airplane mode and open it again — it still plays.

On iPhone: open the address in **Safari** → Share button → **Add to Home Screen**.

## D. Changing content without Claude

These files can be edited directly on github.com (open the file → pencil icon →
**Commit changes** on the `main` branch). The site updates in 1–3 minutes.

| What | File | Guide |
|---|---|---|
| Lessons and questions | `data/lessons.json` | `docs/CONTENT_GUIDE.md` |
| Posters and billboards | `data/posters.json` + picture in `posters/` | `posters/README.md` |
| Social / enroll links | `data/links.json` | — |
| Reward codes | `data/rewards.json` | `docs/CONTENT_GUIDE.md` |
| Privacy / Credits text | `data/pages.json` | — |

Careful with typing mistakes (a missing comma or quote). In a content file (lessons,
posters, rewards) a mistake makes that whole list disappear from the game until it is fixed;
in a settings file (`links.json`, `pages.json` and the other `data/*.json`) it can stop the
game from loading. A single bad lesson row (e.g. a missing answer) is just skipped. Always
open the game after an edit; if it broke, edit the file again to put it back as it was.
If unsure, ask Claude: *"Check data/lessons.json for mistakes."*

## E. If something goes wrong

- **The site shows 404:** check step A (branch **main**, folder **/ (root)**). The address
  must end in `/shoumik--breaking--city/`.
- **The new version does not appear:** wait 3 minutes and reload. Still old? Open the
  game, then reload once more (the first load fetches the update, the reload shows it).
- **A bad update broke the game:** on github.com open **Pull requests → Closed**, open the
  last merged one and click **Revert** → **Create pull request** → **Merge**. The previous
  version is back in 3 minutes.
- **Emergency: switch offline mode off for everyone:** set `"register": false` in
  `data/pwa.json`. (Normally never needed.)
- **Throw away every player's offline copy** (only if Claude asks you to): change
  `"cacheVersion"` in `data/pwa.json`, e.g. from `"1"` to `"2"`.

## F. Custom domain (optional, later)

Buy a domain (e.g. `breakingcity.com.bd`), then in **Settings → Pages → Custom domain**
type it and follow GitHub's DNS instructions. The game uses relative paths only, so it works
at a domain root or a sub-path without changes.
