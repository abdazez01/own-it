# own-it v2 — Design

Date: 2026-10-17
Status: Draft, awaiting user approval
Builds on: `2026-10-13-own-it-design.md` (Phase 1, merged). Everything there still holds unless this document changes it.

## 1. Why v2

The user played Phase 1 on a real project (a profit-calculation app). What went wrong:

1. **Questions were code trivia.** Example: "What does the rule `profit_math_version` do?" To answer, you need to know the code itself. The goal is to understand the system, not to recall config keys or function names.
2. **Too much quiz before the fun.** Ten Words questions and a 70% gate kept the user away from the whiteboard. They had to ask for it, and Claude had to hand-edit `progress.json` to unlock it.
3. **Claude didn't wait.** After it opened the board, Claude asked the fork-check question again right away. The fork check repeated, and the user's turn was skipped.
4. **The chat quiz felt boring.** The user wants a page that reacts: confetti for a right answer, an explanation for a wrong one.
5. **The whiteboard is too complicated.** The board idea is good, but the interaction is heavy.
6. **The user never saw their app.** The game talked about the app but never showed it.
7. **It felt too restrictive.** The user wants more interactivity and keyboard play.

What worked and must stay:

- The read-only behavior. Claude flagged a slow per-item DB query and did not fix it.
- The zone map.
- The board concept.

New request: a **model map** that tells Claude which model to use for which job, to save tokens.

## 2. Goals

- Every quiz and board interaction happens in the game page. Chat is for narration, debriefs, and the boss cross-examination.
- Feedback is instant and fun: confetti and a sound-free "nice" moment when you're right, and a short explanation when you're wrong. No round-trip to Claude per question.
- The player sees their actual app: real screens rebuilt as clickable pages.
- Simpler boards with full keyboard play.
- Questions sit at product and architecture level.
- Less gatekeeping. The player can jump to the part they want.
- Token use stays at or below Phase 1 targets.

## 3. Non-goals

- Running the user's real app, backend, or database. Screens are rebuilt copies, not the live app.
- Logging in to anything or bypassing real authentication. The copy simply has no auth, because it has no backend.
- Editing the user's source (unchanged guarantee).
- New board types beyond those listed here. Phase 1's state-machine and role-matrix plans are paused; the simpler boards below replace swimlanes as the default.

## 4. Anti-goals (would make v2 a failure even if it works)

- Questions whose answer is a function name, variable name, config key, or line number.
- More than 3 questions before the player first touches a board or screen.
- Claude doing anything after opening the page except waiting for the player.
- A screen copy that leaks real data. Copies use made-up sample data only.

## 5. The player's session (new flow)

1. `/own-it` → **fork check, once.** It runs only as the first step of a `/own-it` invocation and never again in that conversation, including after unlocks, rebuilds, or "show map".
2. Runtime check and safety notice, unchanged.
3. First run: scan, zones, init, unchanged.
4. **Pick what to play.** One question-tool prompt with these options:
   - Quick quiz (Words)
   - My app's screens (Screen tour)
   - Whiteboard (Map / Trace / Break)
   - Boss

   All are open. The recommended next step is listed first.
5. Claude prepares the content (section 9) and writes it into the page data, runs `open`, then says one line: "Page is open. Play, then type **done**." **Then it stops and waits.** Writing anything else before the player types `done` (or asks something) is a bug.
6. On `done`: collect, grade any free text, keep the debrief within caps, apply, then offer the next pick.

## 6. Game page v2 (one page, four modes)

The same single `game.html` (data from `.js` files; works on `file://`). Modes:

### 6.1 Quiz mode (replaces chat Words questions)

- Claude writes `quiz.js`: 5 questions per round (not 10).
- Each question has 4 options. Each wrong option carries a one-sentence "why not" written by Claude. The right option carries a one-sentence "why" plus an optional `file:line` peek.
- The correct index is obfuscated, as with board answers.
- **Right answer:** confetti burst (pure CSS/canvas, no library), "+10 XP" pop, the why-line, then auto-advance after a short delay or on Enter.
- **Wrong answer:** the card shakes, your choice is marked, its "why not" line shows, then the right option and its why. You press Enter or N to continue.
- **End of round:** a score card. The download/copy submit works as on boards (`own-it-<id>.json`).
- **Keyboard:** 1–4 or A–D to answer, Enter or N for next, H for hint (costs XP, confirm), Esc returns to the map.

### 6.2 Screen tour mode (new: "see your app")

- Claude rebuilds one screen of the user's app as a self-contained HTML fragment (`screens/<screenId>.html`, loaded as data via `screens.js`). It keeps the layout, labels, buttons, and form fields of the real screen, filled with made-up sample data. There is no backend, no auth, and no network.
- Each interactive element is tagged with a `data-ownit` id that maps to model items.
- Tour missions, played directly on the screen:
  - **"What happens when you tap this?"** The player clicks a button on the copy. A panel shows 3–4 possible chains ("calls POST /trips/:id/cancel → sets cancel_pending → notifies manager"). The player picks one, then gets confetti or the explanation.
  - **"Find it."** "Where would a driver release the cable?" The player clicks the right element on the screen.
  - **"Who sees this?"** Pick the role(s) that can reach this screen or button. This covers the multi-account confusion the user hit before (manager vs driver).
- Each tour step can link to the matching board card ("see it on the whiteboard").
- **Keyboard:** Tab or arrow keys move between tagged elements, Enter picks, and 1–4 choose a chain.

### 6.2b Quests (user request): play through your own workflow

- A quest is a goal that spans several screens, such as "Place an order", "Cancel a trip and get it approved", or "Release the cable after the trip ends".
- When a quest starts, a **quest pop-up** appears before the screen. It shows the goal and a short checklist of objectives ("1. Open the trip. 2. Request the cancel. 3. Switch to the manager and approve it."). The player dismisses it with Enter, and the checklist stays pinned in a side panel.
- The player walks the flow on the rebuilt screens:
  - **Clicking.** A tagged element with `goes` loads the next screen into the iframe.
  - **Forms.** Form fields can be typed into, and there are no scripts in the copy, so typing is safe.
  - **Switching role.** Changing user means picking the role from a role switcher. This is the "other account" moment the user found confusing in their real app.
  - **Ticking objectives.** Each objective ticks off with a small confetti burst when its tagged element is used in the right order.
- **Wrong turn.** A click that leaves the expected path makes the panel show "That's not how this flow goes. Why?" with the element's `purpose`. The player can retry, at a cost of −5 XP per wrong turn.
- **End of the quest.** A summary shows the objectives done, the wrong turns, and the time taken. Then the usual download/copy happens, and Claude checks it on `done`:
  - It grades the order of steps against the model flow.
  - It writes a debrief within the caps.
  - It points out any step the player hesitated on.
- **Where the data comes from:**
  - The quest objectives come from a model `flow`. Each step maps to an `element` whose `does` belongs to that flow.
  - Navigation comes from the new `element.goes` field (the target surface id).
- **Scoring.** +10 per objective done in order, −5 per wrong turn, and +50 for completing with no wrong turns. A quest counts toward Trace for its flow.
- **Keyboard.** Tab or arrow keys move between tagged elements, Enter clicks, R opens the role switcher, Q shows the quest list.
- **Helper:**
  - `build-missions` gets a `quest` kind. It takes `flow` from the recipe and derives the objectives and the expected path.
  - `build-screen` requires every `goes` target to be a registered screen, or marks that element "dead end (not rebuilt)".

### 6.3 Whiteboard mode (simplified)

- **Map ("who talks to whom"):** cards are laid out automatically (no free dragging needed). To connect, click or press Enter on a card, then on its target; an arrow appears. Press Delete on a selected arrow to remove it. Dragging still works for people who like it.
- **Trace ("what happens next"):** swimlanes are replaced by a step-picker. You start at the trigger (often a button from the screen tour). At each step you choose the next card from 3–4 candidates, building the chain one click at a time. Wrong picks shake and show their "why not". Lanes and actors are shown as color tags on the cards, not as drop zones.
- **Break:** unchanged concept, simpler input. You select a threat token (1–4), then click or Enter on the card where it breaks, then type one line on what happens.
- **Keyboard everywhere:** arrows move the selection, Enter acts, Delete removes, H hints, ? shows the key help overlay.

### 6.4 Map screen

As in Phase 1, plus:

- A "Screens" strip per zone with thumbnails of the screens that have been rebuilt.
- Modes appear as big buttons: Quiz, Screens, Board, Boss.

## 7. Question rules (all modes)

Questions must be about one of:

- what the product does for a user,
- what a domain term means and why it is named that way,
- who can do what,
- what happens when an action is taken,
- why it was built this way,
- where it breaks.

They must never be answerable only by a function name, variable name, config key, or line number. Identifiers may appear in the peek and explanation, never as the subject or the answer.

A good and a bad example for the profit app go into `references/rungs.md`:

- **Bad:** "What does `profit_math_version` do?"
- **Good:** "An admin re-runs profit for last month after changing the math. What happens to last month's old numbers?"

## 8. Gates (softer)

- All modes and rungs are playable from the start.
- The ladder remains as the **recommended** path and is shown on the map.
- Clearing still needs ≥70% per rung, and Map still needs all surfaces covered.
- **Claim** (zone boss win) still requires every rung cleared first. Playing the boss early is a practice run and cannot claim.
- `build-missions` stops rejecting rungs that are "locked". Locked becomes "not recommended yet", shown in the result.

## 9. Content generation and the model map

New file `references/models.md`, loaded once at session start (≤150 words). Each job is listed with the model to dispatch through the Agent tool when available:

| Job | Model | Why |
|---|---|---|
| Words term list (`scan --strings`) | none (script) | mechanical |
| Quiz round: questions + options + why/why-not lines | Haiku | short, pattern-driven, from the cached model |
| Structure extraction (per zone) | Sonnet | reading code, caps from Phase 1 |
| Screen rebuild (one screen → HTML) | Sonnet | reading a component and writing HTML |
| Recipes (board/tour missions) | session model | small output, needs judgment about what matters |
| Free-text grading, debrief, boss cross-exam | session model | judgment |

- When there is no subagent tool, the session model does everything inline under the same caps.
- Haiku quiz output is validated by the helper (`build-quiz`) and spot-checked by the session model against the model items before writing.

## 10. Helper changes

- `build-quiz <quiz.json>`: validates the questions (exactly 4 options, one correct, every option has a why/why-not under 160 chars, no identifier-only answers per a simple regex check), obfuscates the correct indices, and writes `quiz.js`.
- `build-screen <screenId> <html-file>`: sanitizes and stores a screen copy.
  - It strips `<script>`, inline event handlers, external URLs, `<iframe>`, `<form action>`, and network attributes.
  - It verifies that every `data-ownit` id exists in the model.
  - It writes `screens/<id>.html` plus the registry `screens.js`.
  - Caps: 60 KB per screen, 8 screens per zone.
- `build-missions`: adds tour mission kinds (`tour-chain`, `tour-find`, `tour-role`) and the trace step-picker format (distractors come from model items). Rung gating becomes advisory (section 8).
- `apply`: handles quiz and tour results with the same XP rules (correct element +10, hints −15).
- `open`: unchanged.

## 11. Screen rebuild rules (for the Sonnet subagent)

- Input: one screen component file (plus its direct child components if needed), capped at 3 files and 400 lines total.
- Output: one HTML fragment with inline CSS and no JavaScript. It keeps the visual hierarchy, labels, and interactive elements.
- Every button, link, or input that matters gets `data-ownit="<model item id>"`.
- Data is made up and plausible. Never copy real values found in fixtures, seeds, or env files. Fill with neutral sample values instead.
- Screens that need a login show their logged-in state, because there is no login in the copy.
- On failure (an unsupported framework, or a screen too dynamic to copy), fall back to a "sketch" card: a plain wireframe listing the screen's buttons and fields.

## 12. Bugs to fix regardless

1. **The fork check repeats.** Fix: docs state that it runs once per `/own-it` invocation and never again in the conversation. Pressure scenario: a mid-session unlock or rebuild must not re-ask it.
2. **Claude doesn't wait after `open`.** Fix: a hard rule in `SKILL.md`. After `open`, send one line, then stop. Pressure scenario added.
3. **A test unlock was done by hand-editing `progress.json`.** Fixed by the soft gates (section 8). The docs should forbid hand-editing progress.

## 13. Token budget

The Phase 1 targets stay. New items:

- Quiz round (Haiku): at most 3,000 tokens per 5 questions.
- Screen rebuild (Sonnet): at most 8,000 tokens per screen, cached by file hash and rebuilt only when fogged.
- Per-question chat cost: zero. All feedback is in the page.

## 14. Testing

- `node --test` for `build-quiz`, `build-screen` (sanitizer: script, event-handler and URL stripping; size caps), tour missions, advisory gates, and apply for quiz and tour.
- A browser check of quiz mode (confetti, why-not, keyboard), screen tour on a rebuilt trip-app screen, and the step-picker trace.
- Pressure scenarios:
  - fork check once,
  - wait after `open`,
  - no identifier-only questions,
  - no hand-editing of progress.
- An end-to-end run on the trip-app sample, with a fresh token report.

## 15. Decisions from the builder check (Claude's calls, user to confirm)

1. **The model schema is extended.** The new tour and quiz content must be checkable against something, so the structure pass collects more:
   - New item kind `element`: a button, link, or input on a screen. Fields: `on` (surface id), `label`, `does` (the flow id or edge it triggers), `goes` (optional: the surface id it navigates to), `roles` (role ids that can see or use it), `ref`, `conf`.
   - New optional field `purpose`: one plain-language line saying what it is for a user, on surfaces, components, flows, and failures.
   - `extraction.md` and `check-refs` validation are updated. The `element.on` and `element.does` references must resolve.
   - `data-ownit` ids in screen copies must be `element` or `surface` ids from the model, and `build-screen` rejects unknown ids.
   - The correct tour-chain answer is the flow named in `element.does`. Distractor chains are other flows in the zone.
   - `tour-role` answers come from `element.roles` or the role checks on the surface.
   - This is the first and largest task of the plan.
2. **What the quiz writer receives.** The Haiku quiz writer gets model items with `purpose` lines plus at most 6 short code excerpts (≤20 lines each) that the session model picks. It never gets whole files. This keeps the 3,000-token cap realistic.
3. **Identifier-only answers.** `build-quiz` hard-rejects any option (question text and the correct option especially) that is a single token containing `_`, `/`, `.`, or camelCase, or that is wrapped in backticks. Everything else is left to the session model's spot-check. A rejection prints the offending question index, so only that question is rewritten.
4. **Scoring of quiz and tour:**
   - A quiz round of 5 questions is the Words rung. It clears at ≥70% (4 of 5).
   - Tour missions give XP and count toward Map coverage for the surfaces they show, because the player has seen and used that screen.
   - The Trace step-picker is scored per pick: +10 for a right pick on the first try, +5 on the second try, 0 after that. The step is then revealed and play continues.
   - Trace clear is ≥70% of the maximum.
   - When fewer than 3 distractors exist in the zone, the picker uses distractors from other zones, then shows fewer options (minimum 2).
   - Result files keep the Phase 1 answer shape (`got`, `of`, `missed`, `wrong`, `text`, `hintsUsed`). New ids: `<zone>-quiz-<n>` and `<zone>-tour-<n>`.
5. **How screens are isolated:**
   - Screen copies render inside `<iframe sandbox="allow-same-origin" srcdoc=…>` with no `allow-scripts`. The copy's own scripts can never run. The page script attaches click and key listeners through `contentDocument`.
   - The `srcdoc` carries a CSP meta: `default-src 'none'; style-src 'unsafe-inline'; img-src data:`. This blocks `url()`, `@import`, and any network access.
   - `build-screen` uses a tag/attribute allowlist (layout, text, form, and table tags; `class`, `style`, `data-ownit`, `type`, `placeholder`, `value`, `disabled`, `aria-*`) and drops everything else.
   - Styles stay inside the iframe, so they cannot leak into the game UI.
6. **Real-data check.** `build-screen` rejects a screen that contains email addresses, UUIDs, long hex or base64 tokens (≥24 chars), or any value found in the project's `.env*` files. The error lists what matched. This is deterministic, in addition to the subagent's instruction to use sample data.
7. **Screen cache and fog:**
   - The `screens.js` registry stores each screen's input files and their committed hashes.
   - `fog` marks a screen stale if any input file changed. The map strip shows a fog badge on stale thumbnails.
   - A stale screen is rebuilt only when it is next played.
9. **Everything lives in `.own-it/` (user request).** Deleting the folder removes all trace of the game from the project.
   - Game page, data, screens, quests, answers, progress, cache, and logs all go there.
   - Answer files are moved out of Downloads into `.own-it/answers/`, so nothing is left behind in Downloads.
   - *Change from Phase 1:* "predict, then prove" test files are written to `.own-it/tests/`, not the project's test folder. The docs tell the player how to copy a test into their own suite if they want to keep it.
   - Outside the project, the only footprint is the skill itself (`~/.claude/skills/own-it`) and Node.js, if the player chose to install it.
   - `init` writes nothing outside `.own-it/`. That was already true and gets a test.
   - The README and the safety notice say: "Delete `.own-it/` to remove everything."
10. **Fork check once** is enforced by the docs only. Claude cannot see the conversation's id, so a marker file would be wrong across sessions. A pressure scenario covers it.

## 16. Open for the builder

- The confetti implementation, the exact layout of the step-picker, and the screen thumbnail rendering.
- How many distractors to pick, and how (from same-zone model items of the same kind).
