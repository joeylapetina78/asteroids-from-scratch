# Valuation & Economy Roadmap

> **SLICE 1 IMPLEMENTED 2026-07-28.** See "Implemented slice" at the bottom for
> exactly what shipped, and — importantly — what this slice does **not** do.


Design direction for giving NPCs the ability to **value things** — goods, jobs,
repairs, and used assets — so the frontier economy self-balances and prices
propagate through the supply chain instead of sitting as hand-set constants.
Captured from a live play session on 2026-07-26 where a hauler got stuck.

## The live diagnosis (what started this)

Porch Runner Two sat parked at Scrap Porch, unable to leave. Trace:

- It's docked at Scrap Porch in logistics status `maintenance-required` — it came in with a wear issue and is waiting for SPRC (Sal) to service it.
- Its repair (`SPRC-RPR-0004`, emergency) needs a **machine-part**, which the Maw builds from **2 silicate + 1 copper**. SPRC holds **zero** of both.
- Sal posted procurement contracts for the copper (`SPRC-PO-0002`) and silicate (`SPRC-PO-0003`) and committed the cash, but both are still **"offered" with zero deliveries**. No supply arrived → no machine-part → repair never completes → hauler waits indefinitely.

**Root cause = capacity + an inverted price signal, NOT geography.** (Correcting an earlier wrong read: Cinder's deposit knowledge is effectively global — ~6,720 deposits across ±80k units, including **497 copper** with the nearest ~2,060u north of the hub, and **561 silicate**. Copper is *not* a supply gap and Cinder is not blind to it.)

What's actually wrong (corrected after reading `miningOperation.js chooseOrder`):
1. **All four Cinder ships are already committed** — 2× iron-nickel, 1× silicate, 1× water-ice. No free ship to take Sal's emergency order *this moment*.
2. **CORRECTION — the miner does NOT choose by price.** `chooseOrder()` returns `getSprcMiningOrders()[0]` *before* any routine order, so SPRC already always wins, via a **hardcoded priority flag** (emergency = 1000, else 800), not by comparing pay. So the cheap 20/unit silicate price is *not* why miners skip it — an earlier claim that "urgent-but-cheap never wins" was wrong. The next ship that frees up WILL grab the emergency silicate order ahead of all routine work.
3. **The real blockers are throughput, not price:** (a) capacity — only 4 ships, all mid-run; (b) **no preemption** — `if (worker.assignment) return` means a ship won't drop a routine run it already started to serve an emergency; (c) **tiny batches** — SPRC only demands `MINING_ALLOCATION_SIZE` (6) equivalents at a time, so it takes several free-moments to fill; (d) the repair also needed copper, a second material on the same throttled fleet. Ships DO cycle (19 contracts completed in this session), so it's a latency/throughput problem, not a permanent stall.

**Implication for the valuation work:** replacing the crude hardcoded 1000/800 flag with real net-value comparison (step 6) is still the right strategic move, but the thing that would unstick *this specific trucker fastest* is throughput — preemption, bigger batches, or more capacity (Cinder-Four expansion already targets capacity). Valuation is the foundation; it is not, by itself, the quickest fix for the live symptom. Decide scope accordingly.

## The insight that generalizes it (Joey, 2026-07-26)

Prices are a **chain**, not independent knobs. If Sal must pay miners more to get urgent copper, then to keep his margin **his repair price must rise too**; the haulers he repairs then face higher maintenance cost, so **their freight price must rise**; the hub buying that freight pays more; and so on. Marginal cost flows downstream. Today nothing models this — every price is a hand-set constant, so a shock at one link doesn't propagate.

And the reason the miners are busy at all: the hubs issue a stream of **small-batch standing mining orders** to keep the haulers supplied. That background load is what occupies the fleet; it's not "distraction," it *is* the supply chain — but it currently can't be out-competed by something urgent.

## What NPCs already have (grounding — don't reinvent this)

The bespoke-NPC substrate largely exists:

- **Sal carries traits:** `caution: 0.7`, `growthBias: 0.4`, `urgencyBias: 0.8`. Person-archetype institution (`controllerInstitutionId`) controlling SPRC.
- **Authority flags:** `mayProcure`, `mayScheduleProduction`, `mayFundProjects`.
- **A relationship/trust value:** `actor.relationship.playerReliability: 2` (already tracks trust in the player).
- **An operating plan:** `inventoryTargets`, `safetyStock`, `protectedCashReserve`, `servicePriorities`, `procurementBatchSizes` (← the "tiny batches"), `projectedRepairCoverageTarget`.
- **`institutionDecision.js`** already does domain-neutral needs → problems → responses → **priority scoring** → affordability → reconsideration.

**What's missing:** prices are static and unconnected. Repair `servicePrice` is a flat 180 (freight) / 220 (mining). Procurement `pricePerEquivalent` is a fixed per-item constant. Neither reads Sal's traits, neither responds to urgency or scarcity, and they don't share logic — so "does Sal price his purchase contracts the same way he prices his repairs?" is currently **no**; they're two independent constants.

## The design: one shared valuation function, per-NPC trait vector

Every party (Sal buying inputs, Sal charging for repairs, a miner choosing a job, a hauler pricing freight, later a trader pricing a used engine) runs the **same** valuation logic with **different trait coefficients**. Roles emerge from attributes, not special-cased code — the project's systems-first rule.

Two sides of every transaction:

**Willingness-to-pay (as buyer)** — what this good/service is worth to me right now:

```
WTP = baseWorth
      × urgencyFactor(need.urgency, trait.urgencyBias)   // desperate → pays up
      × scarcityFactor(onHand vs target, trait.caution)  // low stock → worth more
      × relationshipFactor(counterparty trust)           // trust a supplier → pay a bit more/extend credit
   bounded by affordability (already modeled)
```

**Ask price (as seller)** — cost-to-provide + margin:

```
ask = costToProvide                                   // inputs I paid for + labor
      + margin(trait.greed/growthBias, myScarcity/leverage, relationship)
   for a used/worn good: costToProvide scales with CONDITION
```

A deal clears when `WTP ≥ ask` (later: negotiate and split the surplus). **Cost pass-through falls out for free:** Sal's repair `ask` includes the materials he bought; if miners bid him up, his cost rises, so his repair price rises; the hauler's freight `ask` includes the repair it just paid for; etc. The whole chain Joey described emerges from each NPC pricing to cover cost + a trait-shaped margin — nobody hard-codes the ripple.

### Trait → coefficient mapping

- `urgencyBias` (Sal 0.8) → how steeply WTP climbs with need urgency. **This is the exact knob that unsticks the trucker:** an emergency repair blocking a paying hauler makes Sal willing to pay a premium for copper, so his order out-bids the routine Ledge run and *pulls* a miner — emergent reprioritization, no preemption logic.
- `caution` (Sal 0.7) → size of safety buffers/reserves; reluctance to run lean; risk aversion when accepting risky/long work.
- `growthBias` (Sal 0.4) → appetite to fund expansion or take thin-margin volume to grow.
- **New traits to add:** `margin`/greed (markup appetite), `honesty` (willingness to misrepresent condition — see below), `generosity`/relationship-weight (discounts for trusted partners).
- `relationship.playerReliability` (exists) → per-counterparty term-shaping: discounts, credit, better terms for the trusted; gouging for strangers or anyone over a barrel.

Same formula everywhere; the trait vector is what makes Sal *Sal*. This is also the substrate for the procedural-creditor "personality knobs" in [stakes-failure design] (pay/cut, time allowed, damage forgiveness) and for rival/patron behavior.

## The used-asset + deception extension (the fun payoff)

Once valuation weighs **condition**, the end-of-life-part fantasy drops on top with little new machinery:

1. **Condemned ceiling** — extend the wear system (engine is the first panel) so a part can degrade *past repairable*. Beyond that threshold it needs **replacement**, not repair.
2. **Removed part = asset with condition** — Sal takes your dead engine into inventory; it carries its wear/condition as a value attribute.
3. **Used-good valuation** — `value = base × condition`, the *same* seam. A worn engine is worth less; a broke/desperate buyer's WTP tolerates worse condition for a lower price → a secondhand market clears.
4. **Lying** — the game knows the *true* condition; the seller advertises a *claimed* condition. Whether the buyer catches the gap rides the **inspection system** (checks some of the truth) and **trust/disposition**. Get away with it → profit; get caught → a reputation hit the disposition system remembers. Deception becomes a real, risky strategy, for NPCs and eventually the player. Low `honesty` trait = willing to misrepresent.

## Suggested build order

1. **Valuation seam (smallest high-leverage slice):** add a shared valuation module `institutionDecision` can call. First job: SPRC procurement `pricePerEquivalent` = `base × urgency(urgencyBias) × scarcity`. Confirm the miners' job-selection actually reads pay so the higher urgent price propagates and pulls a ship. This alone unsticks the live trucker.
2. **Make repair price dynamic through the same function** so raising input costs raises `servicePrice` (margin preserved) — proving contracts and repairs share one valuation, which is Joey's core requirement.
3. **Hauler freight pricing** through the same seam (their ask = operating cost incl. maintenance + margin).
4. **Then**: the condemned-part ceiling + used-asset resale + claimed-vs-true condition (deception), riding the wear system already built + this valuation seam.

Open question to settle before building: how much of "value" is a **shared formula** vs. **per-NPC personality**. Current lean: one formula, per-NPC trait coefficients — enough for distinct behavior without bespoke code per NPC.

---

# Implemented slice (2026-07-28)

## What this slice proves

**Valuation and cost propagation.** Prices are no longer hand-set constants:
they are computed from live circumstances, shaped by institution policy and
decision-maker traits, and every decision carries inspectable reasons.

## What this slice explicitly does NOT do

It does **not** implement the deliberative layer: **motivations, generated
goals, planning, skills, or autonomous advancement**. Actors still respond to
needs the domain systems detect; they do not form their own goals, build plans,
learn skills, hire, train, borrow, or acquire holdings. Relationship-gated
*access* is declared in the schema but not enforced. Those remain future slices.

## New modules

| Module | Role |
|---|---|
| `src/systems/valuation.js` | Shared framework. One `ValuationResult` shape `{acceptable, affordable, recommendedPrice, minAcceptablePrice, maxAcceptablePrice, decision, reasons, metrics}`; separate evaluators per action type (`evaluateProcurement`, `evaluateMiningJob`, `evaluateServicePrice`) with shared influences (`urgencyFactor`, `scarcityFactor`, `relationshipFactor`). Pure functions — call on events/planning ticks, never per frame. |
| `src/systems/costBasis.js` | Per-institution projection of what materials actually cost. `recordAcquisition` (real purchases), `recordProduction` (carries input cost into finished goods), `getUnitCost` / `getReplacementUnitCost` / `getBundleCost`. |
| `src/systems/intentions.js` | Shared intention vocabulary + **read-only adapter seam**. Existing systems stay authoritative. |
| `src/systems/relationshipProjections.js` | Multi-dimensional projections (trust / reliability / gratitude / resentment / familiarity) + bounded `significantEventIds` back-references + the `access` extension point. |

## Behaviour changes

- **Procurement pricing** (`sprcOperation.createProcurementOrder`) uses `valueProcurement()` instead of the constant `directMaterial.price ?? 34`. Nets on-hand + **incoming** + reserved, respects protected cash, batches to a meaningful size, and trims the batch rather than crossing the reserve; defers when genuinely unaffordable.
- **Bounded repricing** (`repriceOpenProcurement`, on the SPRC tick): an unfilled offer with no active allocation is revalued at most once a minute, never above **2× its original ask**, and only if the extra commitment fits inside spendable cash. Logged as `institution.offerRepriced`.
- **Miner selection** (`miningOperation.chooseOrder`) compares **expected net value** — payout (including expected surplus sales) minus travel, wear, and risk — across SPRC and standing orders. **The hardcoded `emergency 1000 / else 800` priority constant is gone.** Selections record the chosen job, its net value, reasons, and the rejected runners-up.
- **Non-preemptive commitments preserved:** `if (worker.assignment) return` is unchanged; only idle workers reconsider.
- **Repair pricing** (`valueRepairService`) quotes from live material cost basis + labor + facility, with a trait-shaped margin, capped by outright replacement cost (parts × 2.5 + labor + facility, so the cap cannot erase margin).
- **Cost recorded** on every material delivery and every production run, so raw price → produced part → service price propagates automatically.
- **Relationship projections** updated on completed deliveries, alongside the legacy `playerReliability` scalar.
- **New ledger events**, all carrying `reasons[]`: `institution.pricedOffer`, `institution.offerRepriced`, `institution.servicePriced`, `institution.valuationDeclined`, `institution.jobValued`, `institution.costBasisUpdated`.

## Live verification (browser, `?resetSave=1&devStart=panorama`)

- Routine feedstock offer priced **50/unit** (was flat 34) — reason: `scarcity (0 on hand + 0 incoming vs target 8) ×1.48`. Protected cash respected (1800 balance − 400 committed ≥ 900 reserve).
- Emergency raised **silicate 20 → 46/unit** and **copper 60 → 137/unit**, each reasoned `Urgency emergency ×1.54; scarcity ×1.48`, with `Batched 2→6` / `Batched 1→3`.
- **Urgent SPRC work pulled miners off routine work with no priority constant:** Cinder Two chose `SPRC-PO-0001` (net 251) over `mine-yard-iron` (net 100); Cinder One took the emergency copper order. Cinder Three kept the Ledge silicate run (net 167 vs 158) because it was already standing at The Ledge — a legible economic call, not a bug.
- **Cost propagation end-to-end:** copper booked at **137/unit** from the real procurement; the resulting repair quoted **224** against a **175** cost-to-provide (28% margin from Sal's traits), reasoned `materials 70 (live cost basis) + labor 70 + facility 35`.
- Supplier relationship recorded multi-dimensionally: `sprc → miner:cinder-contracting`, trust 0.05, reliability 0.08, 1 completed deal.

## Tests

104 pass (26 new across `tests/valuation.test.mjs` and `tests/valuationLoop.test.mjs`), plus content validation. Two pre-existing tests were updated to derive expected payments from live prices instead of the retired constants (`68`/`204` and `-220`) — their original intent (allocation bounding; paid service) is preserved.

## Known follow-ups

- **Scarcity is near-maximal whenever a restock order fires** (an empty shelf is what triggers it), so routine orders carry a standing ~1.48× markup over the authored reference. Defensible, but worth tuning if routine restocking feels expensive.
- `getSpendable` in valuation and `getProcurementAffordability` in sprcOperation both compute spendable cash; consolidate when convenient.
- Hauler freight pricing is the third link of cost pass-through and is not yet wired.

---

# Field report: Scrap Porch congestion (2026-07-28, live save)

Four actors parked at Scrap Porch. Three separate causes; only one is ours.

## 1. Both haulers idle — NOT ours (pre-existing supply lag)

Yard Hauler and Porch Runner Two are both `seeking-work`, docked at Scrap Porch,
`lastDecisionKey: "no-work:scrap-porch:none-offered"`. Neither has a wear issue
(`wearIssueCount: 0`). The outbound Scrap Porch offer moves **water ice**, and
`scrap-forge` holds **0 water-ice** — so no offer exists to take. Cinder Four is
currently mining water-ice for that buyer, so it should clear on its own.

This is the intended "haulers wait for real inventory" rule. The genuine gap is
**coordination, not pricing**: two carriers wait at the same empty source while
Yard Exchange holds 10 iron-nickel. Nothing repositions an idle carrier toward
where work exists. Candidate for the eventual planner, not for this slice.

## 2. Cinder Two: cargo stranded inside the ship that needs it — NOT ours

`worker:cinder-two` is disabled (`tractor-field-instability`), `awaiting-service`
at Scrap Porch — **carrying 3 copper**. Its repair (`SPRC-RPR-0002`) needs
`machine-part 1` + `copper 1`. SPRC holds exactly 1 copper, already reserved for
the repair, so the mill cannot also produce the machine-part (needs another 0.5
copper). Sal has posted `SPRC-PO-0002` for 3 copper at 137/unit with no taker.

**The copper Sal is shopping for is sitting in the hold of the ship he is trying
to repair, 56 units away.** Nothing unloads a disabled ship's cargo on arrival
for service. Not a permanent deadlock (another Cinder ship can take the order,
and 137/unit is attractive), but it reads as absurd and is worth a real fix:
*arriving for service should surrender or offer cargo first.*

## 3. Repair prices rose 220 → 300/326 — THIS IS OURS, and it exposed a defect

Cost-basis + margin now exceeds the retired flat rate by 36–48% (`SPRC-RPR-0001`
= 326, `SPRC-RPR-0002` = 300, both against `referenceServicePrice: 220`). The
pricing itself is working as designed. Two consequences:

### 3a. DEFECT — the eligibility check and the billed price have diverged

`miningOperation` emits `maintenance.requested` with
`servicePrice: MINING_SERVICE_PRICE` (220). `matchMaintenanceService` gates
affordability on **that** number, but `createServiceRepairOrder` then overrides
the order with the **valuation** price (326). So a customer is admitted against
220 and billed 326.

Downstream, `consumeMaintenanceEvents` does
`const price = event.payload.serviceRevenue ?? MINING_SERVICE_PRICE; if (account.balance < price) continue;`
— if the customer cannot cover the *actual* price it silently skips, **forever**.
SPRC has already marked the repair `completed`; the ship never pays and never
returns to service. And `maintenance.requested` is emitted **once**, on
`service.arrived`, with **no retry** — so a declined or unpayable repair strands
that ship permanently.

**Fix direction:** quote before admitting. Price the service first, then run the
affordability gate against the quoted price, and give a declined/unaffordable
repair an explicit outcome (retry, part-payment, debt, or a cheaper tier) rather
than silent limbo.

### 3b. The pass-through chain is only half-built

Cinder's **costs** now float (repairs priced from live cost basis) while its
**revenue** is still hand-set (standing orders at 42–70/unit). The supplier
absorbs the entire increase. Cinder: mining income 952, wholesale 153, capital
−350, maintenance −326, balance 689 (available 569 above its 120 reserve).
Solvent today, but structurally one-sided.

This is exactly the chain Joey predicted: *"then we would need to give the
haulers some kind of way to up the price of how much it costs for them to
deliver things. And then we still have the problem back at the hub."* The answer
is to finish the chain — suppliers price their own work as cost + margin — not
to roll back Sal's pricing.

## Hypothesis tested and REJECTED

I suspected net-value selection would starve the lowest-margin standing order
(water-ice, 46/unit) that feeds the freight loop. **It does not.** Net value is
positional: from Scrap Porch, water-ice is the *best* job (net 138) because the
buyer is on top of it, ahead of yard-iron (102) and ledge-silicate (85). The
earlier low score (8–9) was measured from a worker standing at The Ledge. Job
attractiveness varies by where a ship is, which is the intended behavior.

## Recommendation

**Mostly forward, with one rear-view fix first.** 3a is a real liveness/
conservation defect that our price change introduced — quote-then-gate should be
repaired before building further. 3b is the natural next slice (supplier-side
pricing). 1 and 2 are pre-existing gaps to schedule separately.

---

# Repair-lifecycle fix + local-transaction inspection (2026-07-28)

## FIXED 1 — quote-then-gate, one accepted price

`matchMaintenanceService` gained an optional **`priceService({capability, facility, request})`** hook. It resolves capability and facility, calls the hook to obtain a quote, then runs the affordability gate **against that quote**, returning it as `quotedPrice`. SPRC passes `valueRepairService` as the hook, and the returned `match.quotedPrice` becomes `order.servicePrice` **and** `order.quotedPrice` — the single price used for the gate, the record, `sprc.repairCompleted.serviceRevenue`, and settlement. Admission price and billed price can no longer diverge.

Verified live: a payer with 5 cr was declined citing `quotedPrice: 224` (**not** the old 220 reference) with `availableCash: -115`; on retry it was admitted at exactly 224 with `servicePrice === quotedPrice`.

## FIXED 2 — declined repairs are retryable, not silent limbo

- `sprc.deferredServiceRequests[subjectId]` holds `{request, status:"awaiting-retry", reason, quotedPrice, availableCash, attempts, firstDeferredAt, lastAttemptAt}`.
- `retryDeferredServiceRequests()` runs on the SPRC tick every `SERVICE_RETRY_INTERVAL_MS` (15s), **re-reading the payer's live balance** via `getCurrentPayerSnapshot` (the stale snapshot was why the first attempt failed). Success clears the record and emits `sprc.repairRetryAdmitted`.
- Only the **first** deferral announces (`sprc.repairDeferred`, `retryable: true`); retries stay quiet.
- **Settlement side:** `consumeMaintenanceEvents` no longer pays inline with a silent `continue`. Completed repairs are queued in `operation.pendingServiceSettlements` and retried by `settlePendingServiceCharges()`. An unpayable bill persists as visible debt (`mining.serviceDebtOutstanding`, announced once) and the ship stays in the berth rather than being silently stranded with a completed-but-unpaid repair.

**Project gotcha reconfirmed:** `sprcOperation.js` imported `maintenanceService.js`, `institutionDecision.js`, and my new modules **without `?v=`**, so `npm run bump:cache` could not bust them and the browser ran a stale matcher (the fix appeared not to work while tests passed). All are now versioned. *Any new cross-module import in `src/` must carry `?v=`.*

## INSPECTION 3 — standing purchase orders & partial fulfillment: ALREADY SUPPORTED

SPRC procurement orders are already standing purchase orders with partial fulfillment:

- `requiredEquivalentUnits` / `deliveredEquivalentUnits` track the **remaining need**.
- `deliverMaterial({contractId, materialId, amount, supplierInstitutionId, creditSupplier})` accepts **any amount**, clamps to what remains (`acceptedUnits = min(amount, remaining/equivalence)`), pays **per unit delivered** (`equivalentUnits × pricePerEquivalent`), and only flips to `paid` when `delivered >= required`.
- `acceptedMaterials` already allows outcome-equivalent substitutes (iron-nickel 1 / aluminum 2).
- Multiple suppliers coexist via `order.allocations[supplierInstitutionId]`.

**Nothing new is needed for "buy up to the remaining need at a stated per-unit price, partial allowed."** The only gate is the access path: for a non-player supplier, `deliverMaterial` requires `allocation?.status === "active"`. Crucially, **`reserveProcurementAllocation` does not require an assignment** — it only reserves units against the order. So an idle ship can reserve-then-deliver without taking a mining assignment. The primitive already exists.

## INSPECTION 4 — beacon access: EXISTS FOR THE PLAYER ONLY

- Every hub carries a `beaconId` (`worldSites.js`).
- `state.components.beaconLocator.beaconMemoryIds` is the **player's** list of known hubs, used for navigation (`getBeaconTarget`) and for the "add hub beacon" flow.
- **Institutions and NPC ships have no beacon memory at all.** Cinder has `depositKnowledge` (ore locations, with confidence) but no `knownHubs`.
- **No visibility filter exists anywhere.** NPC selection reads the global arrays directly (`STANDING_MINING_ORDERS`, `state.sprc.procurementOrders`); the player's board filters by *site*, never by beacon possession.

To make beacon access govern market awareness we would need: (a) an institution-level `beaconAccess: [siteId]` (mirroring the player's `beaconMemoryIds`), and (b) a single `getVisibleOffers(actor, siteId)` seam that **both** the player board and NPC selection call, filtering to hubs the actor's institution holds a beacon for. Public board only — private cargo and private offers stay out of it. This is a genuinely new but small layer, and it is the right place for it because both consumers already funnel through a small number of call sites.

## INSPECTION 5 — the decision point for compatible local transactions: MISSING BY ONE BRANCH

`miningOperation.update()`:

```js
if (shipRecord.maintenanceStatus !== "available") return;  // ← disabled ships exit here
if (worker.assignment) return;                             // ← committed ships exit here
const order = chooseOrder(worker);                         // primary assignment only
```

A disabled or awaiting-service ship **returns before evaluating anything**. There is no branch in which any actor considers a transaction that is not a primary assignment. Note that Cinder Two's `assignment` is already `null` while awaiting service, so **all of its cargo is uncommitted** — ownership is unambiguous.

The missing concept is exactly the distinction requested:

- **Primary committed assignment** — mining/hauling; already modeled (allocation + `worker.assignment`), non-preemptive, gated by the two returns above.
- **Compatible local transaction** — selling already-owned uncommitted cargo at the hub you are sitting at. Requires no travel, no assignment, and does not disturb an existing commitment.

`sellSurplusAtHub()` is effectively this primitive already — it sells leftover cargo into local supply at 70% trade value — but it is only reachable from inside `completeDelivery`, i.e. only as part of fulfilling an assignment.

**Shape of the eventual change (not built):** a `considerLocalTransactions(worker, shipRecord)` step that runs *before* the two early returns, for any actor that is docked/idle/awaiting-service, holds uncommitted cargo, and has authority to sell it. It would consult `getVisibleOffers(actor, currentSite)` (beacon-gated), value each with the existing `evaluateMiningJob`/a sale evaluator, and on acceptance call the **existing** `reserveProcurementAllocation` + `deliverMaterial` pair. No unloading, no seizure, no new contract machinery — an ordinary sale contract, separate from the repair contract.

For the Cinder Two scenario this yields exactly the intended outcome: Sal's copper order is a public standing purchase order at Scrap Porch; Cinder Two sees it through beacon access; it knows it owns 3 uncommitted copper; it sells them under a normal partial-fulfillment contract; and it separately buys the repair.

## Sequencing note

Supplier-side pricing remains the next major economic step, after this repair-lifecycle fix. The local-transaction branch and beacon-gated visibility are prerequisites for the Cinder Two scenario but are independent of supplier pricing; either can be scheduled first.

---

# Slice 2: supplier-side pricing (2026-07-28)

Closes the chain Joey described: *Sal's costs → Sal's prices → his customers'
costs → their prices.* Previously only the first two links floated; suppliers
absorbed every increase because their revenue was hand-set.

## New shared pieces

- **`evaluateSupplierAsk()`** (valuation.js) — the mirror of `evaluateProcurement`. Totals what serving a job costs (travel + amortized maintenance + time), adds a trait-shaped margin, and returns the standard `ValuationResult`. `minAcceptablePrice` is **bare cost** — the hard floor below which the work loses money and is declined; `recommendedPrice` is the ask.
- **`recordServiceCost` / `getServiceCost`** (costBasis.js) — a per-institution projection of what upkeep *actually* costs, alongside the existing material cost basis. `getServiceCost` weights the most recent bill 60/40 against the running average, because prices are moving and the next bill resembles the last one.

## Wiring

- **Miner:** pays a repair → `recordServiceCost("miner:cinder-contracting", price)`. Job valuation now prices wear with `getServiceCost(...)` instead of the `MINING_SERVICE_PRICE` constant, so a repair-price rise makes marginal runs unattractive and shifts the fleet toward closer work.
- **Carriers:** pay a repair → `recordServiceCost(carrierInstitutionId, amount)` in `settleRepairInvoice`. Each freight candidate is now valued by `evaluateCarrierAsk()` — travel at the carrier's `operatingCostPerDistance` plus maintenance amortized as `incrementalWear / maximumWear × liveServiceCost`. Work below cost is rejected with the new reason **`below-carrier-cost`**, and every ask is recorded in `logistics.freightAsks` with its cost breakdown and reasons.
- **Issuers:** `repriceUnclaimedFreight()` runs on the logistics tick. A template no carrier will take gets its posted rate raised toward the carrier's ask — throttled (45s), bounded (≤2.5× the authored base), and gated on the issuer's own affordability. Posted rates live in `logistics.postedFreightRates` and are resolved through a single `getFreightRate(template)`, which is now the one price used for funding, commitment, the shipment record, and settlement (`shipment.basePayment` keeps the authored figure for reference). Logged as `institution.freightRepriced`.

**Important correctness note:** `plan.projectedWear` from `transportationPlanning` is **cumulative** (current wear + trip + return). Charging that to a single run made every worn carrier refuse all work — caught by an existing test. Carrier asks now bill only the **incremental** wear the run adds.

## Verification

- 111 tests pass (4 new: ask = cost + margin with cost as floor; decline below cost / accept above; dearer upkeep raises both ask and floor; service-cost projection recency weighting), plus content validation.
- **Live:** carrier asks are produced with real breakdowns — e.g. `standing-iron-yard-scrap costs 16.5 to serve (travel 7.5, maintenance 9). Asking 20 at a 22% margin; will not work below 17.` A 600-credit repair paid by `carrier:porch-runner` was booked into the service-cost projection.
- **Not yet observed live:** a freight ask *rising* after that carrier's own repair, and a `freightRepriced` event. In the probe window the carrier did not re-evaluate the affected template (its templates were occupied/out of stock, so `freightAsks` timestamps went stale), and every ask cleared its rate, so no reprice was warranted. The behaviour is covered by unit tests; observing it in a running economy needs a longer session where a carrier services and then re-bids.

## Still open

- Standing **mining** order prices (42–70/unit) remain authored; only freight rates and SPRC procurement float. Hub-side mining repricing is the symmetric next step.
- The player-facing freight board (`createStandingFreightJob`) still shows `template.payment`, not the posted rate — the player does not yet see raised rates.
