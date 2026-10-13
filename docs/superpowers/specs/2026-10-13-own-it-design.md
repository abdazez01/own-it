# own-it — Design Spec

Date: 2026-10-13
Status: Draft, awaiting user review

## 1. Purpose

Many developers who ship code with Claude Code feel disconnected from what they built. Coding feels mundane, and they can no longer explain their own systems. `own-it` is a Claude Code skill that turns reconnecting with your codebase into a whiteboard game.

The benchmark comes from the "whiteboard defense" idea: a developer should be able to explain any system they shipped, defend the decisions behind it, and say where it fails. Line-level recall is not required. Architecture, vocabulary, flows, decisions, and failure modes are.

Success means a user who finishes a zone can:

- name and explain the domain terms and UI labels in that zone,
- map every surface (screen, route, CLI command, public API) in it,
- trace a key action end to end across actors and apps,
- defend why it was built that way,
- say where it breaks and what protects it.

## 2. Non-goals

- Line-by-line code knowledge.
- Editing, fixing, or refactoring the user's source code. The skill is read-only toward source.
- Running against production systems.
- Team leaderboards or multiplayer (v1).
- First-class multi-repo support (v1 shows outside apps as black-box cards).

## 3. Core concepts

| Term | Meaning |
|---|---|
| Zone | A subsystem of the app (Auth, Trips, Payments). The unit of progress. |
| Surface | A user- or caller-facing entry point inside a zone: screen, route, CLI command, public API. |
| Rung | One difficulty step inside a zone. Rungs unlock in order. |
| Mission | One playable task on the whiteboard. A session has about 5. |
| Truth model | Claude's extracted, cached picture of the real architecture, used as the answer key. |
| Fog | Marks a claimed zone whose files changed since it was claimed. |
| Lexicon | The glossary of domain terms and UI labels the user has learned. |

## 4. The ladder

Each zone is climbed bottom-up. A rung unlocks when the previous rung is cleared. A rung is cleared by scoring 70% or more on one of its missions, except Map it, which is cleared only when every surface in the zone has appeared in a Map it mission scored at 70% or more. A zone is **claimed** when its boss is beaten. The final boss unlocks when every zone is claimed.

| Rung | Name | Player task | Board types | Code exposure |
|---|---|---|---|---|
| 0 | Words | Learn domain and UI vocabulary: what a term means, where it appears (button, DB field, API, enum), why it is named that way. | Lexicon cards | None |
| 1 | Map it (Easy) | Place every surface in the zone and connect them. State who can do what. | Component map, role matrix | None |
| 2 | Trace it (Medium) | Follow one action end to end. Answer "?" decision pins ("why Redis here and not the DB?"). | Swimlanes, state machine | Optional peek |
| 3 | Break it (Hard) | Threat tokens are dropped on the board (malicious user, service down, double request, timeout, 10x traffic, offline client). Mark where it breaks and what defends it. Optionally predict, then prove with a test. | Any board plus tokens | Key line shown as evidence |
| 4 | Defend it (Zone boss) | Draw the zone on a blank board from memory, then answer a chat cross-examination about it. | Blank whiteboard | None |
| ★ | Final boss | Whole-app whiteboard defense. | Blank whiteboard | None |

Easy must cover every surface in the zone across its missions. Harder rungs are selective: they pick the flows, decisions, and failure points that matter, never walking every line.

### 4.1 Reconnecting with code

Code is offered, never forced. Every card carries a `ref` (`file:line`). A **peek** shows the reference and a short snippet and can open the file in the user's editor. Rungs 0, 1, and 4 never show code. Rung 2 offers peeks. Rung 3 shows the key line as evidence in the reveal. The intent is that curiosity, not obligation, pulls the user back into the code.

## 5. Board types

1. **Component map**: cards plus directed arrows. Answers "what talks to what".
2. **Swimlanes**: one lane per actor or app (Driver app | Backend | Manager portal). Numbered steps that can cross lanes. Answers "where does this flow jump to another app or account".
3. **State machine**: status cards plus transitions labeled with the triggering role or event. Answers "how does this status move, and who moves it".
4. **Role matrix**: actions dragged onto roles. Answers "who can cancel, who approves, who can override".
5. **Lexicon cards**: match term to meaning, and term to where it appears.

Every mission is scoped to one flow and about 5 to 10 cards. No mission shows a whole app at once.

Apps or services outside the repo appear as **black-box cards** with a label and no internals.

## 6. Interaction model

### 6.1 Surfaces

- **Game page** (`.own-it/game.html`): a single static HTML file with no external dependencies that works offline. It has two screens:
  - **Map**: zones, fog, rung progress, XP, badges, weak spots.
  - **Whiteboard**: drag cards, draw arrows, sticky notes, lanes, state transitions, token drops, and the reveal overlay.
- **Chat**: narrator only. Mission briefings, debriefs, hints, and boss cross-examination.

### 6.2 Mission loop

1. Claude writes the session's missions to `.own-it/mission.js` (`window.OWNIT_MISSIONS = {...}`). The template loads it through `<script src>`, which works on `file://`.
2. The user plays a mission on the whiteboard and presses **Submit**.
3. The page grades structural answers itself and shows the reveal overlay instantly:
   - green = correct,
   - red ghost = missed,
   - crossed out = wrong,
   - each item links to its real `file:line`.
4. The page delivers the answer to Claude in one of two ways:
   - **Auto-save**: in browsers with the File System Access API (Chrome, Edge), the page writes `.own-it/answers/<missionId>.json`, and the user types "done" in chat.
   - **Clipboard fallback**: Submit copies a compact string `OWNIT:<base64 json>` that the user pastes in chat.
5. Claude reads only the summary (score, misses) plus any free-text fields (sticky notes, "why" answers, break explanations), grades those, and gives a debrief in Practice mode.
6. **Challenge button**: if the user disputes a reveal item, Claude rechecks the code. If the user was right, Claude corrects the truth model and awards bonus XP.

### 6.3 Self-grading by board type

| Board | Comparison |
|---|---|
| Component map | Directed edge set match. Optional arrow labels are compared loosely by Claude only if free text. |
| Swimlanes | Ordered step sequence. Score by longest common subsequence against the expected sequence. Lane placement checked per step. |
| State machine | Transition set match, including trigger role. |
| Role matrix | Cell set match. |
| Lexicon | Exact match of term-to-meaning and term-to-location pairs. |
| Break it | Token-to-card placement checked by the page. The "what happens / what defends it" text is graded by Claude. |

Expected answers ship inside `mission.js`, lightly encoded (base64 of XOR with a fixed key) so the user is not spoiled by accident. This is anti-spoiler, not security. It is an honor-system self-improvement game.

### 6.4 Opening the page

Claude opens the page with the platform command (`start` on Windows, `open` on macOS, `xdg-open` on Linux) or with a browser tool if the harness provides one.

### 6.5 No-browser fallback

When no browser is available (SSH, remote machine), rungs 0 (Words) and 1 (Map it) run in text form through the multiple-choice question tool. Rungs 2 and up require the game page, and Claude says so.

## 7. Session flow

1. **Trigger**: the user runs `/own-it` or asks to be quizzed on or defend their code. The skill never starts on its own while Claude is building something.
2. **Fork check**: Claude explains that the game reads a lot of code and adds many messages, so a forked or fresh session keeps the user's work context clean. Options: *Yes, this is a fork* / *No, I'll fork first* (Claude explains how for the current harness and stops) / *No, play here anyway*.
3. **Safety notice** (once per session): "own-it is read-only. It never edits your source. Test files are only written after you approve each one."
4. **First run only**:
   1. Skeleton scan (see section 9) produces a zone list.
   2. The user confirms, renames, or merges zones.
   3. Claude asks whether `.own-it/` should be committed (team-visible coverage) or gitignored (personal stats). Default suggestion: gitignore.
   4. Claude copies `assets/game.html` into `.own-it/` and writes `progress.json`.
5. **Later runs**: load `progress.json`, compute fog (section 10), and show a short status (XP, claimed zones, fogged zones, weak spots).
6. **Pick mode**: Practice or Exam (section 8.2).
7. **Pick target**: Claude suggests fogged zone first, then weak spot, then next unlocked rung. The user may override.
8. **Prepare zone**: deep extraction for the target zone and rung if not cached (section 9).
9. **Run about 5 missions**, all written to `mission.js` in one write.
10. **End**: update `progress.json` and `lexicon.md`, open the Map screen, offer "one more?". "Show map" works at any time.

## 8. Scoring and modes

### 8.1 XP

| Event | XP |
|---|---|
| Correct board element | +10 |
| Partially correct element (e.g. right edge, wrong label) | +5 |
| Free-text answer graded "solid" / "partial" | +20 / +10 |
| Curiosity: a "why?" or follow-up question asked after answering | +5 each, max 3 per mission |
| Challenge won | +20 |
| Hint used | −15 (mission XP cannot drop below 0) |
| Rung cleared | +50 |
| Zone claimed | +200 |
| Fog cleared (refresh mission passed) | +30 |

Badges (v1 set): First Word, Cartographer (all surfaces of a zone mapped), Tracer, Red Team (first Break cleared), Curious Mind (25 curiosity events), Defender (first zone claimed), Owner (final boss beaten), Fog Lifter (5 fog clears).

### 8.2 Modes

- **Practice (mentor)**: hints available, debrief after every mission, XP earned normally.
- **Exam (examiner)**: no hints and no debriefs until the end. Ends with a report card rating each zone played as *defensible*, *shaky*, or *blind spot*. Exam results are recorded and can clear rungs, but never remove XP.

### 8.3 Hints

Hints are discouraged:

- they need a confirm step ("Sure? Costs 15 XP"),
- they cost XP,
- they are always labeled as a prediction that may be wrong.

Debriefs and follow-up questions *after* an answer are encouraged and earn Curiosity XP. The rule is: skipping the thinking is penalized, wanting to learn is rewarded.

### 8.4 Bosses

- **Zone boss**: the user draws the zone on a blank board (cards available, no arrows). The page self-grades the drawing. Claude then asks 5 cross-examination questions in chat, drawn from the tweet's categories: "why X instead of Y", "what if this actor is malicious", "what data structure and why", "where does this fail", plus one about a domain term. Pass = board ≥ 70% and at least 3 of 5 answers graded solid.
- **Final boss**: same format at app level, with zones as cards and one question per zone, capped at 8.

### 8.5 Predict, then prove (Break it)

After a Break mission, Claude may offer to prove a prediction with a real test. Claude proposes a test file path in the project's existing test folder and its contents. Nothing is written until the user approves that specific file. Tests are only ever added. Existing files are never modified.

## 9. Truth model extraction

Extraction is lazy, cached, and done by a subagent to keep the main conversation small.

### 9.1 Skeleton scan (first run)

Uses the file tree, package manifests, and grep for routes, screens, CLI commands, status enums, and role checks. Avoids full file reads. Output: zone list with each zone's files and surfaces.

### 9.2 Deep extraction (per zone, per rung, on demand)

- **Words**: UI strings, enum values, model and field names. Grep-first.
- **Map it**: surfaces, components, calls between them, role and permission checks (middleware, guards, policy code).
- **Trace it**: key flows (which client calls which endpoint, what gets written), status enums plus every place a status is written, notifications and events that cross apps or accounts, decision points worth a "?" pin.
- **Break it**: input validation, auth checks on mutating endpoints, idempotency, retries and timeouts, concurrency points, external dependencies.

Every extracted item carries a `ref` (`file:line`) and a `confidence` (high, medium, low). Low-confidence items are labeled as such in missions and reveals.

**Domain meaning**: when code shows what a term is but not why it has that name (e.g. "cable" on a lock), Claude may use web search for the domain meaning. Such entries are marked as outside knowledge.

### 9.3 Subagent

Extraction runs through the Agent tool on a cheaper model (Sonnet or Haiku) and returns compact JSON only. The main conversation never sees raw source. If the harness has no subagent tool, Claude extracts inline with the same grep-first rules.

### 9.4 Cache

Results are stored in `.own-it/model.json` with the commit they were extracted at. Later sessions reuse the cache and re-extract only files flagged by fog.

## 10. Fog

- Each claimed zone or cleared rung stores the commit SHA it was achieved at.
- At session start, Claude runs `git diff --name-only <sha>..HEAD` plus `git status --porcelain` and intersects the changed files with each zone's file list.
- A zone with changed files is **fogged**. Its rung progress stays visible but marked as stale.
- A **refresh mission**, scoped to the changed flows only, clears the fog. Claude re-extracts only the changed files first.
- If the project is not a git repository, fog is disabled and Claude says so once.

## 11. Files

### 11.1 Skill package

```
own-it/
  SKILL.md                 trigger, safety rules, session loop, index of reference files
  references/
    onboarding.md          fork check, safety notice, first scan, git question
    extraction.md          truth model rules (section 9), subagent prompt, output schema
    rungs.md               mission types per rung, board types, unlock rules
    grading.md             XP table, hints, curiosity, challenge, modes, report card
    bosses.md              zone and final boss scripts
    schemas.md             progress.json, model.json, mission.js, answer formats; fog logic
  assets/
    game.html              Map + Whiteboard + reveal template
```

`SKILL.md` stays short and tells Claude which reference file to load for each phase, so only the current phase's instructions enter context.

`game.html` is designed once during the build (using design skills available at build time) and shipped as a fixed file. At runtime Claude never edits it.

### 11.2 Runtime files in the user's repo

```
.own-it/
  game.html          copied from assets on first run
  mission.js         current session's missions (rewritten each session)
  progress.json      XP, badges, rung status per zone, claim SHAs, weak spots
  model.json         cached truth model
  lexicon.md         human-readable glossary of learned terms
  answers/           submitted answers (auto-save path)
```

### 11.3 Data shapes (sketch, finalized in schemas.md)

```jsonc
// progress.json
{
  "version": 1,
  "xp": 0,
  "badges": [],
  "curiosity": 0,
  "zones": {
    "trips": {
      "name": "Trips",
      "rungs": { "words": "cleared", "map": "cleared", "trace": "open", "break": "locked", "boss": "locked" },
      "sha": { "words": "abc123", "map": "abc123" },
      "claimed": false,
      "fogged": false,
      "weakSpots": ["cancel_pending -> active transition"]
    }
  },
  "finalBoss": "locked",
  "settings": { "gitTracked": false }
}
```

```jsonc
// mission.js
window.OWNIT_MISSIONS = {
  "session": "2026-10-13T16:00",
  "mode": "practice",
  "missions": [
    {
      "id": "trips-trace-1",
      "zone": "trips",
      "rung": "trace",
      "board": "swimlanes",
      "brief": "Driver taps Cancel. Draw what happens until the trip is cancelled.",
      "lanes": ["Driver app", "Backend", "Manager portal"],
      "cards": [{ "id": "c1", "label": "POST /trips/:id/cancel", "ref": "api/trips.ts:88", "conf": "high" }],
      "pins": [{ "card": "c3", "q": "Why does cancel need manager approval?" }],
      "tokens": [],
      "answer": "<encoded expected answer>"
    }
  ]
};
```

```jsonc
// answers/<missionId>.json (also the payload behind OWNIT:<base64>)
{
  "id": "trips-trace-1",
  "score": { "got": 7, "of": 9 },
  "missed": ["cancel_pending -> active (manager rejects)"],
  "wrong": [],
  "text": { "c3": "Because drivers could cancel to dodge penalties..." },
  "challenges": [],
  "hintsUsed": 0
}
```

## 12. Guarantees

- Never modifies source files. Writes are limited to `.own-it/` plus test files the user approves one by one.
- Never starts unasked.
- Hints and low-confidence extracted answers are always labeled.
- "Break it" is thinking, plus optional tests on the local copy. Never production.
- Outside-knowledge (web) entries in the lexicon are labeled.

## 13. Token budget strategy

1. The page self-grades structural answers. Claude only handles free text and summaries.
2. The template is fixed. Per session Claude writes only `mission.js`.
3. Extraction is lazy (per zone, per rung) and cached in `model.json`. Fog triggers re-extraction of changed files only.
4. Extraction runs in a subagent on a cheaper model and returns compact JSON.
5. `SKILL.md` is short with phase-scoped reference loading. All missions for a session are written in one batch. JSON uses short IDs. Sessions cap at about 5 missions.

## 14. Risks and items to verify during build

- **File System Access API on `file://`**: confirm `showDirectoryPicker` / `showSaveFilePicker` works for a locally opened HTML file in current Chrome and Edge. If it does not, clipboard becomes the primary channel.
- **Fork instructions per harness**: confirm the exact way to fork or start a fresh session in the Claude Code CLI, desktop app, and IDE extensions, for the fork-check message.
- **Extraction quality on messy repos**: mitigated by confidence labels, the Challenge button, and scoping missions to 5 to 10 cards.
- **Swimlane grading fairness**: LCS scoring may punish valid alternative orderings. Allow the truth model to mark steps as unordered groups.

## 15. Testing

- **Fixture repo**: a small sample app with multiple roles, a status lifecycle needing approval (modeled on the trip-cancel case), and domain jargon. The skill is run against it end to end.
- **game.html**: tested in a browser with hand-written `mission.js` fixtures for each board type, covering self-grading, the reveal overlay, auto-save, and the clipboard fallback.
- **Schemas**: sample `progress.json`, `model.json`, and answer files validated against `schemas.md`.
- **Skill behavior**: pressure scenarios using the writing-skills process, checking that the skill never edits source, always does the fork check, labels hints, and respects rung locks.

## 16. Out of scope for v1, candidates later

- Sibling repos as real lanes (multi-repo).
- Plugin wrapper with extra slash commands (`/own-it map`, `/own-it exam`).
- Text fallback for rungs 2 and up.
- Team-shared coverage views.
