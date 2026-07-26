# Scrap Porch Recovery Cooperative

SPRC is the first persistent institution whose work, rather than a job table, creates material demand. Sal is also represented as a person-archetype institution that controls SPRC, avoiding a separate actor category.

## Reusable institution seam

- `institutionDecision.js` contains the domain-neutral record constructors, policy resolution, capability response generation, priority scoring, affordability checks, reconsideration predicate, and inventory-target need derivation.
- Institution archetypes contain capabilities, default policy, and recipes. Institution instances contain ownership/control, accounts, inventories, local policy, projects, and authored identity.
- SPRC-specific execution remains in `sprcOperation.js`: repairs, mill scheduling, procurement contracts, dialogue, fixtures, Mara, and Porch Runner Two.
- `farmOperation.js` is the first transfer probe. Its water and seed shortages use the same record, capability, scoring, affordability, reserve-target, and need-reconciliation logic without adding agricultural nouns to the shared engine. Affordable responses commit cash and create purchase orders; resolved needs cancel those orders and release their commitments.
- Person institutions control operation institutions through `controllerInstitutionId`. Sal controls SPRC and Tavi controls Sunward Acre; both controller records supply traits and authority.
- Meaningful Sal and Tavi state changes are also published as named `institution.action` ledger events. Their private histories remain the detailed record; routine assessment ticks do not create duplicate public entries.
- Protected cash is policy-owned. SPRC retains `account.protectedReserve` only as a synchronized compatibility mirror for existing UI and saves.
- A source guard test rejects authored domain nouns in the shared engine.

## Current vertical slice

- Sal is the player-facing factor for the cooperative.
- The Maw is a visible recovery mill at Scrap Porch.
- Berth Two is one visible repair berth.
- Porch Runner Two, piloted by Mara Venn, is the first repair customer.
- Repair eligibility is now public capability matching rather than a list of recognized ship IDs. Freight haulers and Cinder mining craft use the same facility, condition, capability, mobility, payer, affordability, and material checks.
- Working haulers accumulate persistent wear. Crossing a wear threshold emits a hull-fatigue, control-fault, or maneuvering-strain issue; careful flying increases maneuvering strain rather than providing free acceleration.
- Sal now operates from a persistent plan before that repair occurs: eight structural-feedstock equivalents, three hull plates, two machine parts, two projected repairs of coverage, and a 900-credit protected cash reserve.
- Routine reserve replenishment is distinct from emergency blocked-repair procurement. If Mara arrives while a reserve order is open, Sal promotes that funded order instead of emitting a duplicate.
- The second repair cradle exists as a persistent planned project with material and cash requirements, subordinate to service safety stock and protected cash.
- The repair reserves one on-hand hull plate and one machine part, then calculates the missing plate stock.
- The Maw requires four structural-feedstock equivalents and water ice to produce a two-plate batch.
- Iron-nickel contributes one equivalent per cargo unit; aluminum contributes two. The procurement order requests the outcome, not a profession.
- A finite Yard Exchange raw-stock inventory enables purchase-and-haul. Existing mining and previously held cargo use the same delivery path.
- Procurement payment is debited from SPRC and credited to the player. Repair revenue is transferred from the serviced carrier's operating account when the repair completes.
- Contract payment is committed when an order is posted, unavailable to other decisions, transferred on completion, and released on expiry. Orders are blocked when funding them would cross the protected reserve.
- Procurement orders have a 45-minute base deadline and bounded extensions while an institutional allocation is physically in transit. Rejected delivery preserves cargo and assignment; accepted partial units are paid and conserved.
- Sal checks real Scrap Porch supply inventory for structural material and copper before publishing external procurement. Miners can sell genuine surplus into that inventory, closing the first local wholesale loop.
- Active operational orders appear under **Local Needs** on the Scrap Porch work board, separate from procedural odd jobs.
- Production consumes reserved raw inputs only when it starts and creates output only when its timer completes.
- Repair consumes reserved output, restores the named hauler to availability, and returns it to the standing-freight pool. Issue type selects a distinct plate-and-part recipe.

## Causal record chain

`repair order -> material need -> selected response -> procurement order -> contract/document -> cargo transfer -> production order -> repair completion`

Every procurement order retains the IDs of the repair, need, and response that caused it. History records retain inventory reservations, consumption, production, payment, and repair outcomes.

## Documentation and inspection

Accepting a procurement order issues an open cargo manifest. The manifest documents custody and destination but explicitly grants no extraction or salvage authority. Purchased cargo receives a receipt tied to its cargo metadata. Patrol paperwork reports compare current cargo custody with active manifests and source evidence; undeclared cargo or an unestablished source can flag an inspection.

## Persistence

`state.sprc` is saved with the profile. It includes accounts, inventories, reservations, facilities, repair and production orders, needs, responses, procurement orders, the hauler's operational record, relationship state, counters, and history. Completion checks are status-based so loading cannot repeat payment or duplicate production.

## Deliberate bounded seams

- Renewable source units make the two pilot commodities inexhaustible, but each shipment still creates, transfers, and delivers one conserved container.
- Dispatch selects the first eligible standing offer at the hauler's current site; it is not a route optimizer or price market.
- Local market competition, confiscation, mill faults, and competing carriers are structurally possible but not yet simulated.
- The shared layer intentionally stops short of a universal planner. SPRC and the farm prove only the smallest reusable decision seams; domain execution remains capability-owned.

## Verification

Run:

```powershell
npm test
npm run validate:content
```

The tests cover causal record creation, interchangeable accepted materials, rejected-delivery conservation, institutional allocations and deadlines, local surplus and wholesale flow, material and money conservation, repair completion, hauler return, reload idempotence, blocked-response reconsideration, farm transfer, and the shared-engine domain boundary.
