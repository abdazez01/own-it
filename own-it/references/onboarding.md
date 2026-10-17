# Startup (once per /own-it, in this order)

## 1. Fork check

Ask once: "own-it reads a lot of code. A forked or fresh session keeps your work clean. Is this a fork?"
- **Yes, fork or fresh (Recommended)**: continue.
- **No, I'll fork first**: say how, stop.
- **No, play here anyway**: continue.

Never ask again.

## 2. Storage notice

Say: "Everything own-it creates is stored in the `.own-it/` folder in this project: game page, progress, screen copies, sample data, answers. Delete that folder to remove it all. own-it never edits your code."

No level question: the level arrives with each pick.

## 3. Node check

`node --version`. Missing or below `<skill-dir>/runtime.json` `minimum`? Offer the pinned installer (nodejs.org, size from `installers.<win-x64|darwin|linux-x64>`, or winget/brew). Verify `sha256`; mismatch: delete, stop. "Not now": say "own-it needs Node. Install it from nodejs.org, then run /own-it again." and stop.

## 4. Scan, zones, init

No `.own-it/progress.json`: `scan`, group candidates into zones (ids `a-z0-9-`, max 24), confirm once, ask gitignore or commit, write `.own-it/zones.json`, `init --zones .own-it/zones.json` (add `--git-tracked` if committed, every re-init). Later runs: `fog`.

## 5. Customize the dashboard

Extract zones (`extraction.md`, `screens.md`). Write `.own-it/recs.json` with 3-5 `{game, zone, reason}` (reason ≤120 chars), run `build-recs .own-it/recs.json`. Pre-build rounds for them with `build-round` (`games.md`).

## 6. Live link

`serve` gives `{url}`; `open <url>` opens the browser. Say "Dashboard is open." Remote machine: forward the port (`ssh -L <port>:127.0.0.1:<port>`) and open the url locally. Background `wait`; react, then wait again:

- `pick {game, zone, mode, level, about?}`: `level <x>` (custom: `--about <about> --base <nearest level>`), then `build-round ... --level <x> [--base <b> --about <about>]`, then wait. Rebuild a pre-built round of another level. Never ask mode or level. Level `secret`: skip `level`; `build-round quests <file> --level secret`; after its `result`, tell the user the real bug in chat with `file:line`.
- `result`: `collect <round>`, grade free text. Practice: `build-feedback` and post the debrief in chat; Exam: no feedback file until the report card. `apply`, rebuild recs, wait.
- `ask`: grade, `build-feedback` with `grades`, wait.
- `challenge {id, item}`: see `grading.md` (also after `apply`), wait.
- `hint {round}`, `invalid`: wait.
- `{idle:true}`: wait silently. After 6 idle waits in a row say "Still here. Click in the page or type here." and stop.

File mode (serve fails): `open` the file page; a pasted `play <game> <zone> --level <x> [--about "<text>"]` is a `pick`.
