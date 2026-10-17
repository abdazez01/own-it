# Games (18)

Round data is JSON in `.own-it/`; `build-round <game> <file>` writes the page data, adds ids and answers. Fields: `zone`, optional `mode`, and the shape in `assets/games/<game>.schema.json`.

| Game | Stage | Fit rule and data shape |
|---|---|---|
| `quiz` | 2.0 | Words. `mode` required. `questions` x5: `q`, 4 `options` `{text, why}`, `answer` index 0-3, optional `peek`. |
| `screen-tour` | 2.0 | Screens with elements. `screen`, `steps` 1-6: `kind` chain/find/role, `prompt`, `element`, `choices`, `answer`. |
| `guess-the-screen` | 2.0 | Zones with 3+ surfaces in the model (built copies are optional). `screens` 3-8: `screen`, 4 `choices`, `answer`. |
| `quests` | 2.0 | A flow across screens or roles. `flow`, `goal`, `start`, `objectives` 2-8 `{text, element}`. Answers derived. `--level secret`: optional `weakness` id (default first). |
| `whiteboard` | 2.0 | Structure. `cards` 2-12 component ids. Edges derived. |
| `boss-battle` | 2.0 | Final test. `questions` x5 `{q, kind}` why/malicious/structure/fails/term, per `bosses.md`. |
| `memory-match` | 2.0 | Words. `pairs` 4-8 `{term, meaning}`, each said once. Pairing derived. |
| `spot-the-lie` | 2.0 | Any zone. `statements` x5 `{text, why}`, `answer` index 0-4 of the false one. |
| `chain-reaction` | 2.0 | A flow's step order. `flow` id with 2+ steps. Order derived. |
| `whos-allowed` | 2.0 | Roles. `cards` 8-16 `{action, role, answer, why}`, 2+ of each verdict. |
| `blast-radius` | 2.0 | Dependencies. `target` part id. Damage derived. |
| `pager` | 2.0 | Failures. `failure`, `logs` 4-8, `answer` part id. |
| `data-detective` | 2.0 | State lifecycles with transitions in the model. `entity`, `states` 3-7 `{state}` in order. Movers derived. |
| `pipe-plumber` | 2.0 | Button to database data flow. `flow` id, 2-12 steps, the first a surface and the last a component. Grid derived. |
| `what-if` | 2.0 | Failure at scale. `dials` 3-5 `{label, options, answer, why}`, 4 options, answer 0-3. |
| `design-duel` | 2.0 | Decisions with a real alternative. `decisions` x3 `{real, alt, reasons, answer}`: 4 `reasons` in words, `answer` index 0-3 of the real one. |
| `escape-room` | 2.0 | Mixed boss. `puzzles` x3, one of each kind: role `{role, action, answer allow/deny, why}`, flow `{flow}` (2+ steps), failure `{failure, logs 4-8, answer}` (3+ labeled parts of its kind). Needs 3/3 to pass; no chat grades. |
| `teach-back` | 2.0 | Explaining a screen. `screen` surface id with a built copy. Curiosity XP only; grade the `ask` text q1 with `build-feedback`. |

Rungs: words (quiz, memory-match, spot-the-lie), map (whiteboard, screen-tour, guess-the-screen, blast-radius), trace (quests, chain-reaction, data-detective, pipe-plumber, whos-allowed), break (pager, what-if, design-duel), boss (boss-battle, escape-room).

Quiz, screen-tour and guess-the-screen need `answer` on every entry. Screen-tour `chain`: `element`, 2-4 `choices` (model ids), answer one; `find`: no `choices`, answer an element id; `role`: free-text `choices`, answer one. Guess-the-screen: `choices` are surface ids, answer one. Quests and whiteboard carry none. A quest step is reachable from `start` by `goes`, or sits on a screen whose element `roles` differ from the step before (role switch, key R). Ids must exist in the zone. Player text is never a bare identifier.

Errors name the bad field; fix and rerun.

## Levels

The player picks per game on Home:
- **Easy**: I do not know this app. Screens and words, no code, free hints. Favor `screen-tour`, `quests`, `quiz`, `guess-the-screen`.
- **Medium**: I know some parts. Data flow, light code names, hints cost 15 XP.
- **Hard**: I know it well. Code paths, failures, permissions; hints cost 30 XP; Exam default.
- **Impossible**: all-out. Edge cases, no hints, timers on, boss open. Favor break and boss games.
- **Other**: describes what they know (`about`); infer the nearest base level.
- **Secret** (hidden; `quests`, zone has `weaknesses`): break it. Not stored by `level`.

`build-recs` orders by the last level used (other uses its base). Rounds store their level. The page applies hint and timer policy.
