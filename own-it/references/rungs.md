# Rungs and missions

## Ladder

Per zone: `words` → `map` → `trace` → `break` → `boss`. A rung clears at ≥70% on one mission, opening the next. `map` clears only once every zone surface has been in a passing map mission.

## Words (rung 0, chat only)

Ask about 10 question-tool questions, one at a time: 4 options, one correct, shuffled. Ask what a term means, where it appears (button, DB field, API, enum), or why it has that name. Then `apply <zone>-words-<n> --got <correct> --of <asked>` (`n` from 1; if "already applied", use the next). Add learned terms to `.own-it/lexicon.md`.

## Recipe (rungs 1-4)

Write about 5 missions (max 8), open rungs only (`build-missions` rejects locked ones), to `.own-it/recipe.json`: `{"mode": "practice"|"exam", "missions": [...]}`. Each mission: `zone`, `rung`, `board`, `brief` (≤300 chars), optional `pins` (≤3 `{card, q}`, q ≤160 chars, card on the board).

| rung | board | fields |
|---|---|---|
| map | component | `cards`: 5-10 surface/component ids, surfaces missing from `progress.json` `zones.<z>.surfacesCovered` first; pad with components if under 5 |
| trace | swimlanes | `flow`: one flow id |
| break | component | `cards`, plus `threats`: 1-4 failure ids whose `card` is in `cards` |
| boss | component | none (`bosses.md`) |

Refresh (fogged zone): `"refresh": true`, cards from stale files; passing clears fog.

The helper computes answers.

Rebuilding replaces `session.json`, forgetting unapplied missions: when a rung opens mid-session, rebuild only after all built missions are applied.

## Run

1. `build-missions .own-it/recipe.json` → `{session, missions: [ids], est}`. Errors name the field.
2. `open` (or a browser tool). Name the first mission.
3. Per mission, wait for "done", then `collect <id>` → `{id, got, of, missed, text, wrong?}`.
   - No answer file: ask for the download folder (question tool), set `settings.downloadDir` in `.own-it/progress.json`, retry.
   - User pasted `OWNIT:...`: `collect OWNIT:...`.
4. Grade `text` and debrief (`grading.md`), then `apply <id> --text '<grades>'` plus any `--curiosity n`, `--challenge-won n`, `--tokens in,out` (real counts only).
5. `apply` → `{xp, total, ratio, cleared, claimed, badges, weak}`. Announce clears and badges, one line.

## No browser

Map: build the mission, then for each card with outgoing arrows ask "What does X call?" (question tool, 4 options), then `apply <id> --got <correct> --of <asked>`. `--got/--of`: Words and Map only. Rungs 2+ need the page; say so.

## End

Update `lexicon.md`, `open` the map, ask "One more?"
