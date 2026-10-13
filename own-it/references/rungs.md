# Rungs and missions

## Ladder

Per zone, in order: `words` → `map` → `trace` → `break` → `boss`. A rung clears at ≥70% on one mission, opening the next. `map` clears only once every zone surface has been in a passing map mission. `build-missions` rejects locked rungs.

## Words (rung 0, chat only)

Ask about 10 question-tool questions, one at a time: 4 options, exactly one correct, shuffled. Ask what a term means, where it appears (button, DB field, API, enum), or why it has that name. Then `apply <zone>-words-<n> --got <correct> --of <asked>` (`n` from 1; if "already applied", use the next). Add learned terms to `.own-it/lexicon.md`.

## Recipe (rungs 1-4)

Write all of the session's missions (about 5, max 8) to `.own-it/recipe.json`, building once: `{"mode": "practice"|"exam", "missions": [...]}`. Each mission: `zone`, `rung`, `board`, `brief` (≤300 chars), optional `pins` (≤3 `{card, q}`, q ≤160 chars, card on the board).

| rung | board | fields |
|---|---|---|
| map | component | `cards`: 2-12 surface/component/actor ids |
| trace | swimlanes | `flow`: one flow id (lanes come from `actor`) |
| break | component | `cards`, plus `threats`: 1-4 failure ids whose `card` is in `cards` |
| boss | component | none; the board is blank (`bosses.md`) |

Refresh (fogged zone): add `"refresh": true` and pick cards from the stale files; passing clears fog.

The helper computes answers. Pick what matters (decisions, role checks, failure points), never every line.

## Run

1. `build-missions .own-it/recipe.json` → `{session, missions: [ids], est}`. Errors name the field.
2. `open` (or a browser tool). Name the first mission to play.
3. Per mission, wait for "done", then `collect <id>` → `{id, got, of, missed, text, wrong?}`.
   - No answer file: ask for the download folder (question tool, likely path first), set `settings.downloadDir` in `.own-it/progress.json`, retry.
   - User pasted `OWNIT:...`: `collect OWNIT:...`.
4. Grade `text` and debrief (`grading.md`), then `apply <id> --text '<grades>'` plus any `--curiosity n`, `--challenge-won n`, `--tokens in,out` (real counts only).
5. `apply` → `{xp, total, ratio, cleared, claimed, badges, weak}`. Announce clears and badges in one line.

## No browser

Map: build the mission, then ask one question-tool question per card ("What does X call?", 4 options), then `apply <id> --got <correct> --of <asked>`. `--got/--of` work only for Words and Map. Rungs 2+ need the page: say so.

## End

Update `lexicon.md`, `open` the map, ask "One more?".
