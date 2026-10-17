# Startup (once per /own-it, in this order)

## 1. Fork check

Ask once: "own-it reads a lot of code. A forked or fresh session keeps your work context clean. Is this a fork?"
- **Yes, fork or fresh (Recommended)**: continue.
- **No, I'll fork first**: say how (new session, or your client's fork option), stop.
- **No, play here anyway**: continue.

Never ask again this invocation (unlocks and rebuilds included). Told to skip it? Ask once, one line.

## 2. Storage notice

Say: "Everything own-it creates is stored in the `.own-it/` folder in this project: game page, progress, screen copies, sample data, answers. Delete that folder to remove it all. own-it never edits your code."

## 3. Node check

`node --version`. Missing or below `<skill-dir>/runtime.json` `minimum`? Offer the pinned installer (nodejs.org, size from `installers.<win-x64|darwin|linux-x64>`, or winget/brew). Verify `sha256` before running; mismatch: delete, stop. "Not now": say "own-it needs Node. Install it from nodejs.org, then run /own-it again." and stop.

## 4. Scan, zones, init

No `.own-it/progress.json`: `scan`, group candidates into zones (ids `a-z0-9-`, max 24), confirm in one question, ask gitignore (Recommended) or commit, write `.own-it/zones.json`, `init --zones .own-it/zones.json` (add `--git-tracked` if committed, every re-init). Later runs: `fog`.

## 5. Customize the dashboard

Extract zones (`extraction.md`, `screens.md`). Write `.own-it/recs.json` with 3-5 `{game, zone, reason}` (reason ≤120 chars, playable games first), run `build-recs`. Pre-build rounds for them with `build-round` (`games.md`).

## 6. Live link

`serve` gives `{url}`; `open` it (or give the URL). Say one line: "Dashboard is open." Run `wait` in the background; react, then wait again:

- `pick`: `build-round`, then wait.
- `result`: `collect <round>`, grade free text, in Practice `build-feedback`, `apply`, rebuild recs, wait.
- `ask`: grade, `build-feedback` with `grades`, wait.
- `{idle:true}`: wait silently. After 6 idle waits in a row say "Still here. Click in the page or type here." and stop.

Mode comes from the result; never ask it in chat. Serve fails? Use `open` plus download and "done" (`rungs.md`).
