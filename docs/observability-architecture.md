# Observability Architecture

A developer-facing layer so the simulation can explain itself. Goal: point at
something and ask *"what are you doing, and why?"* without tracing code or
scrolling transient ledger lines.

Written 2026-07-28 after inspecting the scanner, ledger, actor/institution
records, assignments, intentions, valuation reasons, contracts, beacon access,
and the existing debug UI.

---

## 1. What already exists (the good news)

Most diagnostic *content* is already produced and stored — it is simply
scattered across domain systems with no common shape and no UI.

| Question | Already answered by | Where |
|---|---|---|
| What did it choose, and what did it reject? | `lastSelection` — `{workerShipId, chosenOrderId, netValue, reasons[], rejected[{orderId, netValue}], at}` | `miningOperation` |
| Why is a carrier idle? | `lastDecisionKey` — e.g. `"no-work:scrap-porch:none-offered"`, written once per distinct reason by `publishDecisionOnce` | `logistics.haulers[id]` |
| What is a carrier's cost/ask, and did it clear? | `freightAsks[templateId]` — `{ask, floor, costToServe, acceptable, reasons[], at}` | `logistics` |
| Why was a repair not started? | `deferredServiceRequests[subjectId]` — `{reason, quotedPrice, availableCash, attempts, firstDeferredAt, lastAttemptAt}` | `sprc` |
| Why is this price what it is? | `order.valuation` / `repair.priceValuation` — `{decision, recommendedPrice, min/max, reasons[], metrics}` | `sprc` |
| What is an institution short of? | `needs` (urgency, shortage, context), `responses` (rationale, status), `procurementOrders` (required/delivered/allocations) | `sprc` |
| Is an actor committed, and to what? | `intentions.js` adapters — `isActorCommitted`, `getReservedResources`, `mayReconsider`, `getIntentionOutcome` | `intentions` (read-only over authoritative records) |
| What do things cost? | `costBasis.institutions[].items[]`, `costBasis.services[][]` | `costBasis` |
| How do parties regard each other? | multi-dimensional projections + `significantEventIds` | `relationshipProjections` |
| Panel condition | `components.engine.condition {stage, wear}`, hull integrity/reserve | `gameState` |

**Gaps found:**

- **No common shape.** Each system stores its reasoning differently, so no UI or
  test can ask a uniform question.
- **No blocker vocabulary.** `lastDecisionKey` is a formatted string; deferral
  reasons are bare enum-ish strings. Nothing links a blocker to *its* cause.
- **Scanner cannot target actors.** `scanner.js` finds resource asteroids and
  world sites inside a forward cone and draws edge markers. Target types are
  `["resources", "sites"]`; there is no actor targeting and **no selection
  model at all** — markers are decorative, not clickable.
- **No entity selection in the viewport.** No canvas click handling for picking
  an entity.
- **Existing debug UI** is the `ledger-stream` aside (events / stats /
  population) plus `window.__asteroids`. That aside is the right precedent to
  follow for an observatory: a fixed panel reading state each frame.
- **No retention model.** `recordEvent(type, payload, {visible})` treats all
  events alike; `visible` is presentation, not retention or integrity.

---

## 2. Three layers, kept separate

1. **Raw event stream** — `eventLedger`. *What happened.* Append-only, cursor-consumed
   (`getEventsAfterId`), already the durable record.
2. **Projections** — `costBasis`, `relationshipProjections`, contract records,
   inventories, `intentions` adapters. *Compact current summaries.*
3. **Diagnostics (NEW)** — *why an actor is doing what it is doing now.*

The diagnostic layer **reads projections and its own records**. It must never
answer a current question by scanning the ledger; it keeps `eventIds` as
references for history and explanation only.

---

## 3. Shared diagnostic shape

One record per actor or institution, upserted at decision points and state
transitions.

```
DiagnosticRecord {
  actorId, actorName, actorKind        // ship | institution | person
  controllerId                         // controlling institution
  state                                // see DIAGNOSTIC_STATE below
  summary                              // one-line human answer
  locationSiteId, position
  intention  { id, kind, goal, objectId, contractId, reserved }
  lastDecision {
    at, chosen { id, label, score },
    alternatives [ { id, label, score, rejectedBecause } ],
    reasons[]
  }
  blocker    // Blocker | null
  waitingFor // short string
  wakeOn []  // event/condition names that trigger reconsideration
  nextReconsiderAt  // ms timestamp | null
  refs { contractIds[], targetIds[], dependencyIds[] }
  eventIds[]        // references into the raw stream, bounded
  updatedAt
}
```

`DIAGNOSTIC_STATE`: `free · working · committed · waiting · deferred · disabled ·
insolvent · retired`.

## 4. Typed blockers with cause references

Deliberately **not** a general explanation engine. A blocker is a small typed
record that may point at the blockers *causing* it.

```
Blocker {
  kind          // BLOCKER_KIND enum
  summary       // one line
  subjectId     // who/what is blocked
  objectId      // the thing being waited on (contract, item, site)
  waitingFor
  wakeOn []
  nextReconsiderAt
  causedBy []   // BlockerRef { actorId } | inline Blocker — the immediate cause
  at
}
```

`resolveBlockerChain()` walks `causedBy` — following an `actorId` reference to
that actor's own current blocker — producing the expandable *why?* chain:

```
Hauler idle
└ no eligible cargo at Scrap Porch
  └ source hub has no water ice
    └ its purchase order is unfilled
      └ every miner is committed elsewhere
        └ those jobs currently have higher net value
```

Depth is capped and visited actors are tracked, so cycles terminate.

## 5. Ledger retention classes (proposal)

Event definitions declare retention and integrity instead of all events being
equal.

| Class | Examples | Policy |
|---|---|---|
| `ephemeral` | thruster input, weapon fired, scanner activated, tractor toggled, processor cycle, minor movement | Expire quickly; aggregate to counters almost immediately |
| `operational` | job considered/rejected, assignment accepted, route started, cargo loaded/delivered, repair requested, quote issued, contract repriced, actor entered waiting | Keep detailed long enough to diagnose, then summarize |
| `durable` | significant repair, rescue, major contract, asset transfer, loan, default, repossession, ownership change, partnership, betrayal, major crime, death, institution formed/dissolved | Persist indefinitely — supports relationships, biography, legal history, investigation |

Each definition also carries a **`visibility`** field, declared now and *not*
enforced, leaving room for the later investigation systems:
`public · private · restricted · hidden · encrypted · suppressed · falsified ·
disputed · partially-known · discoverable`.

This slice ships the **classification table and helpers**; actual pruning and
aggregation are deferred until retention pressure is real.

---

## 6. Seams to write from (adapt, don't migrate)

| System | Decision point | Diagnostic written |
|---|---|---|
| `miningOperation` | `chooseOrder` | decision + alternatives + reasons, state `committed` |
| | `publishIdleDecision` | blocker `no-eligible-work` |
| | `beginMaintenance` | state `disabled`, blocker `awaiting-service` |
| | `settlePendingServiceCharges` | blocker `unpaid-service-debt` |
| | delivery completion | state `free` |
| `logistics` | `assignNpcShipment` | decision, or blocker `no-eligible-cargo` / `below-carrier-cost` / `source-out-of-stock` with `causedBy` |
| `sprcOperation` | `deferServiceRequest` | state `deferred`, blocker `payer-cannot-afford` etc. |
| | need/procurement assessment | blocker `awaiting-material` pointing at the unfilled order |

Domain systems remain authoritative. Diagnostics is an additional compact
projection, written alongside existing records.

## 7. UI

- **Actor diagnostic panel** — scanner gains an `actors` target type so a sweep
  genuinely finds nearby NPC ships; clicking an actor in the viewport selects it
  and opens the panel. Shows identity, controller, location, state, intention,
  cargo (owned / reserved / committed), cash and available cash, ship and panel
  condition, beacon access, visible offers, recent evaluations with scores and
  reasons, blocker chain, waiting-for, and next reconsideration.
- **Observatory overlay** — a separate dev view (overlay toggled from the
  quick-links nav, matching the existing `ledger-stream` precedent rather than
  introducing routing). First version: searchable **Actors** table and a
  consolidated **Blockers** list.

## 8. First slice vs deferred

**In this slice:** diagnostics module + typed blockers with chains; retention
classification module; writes at the seams above; scanner actor targeting +
click selection + actor diagnostic panel; observatory with Actors and Blockers
tables; tests for assignment selection, waiting-for-inventory, below-cost
rejection, deferred repair, disabled state, and completion→available.

**Deferred:** institution and contract observatory tabs; trends/time-series
(prices, rates, cash, inventory, unfilled counts, delays, downtime); retention
pruning and aggregation; visibility enforcement; player-facing presentation.

No new economy behaviour is added by this layer.

---

# Implemented slice (2026-07-28)

## Modules

| Module | Role |
|---|---|
| `src/systems/diagnostics.js` | `DIAGNOSTIC_STATE`, `BLOCKER_KIND`, `recordDiagnostic` (merging upsert), `recordDecision`, `createBlocker` / `recordBlocker` / `clearBlocker`, `listDiagnostics`, `listBlocked`, `resolveBlockerChain`, `formatBlockerChain`. Compact projection; bounded `eventIds`; cycle-safe, depth-capped chain walk. |
| `src/systems/eventRetention.js` | `RETENTION_CLASS` (ephemeral / operational / durable) with an explicit table plus prefix fallbacks, `EVENT_VISIBILITY` (declared, **not enforced**), `describeRetentionPolicy`, `classifyEvent`. Classification only — pruning and aggregation deferred. |
| `src/systems/actorInspector.js` | Read-only aggregation into one view: identity, controller, state, intention, cargo (held / committed / uncommitted), cash (balance / committed / protected / available / live upkeep cost), condition, beacon access, visible offers, intentions, blocker chain, institution detail. |

## Writes at existing seams

- **miningOperation** — committed state + decision with alternatives and reasons; idle blocker (`no-eligible-work`); **`order-fully-allocated`** and **`no-route-to-destination`** blockers on paths that previously returned silently; `awaiting-service` on breakdown (pointing at SPRC); `unpaid-service-debt`; cleared to `free` on paid service. Plus a **fleet-level institution diagnostic** (`all-suppliers-committed` / `no-eligible-work`) so chains terminate in real reasoning.
- **sprcOperation** — deferred-service blocker with the real quote and retry time; an **institution diagnostic** each tick naming the bottleneck (`awaiting-material` / `awaiting-production`), with causes pointing at the unfilled orders and onward to the supplier.
- **logistics** — carrier commitment with chosen/rejected freight, and an idle blocker (`no-eligible-cargo`) whose causes include `source-out-of-stock`, `below-carrier-cost`, and `payer-cannot-fund`.

## UI

- **Scanner** gained an `actors` target type (`findActors`, carrying `actorId`).
- **Click an actor in the viewport** → diagnostic panel (camera-mapped pick within 60u).
- **Observatory overlay** toggled from the quick links: searchable **Actors** table and a consolidated **Blockers** table; clicking any row opens that actor's panel. Both refresh on a 700 ms cadence (a projection read, not a per-frame cost).
- Console access: `window.__asteroids.diagnostics.{inspect, list, blocked, select}`.

## Verified live

7 actors tracked (2 institutions, 5 ships). The why-chain reproduces the target example end to end:

```
[no-eligible-cargo]        Mara Venn is docked at Scrap Porch with no eligible freight
  [source-out-of-stock]    Scrap Porch has no Water Ice to ship (scrap-forge holds 0)
    [all-suppliers-committed] Every Cinder ship is committed; those jobs currently have higher net value
      [committed]          Mining 6 iron nickel for Scrap Porch
      [committed]          Mining 2 iron nickel for Scrap Porch
      [committed]          Mining 3 Silicate for The Ledge
```

A worker's panel shows the chosen job (`SPRC-PO-0001`, net 269) against three rejected alternatives with scores and `rejectedBecause` text. 126 tests pass, content validation passes, no console errors.

## Two real defects this layer exposed immediately

1. **Silently idle workers.** `chooseOrder` could pick an order whose allocation was already fully reserved; the worker then hit an early `return` with **no diagnostic and no ledger line** — invisible to any observer. Now reported as `order-fully-allocated`. This is exactly the "intentional delay or deadlock?" question the layer exists to answer, and it was invisible before.
2. **Widespread stale-module risk.** `main.js` imported `miningOperation.js` **without `?v=`**, so the browser served a pre-diagnostics copy while Node tests read fresh files from disk — the fix appeared not to work. A sweep found **28 version-less relative imports across 18 files** (including `game.js`, `scanner.js`, `sprcOperation.js`, several field systems). All are now versioned, so `npm run bump:cache` can bust them. **This was a latent correctness hazard well beyond diagnostics: any edit to those modules could silently not take effect in the browser.**

## Deferred (unchanged from the plan)

Institution and contract observatory tabs; trends/time-series; retention pruning and aggregation; visibility enforcement; player-facing presentation. No economy behaviour was added.

---

# Ledger event browser (2026-07-29)

The Ledger tab is now an event browser over the historical record rather than a
relocated activity feed. Other tabs remain basic by design.

## Blocking issue found first: the ledger was forgetting

`eventLedger` had `historyLimit = 250` and was **already rotating** (observed ids
1482–1730 in a short session). A searchable historical record cannot forget after
250 events, so the limit is now **6000**. This is not a retention policy —
`eventRetention.js` still owns the per-class policy that will eventually
summarize ephemeral chatter and keep durable history indefinitely.

## Observatory close button

Root cause of the missing X: `.observatory` declared `grid-template-rows: auto 1fr`
but gained four children (table body + three panes), so the extra panes created
implicit rows and pushed the header out of view. All panes now share
`grid-row: 2` with `min-height: 0`, and `#observatory-close` is pinned with
`margin-left: auto`. The close control is present on every tab.

## `src/systems/ledgerQuery.js`

Read-only. The reference map was built from payload keys events **actually**
carry (surveyed live), so filters and links use real data:

- `extractEventReferences` → `{actor, institution, location, contract, service, asset}`, each `{id, name, field}`, deduplicated.
- `extractEventAmounts` → money/quantity fields (payment, unitPrice, servicePrice, wear, …).
- `extractEventCauses` / `hasCausalLinks` → **only** explicit cause fields: `sourceNeedId`, `sourceRepairOrderId`, `emergencyNeedId`, `sourceContractId`, `referenceId`.
- `filterEvents` → all filters combine: search (type/summary/payload), actor, institution, location, type, contract, service, retention class, visibility, time range, causal-only, durable-only.
- `collectFilterOptions` → real records for the dropdowns; nothing must be typed exactly.
- `findRelatedEvents` → grouped and **labelled precisely** so structure is never presented as proven causation: `causedBy` / `caused` (explicit cause fields), `preceded` / `followed` (same contract or order — a sequence), `sameContract` / `sameActor` / `sameAsset` (co-reference). Timestamps are never used to infer causation.
- `getEventVisibility` reads `payload.visibility` when present, else the retention classifier's default — so the shape already allows an event to be private, suppressed, falsified, or disputed.

## UI

Filter bar (search, six record-backed dropdowns, retention, visibility, time
range, causal-only, durable-only, sort, Pause, Clear, count) above a table
(Age · Type · Ret · Vis · Actor · Institution · Location · Contract/service ·
Summary) with retention shown as a coloured left border, beside a detail panel.

Detail shows: id, type, full timestamp, age, retention, visibility, whether the
event is player-visible or developer-only, a readable explanation, every
referenced entity grouped by kind, amounts, explicit cause references, the
sequence groups above, and a collapsed **Raw payload (developer)** section.
Referenced entities carry **Filter**, **Inspect**, and **Center** actions;
Center appears only when the entity has a live physical position.

**Pause freezes only the display.** Verified: the count held at 120 while the
ledger grew underneath, and resuming showed 126.

## Verification

144 tests pass (18 new in `tests/ledgerQuery.test.mjs`), content validation
passes, no console errors. Live: close button present on the Ledger tab; 17
actor / 6 institution / 25 type options drawn from real records; all three
retention classes visible; combined filters narrowed 120 → 3 → 2; causal-only
worked; and all six requested event categories carry references, amounts, and
relations — repair, mining, freight, pricing, blocker, payment. `contract.paid`
resolved **three explicit `causedBy` links** and classified as `durable`.

## Developer view vs future player access

This view deliberately reads the whole stream, hidden events included. Future
in-world access rules (beacon access, authority, ownership, relationships,
investigation skill, hacking, warrants, witnesses, data integrity, concealment)
belong in a separate access layer; nothing here should be reused directly for
player-facing history or the player becomes omniscient.

## Not touched this pass

Stats, Population, Institutions, Contracts, trends, retention pruning.
