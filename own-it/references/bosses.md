# Bosses

## Zone boss (rung 4)

Recommended after `break`; beating it claims the zone (+200 XP) only when every rung is cleared. Two forms:

1. **Whiteboard**: recipe mission `rung: "boss"`, no pins, blank board; the user draws the zone from memory. Over 15 parts: `cards`, 2-15. `collect <id>`; `wrong` holds box-label pairs.
2. **Boss Battle** (`boss-battle`, HP bars, 3 lives): `build-round boss-battle <file>` with 5 questions `{q, kind}`.

## Cross-examination

Five one-line questions, each from a real model item whose `ref` is your answer key. Never hint the answer.

| Key | kind | Source item |
|---|---|---|
| q1 | `why`: why X and not Y? | `decision` |
| q2 | `malicious`: what does an attacker try, what stops them? | `failure`, `permission` |
| q3 | `structure`: which data structure, how does it change? | `state`, `transition`, store component |
| q4 | `fails`: where does it fail first? | `failure`, external component |
| q5 | `term`: what does it mean, why that name? | `term` |

No item for a type: use the closest other item, never invent one. Follow `rungs.md` question rules.

## Live grading

Each answer arrives as an `ask` event `{round, q, text}`. Grade it (`grading.md`), write `build-feedback <round>` with `{grades:{q1:"solid"}, notes?}` for that key, wait again. Solid hits the boss; partial and miss hurt you.

## Apply

When all five are graded: `apply <id> --text '{"q1":"solid","q2":"partial","q3":"solid","q4":"miss","q5":"solid"}'`. Pass `q1`..`q5` only. Passing needs board ≥70% (if a whiteboard was played) and at least 3 solid; the result shows `cleared:["boss"]`, `claimed`.

- Practice: one debrief, ≤120 words, misses with `file:line`.
- Exam: nothing until the report card.
- Failed: name one or two things to revisit.

## Final boss

When `fog` shows every zone claimed (`ccccc`): "Final boss unlocks, coming in a later version." Do not run it.
