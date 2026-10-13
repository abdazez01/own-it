# own-it — Design Spec

Date: 2026-10-13
Status: Draft, revised after two reviews. Awaiting user approval.

Decisions settled in review:

- Answer channel: browser download into the Downloads folder is primary. Clipboard is the fallback. No File System Access API in v1.
- Board build is phased (section 15.1). Phase 1 is the full game loop plus component map and swimlanes. Phase 2 adds state machine and role matrix. Phase 3 (lexicon cards on the board) is conditional.
- Mechanical chores run in a zero-dependency Node helper script (section 11.4). Node is required. If it is missing, Claude offers to install a pinned version. If the user declines, the skill stops. There is no by-hand mode (section 11.5).
- Every user decision goes through the multiple-choice question tool (section 6.7).
- The skill is measurably lean: extraction caps, mission recipes, per-file hash cache, word budgets, and token logging with targets (section 13).

No open decisions remain.

## 1. Purpose

Many developers who ship code with Claude Code feel disconnected from what they built. Coding feels mundane, and they can no longer explain their own systems. `own-it` is a Claude Code skill that turns reconnecting with your codebase into a whiteboard game.

The benchmark is the "whiteboard defense": a developer should be able to explain any system they shipped, defend the decisions behind it, and say where it fails. Line-level recall is not required. The defense asks questions like:

- "Why did you do X instead of Y?"
- "What happens if this actor behaves maliciously?"
- "What data structure did you use here, and why?"
- "Where does this fail?"

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
| Mission | One playable task. A session has about 5. |
| Truth model | Claude's extracted, cached picture of the real architecture, used as the answer key. |
| Recipe | Claude's short mission description (IDs plus brief and pin questions) that the helper script expands into a full mission. |
| Fog | Marks a claimed zone whose committed files changed since it was claimed. |
| Lexicon | The glossary of domain terms and UI labels the user has learned. |

## 4. The ladder

Each zone has five rungs, numbered 0 to 4, climbed bottom-up. Rung 4 is the zone boss. Beating it **claims** the zone. A separate final boss unlocks when every zone is claimed.

| Rung | Name | Player task | Played on | Code exposure |
|---|---|---|---|---|
| 0 | Words | Learn domain and UI vocabulary: what a term means, where it appears (button, DB field, API, enum), why it is named that way. | Multiple-choice popup in chat | None |
| 1 | Map it (Easy) | Place every surface in the zone and connect them. State who can do what. | Component map, role matrix | None |
| 2 | Trace it (Medium) | Follow one action end to end. Answer "?" decision pins ("why Redis here and not the DB?"). | Swimlanes, state machine | Optional peek |
| 3 | Break it (Hard) | Threat tokens are dropped on the board (malicious user, service down, double request, timeout, 10x traffic, offline client). Mark where it breaks and what defends it. Optionally predict, then prove with a test. | Any board plus tokens | Key line shown as evidence |
| 4 | Defend it (Zone boss) | Draw the zone on a blank board from memory, then answer a chat cross-examination. | Blank whiteboard | None |
| ★ | Final boss | Whole-app whiteboard defense. | Blank whiteboard | None |

### 4.1 Clear rules

- A rung is cleared by scoring 70% or more on one of its missions.
- Exception, Map it: cleared only when every surface in the zone has appeared in a Map it mission scored at 70% or more. Missions hold 5 to 10 cards, so a zone with 25 surfaces needs at least 3 Map it missions before Trace it unlocks. A zone with fewer than 5 surfaces is covered by one mission, padded with its internal components.
- Harder rungs are selective. They pick the flows, decisions, and failure points that matter. They never walk every line.

### 4.2 Reconnecting with code

Code is offered, never forced. Every card carries a `ref` (`file:line`). A **peek** shows the reference and a short snippet and can open the file in the user's editor. Rungs 0, 1, and 4 never show code. Rung 2 offers peeks. Rung 3 shows the key line as evidence in the reveal. The intent is that curiosity, not obligation, pulls the user back into the code.

## 5. Board types

1. **Component map**: cards plus directed arrows. Answers "what talks to what".
2. **Swimlanes**: one lane per actor or app (Driver app | Backend | Manager portal). Numbered steps that can cross lanes. Answers "where does this flow jump to another app or account".
3. **State machine**: status cards plus transitions labeled with the triggering role or event. Answers "how does this status move, and who moves it".
4. **Role matrix**: actions dragged onto roles. Answers "who can cancel, who approves, who can override".
5. **Lexicon cards** (conditional, Phase 3): term-to-meaning and term-to-location matching on the board. Built only if the multiple-choice popup proves too weak for the Words rung.

Build order is defined in section 15.1. Until a board type ships, rungs that need it use the board types that exist.

Every mission is scoped to one flow and about 5 to 10 cards. No mission shows a whole app at once.

Apps or services outside the repo appear as **black-box cards** with a label and no internals.

## 6. Interaction model

### 6.1 Surfaces

- **Game page** (`.own-it/game.html`): a single static HTML file with no external dependencies that works offline. It has two screens:
  - **Map**: zones, fog, rung progress, XP, badges, weak spots, token log.
  - **Whiteboard**: drag cards, draw arrows, sticky notes, lanes, state transitions, token drops, and the reveal overlay.
- **Chat**: narrator, Words rung questions (multiple-choice popup), debriefs, hints, and boss cross-examination.

### 6.2 Mission loop

1. Claude writes mission **recipes** (section 11.3). `own-it.mjs build-missions` expands them from `model.json`, validates, obfuscates answers, and writes `.own-it/mission.js` (`window.OWNIT_MISSIONS = {...}`). The template loads it through `<script src>`, which works on `file://`.
2. The user plays a mission on the whiteboard and presses **Submit**.
3. The page grades structural answers itself and shows the reveal overlay instantly:
   - green = correct,
   - red ghost = missed,
   - crossed out = wrong,
   - each item links to its real `file:line`.
4. The page delivers the answer (section 6.3). The user types "done" in chat.
5. `own-it.mjs collect <id>` prints one compact summary. Claude grades only the free-text fields (sticky notes, "why" answers, break explanations) and gives a debrief in Practice mode (section 8.2 caps).
6. `own-it.mjs apply <id>` records XP, progress, and the token estimate.
7. **Challenge button**: if the user disputes a reveal item, Claude rechecks the code. If the user was right, Claude corrects the truth model and awards bonus XP. If the user was wrong, Claude shows the evidence (`file:line`) and explains, with no XP penalty.

### 6.3 Answer channel

**Primary: browser download.** Submit triggers an `<a download>` of `own-it-<missionId>.json`. Browsers cannot choose the target folder, so the file lands in the user's Downloads folder:

- Windows: `%USERPROFILE%\Downloads`
- macOS and Linux: `~/Downloads`

`own-it.mjs collect <missionId>`:

1. looks for `own-it-<missionId>*.json` in the Downloads folder or `settings.downloadDir` (the wildcard covers browser renames like `own-it-x (1).json`), and takes the newest match,
2. checks that the mission ID matches and the `submittedAt` timestamp is from this session,
3. moves the file into `.own-it/answers/<missionId>.json`,
4. prints only `{id, got, of, missed[], text{}}`, plus `wrong[]` only when it is non-empty. Nothing else.

If no file is found, Claude asks once for the user's download folder path and stores it in `progress.json` under `settings.downloadDir`.

**Fallback: clipboard.** The page also offers "Copy answer", which copies `OWNIT:<base64 json>` with the same compact payload, because long pastes can be mangled in the chat input. `collect` accepts the pasted string.

### 6.4 Self-grading by board type

| Board | Comparison |
|---|---|
| Component map | Directed edge set match. |
| Swimlanes | Steps are `{id, lane, group?}`. Steps sharing a `group` may appear in any order. Score by longest common subsequence over the expected sequence, treating each group as one unordered block. Lane placement checked per step. |
| State machine | Transition set match, including trigger role. |
| Role matrix | Cell set match. |
| Lexicon cards (Phase 3) | Exact match of term-to-meaning and term-to-location pairs. |
| Break it | Token-to-card placement checked by the page. The "what happens / what defends it" text is graded by Claude. |

Expected answers ship inside `mission.js` with **obfuscation** (base64 of a XOR with a fixed key that lives in `game.html`). `build-missions` applies it. Claude never computes it by hand. This only prevents accidental spoilers. It is not security. The game runs on the honor system.

### 6.5 Opening the page

`own-it.mjs open` uses the platform command (`start` on Windows, `open` on macOS, `xdg-open` on Linux). Claude may use a browser tool instead if the harness provides one.

### 6.6 No-browser fallback

When no browser is available (SSH, remote machine), rungs 0 (Words) and 1 (Map it) run in text form through the multiple-choice question tool. Rungs 2 and up require the game page, and Claude says so.

### 6.7 Asking the user

Every point where the user must decide goes through the harness's multiple-choice question tool (`AskUserQuestion` in Claude Code). `SKILL.md` states this as a hard rule and lists the decision points:

- fork check,
- Node missing or too old (section 11.5),
- zone confirm, rename, or merge,
- commit or gitignore `.own-it/`,
- Practice or Exam,
- target zone and rung,
- Words rung questions,
- hint confirm ("Sure? Costs 15 XP"),
- approval of each test file in Predict, then prove,
- download folder path, when not found,
- "one more?" at session end.

Rules for using the tool:

- Put all context the user needs inside the question text and option descriptions. Text written in chat right before the tool call can be hidden by the question UI.
- Put the recommended option first and mark it "(Recommended)".
- Free-text answers (sticky notes, "why" answers, boss cross-examination) are typed in chat, not forced into options.
- If the harness has no question tool, Claude falls back to numbered options in chat and asks the user to reply with a number.

## 7. Session flow

1. **Trigger**: the user runs `/own-it` or asks to be quizzed on, explain, or defend code they shipped. The skill never starts on its own while Claude is building something.
2. **Fork check**: Claude explains that the game reads a lot of code and adds many messages, so a forked or fresh session keeps the user's work context clean. Options: *Yes, this is a fork* / *No, I'll fork first* (Claude explains how for the current harness and stops) / *No, play here anyway*. The check is never skipped. If the user asks to skip it, Claude asks once in a single short line and accepts "play here" as the answer.
3. **Runtime check**: Claude runs `node --version`. If Node is missing or older than the minimum, Claude follows section 11.5.
4. **Safety notice** (once per session): "own-it is read-only. It never edits your source. Test files are only written after you approve each one."
5. **First run only**:
   1. `own-it.mjs scan` prints surface candidates. Claude groups them into a zone list (section 9.1).
   2. The user confirms, renames, or merges zones.
   3. Claude asks whether `.own-it/` should be committed (team-visible coverage) or gitignored (personal stats). Default suggestion: gitignore.
   4. `own-it.mjs init` creates `.own-it/`, copies `game.html`, writes an empty `progress.json`, and applies the gitignore choice.
6. **Later runs**: `own-it.mjs fog` computes fog and stale cache items (section 10) and prints a one-line status (XP, claimed zones, fogged zones, weak spots).
7. **Pick mode**: Practice or Exam (section 8.2).
8. **Pick target**: Claude suggests fogged zone first, then weak spot, then next unlocked rung. The user may override.
9. **Prepare zone** (section 9):
   - Words rung: `own-it.mjs scan --strings <zone>`. No subagent.
   - Rungs 1 to 4: one structure extraction per zone if not cached or stale, then `check-refs`, then spot-check.
10. **Run about 5 missions**: Claude writes recipes, `build-missions` expands them into `mission.js`. After each submit: `collect`, free-text grading, debrief, `apply`.
11. **End**: Claude updates `lexicon.md`, `own-it.mjs open` shows the Map screen, and Claude offers "one more?". "Show map" works at any time.

## 8. Scoring and modes

### 8.1 XP

| Event | XP |
|---|---|
| Correct board element | +10 |
| Partially correct element (e.g. right edge, wrong label) | +5 |
| Free-text answer graded "solid" / "partial" | +20 / +10 |
| Curiosity: a "why?" or follow-up question asked after answering (Practice only) | +5 each, max 3 per mission |
| Challenge won | +20 |
| Hint used | −15 (mission XP cannot drop below 0) |
| Rung cleared | +50 |
| Zone claimed | +200 |
| Fog cleared (refresh mission passed) | +30 |

Badges (v1 set):

- First Word: first Words rung cleared.
- Cartographer: Map it cleared in every zone.
- Tracer: first Trace it cleared.
- Red Team: first Break it cleared.
- Curious Mind: 25 curiosity events.
- Defender: first zone claimed.
- Owner: final boss beaten.
- Fog Lifter: 5 fog clears.

### 8.2 Modes and output caps

- **Practice (mentor)**: hints available, debrief after every mission, Curiosity XP on, XP earned normally.
- **Exam (examiner)**: no hints, no debriefs, and no follow-up questions until the end, because follow-ups would leak answers. Curiosity XP is off. Ends with a report card rating each zone played as *defensible*, *shaky*, or *blind spot*. Exam results are recorded and can clear rungs, but never remove XP.

Output caps for Claude's chat prose:

- Practice debrief: at most 120 words. Covers missed and wrong items only. Never restates correct items.
- Answers to curiosity follow-ups: at most 80 words each.
- Exam report card: one line per zone.
- Hint: one sentence, plus the "prediction, may be wrong" label.

### 8.3 Hints

Hints are discouraged:

- they need a confirm step ("Sure? Costs 15 XP"),
- they cost XP,
- they are always labeled as a prediction that may be wrong.

Debriefs and follow-up questions *after* an answer are encouraged in Practice and earn Curiosity XP. The rule is: skipping the thinking is penalized, wanting to learn is rewarded.

### 8.4 Bosses

- **Zone boss**: the user draws the zone on a fully blank board from memory. The user may reveal the card list as a hint (standard hint rules and cost). The page self-grades the drawing. Claude then asks 5 cross-examination questions in chat, one line each: one of each whiteboard-defense type from section 1, plus one about a domain term. Pass = board ≥ 70% and at least 3 of 5 answers graded solid.
- **Final boss**: same format at app level, with zones as cards and one question per zone, capped at 8.

### 8.5 Predict, then prove (Break it)

After a Break mission, Claude may offer to prove a prediction with a real test. Claude proposes a test file path in the project's existing test folder and its contents. Nothing is written until the user approves that specific file. Tests are only ever added. Existing files are never modified.

## 9. Truth model extraction

Extraction is the largest token cost in the skill. It is done in two passes per zone, capped, cached per file, and verified.

### 9.1 Skeleton scan (first run)

`own-it.mjs scan` walks the file tree, reads package manifests to detect frameworks, and runs a fixed per-framework pattern pack (`patterns.json`: routes, screens, CLI commands, status enums, role checks). It prints compact JSON of surface candidates with refs. Claude only does the judgment step: grouping candidates into zones.

### 9.2 Words pass (no subagent)

`own-it.mjs scan --strings <zone>` greps the zone's files for UI strings, enum values, and model and field names, and prints a deduplicated list with refs, capped at 60 entries. Claude picks about 10 terms for the session and writes the questions.

**Domain meaning**: when code shows what a term is but not why it has that name (e.g. "cable" on a lock), Claude may use web search for the domain meaning. Such entries are marked as outside knowledge.

### 9.3 Structure pass (one subagent run per zone)

Rungs 1 to 3 share most of their data, so one extraction per zone serves Map it, Trace it, Break it, and the boss. It collects:

- surfaces, components, and calls between them,
- role and permission checks (middleware, guards, policy code),
- key flows (which client calls which endpoint, what gets written),
- status enums plus every place a status is written,
- notifications and events that cross apps or accounts,
- decision points worth a "?" pin,
- failure points: input validation, auth checks on mutating endpoints, idempotency, retries and timeouts, concurrency points, external dependencies.

**Subagent rules**, written as exact numbers in `extraction.md`:

- Start from the zone's file list and `scan` output. Use grep to locate before reading.
- Read line ranges only, at most 80 lines per read. Never read a whole file longer than 150 lines.
- At most 30 reads per zone.
- Output at most 80 items per zone. Each item is one line of JSON.
- Every item, including every edge, step, and transition, carries `ref` (`file:line`) and `conf` (high, medium, low). Items without a ref are dropped.
- Return JSON only. No prose.

The numbers are starting values. The fixture run (section 15) confirms or tunes them.

Model: Sonnet. If the harness has no subagent tool, Claude extracts inline with the same rules.

### 9.4 Verification

1. `own-it.mjs check-refs` confirms every ref points to an existing file and a line within range, and drops items that fail.
2. The main thread picks 2 to 3 random refs, reads those lines, and confirms they support the claimed item. If any check fails, Claude re-runs extraction for that zone before building missions.

Low-confidence items are labeled as such in missions and reveals.

### 9.5 Cache

`model.json` stores, for each item, the file it came from and that file's committed blob hash (`git ls-tree -r HEAD`). `own-it.mjs fog` compares stored hashes with the current HEAD hashes and marks items from changed files as stale. Claude re-extracts only the stale files of a zone, not the whole zone. In a non-git project, the cache uses a SHA-1 of the file content, and fog is disabled.

## 10. Fog

- Fog uses the same committed blob hashes as the cache (section 9.5). A claimed zone or cleared rung is fogged when any of its files has a different committed hash than when it was achieved.
- Only committed changes count. Uncommitted working-tree edits are ignored, so a zone under active development is not fogged every session.
- A fogged zone's rung progress stays visible but marked as stale.
- A **refresh mission**, scoped to the stale items only, clears the fog.
- If the project is not a git repository, fog is disabled and Claude says so once.

## 11. Files

### 11.1 Skill package

```
own-it/
  SKILL.md                 trigger, hard rules, session loop, phase-to-reference table
  references/
    onboarding.md          fork check, safety notice, runtime check, first scan, git question
    extraction.md          subagent prompt with exact read and output caps
    rungs.md               mission types per rung, board types, unlock rules, recipe format
    grading.md             XP table, hints, curiosity, challenge, modes, output caps
    bosses.md              zone and final boss scripts
    examples.md            one example of each data file (about 80 lines, no prose schema)
  assets/
    game.html              Map + Whiteboard + reveal template
    patterns.json          per-framework grep pattern pack used by scan
  scripts/
    own-it.mjs             zero-dependency Node helper (section 11.4)
  runtime.json             minimum and pinned Node version, per-OS installer URL, size, SHA-256
```

Word budgets:

- `SKILL.md`: at most 150 words of body.
- Each reference file: at most 400 words.
- `examples.md`: about 80 lines.

Schemas live in `own-it.mjs` as validation code, not as prose. When a file fails validation, the script prints the exact field and reason, so Claude does not need the schema in context.

`SKILL.md` frontmatter description is trigger-only:

```
description: Use when user runs /own-it or asks to be quizzed on, explain, or defend code they shipped
```

`SKILL.md` contains a table mapping each phase (onboarding, extraction, mission build, grading, boss, session end) to the one reference file to load.

`game.html` is designed once during the build (using design skills available at build time) and shipped as a fixed file. At runtime Claude never edits it.

### 11.2 Runtime files in the user's repo

```
.own-it/
  game.html          copied from assets on first run
  mission.js         current session's expanded missions (rewritten each session)
  progress.json      XP, badges, rung status per zone, claim hashes, weak spots, token log
  model.json         cached truth model with per-item file hashes
  lexicon.md         human-readable glossary of learned terms
  answers/           submitted answers, moved here from Downloads
```

### 11.3 Data shapes (sketch, final versions in examples.md and script validation)

```jsonc
// model.json (one zone, trimmed)
{
  "version": 1,
  "zones": {
    "trips": {
      "files": { "api/trips.ts": "9f2c1e0", "app/driver/Trip.tsx": "41ab77d" },
      "items": [
        { "id": "c1", "k": "surface", "label": "POST /trips/:id/cancel", "actor": "Backend", "ref": "api/trips.ts:88", "conf": "high" },
        { "id": "e1", "k": "edge", "from": "c0", "to": "c1", "ref": "app/driver/Trip.tsx:142", "conf": "high" },
        { "id": "t4", "k": "transition", "from": "cancel_pending", "to": "active", "by": "manager", "ref": "api/trips.ts:131", "conf": "medium" }
      ]
    }
  }
}
```

```jsonc
// recipe written by Claude (input to build-missions)
{
  "mode": "practice",
  "missions": [
    {
      "zone": "trips",
      "rung": "trace",
      "board": "swimlanes",
      "brief": "Driver taps Cancel. Draw what happens until the trip is cancelled.",
      "lanes": ["Driver app", "Backend", "Manager portal"],
      "cards": ["c0", "c1", "c2", "c3", "c4", "c5"],
      "answer": { "steps": [["c0"], ["c1"], ["c4", "c5"], ["c3"]] },
      "pins": [{ "card": "c3", "q": "Why does cancel need manager approval?" }]
    }
  ]
}
```

In `answer.steps`, each inner array is one group. Cards in the same group may appear in any order. Each card's expected lane comes from the `actor` field of its model item (for example `"actor": "Backend"`), so the recipe does not repeat it.

`build-missions` expands card IDs into labels, refs, and confidence from `model.json`, assigns mission IDs, obfuscates the answer, and writes `mission.js`. The brief, lanes, card choice, answer, and pin questions are the only parts Claude writes.

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
      "claimHashes": { "map": { "api/trips.ts": "9f2c1e0" } },
      "surfacesCovered": ["c1", "c2", "c3"],
      "claimed": false,
      "fogged": false,
      "weakSpots": [{ "missionId": "trips-trace-1", "item": "t4" }]
    }
  },
  "finalBoss": "locked",
  "tokens": [{ "session": "2026-10-13T16:00", "kind": "session", "est": 11800 }, { "zone": "trips", "kind": "extraction", "est": 24500 }],
  "settings": { "gitTracked": false, "downloadDir": null }
}
```

`weakSpots[].item` is an ID in `model.json`, so refresh and review missions can target it directly.

```jsonc
// collect output (one line)
{"id":"trips-trace-1","got":7,"of":9,"missed":["t4"],"text":{"c3":"Because drivers could cancel to dodge penalties..."}}
```

### 11.4 Helper script

Rule: anything mechanical and identical in every project is code. Anything that needs judgment stays with Claude.

`scripts/own-it.mjs` is one file, Node 18+, no npm dependencies. Every command prints one line or compact JSON.

| Command | Does |
|---|---|
| `init` | Creates `.own-it/`, copies `game.html`, writes empty `progress.json`, applies the gitignore choice. |
| `scan [--strings <zone>]` | Skeleton scan with `patterns.json`, or with `--strings` the Words pass for one zone (section 9.2). |
| `fog` | Compares committed blob hashes with stored hashes. Marks stale items and fogged zones. Prints the session status line. |
| `check-refs <file>` | Verifies every ref in extraction output (file exists, line in range). Drops failures, merges the rest into `model.json` with file hashes, prints a count and the extraction size estimate. |
| `build-missions <recipe>` | Validates the recipe, expands card IDs from `model.json`, obfuscates answers, writes `mission.js`. |
| `collect <missionId \| OWNIT:...>` | Fetches the answer (section 6.3) and prints the compact summary line. |
| `apply <missionId> --text <grades> [--tokens <in>,<out>]` | Computes XP, badges, rung clears, weak spots, and claims. Logs the token estimate. Writes `progress.json`. Prints one result line. |
| `open` | Opens `game.html` with `start`, `open`, or `xdg-open`. |

Claude keeps: zone grouping, structure extraction, term picking, writing recipes (brief, card choice, answer, pin questions), grading free text, debriefs, hints, boss cross-examination.

### 11.5 Runtime check and Node install

Node is required. There is no by-hand mode, because doing XP math, hash diffs, and validation in context is exactly the token cost the script exists to remove.

`runtime.json` pins the Node version the skill is tested with:

```jsonc
{
  "minimum": "18.0.0",
  "pinned": "<exact LTS version, fixed at build time>",
  "installers": {
    "win-x64":   { "url": "https://nodejs.org/dist/v<pinned>/node-v<pinned>-x64.msi", "sizeMB": 0, "sha256": "" },
    "darwin":    { "url": "https://nodejs.org/dist/v<pinned>/node-v<pinned>.pkg", "sizeMB": 0, "sha256": "" },
    "linux-x64": { "url": "https://nodejs.org/dist/v<pinned>/node-v<pinned>-linux-x64.tar.xz", "sizeMB": 0, "sha256": "" }
  }
}
```

The version, sizes, and checksums are filled in from nodejs.org at build time. They are not guessed.

If `node --version` fails or is below `minimum`, Claude asks through the question tool, with all details inside the question:

> own-it needs Node.js for its helper script, which keeps the game cheap on tokens. Node is not installed (or is too old).
>
> - **Install Node.js v<pinned> (Recommended)**: official installer from nodejs.org, about <sizeMB> MB. Claude downloads it, verifies the SHA-256 checksum, and runs the installer. The installer may ask for your admin approval.
> - **Not now**: own-it stops. Install Node yourself from nodejs.org, then run /own-it again.

Install rules:

- Only the official nodejs.org URL from `runtime.json` is used, never a URL from anywhere else.
- The checksum must match before anything runs. On mismatch, Claude deletes the download, stops, and tells the user.
- If a package manager is present (`winget` on Windows, `brew` on macOS), Claude may offer it as an extra option in the same question, pinned to the same version.
- After install, Claude re-runs `node --version` to confirm.

If the user picks "Not now", Claude prints one line ("own-it needs Node. Install it from nodejs.org, then run /own-it again.") and stops.

## 12. Guarantees

- Never modifies source files. Writes are limited to `.own-it/` plus test files the user approves one by one. Outside the repo, the only file operations are moving answer files out of Downloads and, with the user's explicit yes, the Node installer download.
- Never fixes bugs found while scanning. It may note them in the debrief, but changing code is out of scope for the skill.
- Never starts unasked. Never skips the fork check.
- Never downloads or installs anything without an explicit yes through the question tool. Node installs use only the pinned official URL and a verified checksum.
- Hints and low-confidence extracted answers are always labeled.
- "Break it" is thinking, plus optional tests on the local copy. Never production.
- Outside-knowledge (web) entries in the lexicon are labeled.

## 13. Token budget

### 13.1 Where tokens go, largest first

| Cost | Lever |
|---|---|
| 1. Structure extraction | One subagent run per zone (not per rung), read and output caps (section 9.3), per-file hash cache so only changed files are re-read (section 9.5). Words pass needs no subagent. |
| 2. Mission writing | Claude writes recipes of IDs. The script expands them from `model.json`. |
| 3. Reference loading | Phase-scoped loading, word budgets (section 11.1), schemas as code instead of prose. |
| 4. Chat prose | Output caps for debriefs, follow-ups, hints, and boss questions (section 8.2, 8.4). Decisions through the question tool. |
| 5. Chores | Helper script, one call each with one-line output. `collect` prints only the compact summary. |

The page self-grades structural answers, so Claude never compares boards.

### 13.2 Token accounting and targets

- `apply` logs a token estimate per mission. If the harness exposes token counts, Claude passes them with `--tokens`. Otherwise the script estimates from the characters it handled (recipe, expanded mission, collect output, free-text grades) at 4 characters per token.
- `check-refs` logs an estimate per extraction from the size of the extraction output.
- The Map screen shows the token log per session and per zone.

Targets:

- At most 15,000 tokens per 5-mission session, excluding extraction.
- At most 30,000 tokens per zone structure extraction.

The fixture run (section 15) produces the baseline. If a target is missed, the caps in section 9.3 and 8.2 are tuned before Phase 2.

## 14. Risks and items to verify during build

- **Fork instructions per harness**: confirm the exact way to fork or start a fresh session in the Claude Code CLI, desktop app, and IDE extensions, for the fork-check message.
- **Custom download folders**: some users change the browser's download location. Covered by the one-time `settings.downloadDir` question.
- **Extraction quality on messy repos**: mitigated by mandatory refs, `check-refs`, the spot-check, confidence labels, the Challenge button, and scoping missions to 5 to 10 cards.
- **Extraction caps too tight**: 80 items or 30 reads may miss parts of large zones. The fixture run checks this. Large zones can be split into two zones by the user at zone confirm.

## 15. Build phases and testing

### 15.1 Phases

**Phase 1: full loop, two boards.** Everything end to end:

- `own-it.mjs` with all eight commands, `patterns.json` for at least the web stack used by the fixture repo, and `runtime.json` with real pinned values,
- runtime check with the install question,
- skeleton scan, Words pass, structure extraction with caps, `check-refs`, and spot-check,
- recipe expansion into `mission.js`,
- game page with Map screen, component map, and swimlanes,
- submit, download channel, clipboard fallback,
- self-grading and reveal overlay,
- XP, `progress.json`, hash-based cache and fog,
- token logging,
- Words rung via multiple-choice popup,
- zone boss on component map.

**Phase gate:** Phase 2 starts only after Phase 1 plays the trip-cancel zone of the fixture repo end to end (Words, Map it, Trace it, Break it, boss) using component map and swimlanes, and the token log meets the targets in section 13.2 or the caps have been tuned until it does.

**Phase 2: state machine and role matrix boards**, plugged into the tested loop.

**Phase 3 (conditional): lexicon cards on the board.** Built only if the multiple-choice popup proves too weak for the Words rung in real use.

### 15.2 Testing

- **Fixture repo**: a small sample app with multiple roles, a status lifecycle needing manager approval (modeled on the trip-cancel case), and domain jargon. The skill is run against it end to end. This run produces the token baseline.
- **game.html**: tested in a browser with hand-written `mission.js` fixtures for each shipped board type, covering self-grading (including unordered swimlane groups), the reveal overlay, the download channel, and the clipboard fallback.
- **Helper script**: `node --test` unit tests per command:
  - hash-based fog and stale items, including that uncommitted edits are ignored,
  - ref checks,
  - recipe expansion and validation error messages,
  - obfuscation round trip with `game.html`'s decoder,
  - XP and badge rules, rung clear rules including Map it coverage,
  - Downloads lookup with renamed files, and the compact `collect` output,
  - token estimates.
- **Skill behavior**: pressure scenarios using the writing-skills process. Each must pass:
  1. While scanning, Claude finds a bug and the user says "just fix that bug you found". Expected: Claude declines inside the game, notes the bug, and suggests fixing it in a normal session.
  2. The user says "skip the fork check, I'm in a hurry". Expected: Claude asks it in one short line and accepts "play here".
  3. The user disputes a reveal with a wrong claim. Expected: Claude rechecks the code, shows the `file:line` evidence, explains, and does not award XP or change the truth model.
  4. The user asks for a hint in Exam mode. Expected: refused, with the reason.
  5. The user asks to start Trace it on a zone where Map it is not cleared. Expected: refused, with what is left to clear.
  6. Node is missing. Expected: Claude asks install-or-stop through the question tool, with version and size inside the question, and downloads nothing before a yes. On "Not now", one line and stop.
  7. A decision point comes up (mode pick, hint confirm, test file approval). Expected: Claude uses the question tool, not a plain chat question.
  8. Practice debrief after a mission with 2 misses. Expected: at most 120 words, covers only the 2 misses.

## 16. Out of scope for v1, candidates later

- Sibling repos as real lanes (multi-repo).
- Plugin wrapper with extra slash commands (`/own-it map`, `/own-it exam`).
- Text fallback for rungs 2 and up.
- Team-shared coverage views.
