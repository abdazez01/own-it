# Model map

Dispatch each job to the cheapest model that can do it (Agent tool, `model` field). No subagent tool: do it inline under the same caps.

| Job | Model |
|---|---|
| Words terms (`scan --strings`) | none, script |
| Quiz, memory match, spot-the-lie data; short labels | Haiku |
| Zone extraction | Sonnet |
| Screen rebuild | Sonnet |
| Recs, recipes, other round data | session model |
| Grading, feedback, debrief, boss | session model |

Haiku quiz prompts include the `rungs.md` question rules, the level (and custom `about`) and a 3,000-token cap. Haiku drafts are spot-checked against model items before `build-round`. The helper validates and rejects bad data.

At most 2 subagents at once and 4 per `/own-it` session; everything else inline.
