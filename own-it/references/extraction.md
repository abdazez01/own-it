# Extraction

## Words pass (no subagent)

`scan --strings <zone>` gives up to 60 terms `{t, kind, n, refs}`. Pick ~10 for quiz. Unclear names: web search, label "outside knowledge".


## Structure pass

Skip if `model.json` has the zone's items and `fog` shows none `stale`. Else Agent (`sonnet`) with this prompt, or inline.

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
{"zone":"<zone>","files":[<Files>],"items":[one per line]}
```

## Verify

1. Save as `.own-it/extract-<zone>.json`; `check-refs` it → `{kept, dropped[{id, why}], est}`. Items pointing at dropped ids drop as `dangling`.
2. Spot-check 2-3 kept items' `ref` lines. Failure: re-extract.

## Break pass

Every zone, background, after `check-refs`; ids from `model.json`. Skip if `progress.json` counts its weaknesses (even 0) and none `stale`. Agent (`sonnet`):

```
Bug review of the owner's own app, zone "<zone>", to teach them. Read-only, max 20 reads. Files: <files>.
No exploit code.
Only ids: elements <id|label|on|does|roles>; roles <id|label>; flows <id|steps>.
Proven only; none is fine. Max 5: id, kind, text ≤160, why ≤300, ref "path:line", steps 1-4 {element, role?}.
role: last step a role excluded. double: one step. order: skip; last a later flow element. input: unvalidated field, then submit.
JSON: {"weaknesses":[...]}
```

Save `.own-it/break-<zone>.json` with `zone`, `"files":[]`, `"items":[]`; `check-refs` it.

## Partial re-extraction

Rerun on `stale` files, then break pass.
