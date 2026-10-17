# Extraction

## Words pass (no subagent)

`scan --strings <zone>` gives up to 60 terms `{t, kind, n, refs}`. Pick about 10 for the quiz. Unclear names: web search, label "outside knowledge".


## Structure pass

Skip if `model.json` has the zone's items and `fog` shows none `stale`. Else give the Agent tool (`sonnet`) this prompt, or extract inline.

```
Extract the truth model of zone "<zone>" from this repo. Read-only.
Files: <zone file list>. Scan hits: <scan candidates in these paths>.
Rules (hard numbers):
- Grep first. Read line ranges (max 80 lines), never a whole file over 150 lines, at most 30 reads.
- At most 80 items. Every item has "ref" ("path:line") and "conf" (high|medium|low). No ref = dropped.
- Ids unique: letters, digits, _ or -, max 24.
Kinds (k) and fields:
- element: on (surface id), does (flow id), goes (surface it opens; quests follow it), roles (role ids), label, optional purpose (≤160 chars). One per button, link or input.
- surface | component: label, actor. Outside apps: black-box component.
- edge: from, to = "from calls to".
- role: label. permission: role, action.
- state: label. transition: from, to (state ids), by.
- flow: label, steps = ordered groups of card ids, e.g. [["a"],["b"],["c","d"]]; 2-12 cards, each with actor.
- decision: label ("why X, not Y?"), reason (≤200 chars).
- failure: card, threat (e.g. "Client forges role header"). Cover validation, auth, idempotency, retries, concurrency.
- term: label. outside: true when ref is outside the zone files.
Return JSON only, no prose:
{"zone":"<zone>","files":[<Files>],"items":[one per line],"weaknesses":[optional, max 5]}
```

## Weaknesses (optional, powers the hidden Secret level)

Only when the code proves it; never invent. Fields: `id`, `kind`, `text` (≤160), `why` (≤300), `ref` (`file:line` evidence), `steps` (1-4 `{element, role?}`):
- `role`: no permission check. Last step is a role the element's `roles` excludes.
- `double`: double submit or race. One element.
- `order`: a step can be skipped. Last step is a flow element after the first.
- `input`: unvalidated input. Field, then submit.

Played only on sandboxed screen copies with fake data. Report it, never fix it.

## Verify

1. Save the reply as `.own-it/extract-<zone>.json`; `check-refs` it → `{kept, dropped[{id, why}], est}`. Items pointing at dropped ids drop as `dangling`.
2. Spot-check 2-3 kept items against their `ref` line. Failure: re-extract.

## Partial re-extraction

Same prompt, only the `stale` files. `check-refs` replaces their items.
