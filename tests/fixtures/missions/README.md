# Game page fixture

Browser fixture for `own-it/assets/game.html`: one session with four trips-zone missions
(`trips-map-1`, `trips-trace-2`, `trips-break-3`, `trips-boss-4`, practice mode) and a progress
file with two zones (trips: map cleared, trace/break/boss open; access: fogged, mostly locked).

## Open the page

1. Copy `own-it/assets/game.html` and `own-it/assets/core.js` next to `mission.js` and
   `progress.js` in a scratch folder (keep this folder clean).
2. Open `game.html` in a browser that is at least 1024px wide.

Variants:
- Exam mode: in the scratch copy of `mission.js`, change `"mode":"practice"` to `"mode":"exam"`.
- Empty state: leave out `mission.js` (and optionally `progress.js`). The browser logs a
  "file not found" line for each missing script; the page itself raises no errors.

## Regenerate

```bash
node tests/fixtures/missions/regen.mjs
```

The script copies `fixtures/trip-app` to a temp dir, commits it to a fresh git repo, then runs the
real CLI there: `init --zones zones.json`, `check-refs extraction-trips.json`, hand-edits progress
to open the board rungs, `build-missions recipe.json`. It writes `mission.js` and `progress.js`
here and rewrites `root` to this repo's `fixtures/trip-app` so "Open in editor" links resolve
on the machine that generated it. Inputs: `zones.json`, `extraction-trips.json`, `recipe.json`.
