# own-it Phase 1: end-to-end run and token baseline (phase gate)

Date: 2026-10-13. Scratch project: `.superpowers/sdd/2026-10-13-own-it-phase1/e2e/trip-app` (copy of `fixtures/trip-app`, git init, commit `ae81889`). Fake Downloads: `.../e2e/downloads` via `OWNIT_DOWNLOADS`. Node v20.20.1 (above the `runtime.json` minimum of 18.0.0, so no install prompt).

## Summary / verdict

**PASS.** I played the Trips zone end to end, following SKILL.md and its references as written. The full climb worked: Words → Map (2 missions, cleared on full surface coverage) → Trace (`f-cancel`) → Break (pending-never-expires, double-approve, forged role, approve/reject race) → Boss (blank board 24/30 plus 5 cross-exam questions, zone claimed). One extra Exam-mode mission behaved correctly. Committing a change to `server/services/approvals.ts` fogged the zone, a partial re-extraction plus one refresh mission cleared the fog, and the gates, XP math, badges, weak spots and double-apply guard all behaved as documented.

There are no blocking bugs. I found 7 doc issues (3 medium) and 5 bugs or gaps (none blocking; the most serious is the over-broad weak-spot clearing). Both token targets were met with wide margin.

Player simulation: board answers were computed with `own-it/assets/core.js` (decode the mission answer, apply deliberate mistakes, grade with the core graders, build with `Core.payload`), using a scratchpad script. Each answer was written as `own-it-<id>.json` into the fake Downloads.

The page itself was also loaded over a local static server and rendered the zones, rungs, session and token log with no console errors.

## Runtime-Claude walkthrough (what the docs led to)

- **Onboarding.** Fork check answered "Yes, fork". The runtime check passed. Safety notice shown. First run: `scan`, then 2 zones: `trips` (server/routes, server/services, server/models, server/store.ts, driver-app, manager-portal) and `access` (server/middleware, server/index.ts). Chose to gitignore `.own-it/`; init writes `.own-it/.gitignore` = `*` and the tree stays clean. Mode: Practice.
- **Words (rung 0).** Ran `scan --strings trips`, which returned 13 terms, and asked these 10 questions (4 options each, shuffled; the correct answer is marked *):
  1. What does `CANCEL_PENDING` mean? *Driver asked to cancel; waiting for a manager decision* / trip is being cancelled by the system / trip cancelled, refund pending / driver is offline.
  2. In "Release cable", what is the cable? *Steel cable seal on the cargo lock* / network cable to the lock / charging cable / a message channel.
  3. Where does "Pending cancellations" appear? *Manager portal Approvals page heading* / driver Trip screen / DB table name / API route.
  4. What kind of thing is `cancelRequestedAt`? *Trip model field (epoch ms), set when the driver asks* / API route / enum value / UI label.
  5. Which code path sets a trip to `REQUESTED`? *None in this zone; it is only declared* / requestCancel / store seed / approveCancel. (Player **wrong**.)
  6. What does the "Approve cancel" button call? *POST /trips/:id/cancel/approve* / POST /trips/:id/cancel / GET /trips / PUT /trips/:id.
  7. What is `outbox`? *An in-memory array of notifications that nothing delivers* / a DB table / an email queue / a React state. (Player **wrong**.)
  8. Which trip statuses allow releasing the cable? *CANCELLED or COMPLETED* / ACTIVE only / any status / CANCEL_PENDING.
  9. After "Reject", what status does the trip get? *ACTIVE* / CANCELLED / REQUESTED / CANCEL_PENDING.
  10. Which values can `cableState` take? *'locked' / 'released'* / open/closed / true/false / 0-3.

  Score 8/10, then `apply trips-words-1 --got 8 --of 10`. Wrote `lexicon.md` with 7 terms. No web search was needed, because the code comment explains "cable".
- **Structure extraction.** Done inline, since no subagent was allowed. Used 1 grep, 11 zone file reads and 1 read of auth.ts (outside the zone, for the forged-header threat), then 3 spot-check line reads: 16 reads in total, under the cap of 30. Every file is at most 46 lines, so the 80-line and 150-line caps never applied. Produced **65 items** (cap 80): 9 surfaces, 4 components, 17 edges, 2 roles, 5 permissions, 7 states, 4 transitions, 2 flows, 3 decisions, 8 failures and 4 terms (one with `outside: true`). `check-refs` kept 65 and dropped 0. Spot checks on `trips.ts:32`, `approvals.ts:7` and `trip.ts:20` all supported their items.
- **Grading and debriefs.** All debriefs stayed under 120 words (the longest was about 95, the boss debrief). There was one curiosity answer (under 80 words) and one Exam report card line: "Trips, cancellations & locks: shaky — board 80%, but the one text answer (cable-release rule) was only partial."
- **Boss cross-exam.** Each question is followed by its answer key, the player's answer and the grade:
  - q1, decision `d-release-gate`: "Why can the cable only be released after cancel/complete?" Key `locks.ts:18`. Graded **solid**.
  - q2, `x-any-driver` / `p-cancel`: "What could a malicious driver do with POST /trips/:id/cancel, and what stops them?" Key `trips.ts:20`. Player said "cancel someone else's trip; nothing checks driverId". Graded **solid**.
  - q3, transitions `tr1`-`tr3`: "Which field holds cancel progress, and how does it change?" Player said "ACTIVE → CANCEL_PENDING → CANCELLED", leaving out the reject path. Graded **partial**.
  - q4, `x-notify-lost`: "Where does the cancel flow fail first on a server restart?" Player said "the DB transaction rolls back", but there is no DB. Graded **miss**.
  - q5, term `t-cable`: "What does 'cable' mean, and why that name?" Graded **solid**.

  Result: 3 solid answers and a board ratio of 0.8, so `claimed: true` (+200).

## Command log (helper commands in order, one-line output; long outputs truncated)

1. `scan` → frameworks express, react-router; 15 files; 16 candidates (9 surfaces, 6 role checks, 1 enum); `truncated:false`
2. `init --zones .own-it/zones.json` → `{"created":true,"zones":["trips","access"],"gitTracked":false}`
3. `fog` → trips `o----`, not fogged, stale = all 11 zone files (not extracted yet); access `o----`
4. `scan --strings trips` → 13 terms (5 enum, 5 ui, 3 model)
5. `apply trips-words-1 --got 8 --of 10` → `{"xp":130,"total":130,"ratio":0.8,"cleared":["words"],"badges":["first-word"],"weak":0}`
6. `apply trips-words-1 --got 8 --of 10` (deliberate repeat) → rc=1 `mission "trips-words-1" already applied`
7. `fog` → trips `co---`
8. `check-refs .own-it/extract-trips.json` → `{"zone":"trips","kept":65,"dropped":[],"est":2180}`
9. `fog` → trips `co---`, `stale:[]`
10. `build-missions .own-it/recipe-locked.json` (trace while locked, negative test) → rc=1 `rung "trace" is locked in zone "trips"; map needs surfaces s-trip-screen,…,s-release`
11. `build-missions .own-it/recipe.json` (2 map missions) → `{"session":"…18:52:22.272Z","missions":["trips-map-1","trips-map-2"],"est":999}`
12. `open` → `{"opened":".../.own-it/game.html"}`
13. `collect trips-map-1` → `{"got":8,"of":9,"missed":["e4"],"text":{"s-cancel":…},"wrong":[["s-trip-screen","s-cancel"]]}`
14. `apply trips-map-1 --text {"s-cancel":"solid"}` → `{"xp":100,"total":230,"ratio":0.89,"cleared":[],"weak":1}`
15. `collect trips-map-2` → `{"got":5,"of":7,"missed":["e9","e10"],"wrong":[["c-notify","s-approvals"]]}`
16. `apply trips-map-2 --text {"s-approve":"partial"} --curiosity 1` → `{"xp":115,"total":345,"ratio":0.71,"cleared":["map"],"weak":3}`
17. `fog` → trips `cco--`
18. `build-missions` (trace `f-cancel` + 1 pin) → `{"missions":["trips-trace-3"],"est":506}`
19. `collect trips-trace-3` → `{"got":5.5,"of":7,"missed":["c-notify"],"text":{"c-approvals":…}}`
20. `apply trips-trace-3 --text {"c-approvals":"partial"}` → `{"xp":115,"total":460,"ratio":0.79,"cleared":["trace"],"badges":["tracer"],"weak":3}`
21. `fog` → trips `ccco-`
22. `build-missions` (break, 5 cards, 4 threats) → `{"missions":["trips-break-4"],"est":522}`
23. `collect trips-break-4` → `{"got":3,"of":4,"missed":["x-race"],"text":{4 tok: keys},"wrong":[["x-race","s-approve"]]}`
24. `apply trips-break-4 --text {"tok:x-pending-forever":"solid","tok:x-double-approve":"solid","tok:x-role":"partial","tok:x-race":"miss"}` → `{"xp":130,"total":590,"ratio":0.75,"cleared":["break"],"badges":["red-team"],"weak":3}`
25. `fog` → trips `cccco`
26. `build-missions` (boss blank board) → `{"missions":["trips-boss-5"],"est":859}`
27. `collect trips-boss-5` → `{"got":24,"of":30,"missed":["s-get-lock","s-release","e4","e5","e15","e17"],"text":{},"wrong":[["Driver API client","release cable endpoint"],["Trip screen","POST /trips/:id/cancel"]]}`
28. `apply trips-boss-5 --text {"q1":"solid","q2":"solid","q3":"partial","q4":"miss","q5":"solid"}` → `{"xp":560,"total":1150,"ratio":0.8,"cleared":["boss"],"claimed":true,"badges":["defender"],"weak":7}`
29. `fog` → trips `ccccc`, not fogged
30. `build-missions` (mode exam, map, 5 cards) → `{"missions":["trips-map-6"],"est":405}`
31. `collect trips-map-6` → `{"got":4,"of":5,"missed":["e17"]}`
32. `apply trips-map-6 --text {"s-release":"partial"} --curiosity 2` → `{"xp":50,"total":1200,"ratio":0.8,"cleared":[],"weak":2}` (curiosity correctly ignored in exam)
    - Then committed `0bc540a` "approvals: ignore approve without pending cancel" in the scratch repo.
33. `fog` → trips `ccccc`, `fogged:true`, `stale:["server/services/approvals.ts"]`
34. `check-refs .own-it/extract-trips.json` (partial: files = [approvals.ts], 7 items) → `{"kept":7,"dropped":[],"est":270}` (model now holds 66 items)
35. `fog` → trips `fogged:true`, `stale:[]`
36. `build-missions` (`refresh:true`, map, 6 cards) → `{"missions":["trips-map-7"],"est":453}`
37. `collect trips-map-7` → `{"got":5,"of":5,"missed":[]}`
38. `apply trips-map-7 --text {"c-approvals":"solid"}` → `{"xp":100,"total":1300,"ratio":1,"cleared":[],"weak":2}` (50 + 20 + 30 fog bonus)
39. `fog` → trips `ccccc`, **`fogged:false`**
40. `collect trips-map-7` (file already consumed) → rc=1 `no answer file for "trips-map-7" in .../downloads. Submit again, or set the download folder`
41. `collect OWNIT:<base64>` (clipboard path) → same result as #37, accepted
42. `apply trips-map-7 …` (repeat) → rc=1 `already applied`

## Doc issues

1. **Medium: "about 5 missions" can't be met during a climb.**
   - Docs: `rungs.md:13` says "Write about 5 missions (max 8), open rungs only". `rungs.md:26` says "rebuild only after all built missions are applied".
   - What happened: only one rung is open at a time on a fresh zone. Every build had 1 or 2 missions (map 2, then trace 1, break 1, boss 1). Five missions per build is only possible on cleared zones, or by repeating rungs that are already open.
   - Effect: the "5-mission session" token target spans 4 builds and 4 `session` values in the token log.
2. **Medium: refresh missions are underspecified, and the order contradicts fog.**
   - Docs: `rungs.md:22` says "Refresh (fogged zone): `"refresh": true`, cards from stale files". `extraction.md:47` says to re-extract the stale files first.
   - What happened: after the partial `check-refs`, `fog` reports `stale: []` while the zone is still `fogged: true`. The runtime has to remember the stale list from before re-extraction; the docs never say so.
   - The only stale file, `approvals.ts`, holds one card (`c-approvals`). That is below the 2-card build minimum and the 5-card map guidance, and the docs don't say to pad with neighbours. I padded with 5 callers and callees.
   - The docs also don't say which rung or board a refresh mission should use. The CLI accepts any rung, because refresh skips the rung gate. I used map.
3. **Medium: boss box naming has no fair-play path.**
   - Docs: `bosses.md:16` says "The page matches box names to the zone's surfaces and components". `grading.md:32-36`: a challenge fixes the truth model.
   - What happened: the player's box "release cable endpoint" is the right concept but scores Jaccard 0.33 against "POST /locks/:id/release-cable", below the 0.5 threshold. It stayed unmatched, and its correct arrow was reported as `wrong`.
   - The model isn't wrong, so a challenge can't be won. Neither the brief nor the docs tell the user that box names must echo card labels or routes. Route-like labels are the most fragile case.
4. **Low-medium: trace debriefs can't name lane errors.**
   - Docs: `grading.md:17` says "Missed and wrong items only, with `file:line`".
   - What happened: a swimlanes `collect` always has `wrong: []`, and a half-credit (wrong-lane) card shows up only as a fractional `got` (5.5). The runtime can't say which card was in the wrong lane (bug 3).
5. **Low: fog clearing is invisible in `apply` output.**
   - Docs: `rungs.md:36` says "Announce clears and badges".
   - What happened: a passing refresh returns `cleared: []`. Nothing shows that the fog lifted (the +30 is buried in xp), so an extra `fog` call is needed to announce it.
6. **Low: Words cost is invisible in the token log.**
   - What happened: the Words `apply` is logged as `{"kind":"mission","session":null,"est":0}`, although the Words pass (scan output, 10 questions, lexicon) costs about 1.5-2k tokens.
7. **Low: the `outside` flag is documented inconsistently.**
   - Docs: `extraction.md:34` defines `outside` only for `term`, but `examples.md:31` uses it on a `state`.
   - What happened: it works on both. The docs should say it applies to any kind.

Everything else matched the CLI exactly. That includes the init/gitignore flow, the zone id rules, the locked-rung error naming uncovered surfaces, the `collect` no-file message, the OWNIT paste path, the double-apply error, the boss pass rule (ratio ≥0.7 and ≥3 solid), the XP formulas, the exam curiosity rule and the final-boss gating (not triggered, because `access` is unclaimed).

## Bugs (not fixed)

1. **Weak spots clear on rungs that don't test them** (`scripts/lib/cmd-apply.mjs:165-168`).
   - Cause: every edge whose two ends are both mission cards counts as "answered correctly", even for trace (no edge grading) and break (arrows are "context only" per `grading.md:13`).
   - Repro: `trips-map-2` missed `e10` (c-approvals→c-notify), so weakSpots gained `e10`. `trips-trace-3` has both cards, never grades edges, and `e10` was removed (weak stayed at 3, with `c-notify` added).
2. **`apply --text` keys aren't checked against the collected text keys.**
   - Effect: any key is scored. For the boss, `solids` counts every value, so `q1..q5` (`bosses.md:39`) isn't enforced and extra keys can add XP or reach the 3-solid bar.
   - Repro: `apply <boss-id> --text '{"a":"solid","b":"solid","c":"solid"}'` passes the solid check. This was read from the code, not run.
3. **The swimlanes payload loses the lane errors** (`core.js` `gradeSwimlanes` returns `wrong: []`; the page has the data in `reveal.nodes`).
   - Repro: in `trips-trace-3`, `s-approve` was placed in "Manager portal" for 0.5 credit. `collect` shows only `got: 5.5` and `missed: ["c-notify"]`.
4. **Page cosmetics.**
   - The `access` zone was never extracted, yet the zone card shows "Up to date". `fog` lists both of its files as stale.
   - The applied refresh mission still shows "Not started" in "This session", because the page doesn't read the `applied` list.
5. **Per-mission token estimates are only a fraction of the real cost.**
   - Cause: `apply` estimates from the answer file + session meta + the `--text` string (97-277 tokens per mission). Reference reads, recipes, debriefs and command outputs aren't counted, so the page's "Last session ≈ 115 tokens" understates the real cost several times over. This is documented as an estimate, but worth knowing for the cost targets.

## Token numbers vs targets

`progress.json` `tokens` log:

| kind | id / zone | session | est |
|---|---|---|---|
| mission | trips-words-1 | null | 0 |
| extraction | trips | n/a | 2180 |
| mission | trips-map-1 | 18:52:22 | 135 |
| mission | trips-map-2 | 18:52:22 | 124 |
| mission | trips-trace-3 | 18:53:22 | 124 |
| mission | trips-break-4 | 18:53:52 | 277 |
| mission | trips-boss-5 | 18:54:26 | 167 |
| mission | trips-map-6 (exam) | 18:54:50 | 97 |
| extraction | trips (partial) | n/a | 270 |
| mission | trips-map-7 (refresh) | 18:55:29 | 115 |

Helper sums: extraction 2,450, which matches the page's "Reading … ≈ 2,450 tokens". The 5-mission climb (map-1 through boss-5) totals 827. `build-missions` estimates: 999 + 506 + 522 + 859 + 405 + 453.

Estimated runtime-Claude context cost (chars / 4):

| Phase | Contents | Chars | ≈ Tokens | Target |
|---|---|---|---|---|
| Zone extraction (trips) | extraction.md 2.5k + scan 1.8k + grep 4.6k + 12 file reads (with line numbers) 10.5k + written extract JSON 8.7k + check-refs and spot checks 0.5k | ~28.6k | **~7,200** | ≤30,000 ✔ |
| Partial re-extraction | 1 read 0.8k + JSON 1.6k + outputs 0.4k | ~2.8k | ~700 | n/a |
| 5-mission climb (map×2, trace, break, boss), excluding extraction | SKILL + onboarding + rungs + grading + bosses + examples 15.2k + command outputs ~7.5k + recipes ~2.2k + grades, debriefs and curiosity ~2.8k + boss questions and answers ~1.8k | ~29.5k | **~7,400** | ≤15,000 ✔ |
| Words pass | scan --strings 1.1k + 10 questions ~2.5k + lexicon 0.9k | ~4.5k | ~1,100 | n/a |
| Exam + refresh missions | outputs, recipes and grades | ~4k | ~1,000 | n/a |

Both targets are met with about 2x headroom. The fixture is tiny (287 lines), so a real zone's extraction will scale with read count. The 30-read cap bounds it at roughly 30 × 80 lines ≈ 2,400 lines ≈ 25-30k tokens, which is right at the target.

## Phase-gate verdict

**PASS.** The Phase 1 loop works end to end on `fixtures/trip-app`, exactly as the docs instruct: onboarding, Words, inline extraction with verification, every rung through the boss with zone claim, Exam mode, and fog with refresh. Both token targets are met.

Recommended follow-ups before Phase 2, none of which block the gate:

- Fix the weak-spot clearing (bug 1).
- Validate `--text` keys (bug 2).
- Report lane errors from swimlanes (bug 3 / doc 4).
- Specify refresh card selection, padding and rung (doc 2).
- Make boss label matching more forgiving, or tell players the naming rule (doc 3).
