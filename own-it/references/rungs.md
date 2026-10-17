# Rungs, missions and question rules

## Ladder (recommended, not enforced)

Per zone: `words`, `map`, `trace`, `break`, `boss`. Every rung and game is playable; locked means not recommended yet. Clearing needs ≥70% on one mission (map: every surface covered). Claiming needs all rungs cleared; an early boss is practice.

## Question rules

Ask only about: what the product does for a user, what a domain term means, who can do what, what happens when an action is taken, why it was built this way, where it breaks. Never make a function name, variable name, config key or line number the subject or the answer. Identifiers only in a peek or explanation.

- Bad: "What does `profit_math_version` do?"
- Good: "An admin re-runs last month's profit after changing the math. What happens to the old numbers?"

Terms with no code meaning: web search, label "outside knowledge".

## Depth by level

Read `settings.level` in `progress.json` (unset: medium).
- easy: screens, buttons, app words; no code.
- medium: data flow, which parts talk; light code names.
- hard: code paths, failure cases, permissions.
- impossible: edge cases, races, odd config, "what breaks if". Niche means rare behaviour (retries, timeouts, partial failure), never trivia: no line numbers, exact names or paths as answers.
- custom: `levelAbout` per zone: harder where they know, easier where not.

## Words

The `quiz` game replaces chat questions. Draft with Haiku (`models.md`), 5 questions, 4 options, a one-line why each. Add learned terms to `.own-it/lexicon.md`.

## Board missions (map, trace, break, boss)

Write `.own-it/recipe.json`: `{"mode","missions":[...]}`, max 8. Each mission: `zone`, `rung`, `board`, `brief` (≤300 chars), optional `pins` (≤3 `{card, q}`).

| rung | board | fields |
|---|---|---|
| map | component | `cards`: 5-10 surfaces or components, uncovered surfaces first |
| trace | swimlanes | `flow`: one flow id |
| break | component | `cards` and `threats`: 1-4 failure ids on those cards |
| boss | component | none; over 15 parts: `cards`, 2-15 |

Fogged zone: re-extract `stale`, then one `map` mission with `refresh:true` (needs `map` cleared) on `changed` cards, padded to 5.

Run: `build-missions .own-it/recipe.json`, then `collect <id>`, grade, `apply`. A rebuild forgets unapplied missions.

## Fallback without the live link

`open` the file page; the user downloads the result, types "done". `collect <id>` reads `.own-it/inbox/`, then Downloads (ask once, `settings.downloadDir`). A pasted `OWNIT:...` goes to `collect`.

## End

Update `lexicon.md`.
