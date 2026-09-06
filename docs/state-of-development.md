# State of development — orientation for a new contributor

Written 2026-08-22 for someone joining cold. There are 53 documents in `docs/`
and 8,500 lines of them; this one exists so you do not have to read them in
order. It covers what the project is trying to be, the rules it holds itself to,
what is actually built, where the work currently stands, and — most usefully —
the specific ways this codebase has repeatedly fooled people who were sure they
were right.

If you read nothing else, read **What keeps going wrong** near the bottom.

---

## What this is

A space game built from scratch in vanilla JS on a canvas, no framework, no
build step. Modules are imported with a `?v=` cache-busting query string.

What makes it unusual is the ambition underneath the asteroids: **a living
economy of institutional NPCs**. Hubs, mining companies, carriers, repair shops
and factories are actors with treasuries, assets, relationships and character
traits, making their own decisions. The player is one participant in that world,
not its protagonist.

The test suite is 1,057 tests, run with `node --test tests/`. Everything is
expected to pass before a commit.

The Observatory contract board projects the complete carrier auction beside
every unclaimed freight order. It names every carrier considered and shows its
winning, losing, or rejected result together with the rejection gate,
commitment state, sponsor preference, wear, approach burden, ask, offer, and
cost to serve. Persistent READY freight is therefore inspectable as a
per-carrier rejection matrix rather than only as a stalled outcome. The matrix
also covers carriers excluded before pricing: physical docking, movement and
shipment commitments, maintenance, insolvency, community discovery, sponsored
home duty, reservations, cargo custody, and portfolio capacity all report their
own explicit early-stage reason.

New aggregate flows initialize their family shortfall ledger immediately.
Regional clearing may legitimately run in the same observation tick that a hub
first aggregates; previously its first trade attempted to reduce a missing
`shortfall` object, threw inside `simulation-detail`, and prevented later
observation systems from refreshing. Clearing also normalizes older flow records
before writing them.

---

## The design constitution

These are not style preferences. They are rules the project owner has asserted
repeatedly, usually by rejecting something that violated them. Violating one
will get your work reverted, however well it performs.

### 1. Assets provide abilities

`institutional identity + controlled assets = capability portfolio`. A ship can
make a long haul because it owns a subspace drive. A hub can build ships because
it owns a shipyard. A hub with no miner and no way to get one **cannot mine** —
absence of an asset is a real constraint, not a balancing knob.

Corollary: a capability that arrives by decree is a bug. Ships used to appear
from nothing when a fleet grew; closing that was a whole work stream.

### 2. No arbitrary caps, floors or ceilings

Quoting the owner directly:

> "I don't know how I feel about these caps and limits and ceilings and floors
> that are arbitrary. Different kinds of NPCs based on their traits might have
> higher or lower things happening. And as desperation increases, those ceilings
> and floors would continue to move."

Before writing a constant that bounds a decision, apply the four-question test
recorded in `HANDOFF.md`: is it a shape or a limit; whose number is it; does it
move; what is the natural bound? A curve needs shape parameters and that is
fine. A ceiling that decides an outcome is not.

Worked example: hub buy-prices used a three-step urgency table. It was replaced
by `chaseMultiple` in `valuation.js`, which moves continuously with how short a
buyer is and how long it has been short, scaled by that actor's authored
`urgencyBias`. There is no cap; what stops a buyer is its own money.

### 3. NPCs decide; the engine does not protect outcomes

An operator that undervalues its only long-range hull is allowed to sell it,
strand its own hub, and leave a derelict. That is content, not a defect. Two
attempts to add protective rules were rejected outright — a rule forbidding the
sale of the last capability-holding hull, and a fixed patience cap. Both became
valuations the actor can get wrong.

### 4. Nothing is hidden

> "We don't want hidden things in this game. We want to see as much of the
> sausage being made as possible."

Every parts factory is drawn where it stands, with a progress arc that is a real
fraction of a real recipe. Material moves along visible tethers between hub,
factory and slipway. A hull is built on the ways one stroke at a time from the
same outline data the flying craft is drawn from. This is not decoration: a
same-institution procurement deadlock was found within ten minutes of making the
order board visible.

### 5. Every place starts owning what it must have needed to exist

A hub is out there because something carried the means out there. The shipyard
opens with hulls in its shed because the world commissions a freight fleet on
tick one and a yard with nothing built would strand it.

### 6. Distance can be a wall, not a cost

Some clusters should be too far apart to be economically attached, and the
answer is a **gate**, not cheaper wear or shorter lanes. Explicitly retired:
moving the outer hubs closer, and rebalancing wear to make the frontier
reachable. Miners are **not** long-range; a distant hub needs local production
or freight, and eventually a heavy-lift ship that carries craft and industrial
plant out to range.

---

## Architecture worth knowing before you touch anything

### The actor strata

Modelled on Sal's repair shop and now copied by the shipyard. Follow it.

| tier | example | holds |
| --- | --- | --- |
| hub institution | `scrap-forge`, `yard-exchange` | treasury, warehouse, ownership |
| department / operation | `sprc`, `yard-shipyard` | facility, capabilities, inventories, its own projects |
| person | `sal`, `mira-koss` | traits, delegated authority, career record |
| population | `population:scrap-porch` | labour supply, demand, royalties |

The hub OWNS (`ownerInstitutionId`), the person RUNS it under `delegatedRoles`
and `authority`, and departments carry `organizationRole: "department"`. A
department may share the hub's operating account — `economySampler` deduplicates
by account identity, so this does not double-count. See
`src/content/institutions/institutionInstances.js`.

### Key systems

- `src/systems/logistics.js` — hubs, carriers, freight, the one actor table
- `src/systems/miningOperation.js` — mining companies, extraction offers, fleets
- `src/systems/hubProcurement.js` — orders, reservations, title transfer
- `src/systems/industrialProduction.js` — factories, recipes, the parts market
- `src/systems/shipyards.js` — hull build queue, stock, relationship pricing
- `src/systems/valuation.js` — the shared valuation vocabulary everything prices with
- `src/systems/extractionMarket.js` — one clearing ranks every miner against every offer
- `src/systems/economySampler.js` — money reconciliation; treats `capitalSpend` as burned
- `src/systems/hubLayout.js` — where facilities may be placed around a hub
- `src/systems/distantSimulation.js` + `regionFlow.js` — level-of-detail aggregation

### Conservation invariants

Money, material, custody and title must all have traceable sources and
destinations. `economySampler.reconcile()` reports a residual. A transfer must
never be recorded as a burn — hull purchases are tracked as `hullSpend`
precisely because `capitalSpend` means "left the world" to the reconciler.

---

## Where the work stands

### Recently completed

- **Local trade communities** — the core (Yard, Porch, Ledge, Lantern, Morrow,
  Kiln) and Far Reach (Ore Station, Coldwater, Deep Research) are now separate
  ordinary freight markets. A carrier sees community work, may claim it and fly
  empty to pickup, and only loads after physically arriving. Subspace hulls may
  serve explicit agreements crossing their home community boundary. A
  hub-sponsored cartage company owns its hull and carries an inspectable
  first-consideration charter for supply returning to its sponsoring hub; this
  preference has actor-valued weight rather than compulsory dispatch.

- **Frontier reach** — a five-link chain that starved the outer hubs, ending in
  the first frontier mining delivery this world had ever produced. Then largely
  retired by design: miners are no longer long-range (see constitution §6).
- **Shipbuilding Stage 1** — hulls are bought from a shipyard, not conjured.
  Money moves to a seller; every hull records `builtBy` and `quality`. Pricing
  is by relational standing: the owning hub builds at cost, a stranger pays book,
  friends less, enemies are refused. This is the first enforcement of the
  `access` shape in `relationshipProjections.js`.
- **Shipbuilding Stage 2** — hulls consume `hull-plate` and `machine-part`, take
  45 seconds, and enter a shed. A buyer arriving at an empty shed is refused.
  Shipbuilding bids for parts in the same market as Sal's repair queue.
- **Visibility** — every factory drawn, material in motion, a capital that reads
  as one, subspace haulers marked, and a placement rule with tests.

### The open question

**Ore is the binding constraint on the whole industrial chain.** Measured live:
all three parts works idle simultaneously with zero iron-nickel and zero
silicate between them, having converted every scrap of ore in the world into
twelve parts. A hull needs 3–9 plate plus 2–7 machine parts.

No keel has yet been laid in a live run. The chain is connected and correct at
every link; it is starved at the first one.

Three candidate levers, none pulled, recorded in `shipbuilding.md`:

1. **Miners carry more per trip** (`MINING_ALLOCATION_SIZE`, currently 6). Tried
   at 12 and reverted — it re-ranks the entire job market and broke three tests
   encoding intended behaviour.
2. **Ore yields more parts.** Lifts all industry at once; leaves the mining loop
   feeling like five-ore errands.
3. **Fewer hulls destroyed.** An overnight run lost sixteen mining hulls to
   incursion waves. Reads as an economy problem, is actually a protection one.

The owner's stated position is that the balance is above what they can compute
by hand and wants something that can find its own equilibrium. Measure one lever
properly rather than tuning all three.

### Known open items

- Stage 3: every hub endowed at founding (a distant hub with no extractor still
  posts extraction demand nobody can serve).
- Stage 4: hubs commissioning industry they lack, via the existing project
  mechanism. `commission-shipyard` is already in the municipal capacity charter.
- Stage 5: heavy-lift craft carrying ships and plant; viewport scale changing
  when boarding a larger vessel.
- Hull `quality` is recorded at construction but nothing derives it from
  materials or reads it. The repair-ceiling half already exists —
  `maxRecoverableCondition` falls as `lifetimeDegradation` accumulates.
- A market visit commits a ship to a voyage but does not reserve the offer, so
  several craft can set out for the same exclusive job. Harmless locally,
  ruinous at frontier distances. Three options recorded in `HANDOFF.md`.

---

## What keeps going wrong

This is the section that will save you time. Every entry below is a real
incident from the last two days, and in every single one the tests were green
and the code read correctly.

### The bug is almost never in the logic. It is in the measurement.

Five consecutive investigations ended with "the thing I was measuring never had
a chance to happen":

1. A hunger clock read `order.at` — but the order book is rebuilt on every read,
   so elapsed time always measured zero and a starving hub could never raise its
   offer past its opening bid.
2. A fleet planner counted a travelling ship as idle, because
   `trackFleetClocks` checked `assignment` but not `marketVisit`. It retired its
   only long-range hull 26,000 units into a voyage. The bias was systematic:
   the longer the trip, the likelier the recall.
3. A shipyard read free parts stock, which was permanently zero because every
   part was reserved against an accepted order the moment it existed.
4. A hub ordered parts from the factory it owns; the procurement path leaves
   goods at the seller awaiting freight, and no carrier runs a route from a site
   to itself. The order sat accepted forever.
5. Parts recipes were sped up 3x and nothing changed, because conversion was
   never the constraint — ore was.

**Before concluding a mechanism does not work, prove it ran at all.**

### Tests that assert their own fixtures

The urgency-ceiling tests kept a private copy of the ceiling table in the test
file. They passed unchanged when the production constant was deleted. Another
test asserted `busy <= quiet + delivered`, which permits the exact double-count
it was meant to catch.

Assert the outcome through the real code path. When you fix something, **revert
the fix and confirm the test fails.** This has caught two would-be no-ops.

### The `?v=` cache trap, in three flavours

- A bare import without `?v=` is never cache-busted. Tests green, game dead at
  boot.
- A symbol used without being imported — `DRIVE_KIND` in `NpcShip.js` — throws
  at draw time, which no test exercises.
- `index.html` itself is cached by the browser and is **not** covered by the
  `?v=` scheme. A single page load once fetched three different versions of
  `valuation.js` while disk was uniform. If the game behaves like yesterday's
  code, force-reload before debugging anything.

Bump with the snippet in `HANDOFF.md`, **after** committing, so the sha in the
version string matches the code it labels.

### Headless harnesses lie

`createMiningOperation` with a stub `addWorkerShip` produces a world with no
physical workers, no demand, and no posted orders — and it will answer your
questions confidently and wrongly. Some behaviour can only be verified in the
running game. When a test cannot honestly cover something, say so in the test
file rather than writing one that passes vacuously.

### Instruments that lie

- `getRetainedEvents()` **prunes**. Counts are within-window, not cumulative.
  A count that goes down is retention, not a bug.
- `deliveredUnits` on a procurement order stays 0 while the reserve fills;
  reserve progress lives on the supplier.
- A withheld order has no `paymentPerUnit`. Rounding it yields `NaN` and looks
  like a pricing defect.
- `capitalSpend` means "money that left the world" to the reconciler.

### Short observation windows over-claim

Two findings were reported from 23 and 143 samples and both were wrong at larger
N. The live game is the real instrument; give it minutes, not seconds, and say
how long you watched.

---

## How to work here

### Maintenance-return navigation boundary

A repair order may be opened before its craft reaches the repair berth. The
order makes the carrier unavailable for new work, but it must not set the
physical ship to `maintenance` while a service-return movement is still active.
That premature projection stopped Yard Hauler and Lantern Runner in open space;
navigation recovery could point them toward the berth, then the next simulation
tick turned their engines off again. Logistics now remains authoritative for
physical travel state, preserves `returning-maintenance` until docking, and
clears an old navigation blocker once the craft is legitimately stopped.

### Long-run ecology checkpoint — grazer condensation

A roughly three-hour Explorer observation exposed a physical-population leak:
2,912 lifeforms were retained, 2,735 of them grazers. The ambient director's
local ceiling was working; the leak was the deliberate exemption that kept
every ripe grazer alive at any distance because it carried a harvest reward.

Grazers now condense a crowded field through visible competition. Once animals
reach the large feeding stage, nearby grazers—including other large, ripe
rivals—become potential prey even while forage remains. A predator must pursue
and physically catch its target; only part of the prey's biomass carries
forward. There is no final size cap: growth becomes logarithmically more costly,
and biomass gained by eating another grazer diminishes further as the predator
becomes enormous. Cannibal growth does not compound spore yield. Ordinary ripe
grazers may stream out when left far behind; old apex animals remain persistent.
This turns the performance fix into observable ecology while keeping rockmoss
spores distinct from industrial ore.

The next ecological/economic seam is institutional recovery: hubs may eventually
commission collectors for abandoned bulk ore. Keep three visually adjacent
things distinct: green star-like rockmoss spores are biological farming inputs;
pink shards are anomaly material rather than ordinary industrial feedstock.
Generic collectors leave anomaly shards alone. Once the normal fresh-drop and
player-proximity protections lapse, grazers can consume abandoned pink shards;
the player's specialist intake route still exists for shards recovered in time.

That seam is now implemented. Each 3,600-unit locality has a hard 180-unit
grazer biomass budget, enforced independently so one lively field does not
erase another. Yard Exchange Field Recovery surveys settled, unclaimed volatile,
structural and industrial drops near funded hubs. Six compatible units justify
a real 6,000-credit capital commission; the resulting hub-owned green recovery
craft flies to the field, tractors one named material, returns physically, and
places it on its owner's shelf under an inspectable `ECO-*` commission. It will
not claim spores, anomaly shards, fresh player drops or titled cargo.

Pink anomaly shards now use specialist intake rather than ordinary raw-material
sale. Only Yard Exchange and Deep Research accept them; five raw shards stabilize
into one `stabilized-anomaly-sample`, payment is 100 credits per sample, and each
desk accepts at most 25 shards per run. The residue stays with the player rather
than silently disappearing. This is deliberately a bounded research sink, not
industrial feedstock and not an unlimited hub-cash drain.

Gold rift trophies remain bounty claims, never grazer food. A player or other
unaffiliated kill still leaves a physical bearer token. When a patrol destroys
the portal, that patrol collects the token itself and telemetry settles the
bounty immediately: an internal patrol credits its hub, a contracted patrol
credits its controlling security institution, and a singleton operator credits
its own institutional account. If settlement cannot be funded, the physical
gold token remains in the world rather than disappearing.

### Mining and freight circuit checkpoint

The August 22 follow-up closes three misleading deadlocks found in the long
Explorer run. Yard Exchange now holds one strategic `mining-craft` commissioning
reserve. It is available only to a real mining contractor, only after ordinary
shed stock is gone, and it is consumed permanently when used. This is a single
self-rescue path for the “not enough extraction to build the miner that would
increase extraction” loop, not a regenerating hull faucet.

READY procurement freight was audited and is functioning: an idle regional NPC
hauler claims prepaid goods awaiting pickup and turns the order into an assigned
shipment. A regression test now pins that exact transition. The apparent
duplicate Coldwater Relief identity was diagnostic presentation, not a cloned
craft: ship cards were displaying their carrier company's name. Ship diagnostics
now display the physical craft's own name while retaining its carrier as the
controller.

Aggregated settlements were also selling modeled household consumption without
booking the warehouse value of those goods. Region flows now retain cumulative
consumption by family, and the aggregation boundary converts its delta through
the live weighted cost basis into `costOfGoodsSold`. Aggregate profit should no
longer be overstated merely because a hub is outside detailed simulation.

The full suite is green at 1,015 tests. The next live check must start fresh in
Explorer and compare extraction with consumption after the reserve has had time
to commission a miner; also verify READY orders do not remain unclaimed while a
compatible hauler is genuinely idle.

### Ecological collector ownership correction

A long run exposed dozens of idle `Yard Recovery` craft stacked at Yard
Exchange. They were not miners: the ecological capital planner recognized a
collector as reusable only when it was both unassigned and exactly empty. A
completed or interrupted craft retaining partial cargo appeared `free` to the
actor UI but disappeared from capacity planning, causing another 6,000-credit
hull to be commissioned for the next field.

Collectors are now permanent hub-owned assets. Empty owned craft take the next
compatible field; unassigned craft carrying material receive a return-and-unload
duty; and an extant owned collector prevents speculative replacement until a
future backlog model can provide a positive reason for parallel capacity. This
is an ownership/utilization rule, not a global numerical fleet cap. The craft
remains a physical `MiningWorkerShip` with its real tractor field. Regression
tests cover both ordinary reuse and retained-cargo recovery; the full suite is
green at 1,017 tests.

Sponsored freight now has an enforceable home-service concession rather than a
preference alone. Two completed outside jobs or four outside market calls create
a home duty. A due craft limits itself to sponsor-serving freight or returns
physically to its home hub, where docking clears the duty. Home imports and
exports both qualify; fresh remote-sponsored hulls must make their first report
home. The charter also records the intended one-third dispatch share and the
hub's outstanding capital lien. The full suite is green at 1,023 tests.

Sponsored carriers now receive a live home-dispatch feed even while underway.
It contains their sponsor's open import/export needs and ready home-serving
freight, and therefore bypasses ordinary dockside market discovery for that
relationship. It informs the next safe decision point rather than interrupting
cargo custody or retargeting a craft in flight.

Idle one-hull sponsored carriers now publish transferable concessions before
their capacity and worker are lost. A hub with sustained unserved inbound or
outbound freight can buy the used concession below replacement cost, with wear
affecting price, rather than commission a new hull. The existing ship, operator,
history and personal place of origin survive; sponsorship, lien, dispatch feed
and mandatory first home call transfer to the acquiring hub. Quiet fleet-floor
pressure by itself cannot trigger a purchase.

Remote freight pickup reservations now end when the empty approach reaches the
source market. The arriving carrier bids again using its actual location and
current wear; if it can no longer accept the load, another carrier may take it.
Previously that failed reconsideration retained an invisible reservation
forever, leaving the contract visibly unclaimed while excluding every other
hauler. The long-lived frontier backlog exposed this lifecycle error.

Home dispatch now changes ordinary choice before duty becomes binding. A
sponsor-serving load receives operator value based on the carrier's urgency
temperament, how long the underlying purchase need has waited, and whether a
home call is due. The value grows but does not override route, wear, capacity,
funding or the carrier's cost floor, so exceptional outside work remains a real
choice. Carrier cards expose the offer, ask, cost, approach, charter value,
need age and exact rejection reason. The full suite is green at 1,024 tests.

Safe-stop freight consideration now precedes market roaming. An economically
eligible sponsored carrier physically beside prepaid cargo serving its home
receives first consideration before an absent carrier can win several parallel
auctions and accept only one of them. If the craft does leave, its actor card
retains every offer considered and the explicit rejection or allocation reason
after departure. The full suite is green at 1,025 tests.

Procurement now enforces the READY/custody invariant. A READY purchase is
advertised as freight only when its supplier holds a matching awaiting-pickup
manifest naming the correct material, quantity and buyer. Observation repairs
a missing custody row from the already-paid, already-titled order without
changing inventory or cash; an active shipment instead advances the stale order
to SHIPPED. An unrepairable record becomes a visible custody blocker. Each
repair emits `procurement.readyCustodyReconciled`. The full suite is green at
1,026 tests.

Carrier maintenance now responds to work-limiting wear, not only a general
odometer threshold. When a docked carrier can see real, loadable freight but
every candidate is presently unsafe because the hull could not complete the
run and retain a service margin, it seeks preventive service immediately
instead of adding wear on another empty market circuit. Auction losers are not
sent to repair, and `beyond-fleet-range` remains a permanent route/capability
problem rather than something maintenance pretends to cure. This removed one
contributor to sponsored craft sitting at pickup markets while valuable prepaid
loads aged, but later clean runs showed that it was not the whole cause. The
full suite is green at 1,027 tests.

Empty pickup reservations no longer hide prepaid cargo from the sponsor's own
craft after that craft reaches the source. A remote carrier may still reserve a
load while deadheading toward it, but an economically and physically eligible
sponsored carrier already docked beside sponsor-serving cargo can enter the
auction and displace that reservation. The distant craft is not retargeted in
flight: its pickup movement becomes an ordinary market visit to the same
destination, while custody passes only to the local winner. The displacement
is explicit in history and the public carrier ledger. This closes the specific
case where a local sponsor craft is blocked by a remote empty reservation; it
was observed working once, but did not by itself clear the frontier freight
tail. The full suite is green at 1,028 tests.

Dockside freight auctions now carry their winning candidate snapshot into the
assignment pass. The winner still rechecks that the READY cargo and quantity
exist and that no active shipment has taken custody, but it no longer reruns
market discovery and contradicts the auction within the same decision phase.
This enforces an important decision-phase invariant. A later clean run showed
that the stale actor-card winner was not the root cause of Coldwater Relief 1
departing Ore Station One empty, so the diagnostic claim was narrowed rather
than treated as proof of a completed repair. The full suite remains green at
1,028 tests.

A carrier's remote pickup reservation now survives its physical arrival until
the first dockside freight assignment pass. Previously the arrival handler
cleared `reservedTemplateId` before that pass, briefly reopening the cargo to
remote bidders; the arriving carrier then saw no eligible freight and converted
the stop into an empty market circuit. The reservation now becomes real
shipment custody when the load is still eligible, or is explicitly released
with `freight.pickupReservationReleased` when it is not. The strengthened
arrival test verifies that the reserved procurement order is actually assigned
to the claimant, not merely that the craft reaches the dock. The full suite
remains green at 1,028 tests.

Live observation showed that preserving the reservation until a later decision
pass was still too weak: Coldwater Depot Relief 1 could publish
`carrier.freightPickupArrived` at Ore Station One, leave without HPO-0014, and
eventually become free at home while the prepaid cargo remained on the board.
A freight-pickup route completion now converts its exact reservation into
shipment custody inside the arrival handler itself. The craft never becomes a
general free agent between arrival and loading. The arrival message says the
craft is checking its claim until custody actually succeeds, and failed
execution now distinguishes missing ship, rejected route, insufficient cargo
capacity, funding loss, missing source, missing prepaid custody, missing stock,
or a last-moment state change. A failed claimant explicitly releases its
reservation with that reason. The full suite remains green at 1,028 tests.

The arrival conversion now treats the exact pickup reservation as durable
knowledge. It does not require the carrier to rediscover that offer through
its home dispatch or market knowledge, which refresh later in the observation
phase. Physical custody, quantity, cargo capacity, route safety, wear,
economics, and payer funding are still revalidated before loading. The remote
pickup regression deliberately erases the carrier's dispatch immediately
before arrival and proves that the reserved cargo still becomes a shipment.
This addresses the observed Coldwater/HPO-0014 failure where the atomic path
ran against the correct offer but produced an empty candidate set. The full
suite remains green at 1,028 tests.

The navigation watchdog now recovers a physically deadlocked hauler instead of
only documenting that it will remain stuck forever. After sixty seconds with
no meaningful approach progress, a craft drops its optional berth/lane offset,
clears the avoidance equilibrium, and takes a clean centerline heading toward
the same waypoint. Its route, route index, destination, cargo commitments, and
contractual custody are unchanged. It receives two recovery attempts before a
continuing failure is promoted to a durable `navigation-stalled` blocker. Tests
cover both the loaded-craft invariant and watchdog ordering. This responds to
Lantern Runner and the loaded Yard Exchange Relief 5 remaining stalled for
many minutes in a healthy foreground run. The full suite is green at 1,030
tests.

Sponsored-carrier public capital now has a repayment waterfall. Commissioning
opens a concrete lien for the hull's real purchase price plus the 5,000-credit
operating grant. Paid freight first services emergency fleet debt; the carrier
then retains commitments, minimum operating cash, a full maintenance reserve,
and any larger recent operating-cost runway. One third of genuine surplus
repays the sponsor until the lien is extinguished, with conserved transactions
in both accounts and a public ledger event. Concession transfers replace the
old lien with the buyer's transfer-price lien. Dispatch authority remains a
separate service right. The full suite is green at 1,033 tests.

Sponsor freight blocked only by projected maintenance now sends the carrier to
service even when unrelated eligible offers appeared in the same auction but
were awarded elsewhere. Previously those losing alternatives prevented the
"all visible work is wear-limited" test from firing: Deep Research Relief 2
could stand empty at Morrow Shoal, explicitly reject its profitable 5,302-credit
home order only for `maintenance-policy`, and then leave on another empty
market circuit. Sponsor service is still not forced through an unsafe route;
maintenance is the reasoned action which may make that route safe. The full
suite is green at 1,034 tests.

The physical and economic universe now has one runtime historical registry in
`worldNetworkRegistry.js`. First Reach's authored sites, routes, and trade
communities are its opening history rather than universal constants. Every
record carries origin, provenance, and history. A procedurally founded
settlement enters that same registry through `registerGeneratedSettlement`,
may join an existing trade community, and may receive a validated road whose
distance is derived from the actual geography. Logistics refreshes its network
when that registry changes; procurement, regional clearing, industrial
production, towing, simulation detail, and the physical Game all read the same
graph. Tests prove a surveyed settlement and founding road become routable and
survive serialization, while routes to nonexistent places are rejected. This
is the durable base for compiling an old universe from survey, expedition,
outpost, growth, succession, and decline events, then allowing the same history
to continue live. The full suite is green at 1,046 tests.

Fresh play now compiles its first genuinely historical neighboring community.
Ore Station One's old survey program evaluates seventy-two deterministic
points in the real terrain, environmental, and resource-opportunity fields. It
selects a balanced locality, records the discovery and expedition approval,
opens an expedition trunk, founds an outpost, and later grows two complementary
settlements and internal roads. The three specialize in structural, volatile,
and industrial feedstock and form their own Ashfall Compact trade community;
they are connected to First Reach but do not share its local freight board.
Historical success selects the eventual capital, so the first landing is not
automatically the permanent center. Every decision is stored as an ordered,
serializable chronicle with evidence, timestamps, provenance, project IDs,
site histories, and route histories. Compilation is deterministic and
idempotent, and it uses the same public registration functions intended for
future live survey and founding projects. The full suite is green at 1,050
tests.

The first long Ashfall run exposed four coupled omissions and all four now have
regressions. Generated populations participate in inventory targets, and their
installed extraction participates in the local/import split. The old-universe
chronicle now records each mature settlement commissioning a sponsored
municipal extraction company; three ordinary mining operations and physical
workers begin at the Ashfall hubs and enter the same competitive order market
as authored companies. A loaded carrier entering a hub's declared operational
envelope completes that waypoint even if its berth lane misses the old 150-unit
capture circle, while corridor gates retain the strict radius. Portal waves now
distinguish nearby shield guards from every living unit the gate has fabricated,
so raiders cannot trigger infinite reinforcements merely by roaming past the
shield orbit. Finally, distant apex grazer herds condense into one progressively
older giant per ecological locality, with diminishing biomass transfer; nearby
predation remains physically visible. Content validation and all 1,057 tests
are green.

The August 27 long run exposed a geological lifecycle leak rather than merely
an over-rich asteroid field. A tier-three rock could become six to nine small
rocks; those fragments were not owned by the chunk that supplied their parent,
so they survived every unload while the deterministic pristine parent returned
on the next visit. Mining therefore accumulated permanent rubble without
creating persistent depletion. Fragment descendants now retain their chunk and
seeded-source identity and unload with that locality. A disturbed but unmined
source may re-accrete after eight quiet minutes; a source whose ore entered the
pickup economy remains depleted for thirty minutes before the locality can
recover it. Reformation and recovery happen only beyond every player or worker
observation field, including in quiet outer portions of still-loaded chunks.
The authored chunk remains the natural carrying shape, so recovery approaches
terrain capacity rather than adding unbounded new material. The World debug
panel exposes disturbed and depleted source counts. Four lifecycle regressions
cover ownership, loaded-chunk coalescence, delayed reformation, and slower ore
recovery. Content validation and all 1,061 tests are green.

The first-tick long-range fleet at Yard Exchange was not compiled history. A
regional target of eight compared itself with the three authored carriers and
mass-commissioned the difference immediately, even without freight evidence.
That target and its startup bypass are gone. A hub now considers a sponsored
carrier only after real, loadable freight involving that hub has remained
undiscoverable or physically infeasible for every carrier for sixty seconds.
Private companies count only jobs their own organization can discover and a
fresh hull of their class can actually complete; seeing a pickup at Yard no
longer makes an ordinary carrier invest in a ship for an unreachable Ashfall
destination. Only one capacity response may act on an observed backlog before
the market is observed again, preventing several companies from buying against
the same stale order.

A newly commissioned carrier also receives knowledge appropriate to its real
charter rather than a cloned First Reach destination list. It knows its
sponsoring compact, the yard delivering its hull, and every registered road on
the delivery route home. The drive-range test now separates physical reach from
map knowledge, so a generated destination is not classified as remote merely
because an authored carrier had never heard of it. A clean first tick creates
no sponsored ships; a sustained genuinely unserved generated-hub order creates
one reasoned commission whose crew can route home. Content validation and all
1,062 tests are green.

- Run `node --test tests/` before every commit; keep it green.
- Verify in the running game, not only in tests. Reset freely — the owner always
  plays from a fresh start. Use `?resetSave=1&devStart=explorer`, which opens in
  free-play with all panels visible so the screen is legible in passing.
- Commit messages here are unusually substantive: what changed, what was
  observed, what was tried and reverted. Match that.
- Comments explain *why*, and frequently cite the live incident that motivated
  the code. Match that too.
- When a decision is genuinely the owner's — a balance lever, what an actor is
  allowed to know, whether a hub may privilege itself — record the evidence and
  the options and ask. Several unilateral changes were reverted for being
  engine-protects-outcome rules.

## Where to read next

- `HANDOFF.md` — the running log, densest and most current
- `shipbuilding.md` — the active work stream and the ore-economy evidence
- `institutional-npcs-and-assets.md` — the actor model and asset archetypes
- `level-of-detail.md` — distant simulation, aggregation, drift budgets
- `observability-architecture.md` — diagnostics, blockers, the economy tab
- `project-map.md` — the file-by-file tour
