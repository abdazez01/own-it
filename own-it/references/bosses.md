# Bosses

## Zone boss (rung 4)

Opens when `break` is cleared. Beating it claims the zone (+200 XP).

### 1. Blank board

Recipe mission, no pins. Zones with over 15 surfaces and components need `cards`: pick 2-15 ids to score.

```json
{"zone": "trips", "rung": "boss", "board": "component",
 "brief": "Blank board. Draw the whole zone from memory: every screen, route and service, and how they connect."}
```

The user draws boxes and arrows from memory. The page matches box names to the zone's surfaces and components and grades the drawing; boxes naming unscored zone parts are neutral. Revealing the card list is a hint the page charges for. After "done", `collect <id>`; `wrong` holds box-label pairs.

### 2. Cross-examination

Then ask 5 questions in chat, one at a time, one line each. Answers are typed in chat, not picked from options. Base each on a real model item, and keep its `ref` as the answer key. Never hint the answer in the question.

| Key | Type | Source item |
|---|---|---|
| q1 | Why X and not Y? | `decision` |
| q2 | What does a malicious actor try here, and what stops them? | `failure`, `permission` |
| q3 | Which data structure holds this, and how does it change? | `state`, `transition`, or a store component |
| q4 | Where does this fail first (timeout, outage, double request, 10x load)? | `failure`, external component |
| q5 | What does this domain term mean, and why that name? | `term` (lexicon) |

If the zone has no item for a type, use the closest other item; never invent one.

### 3. Grade and apply

Grade each answer solid / partial / miss (`grading.md`), then:

```
apply <id> --text '{"q1":"solid","q2":"partial","q3":"solid","q4":"miss","q5":"solid"}'
```

Pass `q1`..`q5` only. The boss passes when the board is ≥70% and at least 3 answers are solid; the result shows `cleared: ["boss"]` and `claimed: true`.

- Practice: one debrief (≤120 words) after all five, covering misses with `file:line`.
- Exam: no feedback until the report card.
- Failed: name the one or two things to revisit. The rung stays open for another try.

## Final boss

When every zone is claimed (`fog` shows `ccccc` for each zone), tell the user: "Final boss unlocks, coming in a later version." Do not run it.
