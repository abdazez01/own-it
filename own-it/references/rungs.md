# Rungs and missions

## Ladder

Per zone: `words` → `map` → `trace` → `break` → `boss`. A rung clears at ≥70% on one mission, opening the next. `map` clears once every zone surface was in a passing map mission.

## Words (rung 0, chat only)

Ask ~10 question-tool questions, one at a time: 4 shuffled options, one correct. Ask what a term means, where it appears (button, DB field, API, enum), or why that name. Then `apply <zone>-words-<n> --got <correct> --of <asked>` (`n` from 1; "already applied": use the next). Add learned terms to `.own-it/lexicon.md`.

## Recipe (rungs 1-4)

A session is about 5 missions, usually across several builds. Build what the open rungs allow (map: enough to cover remaining surfaces; trace/break/boss: 1). Apply all, then rebuild.

Write missions (max 8) to `.own-it/recipe.json`: `{"mode":"practice"|"exam","missions":[...]}`. Each mission: `zone`, `rung`, `board`, `brief` (≤300 chars), optional `pins` (≤3 `{card,q}`, q ≤160 chars, card on board).

| rung | board | fields |
|---|---|---|
| map | component | `cards`: 5-10 surfaces/components, uncovered surfaces first (`progress.json` `zones.<z>.surfacesCovered`) |
| trace | swimlanes | `flow`: one flow id |
| break | component | `cards` + `threats`: 1-4 failure ids on those cards |
| boss | component | none; over 15 surfaces/components: `cards`, 2-15 (`bosses.md`) |

Refresh (fogged zone): Re-extract `stale`, then build one `map` mission with `refresh:true`: cards from items whose ref file is in `changed`, padded to 5 with their edge neighbours. Passing clears fog (+30).

Rebuilding replaces `session.json`, forgetting unapplied missions.

## Run

1. `build-missions .own-it/recipe.json` → `{session,missions:[ids],est}`. Logged tokens are a helper floor ("≈ N tokens"); real cost is ~5-10x (reference reads, chat, debriefs uncounted).
2. `open` (or a browser tool). Name the first mission.
3. Per mission, wait for "done", then `collect <id>` → `{id,got,of,missed,text,wrong?}`.
   - No answer file: ask the download folder (question tool), set `.own-it/progress.json` `settings.downloadDir`, retry.
   - User pasted `OWNIT:...`: `collect OWNIT:...`.
4. Grade `text` and debrief (`grading.md`), then `apply <id> --text '<grades>'` plus any `--curiosity n`, `--challenge-won n`, `--tokens in,out` when the harness gives real counts.
5. `apply` → `{xp,total,ratio,cleared,claimed,badges,weak,fog?}`. Announce clears and badges, one line.

## No browser

Map: build the mission, ask "What does X call?" per card with outgoing arrows (question tool, 4 options), then `apply <id> --got <correct> --of <asked>`. Rungs 2+ need the page; say so.

## End

Update `lexicon.md`, `open` the map, ask "One more?"
