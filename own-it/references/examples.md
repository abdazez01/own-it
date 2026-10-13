# Examples (real formats; the helper validates every field)

## Zones file `.own-it/zones.json` → `init --zones .own-it/zones.json`

```json
{
  "zones": [
    { "id": "trips", "name": "Trips & cancellations", "paths": ["server/routes", "server/services", "driver-app", "manager-portal"] },
    { "id": "access", "name": "Access & startup", "paths": ["server/middleware", "server/index.ts"] }
  ]
}
```

`{"created":true,"zones":["trips","access"],"gitTracked":false}`

## Extraction file `.own-it/extract-trips.json` → `check-refs` it

```json
{
  "zone": "trips",
  "files": ["driver-app/api.ts", "manager-portal/Approvals.tsx", "server/routes/trips.ts", "server/services/approvals.ts"],
  "items": [
    { "id": "c-api", "k": "component", "label": "Driver API client", "actor": "Driver app", "ref": "driver-app/api.ts:3", "conf": "high" },
    { "id": "s-approvals", "k": "surface", "label": "Approvals page", "actor": "Manager portal", "ref": "manager-portal/Approvals.tsx:9", "conf": "high" },
    { "id": "s-cancel", "k": "surface", "label": "POST /trips/:id/cancel", "actor": "Server", "ref": "server/routes/trips.ts:19", "conf": "high" },
    { "id": "c-approvals", "k": "component", "label": "Approvals service", "actor": "Server", "ref": "server/services/approvals.ts:4", "conf": "high" },
    { "id": "e2", "k": "edge", "from": "c-api", "to": "s-cancel", "ref": "driver-app/api.ts:11", "conf": "high" },
    { "id": "e3", "k": "edge", "from": "s-cancel", "to": "c-approvals", "ref": "server/routes/trips.ts:25", "conf": "high" },
    { "id": "r-mgr", "k": "role", "label": "manager", "ref": "server/routes/trips.ts:29", "conf": "high" },
    { "id": "p1", "k": "permission", "role": "r-mgr", "action": "approve cancel", "ref": "server/routes/trips.ts:29", "conf": "high" },
    { "id": "st-pend", "k": "state", "label": "CANCEL_PENDING", "ref": "server/models/trip.ts:4", "conf": "high", "outside": true },
    { "id": "f-cancel", "k": "flow", "label": "Driver cancels a trip", "ref": "server/routes/trips.ts:19", "conf": "high",
      "steps": [["c-api"], ["s-cancel"], ["c-approvals"], ["s-approvals"]] },
    { "id": "d1", "k": "decision", "label": "Why does cancel need manager approval?", "ref": "server/routes/trips.ts:25", "conf": "medium" },
    { "id": "x-role", "k": "failure", "card": "s-cancel", "threat": "Client sends a forged x-user-role header", "ref": "server/routes/trips.ts:19", "conf": "medium" },
    { "id": "t1", "k": "term", "label": "release cable", "ref": "server/routes/locks.ts:14", "conf": "low" }
  ]
}
```

`{"zone":"trips","kept":13,"dropped":[],"est":509}` (`dropped`: `{id, why}`, why = invalid, dup-id, no-file, bad-line, outside-zone, dangling)

## Recipe `.own-it/recipe.json` → `build-missions` it (format only: real map missions use 5-10 cards; one build mixes rungs only if all are open)

```json
{
  "mode": "practice",
  "missions": [
    { "zone": "trips", "rung": "map", "board": "component", "brief": "A driver taps Cancel. Draw which part calls which.",
      "cards": ["c-api", "s-cancel", "c-approvals"],
      "pins": [{ "card": "s-cancel", "q": "What stops a driver cancelling a finished trip?" }] },
    { "zone": "trips", "rung": "trace", "board": "swimlanes", "brief": "Trace a cancel from tap to manager approval.", "flow": "f-cancel" },
    { "zone": "trips", "rung": "break", "board": "component", "brief": "Drop each threat on the part it attacks, then say what happens and what defends it.",
      "cards": ["s-cancel", "c-approvals"], "threats": ["x-role"] }
  ]
}
```

`{"session":"2026-10-13T18:32:08.035Z","missions":["trips-map-1","trips-trace-2","trips-break-3"],"est":784}`

## Collect → `collect trips-trace-2` (or `collect OWNIT:<base64>`)

`{"id":"trips-trace-2","got":5,"of":6,"missed":["c-notify"],"text":{"s-approvals":"Notification outbox pings the portal"}}`

Boss, with `wrong` as box-label pairs:
`{"id":"trips-boss-4","got":8,"of":10,"missed":["e4"],"text":{},"wrong":[["Trip screen","Trip store"]]}`

## Apply

`apply trips-trace-2 --text '{"s-approvals":"partial"}' --curiosity 1`
`{"id":"trips-trace-2","xp":115,"total":245,"ratio":0.83,"cleared":["trace"],"claimed":false,"badges":["tracer"],"weak":1}`

`apply trips-words-1 --got 8 --of 10`
`{"id":"trips-words-1","xp":130,"total":130,"ratio":0.8,"cleared":["words"],"claimed":false,"badges":["first-word"],"weak":0}`
