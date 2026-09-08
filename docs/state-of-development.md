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

**A third, 2026-09-06, and it is the clearest one.** A story run was watched for
thirteen minutes. The mining fleet went 14 hulls to 13, four hulls stood down,
zero hired — reported as a ratchet: too little work, so hulls stand down, so
less ore, so less work. At twenty-six minutes the fleet had been flat for twelve
minutes and four parts works had completed fifty-six runs. It was a one-time
correction to the real amount of work.

The "zero hired" half was simply false, and worth dwelling on. It came from
filtering the ledger for `mining.workerHired`, getting nothing, and concluding
nothing was built — while Ore Station Two and Rimeward Rest Works Two had
already been commissioned through a path that does not emit that event. The
fleet was churning, not dying; only the losses had an instrument. **Measuring
one event type and calling it the fleet is not measuring the fleet.** A later
run with the census in place showed 14 → 17 → 16, three commissionings at a
real 3,500 credits each against one stand-down.

The tell is worth internalizing: **this economy produces transients that look
exactly like defects between ten and fifteen minutes and resolve by twenty-five.**
That is most of why balance work here has gone in circles — every fifteen-minute
read yields a fresh plausible defect, and chasing it is indistinguishable from
progress until the next read.

Two defences. First, `fleetCensus.js` now gives the physical fleet the same
treatment money already had — a series, and an `auditFleetIntegrity` residual —
so the Observatory's **Fleet** tab answers "correction or spiral" at a glance
instead of after twenty minutes of hand-written console sampling. Second, and
more useful than any instrument: **separate conservation questions from balance
questions before acting.** Conservation questions have a right answer and
converge; balance questions do not, and are the owner's call. The same run
produced one of each. The conservation half — four operators still employed on
hulls deleted thirteen minutes earlier — was fixed. The balance half — whether a
company holding 59,909 credits should shed a hull after 127 idle seconds — was
left alone, because the longer window said there was nothing to fix.

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

## The player's sponsor got a body (2026-09-06)

Direction change, and the reasoning matters more than the diff.

Weeks of work went into making the economy clear its own shortages, and it never
did. The reframe that replaced that effort: **an economy that cannot serve its
own demand is not a broken economy, it is a job board.** The refusal matrix in
`HANDOFF.md` item 10b — `mine-ore-station-aluminum REJECT net -241` and its
neighbours — is a list of jobs already priced and already declined by every NPC
in the world. A player's valuation function is not an operator's; a person will
fly a 48,000-unit run for reasons no bidder has. So the player is the natural
taker of exactly the work the market correctly refuses, and the shortage becomes
content rather than a blocker. A fully self-clearing economy would leave no room
for a player in it, so equilibrium is the wrong target. Persistent, legible,
LOCAL shortage is the right one, and it is far cheaper to reach.

Story mode therefore starts the player as a hand at Rook Industries, which is
also where the ownership ladder in `stakes-failure-design` bottoms out. The
opening and the failure floor are the same place, so the opening is no longer
disposable tutorial content.

**Rook existed only as a voice.** `src/content/npcs.js` gave it a name, a
`voiceFrequency` and an `organizations` string; there was no institution record,
no treasury, no hull and no seat in the extraction clearing, while five smaller
outfits had all of it. It now has a `MINING_INSTITUTION_SEEDS` entry in the same
shape as Cinder and Flint: institution, licensed controller with traits, three
named hulls with individual wear, and a home at Yard Exchange. It bids into
`clearExtractionMarket` beside everyone else with no reserved work and no update
-order privilege.

It opens with 32,000 credits against the small outfits' 260–5,200. That is a
character fact, not a protective rule: Rook has to still be standing after a
whole player arc, and an engine rule forbidding its bankruptcy would be the
outcome-protection this project keeps rejecting. Deep reserves and patient
traits are the diegetic version. It can still be outcompeted to zero.

`FRONTIER_MINING_SEEDS` was `MINING_INSTITUTION_SEEDS.slice(2)`. Inserting any
core operator above the frontier ones silently enrolled it in the frontier
fleet — and the test pinning that fleet's home sites read the same slice it was
checking, so it passed. The group is now derived from home site. Reverting the
derivation fails three tests including the pre-existing one, which is how the
landmine was confirmed rather than assumed.

### Two modes, deliberately different games

**Explorer** (`?devStart=explorer`, the default) is unchanged and stays that way.
You are Explorer One in a fully fitted ship with every hub beacon and a Vektor
drive. It is about the terrarium at large and the foundations of the game.

**Campaign** (`?resetSave=1&devStart=campaign`) is a career, not a sandbox. You
are Niko Franks — a default on an editable form, not a fixed protagonist — a
provisional licensee working for Rook Industries. The RTC form already said
"under Rook Industries sponsorship" and "mining rights are extended only through
the sponsoring operator's permit"; that fiction now has a company behind it.

The loadout was not invented. `shipOffers.js` has carried the
`rook-yard-skiff-miner` all along — *"a cheap working hull with a miner and cargo
hold bolted in. Ugly, slow, and legal"*, included components Engine, Hull,
Docking, Beacon Locator, Miner, Cargo Hold, tradeoff line "Eligible for Rook
work". Campaign fits exactly that and nothing else. `campaignLoadout.js` is the
single source and `campaignLoadout.test.mjs` pins it against the offer in both
directions.

Three details carry the design:

- **The engine is slow because it is the game's default.** `rook-standard-drive`,
  95/105 against the explorer Vektor's 160/185. Nothing was slowed down for
  campaign; explorer is what speeds it up.
- **The laser is used, not specially fragile.** A hidden "campaign lasers wear
  faster" rule would be invisible and unserviceable. Instead the start walks the
  emitter forward through the SAME wear ladder every panel uses — three prior
  services, then 72% of the way to Degraded again — so it shows symptoms in tens
  of shots instead of two hundred and Sal can fix it like anything else.
- **The player flies the same hull as everyone else.** The campaign ship is the
  ORE WORKER — the identical outline every NPC miner flies, derived from
  `HULL_OUTLINES["mining-craft"]` rather than copied, so the player's craft, the
  NPC craft and the hull the slipway lays down stroke by stroke cannot drift
  apart. It is painted from `ROOK_MINING_SEED.shipPalette`, so it is
  indistinguishable from Rook One, Two and Three while Cinder's stay orange. A
  distinct silhouette would quietly tell the player they are a special case,
  which is the opposite of what campaign is for. The angular `yard-skiff-miner`
  frame stays in `SHIP_FRAMES` for a better hull to earn later.
- **The beacon locator is fitted and empty.** No hub directory, no ecology
  beacons. A fleet miner's locator holds job geography; where the ore is and
  where it goes arrive with the work Rook gives out. Knowing your way around
  First Reach is something the job teaches you, and something an independent
  operator has that a hand does not.

- **The processor is aboard and dead.** Not absent — bolted in and failed, which
  is the in-world reason a hand's ore drops straight into the hold unrefined.
  Its panel is shown broken rather than hidden, so the routing explains itself
  and a repair becomes something to want. At `failed` the mag link reaches only
  cargo (`componentRules.js`), even with engine, miner, hull and scanner all
  fitted and working. There is no wear ladder driving a processor to that stage
  yet — today it is authored — so this pins the behaviour of the final stage for
  when one exists.

**Campaign runs the authored interview.** It was always Rook's induction —
*"All right, rookie… consider this your assessment test, training, and interview
all in one"* — it simply had no company behind it. Now it does, so the tutorial
is routed rather than replaced, and it introduces each panel in turn instead of
dumping a fitted cockpit on the player. The skiff's components are installed at
start; only the panels wait for Rook to get to them.

Nothing had to be carved out for the stripped hull, and the reason is worth
recording: the steps named `show-scanner` and `try-scanner` **teach the beacon
locator**, not a scanner. The tutorial never installs one. A skip mechanism was
half-built for a problem that existed only in two stale step ids — read what a
step does, not what it is called. The interview also loads the two job beacons
(`scrap-porch`, `yard-exchange`) at that step, which is exactly the "beacon
carries job geography, not a gazetteer" rule arriving through the work.

**Open, found 2026-09-06 and not yet chased.** A ~26-minute Rook-enabled run
threw `SPRC inventory underflow: raw.iron-nickel` from `sprcOperation.js`. That
is a deliberate conservation guard doing its job — it refuses to let an
inventory go negative — so the defect is whatever tried to remove more
iron-nickel than Scrap Porch held. It is NOT known whether adding Rook's three
hulls caused it or merely made a pre-existing race more likely; Rook is seeded
in every mode, so it cannot be isolated by picking a start. It did not recur on
a fresh boot. Reproduce it before theorising.

**What is NOT yet true.** The player cannot take work from Rook — being
dispatched as one of its hulls, and being paid out of its real treasury, is the
next slice. Whether Rook's higher crew pay (80 against 65–85) costs it marginal
auctions, and whether it stays solvent doing so, has been watched for minutes,
not hours. It won an allocation in its first minute, which says it competes; it
says nothing yet about the long run. Measure that before trusting the number.

### Panel positions survive a resize (2026-09-07)

Panel positions were absolute pixel offsets, so a desk arranged on a wide screen
collapsed on a laptop: a corner panel kept its offset and floated into open
space, and an edge panel fell off the desk and got clamped into a pile.

`panelAnchoring.js` stores what a panel was arranged RELATIVE TO — one of nine
reference points (four corners, four edge midpoints, centre), whichever its
top-left was nearest, plus the remaining distance as a FRACTION of desk width
and height. Corner panels stay welded to their corner at any size; a centred one
stays centred. Storage moved to `asteroids.panelLayout.v7`.

Three details are load-bearing:

- **Anchor choice is normalised before comparing.** On an ultrawide desk a raw
  pixel comparison makes every anchor look horizontally close, so the choice
  collapses onto whichever is vertically nearest.
- **Clamping never writes back.** A panel squeezed by a narrow window keeps its
  stored arrangement, so widening again restores what the player intended
  instead of permanently baking in the squashed layout. `keepAnchor` on restore
  exists solely for this.
- **The viewport is not anchored.** It has one place and keeps it, per the
  owner. `journey` likewise.

The geometry is pure and has nine tests. The wiring in `main.js` does not, and
it bit immediately: `UNANCHORED_PANEL_IDS` was declared beside the helpers that
use it, but `makePanelsDraggable()` runs at module top level far above them, so
the const sat in the temporal dead zone and threw at boot — **with the whole
suite green.** That is the `?v=` trap's cousin and the reason browser
verification is not optional. It is now declared with the other panel constants.

### The old tutorial inside the new cockpit (2026-09-07)

Routing campaign through the authored interview surfaced three places where a
tutorial written for the free-floating desk does not fit the cockpit. All three
are the same shape — **the beat assumes a UI that no longer exists** — and more
will surface as the sequence is played through.

- **An un-completable gate.** `drag-panels` required moving the License AND the
  Hull panels. The hull is in `COCKPIT_MODULE_IDS`, so `makePanelsDraggable`
  skips it and it can never emit `component.dragged`: a player doing exactly as
  asked was stuck forever. The beat now gates on the License alone and points at
  the module bay for the hull. The hull consideration is kept for the legacy
  desk layout, where the panel does float.
- **The license was filed before the beat that is about it.** Cockpit setup
  called `movePaperPanelToDrawer("license")` at startup, undoing
  `setInitialPaperworkLocations()` and putting the one piece of paper the
  opening beat asks the player to drag into a closed drawer. Filing is now the
  player's move.
- **The Journey panel was a drawer wearing a card's position.** Base
  `.journey-panel` is a left slide-out: fixed to the window edge, full height,
  translated off-screen but for a 44px tab. The cockpit override re-centred it
  and inherited every drawer trait — left-edge shadow, no left border, no
  radius, 130px bottom padding, full-height column — rendering a 390x854 pillar
  down the middle of the viewport. It is now a wide, short comms card: header,
  speaker alcove, dialogue, pilot rail, mission block, collapsing to one column
  under 1180px.

One CSS trap worth keeping: `.is-cockpit-expanded` sets `display: block` at a
higher specificity than the base cockpit rule, so a `display: grid` declared
only on the base selector is **silently inert** and every grid property with it.
The card laid out as a single stacked column and nothing errored. Declare the
display on the state class too.

### The temporal dead zone in main.js, twice (2026-09-07)

`main.js` runs a boot sequence at module top level, far above most of its
function bodies. A `const` declared beside the function that reads it is
therefore **in the temporal dead zone** when that function is first called, and
the throw kills module evaluation — the page half-renders with the entire test
suite green, because nothing tests `main.js`.

This happened twice in one session, with `UNANCHORED_PANEL_IDS` and then again
with `SPRC_CHATTER_ENABLED` after the first had already been written up here.
**Declare module-level constants with the other constants at the top of the
file, not next to their reader.**

The second occurrence is the more instructive one, because of what it did to
the verification. The check that was supposed to prove Sal had gone quiet ran
for ninety seconds against a page that had thrown at boot, observed no Sal, and
would have been reported as a pass. A silent-death bug does not just break the
game — it makes every observation of the game agree with you. **Read
`document.documentElement.dataset.runtimeError` before believing any live
measurement**; `index.html` installs a handler that records it, and it is the
cheapest possible guard against measuring a corpse.

### One stacking ladder (2026-09-07)

Z-index was scattered across three dozen declarations between 1 and 999999,
several `!important`, and the result matched no intention: the paperwork drawer
sat ABOVE the journey card, processor tethers ran over the desk, the chambers
covered the viewport, and floating instruments buried the license. The order is
now declared once as custom properties at the top of `styles.css`, top to
bottom: journey, drawer paper, drawer, desk paper, desk panels, viewport,
chamber pipes and plug, chamber ore, chamber glow. `main.js` mirrors only the
bands it assigns directly.

Two things worth knowing before touching it. **A document's layer follows where
it is filed** — its z-index used to be decided once at boot, so paper that
started on the desk kept a desk layer after being filed and sat behind the
drawer holding it; `movePaperPanel` now sets the layer at the moment the paper
moves. And **the chambers open their own stacking context**, so the outbound
cargo wash uses `z-index: -1` rather than the ladder's `--z-chamber-glow`: a
positive z-index inside a stacking context paints above that element's in-flow
content, which would have put the glow in front of the ore it sits behind.

### The processor gather is a field, not a snap (2026-09-07)

`startCompaction` runs every idle frame, so bursting a ten-stack made its own
fragments — ten loose units of one kind, sitting together — the best gather
candidates in the chamber, seized on the very next frame. With other material
around it read as the burst being undone.

Fragments now carry a `settleUntil` stamp and are ignored while it stands, and
the gather that follows accelerates toward the target on a quadratic ramp over
~2.6s instead of lerping a fraction of the remaining distance each frame. That
old form compounds: the ore was most of the way home before the eye registered
it had moved. Gravity hands over to the field as the ramp climbs, which is what
makes it read as magnetic rather than as an animation playing.

Two existing tests encoded the old 0.38s timing and broke. They assert the right
OUTCOME, so they were made timing-agnostic — one runs the gather to completion,
the other drives the real `update()` loop — rather than being loosened.

### `display: revert !important` (2026-09-07)

A collapsed cockpit module hid its children with `display: none !important`, and
an expanded one undid that with:

```css
body.is-cockpit-layout .is-cockpit-module.is-cockpit-expanded > :not(.component-panel-title) {
  display: revert !important;
}
```

`revert` goes back to the USER-AGENT value — `block` for a div — and the
`!important` made it beat every author rule. So **every expanded panel child
that needed grid or flex silently got block**, with the correct rule present,
matching, and losing. That is why the docking readout ran its four fields inline
into each other, and why the Processor's outputs already carried an
`!important` grid patch as a one-off workaround.

Hiding is now scoped to `:not(.is-cockpit-expanded)`, so expanding a module
simply stops hiding things and nothing has to be forced back on.

**A debugging note that cost more than the bug.** Scanning `document.styleSheets`
to find "which rule wins" gave a confidently empty answer twice, because the
walker did `if (r.cssRules) { walk(r.cssRules); continue; }` — and with nested
CSS a plain `CSSStyleRule` now exposes an EMPTY `cssRules` list, which is
truthy. Every rule was treated as a container and its own declarations skipped.
Guard with `r.cssRules && r.cssRules.length`, and treat "no rule matches" from
a hand-rolled cascade scan as a claim to verify, not a result.

### Asymmetric overflow (2026-09-07)

Three layout complaints turned out to be one shape: a box positioned from one
edge while sized to the full container.

- The status bar was `position: absolute; inset: 6px 6px auto`, which sizes
  correctly — until a later rule set `position: relative`. On a relatively
  positioned box `left` shifts and `right` is ignored, so it kept full width,
  slid 6px right, and hung off that edge while still showing its left end.
- The module bay used `top: 48px; bottom: 34px`, so it hung lower than it sat
  high and a full list ran off the bottom. Its list now takes `flex: 1 1 auto`
  so the list is what gives, not the column.
- Floating instruments clamp when placed, but the position is SAVED — restored
  on a narrower window they sat off-screen with no pass to pull them back.
  There is now a resize re-clamp.

### A player who runs ahead of the script (2026-09-07)

The interview enables paperwork filing at `open-drawer` but only asks for it at
`file-contract`, four beats later. A player who filed as soon as the button
appeared was made to pull the documents back out and file them again, because
the flags only counted inside the asking beat.

Two things had to change, and the second was the real one.

- **Scope.** The `contract-filed` / `license-filed` considerations now listen
  from `open-drawer` through `file-contract`, so filing counts whenever it is
  possible. `file-contract` checks those flags on entry with the new
  `goToStepIfFlags` action and routes to `paperwork-already-filed`, where Rook
  says something different. Both paths rejoin at the same next beat, which the
  tests pin so the tutorial cannot fork.
- **`pendingAcknowledgement` silenced every consideration.** That is right for
  keeping the world from talking over Rook while he waits on an "Okay", but it
  also meant nothing a player DID during those beats was recorded — and two of
  the four beats in that window are acknowledgement beats. Filing there
  registered nowhere. Considerations may now opt in with `allowWhilePending`,
  mirroring the existing `allowWhileControlLocked`: it does not let them speak,
  it lets them observe.

Worth generalising from: **enabling an affordance several beats before asking
for it creates a window where the player can complete the ask early.** Either
the beat has to notice, or the affordance should not be there yet. Widening a
consideration's window is not enough on its own if the window contains an
acknowledgement.

### The journey card that went missing (2026-09-07)

Opening the mission card did nothing, in both cockpit and panorama, because the
card was several thousand pixels off the desk. Four causes, compounding, and
three of them were introduced while fixing the previous one.

- Clamping was disabled for the journey panel to stop a boot-time corruption
  (before the cockpit class lands it is the legacy slide-out drawer, parked
  off-canvas by design, and clamping "rescued" it to a nonsense offset). That
  also removed the safety net keeping it on screen.
- With no net, a dragged position could be saved off-screen and restored there
  forever.
- It was ALSO proportionally anchored. Two systems arguing over one position
  meant a bad offset was re-derived into a worse anchor on every boot — the
  observed values grew from 380 to 4360 to 7240 across reloads.
- The rescue itself made things worse by clamping: `clampPanelOffset` read the
  element's rect mid-update and, for a card already far off-screen, computed a
  correction from the stale box and threw it just as far the other way.

Settled shape: the journey card is **not anchored** (its position is CSS plus a
drag offset), it **is clamped once it is actually shown**, and a card found
entirely off-screen is reset to zero offset **without clamping** — zero needs no
correction because the stylesheet already centres and docks it. Saved records
for unanchored panels drop any anchor they carried, so a poisoned record cannot
outlive the decision to stop anchoring.

Two general lessons. **A saved layout outlives the window it was made in**, so
any restore path needs a way back for a panel the player cannot see to drag.
And **do not let two systems own one coordinate** — CSS placement, a drag
offset, and a proportional anchor were three, and each fix fed the next.

### …and why it dragged badly (2026-09-07)

Once it was findable it was still unusable: it slid away from the pointer before
being grabbed, lagged while dragged, and would not move upward. Three causes,
none of them in the drag maths.

- **`transition: transform 260ms`**, inherited from its slide-out drawer
  origins. Every pointer move set a new transform and the browser animated
  toward it, so the card trailed a quarter-second behind — and worse,
  `clampPanelOffset` then measured that IN-FLIGHT rect and corrected against it,
  which is what made it drift on its own and refuse to travel up. Nothing
  animates while `.is-dragging` now, and the cockpit card never transitions its
  position at all.
- **A `localStorage` write per pointer move.** `savePanelLayout` ran inside
  `pointermove` — a JSON.stringify and a synchronous write once per frame.
  Moved to the end of the gesture, which is the only time anything needs it.
- **Bottom-anchored with a content-driven height.** `bottom: 64px; top: auto`
  meant a longer line from Rook grew the card UPWARD — measured at 65px for one
  extra line — so it slid out from under a pointer that was reaching for it.
  Anchored by `top` now, so new dialogue grows down into the room `max-height`
  already reserves.

The general one: **a draggable element must not have a CSS transition on the
property the drag writes.** Any clamp that re-measures during the gesture will
read the animation, not the pointer.

### The bays are one space with furniture in it (2026-09-07)

The processor and cargo chambers were two boxes beside a picture. They are now
the full left and right sides of the desk, and material behaves as though both
sides share one room:

- **No gravity.** A bay the size of a wall is a hold, not a hopper — with
  gravity, however much ore you have ends up in a strip along the floor.
  `gravityScale: 0` lets the pile grow into the space it actually occupies.
- **Real obstacles, re-read every frame.** `getObstacles` hands the Processor
  the viewport scope and the module bay in that canvas's own coordinates.
  Material packs against them instead of drawing over them. The scope is passed
  as an ELLIPSE, not a circle: the two canvas axes scale differently from CSS
  pixels, so a round thing on screen is an ellipse in chamber coordinates and
  solving it as a circle pushes along the wrong normal.
- **A wall that arrives shoves.** `shoveFrom` fires when the module bay finishes
  sliding out, and the impulse travels on through the pile by ordinary
  unit-to-unit contact. Measured: average speed 0 → 339, decaying over ~600ms.
- **The designation is painted on the wall**, in the bay's lower third, the way
  a shipping floor marks off an area — a label on the space rather than a header
  above it, so it does not move as the pile grows.

Two tuning notes, both of which were wrong on the first attempt and both of
which are per-frame multipliers where small numbers matter enormously:

- `DRIFT_DAMPING` at 0.985 is a **60% loss every second**. Material stalled
  within a couple of hundred units of the inlet and clumped around the pipe. At
  0.997 (~17% a second) it crosses the bay and mingles, and still goes still
  rather than churning forever.
- The shove's falloff was measured against the wall's own width, which gave
  anything a few hundred units away about a tenth of the impulse — a two-pixel
  nudge. It is measured against the bay now and never drops below a quarter.

### The working bays and the plug (2026-09-07)

- **Processor and cargo moved to the bottom.** They were full-height columns
  either side of the scope, which made them narrow and put the pile at the far
  end of a shaft. At the bottom the viewport circle has already pulled in, so
  there is room for both to be wider AND for the ore to read as settling on a
  floor. Both bays are now the same size, bottom-anchored, and an equal 6px from
  their outer edges; their labels are centred in their own bay, because one was
  reading as centred and the other as hugging its edge, which is what made the
  pair look lopsided.
- **The outbound cargo wash is flat.** A radial gradient rising from the base
  looked like a candle flame rather than a bay that is lit up.
- **The plug docks when left alone.** After ~2.6s idle it eases into the left
  edge until only the grab end shows — measured at 29px, the same protrusion as
  the module tab, so the two things on that edge stick out by the same amount.
  It comes straight back out on hover or grab. The plug head is opaque now:
  seeing the asteroid field through the part you grab made it read as a hole
  rather than a handle.
- **The module tab yields to the plug.** Both live on the left edge and were
  happy to sit on top of each other. The tab moves, because the plug's position
  is the player's choice and the tab's is not.

## Where to read next

- `HANDOFF.md` — the running log, densest and most current
- `shipbuilding.md` — the active work stream and the ore-economy evidence
- `institutional-npcs-and-assets.md` — the actor model and asset archetypes
- `level-of-detail.md` — distant simulation, aggregation, drift budgets
- `observability-architecture.md` — diagnostics, blockers, the economy tab
- `project-map.md` — the file-by-file tour
