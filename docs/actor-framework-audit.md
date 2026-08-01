# Actor Framework — Convergence Audit

> **Status:** §5, part of step 0, and step 1 have since been implemented — see
> the "Implemented" notes inline and the progress table in §6. The audit body
> describes the state *before* that work and is kept as written, so the
> diagnosis stays readable and the before/after stays honest.
>
> Commits: `eb0a500` seller concession (pre-audit), `5bdbcc3` actor configuration,
> `f1a2625` extraction offer surface, `2a65aef` intention coverage, `2d580d2`
> urgency fix, `855d6c2` read side on the shared substrate, `2c951e5` Nell as the
> proving slice. 312 tests, 311 pass, 1 skipped.

Architectural check only (2026-08-01, at `b752bfb` plus the uncommitted seller-concession
work). No implementation. Follow-up to `actor-framework-inventory.md` (2026-07-28), which
mapped the framework *before* the valuation slice and the hub economy were built.

The question: **is the economy work converging on one reusable actor framework, or
accumulating bespoke systems?**

---

## Verdict

**The seams converged. The configuration did not.**

This is a better position than "we built bespoke systems", and it needs a different fix.
Almost every generic seam the framework calls for now exists and is *plumbed into the
call sites*: one `ValuationResult` shape used by four evaluators across five modules, one
cost-basis projection, one diagnostics/blocker layer, one relationship projection with the
right dimensions, one rights checker. Sal, hubs, miners and carriers genuinely share
those.

What did not converge is the **actor configuration behind the seams**. The evaluators ask
for traits, relationships, policy and rights — and are handed module-level constants,
`null`, and dangling archetype ids. Concretely:

| Seam | Wired into call sites | Actually fed real per-actor data |
|---|---|---|
| `traits` | 7 evaluator call sites | **1 actor** (Sal). 4 sites use module constants; carriers *and* Ivo Cinder read a controller that has no `traits` field, so all fall back. Tavi has traits but does no valuation. |
| `relationship` | 3 evaluator params | **1 call site** (`sprcOperation.js:888`), fed by **1 write** (`sprcOperation.js:1140`) |
| `archetypeId` | 14 distinct values in world data | **4 defined**, **3 ever looked up**. Hubs, carriers, populations, ships and every person carry ids that resolve to nothing. |
| `canActorDoAction` | rights vocabulary covers `haul`,`repair`,`sell`,`tow`,`dock`,`buy` | **1 caller** (`miningOperation.mayPostMiningOrder`) |
| `ECONOMY_SCALE` | intended as the one price dial | **1 consumer** (`getResourceTradeValue`); 9 other price constants were scaled by hand and two were missed |

So the three hubs make identical decisions not because they share a brain, but because
they share a `const BUYER_TRAITS`. Sal is not a repair-oriented actor *because of what he
has* — he is one because `sprcOperation.js` is 1,347 lines of repair nouns. The gap
between those two statements is the whole remaining lift, and most of it is data plus one
structural extraction, not a rewrite.

The genuinely absent layer is still the **deliberative middle** — but the priority order
inside it has changed since July, for reasons in §6.

---

## 1. The shared framework that already exists

Real, load-bearing, used by more than one actor:

| Layer | Module | Used by |
|---|---|---|
| **Valuation result + evaluators** | `valuation.js` — `evaluateProcurement`, `evaluateMiningJob`, `evaluateSupplierAsk`, `evaluateServicePrice`, shared `urgencyFactor`/`scarcityFactor`/`relationshipFactor` | SPRC, hubs (buy + sell), miners, carriers |
| **Cost-basis projection** | `costBasis.js` — `recordAcquisition`, `recordProduction`, `getUnitCost`, `getServiceCost` | SPRC, hubs, miners, carriers, populations |
| **Diagnostics / blockers** | `diagnostics.js` — `recordDiagnostic`, `recordBlocker`, `createBlocker`, `resolveBlockerChain` | SPRC, hubs, miners, carriers, populations |
| **Authority & rights** | `authorityModel.js`, `authorityRegistry.js`, `ruleChecker.js`, `authoritySeeds.js` | mining rights only (see §2) |
| **Relationship projection** | `relationshipProjections.js` — five independent dimensions, `access` extension point declared | SPRC only |
| **Institution decision pipeline** | `institutionDecision.js` — needs → capability `propose` → `scoreResponse` → `evaluateAffordability` | SPRC, farm, carriers (carriers ceremonially — see §3) |
| **Event ledger + retention classes** | `eventLedger.js`, `eventRetention.js` | everything |
| **Contract board projection** | `contractBoard.js` — normalizes 5 work shapes into `{issuer, supplier, state, kind}` | read-only, observer only |
| **Intention vocabulary** | `intentions.js` — `IntentionRecord`, `mayReconsider`, `getReservedResources` | read-only adapters over mining + SPRC only |

Two of these — relationships and intentions — are **built but barely connected**. They are
framework in shape and not yet in effect.

---

## 2. Per-system audit

Columns follow the requested checklist. "Reusable?" answers: *could a different actor use
this capability without new bespoke code?*

### Sal / SPRC — `sprcOperation.js` (1,347 lines)

| | |
|---|---|
| **Generic action** | procure input · transform input · sell service · schedule project |
| **Actor state read** | `sprc.inventories{raw,produced,reserved}`, `sprc.account`, `sprc.needs/problems/responses`, `operatingPlan`, `serviceCapabilities`, controller `traits` |
| **Capabilities checked** | `matchMaintenanceService()` — craftClass, issueType, repairCapabilities, facilityType, facility online, location/mobility, payer funds, materials available-or-procurable. **The only real precondition checker in the codebase.** |
| **Valuation seam** | `evaluateProcurement` (buy), `evaluateServicePrice` (sell). Both read controller traits; service pricing reads the live relationship projection |
| **Commitment record** | `responses{}` + `procurementOrders{allocations}` + `repairOrders{reserved}`; adapted to `IntentionRecord` read-only |
| **Ledger / projections** | `institution.action`, `institution.offerRepriced`, `sprc.*`; writes cost basis, service cost, **the only relationship write in the world** |
| **Duplicated** | `repriceOpenProcurement` (≈ hub + freight repricers); its own `appendHistory` beside the ledger |
| **Actor-specific** | `getSalActionMessage()` (a Sal-only message formatter inside a system module); `DIRECT_PROCUREMENT`, `SERVICE_REPAIR_RECIPES`, `REFERENCE_UNIT_COSTS`, `REPAIR_LABOR_COST/FACILITY_COST` as module constants rather than institution config; 50 named-actor string literals |
| **Reusable?** | **No.** A second repair shop needs a second copy of this file. Everything that should be config (recipes, labor cost, capabilities, reference prices) is either a module constant or fused to `sprc.*` state paths. |

### Hubs — `hubProcurement.js` + `hubInventory.js` + `populationDemand.js` (production side)

| | |
|---|---|
| **Generic action** | buy input · sell output · set ask price · commission extraction |
| **Actor state read** | `logistics.institutions[id].{inventories, saleReserve, awaitingPickup, finishedGoods, accounts}`, derived `getInventoryPosition` |
| **Capabilities checked** | **None directly.** Mining rights are checked one layer away in `miningOperation.mayPostMiningOrder`. A hub's ability to buy, sell, hold title or produce is never checked — trade rights are seeded but unenforced |
| **Valuation seam** | `evaluateProcurement` (buy) with `BUYER_TRAITS` constant; `evaluateSupplierAsk` (sell) with `SUPPLIER_TRAITS` constant |
| **Commitment record** | `hubProcurement.orders{}` with its own status machine; `accounts.committed`. **Not adapted into `IntentionRecord`** |
| **Ledger / projections** | `procurement.*`, `institution.offerRepriced`, `institution.askShaded`; writes cost basis |
| **Duplicated** | `repriceUnfilledOrders` (≈ SPRC + freight); `SITE_BY_INSTITUTION` and `HUB_NAMES` each duplicated in `contractBoard.js` / `populationDemand.js` |
| **Actor-specific** | `SITE_BY_INSTITUTION` hardcodes exactly three hubs — `postNeeds()` iterates its keys, so **a fourth hub cannot exist without editing this file**. `archetypeId: "trade-hub"` resolves to nothing |
| **Reusable?** | **Partly.** The buy/sell logic is genuinely generic and family-driven. But hubs are not archetype-driven institutions: no controller, no traits, no policy, no capability list. All three behave identically by construction. |

### Miners — `miningOperation.js` (1,006 lines)

| | |
|---|---|
| **Generic action** | select work by expected net value · extract · deliver · hire/release capacity |
| **Actor state read** | `operation.ships{wear,maintenanceStatus,idleSince}`, `allocations`, `depositKnowledge` (a real belief store: confidence + reinforcement), controller `traits`, worker `position` |
| **Capabilities checked** | `canActorDoAction(action:"mine", resourceType)` — the **only** rights enforcement in the game. Worker `capabilities{miningLaser, cargoCollector, tractorField}` exist but are not checked at selection |
| **Valuation seam** | `evaluateMiningJob` — payout − travel − wear − risk, wear priced from live `getServiceCost`. `chooseOrder()` is the **cleanest generic decision in the codebase**: candidates → value → filter acceptable → sort by net value → record reasons |
| **Commitment record** | `allocations{}` + `worker.assignment`; adapted to `IntentionRecord`, non-preemptive |
| **Ledger / projections** | `institution.jobValued`, `mining.*`; writes cost basis and service cost |
| **Duplicated** | fleet hire/release policy is a near-exact twin of the carrier one (same 60s/120s constants, different names) |
| **Actor-specific** | `getSprcMiningOrders()` reaches directly into `state.sprc.procurementOrders` and hardcodes `["copper","silicate","iron-nickel","aluminum"]`. The opportunity set is assembled from exactly two hardcoded sources |
| **Reusable?** | **The selection loop, yes — the opportunity set, no.** Any actor could use `chooseOrder`'s logic, but no actor can *offer* work to a miner without new code in this file. This is the sharpest single blocker in the audit. |

### Haulers / carriers — `logistics.js` (910 lines)

| | |
|---|---|
| **Generic action** | select work by net value · move goods · hire/release capacity · request own maintenance |
| **Actor state read** | `haulers{currentSiteId,status,idleSince}`, ship `wear`, carrier `accounts`, `policies.transportation`, `repairOptions` |
| **Capabilities checked** | `ship.canAcceptRoute()`, route existence, docked-state, maintenance policy, solvency. **No rights check** despite `haul → TRADE` existing in `ACTION_RIGHTS` |
| **Valuation seam** | `evaluateCarrierAsk` → `evaluateSupplierAsk`, costs = travel + amortized wear at live service price. **Reads controller traits correctly** — but no carrier person has a `traits` field, so both always fall back to `CARRIER_DEFAULT_TRAITS` |
| **Commitment record** | `shipments{}` + `hauler.activeShipmentId` + `logistics.responses{}`; **not adapted into `IntentionRecord`**; writes an *inline* intention shape into diagnostics instead |
| **Ledger / projections** | `carrier.*`, `logistics.*`, `institution.freightRepriced`; writes cost basis |
| **Duplicated** | `repriceUnclaimedFreight` (≈ SPRC + hub); fleet policy twin of mining's; a second inline intention representation |
| **Actor-specific** | the `generateCapabilityResponses` call at `logistics.js:397-400` is **ceremonial** — it invents a fake need, a capability with `canAddress: () => true`, and one hardcoded proposal, then takes `[0]`. The real decision was already made 10 lines above by `evaluateTransportPlan` + ask + score sort |
| **Reusable?** | **Yes, nearly.** This is the best-shaped actor after miners. Give the two carrier persons `traits` and they differentiate immediately with zero code change. |

### Populations — `populationDemand.js`

| | |
|---|---|
| **Generic action** | recurring need → buy → consume (the world's only material sink) |
| **Actor state read** | `population.populations{householdCash, needs{backlog}}` |
| **Capabilities checked** | none |
| **Valuation seam** | **none.** `price: 4000` etc. are authored constants. A population can fail to afford but can never judge something overpriced |
| **Commitment record** | `needState.backlog` — a counter, not a record |
| **Ledger / projections** | `population.*`; drives `recordProduction` cost basis |
| **Duplicated** | third copy of `HUB_NAMES`; `reservedForSale()` reimplements `getSaleReserve` to dodge a circular import |
| **Actor-specific** | three hardcoded profiles; `archetypeId: "population"` resolves to nothing |
| **Reusable?** | **No, and arguably shouldn't be** — see §4. But its *prices* should come through the valuation seam. |

### Tavi / Sunward Acre — `farmOperation.js` (113 lines)

| | |
|---|---|
| **Generic action** | procure input · cultivate |
| **Actor state read** | institution `inventories.inputs`, `policies.inventoryTargets`, `accounts`, controller `traits` |
| **Capabilities checked** | one inline capability with `canAddress` gated on a hardcoded `INPUT_PRICES` table |
| **Valuation seam** | **none.** `INPUT_PRICES = { water: 20, seed: 35 }` — unscaled, no cost basis, no `evaluateProcurement` |
| **Commitment record** | `responses{}` + `procurementOrders{}` in the correct shared shape |
| **Ledger / projections** | `institution.action` only; no cost basis, no diagnostics, no blockers |
| **Duplicated** | its own `record()` history path, parallel to hub `emit()` and SPRC `appendHistory()` |
| **Actor-specific** | the `farm` archetype IS defined and IS looked up — Tavi is the **only** actor whose archetype recipes/policy actually resolve besides Sal |
| **Reusable?** | **This is the closest thing to a correct framework actor** — and simultaneously the most economically disconnected. Its orders reach no market, no supplier, no delivery. It is a correctly-shaped actor with nothing to act on. |

### Tow — `towService.js`

Declares `archetypeId: "recovery-service"` with real capabilities and purposeWeights in
`INSTITUTION_ARCHETYPES` — and **never looks them up**. `BASE_NPC_TOW_FEE = 140` sits at
the pre-redenomination tier while hub work pays ~390/unit. No valuation, no cost basis.
**Reusable? No** — but it is one of the smallest files, so converting it is a cheap proof.

### Contracts — `contractManager.js` / `contractBoard.js`

Two parallel notions of agreement. `state.contracts` is player-only: offered → accepted →
fulfilled → paid, driven by player events. NPC work lives in five per-domain order shapes.
`contractBoard.js` normalizes those five into one vocabulary — **but only for display**.
Its own header names the problem: *"Work is offered by five different systems in five
different shapes."* The canonical shape already exists; the deciders just don't read it.

---

## 3. Duplicated or actor-specific logic that should be generalized

Ordered by leverage.

1. **Offer/opportunity assembly** — five bespoke shapes, one read-only normalizer, and
   every actor reading raw records. `miningOperation.getSprcMiningOrders()` is the proof:
   a hardcoded adapter for one named institution.
2. **Bounded/throttled repricing** — three near-identical implementations
   (`sprcOperation:894`, `hubProcurement:637`, `logistics:219`): same algorithm (unfilled →
   move toward counterparty's number → cap at a multiple of the opening price → gate on
   funding → log with reasons), three state shapes, three event paths. The new seller
   concession makes a fourth pricing loop that only hubs have.
3. **Fleet hire/release policy** — `miningOperation` and `logistics` twins, same 60s/120s
   constants under different names, same guards (never release loaded, never empty, hard cap).
4. **Commitment representation** — three: `intentions.js` adapters (mining + SPRC),
   `diagnostics.intention` inline objects (logistics, mining), and the per-domain records
   themselves. Hubs and carriers appear in none of the adapters. Every new system adds a fourth.
5. **Actor traits** — 4 of 7 evaluator sites use module constants (`BUYER_TRAITS`,
   `SUPPLIER_TRAITS`, `HUB_TRAITS`, `CARRIER_DEFAULT_TRAITS`, plus an inline literal at
   `logistics:745`). These are per-actor config wearing a `const`.
6. **Price constants outside the scale dial** — `REPAIR_LABOR_COST 700`,
   `REPAIR_FACILITY_COST 350`, `MILL_CONVERSION_COST 120`, `BASE_NPC_TOW_FEE 140`,
   `MINING_SERVICE_PRICE 2200`, `HIRE_COST 3500`, `HAULER_COST 6000`. Two are visibly at
   the wrong tier after the 10× redenomination — the direct cost of per-module pricing.
7. **Institution identity tables** — `HUB_NAMES` ×3, `SITE_BY_INSTITUTION` ×2. And
   `SITE_BY_INSTITUTION` is *load-bearing*: `postNeeds()` iterates its keys, so the hub
   roster is defined by a constant in a system module.
8. **History/logging paths** — `appendHistory` (SPRC, logistics), `record` (farm, mining),
   `emit` (hubs, populations). Four ways to say the same thing beside the ledger.
9. **Actor-specific presentation in system modules** — `getSalActionMessage()`.

---

## 4. Genuinely domain-specific — keep specialized

Do not generalize these; the differences are real, not accidental.

- **Physical execution.** Mining (approach deposit → extract → haul to buyer) and freight
  (dock → load → route → unload) are different physics. They should share *contract and
  commitment* concepts, which is exactly what the user asked for — not execution.
- **`transportationPlanning.js` / route + corridor model.** Genuinely transport-specific.
- **Field/terrain systems** (`asteroidField`, `resourceField`, `lifeField`, `claimField`,
  `worldTerrain`, `driftMouthField`, `threadwyrmField`) — world simulation, not actors.
- **`processor.js`, ship entities, scanner, audio** — player-facing mechanics.
- **`missionRunner` / `missionRules` / `journeyDirector`** — authored narrative. The
  Live-demand-vs-Scripted split on the job board is the correct boundary; keep it.
- **Populations as non-negotiating consumers.** A *design* choice worth keeping: they are
  the demand floor and the material sink. Give them valuation for *price* (so they can
  judge something overpriced and abstain) but they should not need goals or plans.
- **`eventLedger` / `eventRetention`** — correctly generic already.
- **`worldRecords` / `legalRecords` / `authorityRegistry`** — the substrate. Generic, just
  under-consumed.

---

## 5. The smallest refactor that makes one capability reusable

**Make "offer extraction work" a capability any actor can exercise, instead of a hardcoded
list inside the miner.**

Today, `miningOperation.chooseOrder()` builds its world from exactly two sources:

```js
const candidates = [...getSprcMiningOrders(), ...getAvailableStandingOrders()];
```

`getSprcMiningOrders()` reads `state.sprc.procurementOrders` by name and hardcodes the
material list. `getAvailableStandingOrders()` reads hub `postedOrders`. For Tavi — or a
fourth hub, or the player — to hire a miner, someone must edit `miningOperation.js`.

**The change:**

1. Define one `ExtractionOffer` shape — `{ id, issuerInstitutionId, siteId, resourceId,
   amount, paymentPerUnit, equivalence?, fundedThrough }`. Both existing adapters already
   produce ~90% of this.
2. Add `listExtractionOffers(state)`: a single function that collects offers from any
   institution exposing them, rather than from two named systems. Keep the two current
   adapters as the first two *contributors* — no behaviour change, no test churn.
3. Point `chooseOrder()` at `listExtractionOffers()` only. `valueOrderForWorker` already
   branches on `order.kind`; that branch becomes a property of the offer (`harvestTarget`,
   `surplusSellable`) instead of a name check.

**Why this one:** it is contained (~40 lines plus two call sites, one module), it changes
no economics, it is fully covered by existing mining tests, and it converts the single
hardest "another actor can't do this" case in the audit into a data write. After it, Tavi
posting *"Sunward Acre needs 6 water-ice at 320 cr"* requires no code in the mining system
— which is precisely the target the user stated.

**Do this data edit in the same pass** (zero refactor, immediate payoff): give the two
carrier persons and the three hubs real `traits`. The carrier seam already reads
`institutions[controllerInstitutionId].traits`; the field is simply absent. Three hubs plus
two carriers stop behaving identically for the cost of five object literals — the cheapest
possible demonstration that differences can emerge from configuration.

> **Implemented.** `actorConfig.js` resolves an actor id across all six state shapes and
> answers `getActorTraits` / `getControllerId` / `getActorAccount`. The three hubs gained
> quartermasters (Bex Ordell, Hale Sunder, Ivry Nakash), the two carrier operators and Ivo
> Cinder gained traits, and all five trait constants (`BUYER_TRAITS`, `SUPPLIER_TRAITS`,
> `HUB_TRAITS`, `CARRIER_DEFAULT_TRAITS`, one inline literal) became fallbacks behind the
> lookup. The Ledge now outbids Yard Exchange on the same shortage, and Dara Quill quotes
> a run differently from Mara Venn, with no per-actor code on either path.
>
> One test had to be rewritten rather than retuned, and the reason is worth keeping: the
> concession fixture assumed a single hub bid, so when the hubs stopped bidding alike, one
> buyer bid up, won the ore, filled the seller's book, and correctly ended the discount.
> Isolating "the seller closed this" now requires pinning *every* buyer at its ceiling.
> The fixture was wrong, not the behaviour — but it only became wrong once actors differed.

---

## 6. Order for the missing deliberative layer

The July inventory proposed motivations → goals → intentions → planning. **That order
should change.** Motivations and goals are speculative until there is one commitment
record and one opportunity surface to aim them at; and the cost of *not* unifying
commitment is compounding — it went from two representations to three while the hub
economy was built, and hubs and carriers are in none of the adapters.

| Step | State |
|---|---|
| 0. Actor registry + config | **Done for live actors** — `actorConfig.js` resolves actors, controllers, traits, accounts and protected cash; `inspectActor` routed through it; coverage tests assert every seeded actor resolves |
| 1. Intentions authoritative | **Adapters complete** — every committing system is covered and both duplicate shapes retired; domains still own the records |
| 2. `canPerform` | Not started |
| 3. Offer surface | **First slice done** for extraction (§5); freight, repair and purchase offers still bespoke |
| 4. Motivations | Not started |
| 5. Goals | Not started |
| 6. Planning | Not started |

**Proving slice passed.** Nell Winch was converted through configuration alone
(`2c951e5`) — the cost model to the `recovery-service` archetype, the margin to her
traits, the terms to a relationship projection, the upkeep to cost basis. No
tow-specific pricing survives in `towService.js`. Recovery stopped being the cheapest
thing in the world in the process: Yard→Scrap 163 → 492, Yard→Ledge 241 → 1360.

The slice also justified itself as a *test*: `actorConfig` was reading
`state.towService` when the state key is `state.towing`, so every tow lookup missed
and `getActorTraits` returned the framework default. Nothing failed — Nell simply
quoted with nobody's temperament. **A missing actor and an actor with no traits are
indistinguishable at the call site**, which is why two coverage tests now assert that
every seeded actor resolves and that everything which prices, bids or quotes has a
temperament of its own. Expect this failure mode again wherever a lookup has a
plausible default.

Recommended order, each step justified by what it unblocks:

**0. Actor registry + configuration surface** *(prerequisite, mostly data)*
One place to ask "what is this actor and what does it have": traits, assets, facilities,
rights, skills, knowledge, inventory, cash, condition, relationships. Today `inspectActor`
tries three state shapes and special-cases `controllerId === "sprc"` to find a bank
balance — the read side already proves the write side has no substrate. Fold the 10
dangling `archetypeId`s into real archetypes while doing it. *Unblocks: everything.*

**1. Intentions become authoritative, not adapters**
Have hubs, carriers, populations and the farm write `IntentionRecord`s directly; retire
`diagnostics.intention` in favour of a reference. *Unblocks: reconsideration, preemption,
"what is this actor committed to" as one question. Stops the divergence now.*

> **Implemented, adapter half.** `adaptHubPurchase`, `adaptHubSale` and
> `adaptShipment` close the coverage gap, and both inline `diagnostics.intention`
> shapes now hold the shared record. A purchase order adapts to *two* intentions,
> because it binds two actors differently: the buyer from the moment it commits
> money and still revisable (it reprices and reopens declined orders), the
> supplier only once it has agreed to dig and then fixed — it shades its ask on
> the next order, never this one. Allocations gained `resourceId`,
> `destinationSiteName` and `contractId`, which a commitment should always have
> carried; without them the adapter had to reach back into the offer.
>
> **Still open:** domains remain authoritative and the adapters are read-only, so
> nothing yet *acts* on `mayReconsider`. Populations and the farm are unadapted —
> a population holds a backlog counter rather than a commitment, and the farm's
> orders reach no market. SPRC's customer-side service commitment has no record.

**2. `canPerform(action, actor, target, context)`**
Generalize `matchMaintenanceService`'s five checks (capability / facility / location+mobility
/ payer funds / materials) into declarative requirement types, and fold `canActorDoAction`
in as the rights requirement. Then extend rights enforcement past mining to `haul`, `sell`,
`repair`, `tow` — the vocabulary already exists. *Unblocks: goals, which are meaningless
without feasibility. Also the point where skills enter as one more requirement type.*

**3. Offer surface**
Promote `contractBoard` from read-only projection to the thing actors actually select from
(§5 is the first slice of this). *Unblocks: any actor offering work to any other; also
collapses the three repricers, since repricing becomes a property of an offer.*

**4. Motivations**
Promote `purposeWeights` into first-class standing drives with trait-derived weights. Cheap
— the vocabulary is already authored in `INSTITUTION_ARCHETYPES.defaultPolicy`. *Unblocks:
ranking across unlike goals.*

**5. Goals**
Only now, because a goal is *motivation + offer + feasible action + commitment* — and
steps 1–4 supply all four. Templates instantiated into records with subject, target,
deadline, value estimate.

**6. Planning (multi-step)**
Last, and only where a single action demonstrably cannot express the work. Most current
behaviour is single-step; do not build a planner before something needs one.

**Suggested proving slice for steps 0–2:** convert `towService.js` — the smallest actor
file, with a defined-but-unused archetype, a constant price at the wrong scale, and no
valuation. If Nell Winch can be made a recovery-oriented actor purely through
configuration, the framework works. If it still needs a bespoke module, it doesn't.

---

## 6b. Latent defects found while implementing

The first two were reported before being fixed, because both change economy
behaviour and that was the user's call rather than a refactor's.

> **1 and 2 are now fixed** — `2d580d2` and `2c951e5`. Urgency: the vocabulary is
> exported so a call site names a level instead of spelling one, `urgencyFromCoverage`
> grades it from the shortage so hubs and miners share one definition of "thin", and an
> unrecognised level still prices as routine but says so in the reasons. Measured over
> 20 simulated minutes: mean accepted price 300 → 331, first quarter 313 → **436**, last
> quarter unchanged at 294 — hubs pay up only while genuinely empty. The tow fee was
> fixed as part of the Nell conversion; `MILL_CONVERSION_COST` (120) remains.

1. **`urgency: "critical"` does nothing.** `hubProcurement.postNeeds` and
   `miningOperation.getPostedMiningOrders` both pass `urgency: position.onHand === 0
   ? "critical" : "routine"`, but `URGENCY_BASE` in `valuation.js` only defines
   `routine | urgent | emergency`. An unknown key falls back to `routine`, whose base
   is `1`, so `urgencyFactor` returns exactly 1 no matter what. **The entire
   empty-shelf urgency path is inert, and `urgencyBias` has never affected a hub's
   bid.** Fixing it means changing `"critical"` to `"emergency"`, which raises hub
   prices whenever a shelf hits zero — a real economy change that wants measuring.
2. **`BASE_NPC_TOW_FEE = 140` and `MILL_CONVERSION_COST = 120` are at the
   pre-redenomination tier** while `REPAIR_LABOR_COST = 700` and the rest are 10×.
   The redenomination reached one dial (`getResourceTradeValue`) and nine constants
   by hand; these two were missed. See §3 item 6.

Also removed in passing, as genuinely dead rather than behavioural: `nextOrderIndex`
was written on every mining assignment and never read, and its
`STANDING_MINING_ORDERS.indexOf(order)` could only ever return `-1`, since `order`
had been a spread copy since orders became derived.

## 6c. Ready for doubling — checklist and findings

The distinction throughout: **does adding an actor require editing logic, or only
adding data?**

| Statement | State |
|---|---|
| A new hub can be seeded without editing procurement logic | **Yes** — `listSettlementIds` derives the roster from archetype `offerTypes`. Verified: a fourth settlement is recognised, priced and floated from data alone |
| A new controller's traits automatically affect its bids | **Yes** — verified end to end |
| A new mining operation can publish and consume extraction offers unnamed | **Yes** — registered sources, verified with a third issuer |
| A new recovery actor can quote through the archetype using only configuration | **Yes** — the cost model is on `recovery-service` |
| Protected cash can differ by actor without adding constants | **Yes** — four layers, one resolver, three constants retired |
| `inspectActor` reveals when a fallback is used | **Yes** — `resolution` reports source and reason per field |
| Public choice functions can be called without mutating the world | **Yes** — `chooseOrder` / `listOffers` locked by test |
| No mutable registry lives at module scope | **Yes** for the offer registry; see the standing rule in `extractionOffers.js` |
| All active actors resolve to configured controllers and defined archetypes | **Yes** — asserted by coverage tests over all nine deciding actors |

### Classified findings

**Must fix before doubling — DONE this session**
- `hubProcurement.SITE_BY_INSTITUTION` — its *keys were iterated* to decide who posts
  purchase orders, so the hub roster was literally a constant in a system module.
  Now `listSettlementIds(state)`.
- Three copies of `HUB_NAMES` and two of `SITE_BY_INSTITUTION` (hubProcurement,
  contractBoard, populationDemand). All now read `name` / `siteId` off the record.
- `contractBoard.actorLabel` / `siteOf` took an id and consulted a hardcoded table;
  they now take `state` and read the record.

**Will naturally break during doubling — leave, and let it fail loudly**
- `STANDING_MINING_ORDERS` is one row per settlement that mines. A fourth mining
  settlement needs a row; it is identity data, and its absence is obvious.
- `INSTITUTION_MINING_RIGHTS` in `authoritySeeds.js` — same shape, same reasoning.
- `FIRST_REACH_TRANSPORT_CONNECTIONS` — a new site needs lanes, and a missing lane
  already surfaces as `no-known-recovery-route` / `no-route-to-destination`.

**Intentional world configuration — not a defect**
- `POPULATION_PROFILES` and `POPULATION_NEEDS`. A population IS its profile; this
  table is the configuration, not a hardcoding of it.
- **But note the seam:** a settlement's *demand* comes from `POPULATION_PROFILES`,
  which is compile-time. The fourth settlement above was fully recognised and posted
  **nothing**, correctly, because it has no population. Seeding a working settlement
  therefore touches four places: the logistics institution, its controller, a
  population profile, and mining rights. **The one thing worth building before the
  doubling proper is a single settlement seed record that emits all four.**

**Intended behaviour, documented so nobody "fixes" it**
- **A carrier that cannot afford recovery stays stranded.** Recovery is now priced
  against real distance, so a poor carrier far from help may not be able to pay.
  *Guaranteed recovery is not an invariant.* Do not lower an expensive lane's price
  or add an automatic bailout — that removes the only consequence distance currently
  has. Permanent ship loss, wrecks, salvage rights, insurance and replacement are a
  later slice. What was fixed is only the noise: a stranded carrier now holds **one**
  blocked record with an attempt count and logs once, rather than minting a new
  record and ledger line every time it calls for help.

**Safe to leave**
- `state.towing` / `state.sprc` as singleton keys. A second recovery firm or repair
  co-op needs the state shape to become a map, which is a real refactor — but nothing
  today pretends otherwise, and both resolve through `actorConfig` already.
- `REPAIR_SITE_ID` in `towService` — one repair destination is a world fact today,
  and `repairOptions` on the carrier is the existing generalisation point.

## 7. Answering the framing question directly

> Is the economy serving the procedural NPC framework, or replacing it?

**Serving it — but drifting.** Every economy feature since the valuation slice has reused
the shared evaluators, the cost-basis projection and the diagnostics layer; none of them
reinvented pricing or explanation. That is real convergence and it held under pressure.

The drift is that each new feature also added: one more commitment shape, one more traits
constant, one more repricer, one more logging path, one more name in a hardcoded table.
None is individually wrong; together they are why `SITE_BY_INSTITUTION` now decides how
many hubs the world can have.

The seller-concession work just completed is a fair example of both halves. It correctly
extended the shared `evaluateSupplierAsk` with a `concession` parameter that any seller can
use — and it added `SUPPLIER_TRAITS` as the fourth traits constant and a fourth pricing
loop that only hubs have. **Pausing here is the right call.**
