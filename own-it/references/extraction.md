# Extraction

## Words pass (no subagent)

`scan --strings <zone>` gives up to 60 terms `{t, kind, n, refs}`. Pick about 10 for the quiz. If code shows what a term is but not why it has that name, web search for the domain meaning; label it "outside knowledge" in questions and `lexicon.md`.

## Structure pass (rungs 1-4, once per zone)

Skip if `model.json` has the zone's items and `fog` shows none `stale`. Else paste into the Agent tool, model `sonnet`, filling `<...>`. No subagent tool? Extract inline, same rules.

```
Extract the truth model of zone "<zone>" from this repo. Read-only.
Files: <zone file list>. Scan hits: <scan candidates in these paths>.
Rules (hard numbers):
- Locate with grep first. Read line ranges only, at most 80 lines per read.
  Never read a whole file longer than 150 lines. At most 30 reads.
- At most 80 items. Every item, including edges, steps and transitions,
  has "ref" ("path:line", repo-relative, forward slashes) and "conf"
  (high|medium|low). No ref = dropped.
- Ids unique: letters, digits, _ or -, max 24 chars.
Kinds (k) and fields:
- element: on (surface id), does (flow id it belongs to), goes (surface id it leads to), roles (role ids who may use it), label, optional purpose (one plain line, ≤160 chars). One per button, link or input that matters.
- surface | component: label, actor (app or lane running it, e.g.
  "Driver app"). Outside apps: black-box component.
- edge: from, to (surface/component ids) = "from calls to".
- role: label. permission: role (role id), action.
- state: label. transition: from, to (state ids), by (role or event).
- flow: label, steps = ordered groups of card ids, e.g.
  [["a"],["b"],["c","d"],["e"]]; ids in one group may run in any order.
  2-12 cards per flow, each with actor.
- decision: label (a "why X, not Y?" worth asking), reason (one real line, ≤200 chars).
- failure: card (surface/component id), threat (short attack or fault,
  e.g. "Client forges role header"). Cover validation, auth on mutating
  endpoints, idempotency, retries/timeouts, concurrency, external deps.
- term: label. outside: true when ref is outside the zone files.
Return JSON only, no prose:
{"zone":"<zone>","files":[<the Files list>],"items":[
one item per line
]}
```

## Verify

1. Save the reply as `.own-it/extract-<zone>.json`; `check-refs` it → `{kept, dropped[{id, why}], est}`. Items pointing at dropped ids drop as `dangling`.
2. Spot-check 2-3 random kept items: read each `ref` line, confirm it supports the item. Any failure → re-extract the zone before building missions.
3. Call low-`conf` items low confidence in debriefs.

## Partial re-extraction (stale files)

Same prompt with only the zone's `stale` files as Files. `check-refs` replaces those files' items, keeps the rest. Spot-check.
