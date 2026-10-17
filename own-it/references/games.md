# Games (18)

Round data is JSON in `.own-it/`, then `build-round <game> <file>`; it writes the page data, adds ids and answers. Fields: `zone`, optional `mode`, plus the shape in `assets/games/<game>.schema.json`. Playable at stage 2.0; other tiles show "Coming in a later update". Do not build them.

| Game | Stage | Fit rule and data shape |
|---|---|---|
| `quiz` | 2.0 | Words. `questions` x5: `q`, 4 `options` `{text, why}`, `answer` index 0-3, optional `peek`. |
| `screen-tour` | 2.0 | Screens with elements. `screen`, `steps` 1-6: `kind` chain/find/role, `prompt`, `element`, `choices`, `answer`. |
| `guess-the-screen` | 2.0 | Zones with 3+ screens. `screens` 3-8: `screen`, 4 `choices`, `answer`. |
| `quests` | 2.0 | A flow across screens or roles. `flow`, `goal`, `start`, `objectives` 2-8 `{text, element}`. Answers derived. |
| `whiteboard` | 2.0 | Structure. `cards` 2-12 component ids. Edges derived. |
| `boss-battle` | 2.0 | Final test. `questions` x5 `{q, kind}` why/malicious/structure/fails/term, per `bosses.md`. |
| `memory-match` | 2.1 | Words, pairs of term and meaning. |
| `spot-the-lie` | 2.1 | Any zone, 5 statements, one false. |
| `chain-reaction` | 2.1 | A flow's step order. |
| `whos-allowed` | 2.1 | Roles and permissions. |
| `blast-radius` | 2.1 | Edges and dependencies. |
| `pager` | 2.1 | Failures on a flow. |
| `data-detective` | 2.2 | State lifecycles. |
| `pipe-plumber` | 2.2 | Button to database data flow. |
| `what-if` | 2.2 | Failure at scale. |
| `design-duel` | 2.2 | Decisions with a real alternative. |
| `escape-room` | 2.2 | Mixed boss. |
| `teach-back` | 2.2 | Explaining a screen; Curiosity XP only. |

Rungs: words (quiz, memory-match, spot-the-lie), map (whiteboard, screen-tour, guess-the-screen, blast-radius), trace (quests, chain-reaction, data-detective, pipe-plumber, whos-allowed), break (pager, what-if, design-duel), boss (boss-battle, escape-room).

Quiz, screen-tour and guess-the-screen need `answer` on every entry; quests and whiteboard must not carry one. Element ids and screens must exist in the zone. Quiz options must not be bare identifiers.

Errors name the bad field. Fix the file and rerun; nothing was written.
