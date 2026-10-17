# Rungs, missions and question rules

## Ladder (recommended, not enforced)

Per zone: `words`, `map`, `trace`, `break`, `boss`. Every rung and game is playable from the start; locked means "not recommended yet". Clearing needs ≥70% on one mission; map also needs every surface covered. Claiming the zone needs all rungs cleared; an early boss is a practice run.

## Question rules (every game, every mode)

Ask only about: what the product does for a user, what a domain term means and why it has that name, who can do what, what happens when an action is taken, why it was built this way, where it breaks. Never make a function name, variable name, config key or line number the subject or the answer. Identifiers may appear only in a peek or explanation.

- Bad: "What does `profit_math_version` do?"
- Good: "An admin re-runs profit for last month after changing the math. What happens to last month's old numbers?"

Terms with no code meaning: web search, label "outside knowledge".

## Words

The `quiz` game replaces chat questions. Draft with Haiku (`models.md`), 5 questions, 4 options, a one-line why for each option. Add learned terms to `.own-it/lexicon.md`.

## Board missions (map, trace, break, boss)

Write a recipe to `.own-it/recipe.json`: `{"mode","missions":[...]}`, max 8. Each mission: `zone`, `rung`, `board`, `brief` (≤300 chars), optional `pins` (≤3 `{card, q}`).

| rung | board | fields |
|---|---|---|
| map | component | `cards`: 5-10 surfaces or components, uncovered surfaces first |
| trace | swimlanes | `flow`: one flow id |
| break | component | `cards` and `threats`: 1-4 failure ids on those cards |
| boss | component | none; over 15 parts: `cards`, 2-15 |

Fogged zone: re-extract `stale`, then one `map` mission with `refresh:true` on cards from `changed` files, padded to 5.

Run: `build-missions .own-it/recipe.json`, then `collect <id>`, grade, `apply`. A rebuild forgets unapplied missions.

## Fallback without the live link

`open` the file page; the user downloads the result and types "done". `collect <id>` reads `.own-it/inbox/` first, then Downloads; ask once for the folder (`settings.downloadDir`). A pasted `OWNIT:...` goes to `collect`.

## End

Update `lexicon.md`, offer one more round on the dashboard.
