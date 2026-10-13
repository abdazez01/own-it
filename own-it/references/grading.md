# Grading and debrief

## Free text

`collect` gives `text`: pin answers keyed by card id, Break answers ("what happens, what defends it") keyed `tok:<threatId>`. Grade every key:

- **solid**: right, and names the real mechanism the code uses.
- **partial**: right direction, but vague or missing the key piece.
- **miss**: wrong, empty, or a guess.

Pass all grades: `apply <id> --text '{"s-cancel":"solid","tok:x-role":"partial"}'`.

Break boards score threat-token placement only; their arrows are context. `missed` lists ids; `wrong` lists `[a, b]` pairs (map: card ids; boss: box labels; break: threat id, card id).

## Output caps

- Practice debrief: ≤120 words. Missed and wrong items only, with `file:line`. Never restate correct items. Mark low-confidence items. Bugs spotted: mention, never fix.
- Curiosity answer: ≤80 words each.
- Exam report card: one line per zone.
- Hint: one sentence, plus "(prediction, may be wrong)".

## Hints

Board hints: the page's Hint button confirms and records the cost. In chat, never hint on a board mission; point to the button. Words (Practice): confirm with the question tool ("Sure? Costs 15 XP"), give one sentence, and score that question as wrong. Exam: no hints.

## Curiosity (Practice only)

A "why?" or follow-up asked after answering counts; asked before submitting, it is a hint request. Count per mission (max 3); `apply` after them with `--curiosity n`.

## Challenge

The user types `challenge <id>`: a model item id, or an arrow `A->B` (card ids on map, box labels on boss).

1. Re-read the code at the item's `ref`.
2. User right: fix the truth model. Write `.own-it/fix-<zone>.json` as `{"zone": "<zone>", "files": [], "items": [<corrected or new item>]}` (same id replaces), run `check-refs` on it, then add `--challenge-won 1` per win to `apply`. To delete an item, put its file in `files` and include that file's other items from `model.json`.
3. User wrong: show the `file:line` evidence, explain in ≤80 words. No XP change.

Resolve challenges before `apply`; it runs once.

## Exam mode

No hints, no debriefs, no follow-ups until the end. Still grade text and `apply` each mission. At the end, the report card, one line per zone played:

`<Zone>: defensible | shaky | blind spot — <one reason>`

- **defensible**: every mission ≥70% and text mostly solid.
- **shaky**: passed some, or text mostly partial.
- **blind spot**: under 50%, or text mostly miss.

Then answer held follow-ups (≤80 words, no Curiosity XP).
