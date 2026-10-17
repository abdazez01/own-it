# Grading and feedback

## Free text

`collect <id>` returns `text`: pin answers by card id, Break answers keyed `tok:<threatId>`. Grade each key:

- **solid**: right, names the real mechanism.
- **partial**: right direction, missing the key piece.
- **miss**: wrong, empty, or a guess.

`apply <id> --text '{"s-cancel":"solid"}'` with every key graded. `--got/--of` are only for words ids and map-rung missions or rounds. Then rebuild recs. `missed` lists ids; `wrong` lists pairs.

## Feedback file

Write `.own-it/feedback.json` (Exam: only at the report card), run `build-feedback <roundId> .own-it/feedback.json`. It merges with the round's existing feedback (grades and notes by key, a new `debrief` replaces), so send only what is new. Shape: `{grades?: {q1..q5: solid|partial|miss}, debrief?: string, notes?: {key: string}}`.

- Practice: `debrief` ≤120 words, missed and wrong items only, with `file:line`; notes ≤300 chars each. Never restate correct items. Mention bugs, never fix.
- Exam: no feedback until the report card.
- No em or en dashes; the helper rejects them.
- Boss and teach-back `ask` events (`{round, q:'q1'..'q5', text}`): grade, write `grades` for that key, wait.

## Where it lives

`build-round` attaches `file:line` refs of the items a round uses; the results panel lists them (editor links with `OWNIT_ROOT`) only when the round ends.

## Output caps

Curiosity answer ≤80 words. Exam report card: one line per zone. Hint: one sentence plus "(prediction, may be wrong)".

## Hints and curiosity

Never hint on a board in chat. Exam and Impossible: no hints. A "why?" after answering is Curiosity (Practice, max 3 per mission, `--curiosity n`); before submitting, it is a hint.

## Challenge

The page sends `challenge {id, item}`: a model item id or an arrow `A->B`. In file mode the user types `challenge <id>`.

1. Re-read the code at the item's `ref`.
2. User right: write `.own-it/fix-<zone>.json` `{"zone","files":[],"items":[corrected item]}` (same id replaces; one-item extraction), `check-refs` it, then add `--challenge-won 1` to `apply`. To delete an item, list its file in `files` and include that file's other items.
3. User wrong: `build-feedback` with a note giving `file:line` evidence, ≤300 chars.

Resolve before `apply`, which runs once. After it: fix the model with `check-refs` if the user is right, no XP.

## Exam report card

`<Zone>: defensible | shaky | blind spot, <one reason>`. Defensible: every mission ≥70%, text mostly solid. Shaky: some passed, or text mostly partial. Blind spot: under 50%, or mostly miss. Then answer held follow-ups.
