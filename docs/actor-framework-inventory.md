# Actor & Institution Framework — Architectural Inventory

Investigation only (2026-07-28). No implementation. Maps the proposed shared
actor-and-institution framework against what the codebase already has, so we
build the smallest set of *missing* pieces rather than reinventing existing ones.

Verdict up front: **roughly 60% of the framework already exists**, mostly under
different names and mostly scoped to institutions rather than actors generally.
The genuinely absent layer is the **deliberative middle**: motivations → goal
templates → candidate actions → committed intention. Everything before it
(traits, policy, needs, assets, authority, capability) and after it (contracts,
services, ledger, relationships) is present in some form.

---

## 1. Inventory by concept

| # | Concept | Status | Where it lives | Current terminology |
|---|---|---|---|---|
| 1 | Actor/institution traits | **Exists** | `content/institutions/institutionInstances.js` | `traits: { caution, growthBias, urgencyBias }` on person-archetype instances (Sal, Tavi) |
| 2 | Institutional policies | **Exists** | `institutionArchetypes.js` (`defaultPolicy`), instance `policies`, `institutionDecision.js` | `defaultPolicy`, `policies`, `resolveInstitutionPolicy`, `createPolicyRecord` |
| 3 | Needs / operational pressures | **Exists (strong)** | `institutionDecision.js`, `sprcOperation.js` | `createNeedRecord`, `deriveInventoryNeeds`, `reconcileNeeds`, `createProblemRecord`; `kind: inventory-reserve \| blocked-activity-input`; `urgency: routine\|urgent\|emergency` |
| 4 | Motivations | **Absent** (proxied) | — | Nearest proxies: policy `purposeWeights` (e.g. `restore-operating-reserve`, `complete-accepted-service`, `growth`) and need `purpose`. These are *scoring weights on derived needs*, not standing drives. |
| 5 | Goal generation | **Absent** | — | Responses are generated per-need by capability `propose()`, never as durable multi-step goals. No goal templates, no goal records. |
| 6 | Intentions / commitments | **Partial** | `miningOperation.js` (`allocations`, `worker.assignment`), `sprcOperation.js` (`responses`, orders), `logistics.js` (`activeShipmentId`) | `allocation`, `assignment`, `response.status`, `activeShipmentId`. Real commitment semantics exist per-domain (a worker holds an assignment until delivery) but there is **no shared intention record**, and no shared "reconsider on material change" rule (only `shouldReconsiderResponse` for blocked responses). |
| 7 | Skills | **Absent** | — | Nothing models actor competence. `repairCapabilities` are *institutional* service capabilities, not personal skill. |
| 8 | Assets & ownership | **Exists** | `worldRecords.js`, `hulls.js`, `accounts.js`, institution `inventories` | `entities{type:asset, assetType}`, `OWNS`/`CONTROLS`/`COLLATERALIZES` relationships, `accounts.operating{balance, committed}`, `inventories{raw, produced, reserved}` |
| 9 | Authority | **Exists (strong)** | `authorityModel.js`, `authorityRegistry.js`, `ruleChecker.js`, `authoritySeeds.js` | `POWER_TYPES`, `RIGHT_TYPES`, `ACTION_RIGHTS`/`ACTION_POWERS`, `authorityGrants`, `actorHasPower`, `canActorDoAction`, `limitsAllowAction`. Also coarse per-person flags: Sal's `authority: { mayProcure, mayScheduleProduction, mayFundProjects }` |
| 10 | Operational capabilities | **Exists** | `institutionArchetypes.js`, instance `serviceCapabilities`, worker records | Archetype `capabilities: ["procure-input","transform-input",...]`; `serviceCapabilities[{craftClasses, issueTypes, repairCapabilities, facilityType, servicePrice}]`; worker `capabilities: {miningLaser, cargoCollector, tractorField}` |
| 11 | Services | **Exists (as matchable action)** | `maintenanceService.js`, `hubServices.js`, `content/hubs/*` | `matchMaintenanceService()` — **this is the closest thing in the codebase to a general action-precondition checker.** It already validates capability match, facility compatibility, location/mobility, payer affordability, and material availability-or-procurability, returning `{eligible, reason, capability, facility, unavailable}`. Player-facing `hubServiceDefinitions` are a separate, UI-oriented notion of "service". |
| 12 | Contracts | **Exists (strong)** | `contractManager.js`, `contractRules.js`, `content/contracts/*`, generated archetypes (`surveyContracts`, `bountyContracts`, `cargoContracts`) | `registerContractDefinition`, lifecycle offered→accepted→fulfilled→paid, `terms`, `reward`, `clauses`, `requires[{type:"dockAt"}]`. Player-centric fulfillment, but definitions are data and NPC-issued orders already mint contracts. |
| 13 | Actions & plans | **Partial / fragmented** | `authorityModel.ACTION_RIGHTS` (action vocabulary), capability `propose()`, `maintenanceService` (preconditions) | An action *vocabulary* exists (`mine`, `haul`, `dock`, `repair`, `sell`, `seize`, `tow`…) used only for rights checks. There is **no action definition schema** (preconditions/effects/cost/duration) and **no multi-step plan** structure. Recipes (`inputs/outputs/durationSeconds`) are the closest thing to an action-with-effects. |
| 14 | Ledger events | **Exists (strong)** | `eventLedger.js` (694 lines) | `recordEvent(type, payload, {visible})`, `stats`, `signals`, `getEventsAfterId` (cursor-based consumption — `lastLedgerEventId` per operation). Institutions also keep private `history` arrays (`appendHistory`). |
| 15 | Relationships & reputation | **Partial** | `worldRecords.relationships`, `entityRegistry.js`, `sprcOperation` | Structural relationships (OWNS/HELD_BY/ISSUED_BY/CONTROLS) are solid. **Affective** relationship is minimal: `entityRegistry.rememberRegistrySubject({status, disposition, seenCount, firstSeenAt, lastSeenAt})` (a real "who knows whom" projection, written at few call sites) and a single scalar `sprc.actor.relationship.playerReliability` incremented on player delivery. No trust/gratitude/resentment/reputation model. |
| 16 | Beliefs / actor knowledge | **Partial** | `miningOperation.depositKnowledge`, `entityRegistry` | `depositKnowledge{id, resourceId, x, y, source, confidence, successfulSelections}` — a genuine belief store **with confidence and reinforcement**, but mining-specific. Registries are the other knowledge store. No general belief schema, and no notion of an actor *not* knowing a price/opportunity. |

### Cross-cutting observations

- **Policy vs. traits separation already exists** and matches the requested design: `resolveInstitutionPolicy({archetypePolicy, institutionPolicy, controllerModifiers})` layers them, and `scoreResponse({policy, controllerTraits})` reads them as separate inputs. This is the pattern to extend, not replace.
- **The decision pipeline exists but stops early.** `institutionDecision.js` runs: needs/problems → capability `propose()` → `scoreResponse` (priority) → `evaluateAffordability` → `shouldReconsiderResponse`. It produces **priority-ranked proposals**, never *prices* and never *plans*.
- **Cursor-based event consumption is already the norm** (`lastLedgerEventId`), so the "don't rescan the ledger" requirement is already honored architecturally — but the compact projections those events should update (trust, cost basis, reliability) mostly don't exist yet.
- **Everything is institution-shaped, not actor-shaped.** Persons (Sal, Tavi) exist only as *controllers* of institutions, with traits+authority but no assets, skills, location, or independent decision loop. Generalizing "actor" is the main structural lift.

---

## 2. What can be generalized (reuse, don't rebuild)

| Existing thing | Generalize into |
|---|---|
| `matchMaintenanceService()` | **`canPerform(action, actor, target, context)`** — the general action-feasibility checker. Its five checks (capability / facility / location+mobility / payer funds / materials) are already the right shape; strip the repair nouns and make them declarative requirement types. |
| Archetype `recipes` (`inputs→outputs, durationSeconds`) | **Action/service effects**: resource consumption, duration, produced outputs. |
| `institutionDecision` need→propose→score→afford | The **candidate-generation + selection** stage of the loop; insert valuation between `propose` and selection. |
| `resolveInstitutionPolicy` + `scoreResponse(controllerTraits)` | The policy/trait layering for **all** valuation, not just priority. |
| `depositKnowledge` (confidence + reinforcement) | The general **belief record** shape (`subject, value, confidence, source, lastConfirmedAt`). |
| `entityRegistry.rememberRegistrySubject` | The general **relationship projection** store (add trust/reliability/gratitude/resentment fields + `significantEventIds` back-references). |
| Contract definitions + generated archetypes | Already the **offer/opportunity** vocabulary; goals can target them. |
| `worldRecords` entities/relationships | Already the **actor + ownership substrate**; persons need to become first-class holders of assets/skills. |

---

## 3. Missing schemas (the actual new work)

Minimum viable set, in dependency order:

1. **`ValuationResult`** — the standard return shape:
   `{ acceptable, affordable, recommendedPrice, minAcceptablePrice, maxAcceptablePrice, decision, reasons[] }`.
   Action-specific *evaluators* feed it different inputs (procurement: urgency/scarcity/on-hand/incoming/substitutes/cash; mining-freight: payment/distance/time/risk/wear/maintenance/opportunity cost; repair: materials/replacement cost/freight/labor/facility/margin). **Shared framework, not one identical equation** — one module, several evaluator functions, common inputs (policy, traits, relationships, circumstances) and common output.
2. **`MotivationDefinition`** — standing drives per actor archetype (e.g. `earn-operating-income`, `protect-service-commitments`, `grow-capacity`, `avoid-ruin`), with trait-derived weights. Largely a promotion of today's `purposeWeights` into first-class, authored vocabulary.
3. **`GoalTemplate` + `GoalRecord`** — authored templates (`when need X and opportunity Y exist, a candidate goal is Z`) instantiated into concrete goals with subject, target, deadline, and value estimate.
4. **`ActionDefinition`** — declarative `{ id, requires[], consumes{}, produces{}, durationSeconds, rightType, effects[] }`, with `requires` reusing the requirement types abstracted from `matchMaintenanceService`.
5. **`IntentionRecord`** — the shared commitment: `{ actorId, goalId, planSteps[], status, committedAt, reconsiderWhen[], abandonReason }`. Commitment persists until completion/failure/infeasibility/material change (`reconsiderWhen` already has precedent in `createResponseRecord`).
6. **`SkillSet`** (thin at first) — `{ skillId: level }` on actors; consumed by `canPerform` requirements and by service quality/duration. Can start as a stub that always passes for existing NPCs.
7. **Relationship projections** — extend registry subjects with `{ trust, reliability, gratitude, resentment, dealCount, lastOutcome, significantEventIds[] }`, updated from ledger events, **never** by rescanning the ledger.
8. **`CostBasis` projection** — per-institution, per-item actual acquisition cost (weighted average + last paid), written on procurement completion. This is what makes repair pricing "cost + margin" real rather than a constant, and it is the linchpin of cost pass-through.

Deliberately **not** in the minimum set: careers, training, loans/credit issuance, hub acquisition, ownership expansion, deception/claimed-condition, autonomous goal invention.

---

## 4. Where the valuation result fits in the larger loop

```
traits + policy ─────────────┐
                             ▼
current state ──► NEEDS / opportunities (exists: institutionDecision)
                             │
        motivations + goal templates (MISSING)
                             ▼
                     candidate GOALS (MISSING)
                             │
   skills, assets, authority, resources, location, operational state
        └─► canPerform() feasibility filter  (generalize matchMaintenanceService)
                             ▼
                  viable ACTIONS / services / contracts
                             │
                    ***VALUATION*** ◄── traits, policy, relationships, circumstances
                    returns {acceptable, affordable, recommendedPrice,
                             min/max, decision, reasons}
                             ▼
                    chosen INTENTION (MISSING) — commitment held until
                    completion / failure / infeasibility / material change
                             ▼
                        execution → LEDGER EVENTS (exists)
                             ▼
        compact PROJECTIONS: cash, assets, skills, beliefs, trust,
        reputation, cost basis, contractual history (mostly MISSING)
                             └────────► feeds back into state & future valuation
```

**Valuation is the selection stage** — it sits *after* feasibility filtering and *before* commitment. It is consulted twice per transaction: once by the buyer (willingness to pay) and once by the seller (ask price); a deal clears when WTP ≥ ask. Cost pass-through is emergent because each seller's ask reads its own `CostBasis` projection.

---

## 5. Narrowest vertical slice (recommended)

**"SPRC buys a material and sells a repair, with inspectable numbers."**

End-to-end path to prove, reusing existing machinery wherever possible:

1. SPRC detects a material need — *exists* (`assessOpenRepairs` / `createOrUpdateNeed`).
2. Sal evaluates procurement → **new** `evaluateProcurement()` returns a `ValuationResult` (WTP from urgency × scarcity × traits, bounded by `evaluateAffordability`, netting on-hand + reserved + **incoming**). Replaces the constant `directMaterial.price ?? 34`.
3. Batch sizing improved so one meaningful order is posted instead of repeated tiny ones — *tune existing* `procurementBatchSizes` + demand aggregation across needs.
4. Contract created — *exists* (`createProcurementOrder` → `registerContractDefinition`).
5. Miner selects it by **expected net value** (payout − travel/time/wear/opportunity) → **new** `evaluateMiningJob()`; **removes the hardcoded 1000/800 priority constant** only at this point.
6. Material + payment transfer — *exists* (`deliverMaterial`, allocations, accounts).
7. **New**: write `CostBasis` on completion (actual acquisition cost per item).
8. Sal performs the repair service — *exists* (`matchMaintenanceService` → berth → `completeDueRepairs`), but **price becomes `costBasis + margin(traits/policy)`** instead of the flat 180/220.
9. Customer pays — *exists* (service revenue transfer).
10. Ledger events — *exists*; add valuation-decision events carrying `reasons[]` so every price change is inspectable.
11. Relationship + cost-basis projections update — **new**, from those events via the existing cursor pattern.

This proves: shared valuation used by **two different actors** (buyer Sal, seller Sal) and **two different action types** (procure, service); trait/policy separation; cost pass-through; inspectable reasons. It does **not** require goals, intentions, skills, or plans — those can be introduced in the following slice, with valuation already in place as the selection stage.

**Deferred to slice 2:** motivations/goal templates/intention records (the deliberative middle), skills, hauler freight pricing (cost pass-through's third link).

---

## 6. Throughput constraints to honor (from the corrected diagnosis)

- Existing mining assignments stay **non-preemptive** for now — a worker keeps its assignment until delivery.
- The hardcoded SPRC-first priority constant (`emergency 1000 / else 800` in `miningOperation.getSprcMiningOrders`) is removed **only when** net-value valuation is ready to replace it.
- SPRC batch sizing improved so important needs aren't supplied through repeated tiny requests (currently `MINING_ALLOCATION_SIZE = 6` equivalents per allocation, `procurementBatchSizes {copper: 3, silicate: 6}`).
- Urgent SPRC work should attract the **next available** miner through inspectable valuation, not an unexplained constant.

---

## 7. Performance rules (agreed)

- Never evaluate per-frame. Evaluate on **events** or **staggered planning intervals** (institutions already tick on their own `update()` cadence and consume the ledger by cursor).
- **Cache** valuation results; invalidate on material input change (price, stock, cash, urgency, relationship).
- Show each actor a **relevant shortlist** of contracts/opportunities, not the global set.
- Ledger stays the durable record; routine decisions read **projections**, with `significantEventIds` back-references for explanations.
