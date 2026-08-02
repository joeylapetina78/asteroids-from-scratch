# Patrol economy roadmap

## Current checkpoint: patrols become finite assets

The first anti-cheat patrol slice replaces the anonymous global responder with
one patrol institution and one titled craft per First Reach hub. Each office has
a controller, authority and license records, an operating account, protected
cash, and a locally registered patrol craft.

Dispatch now consumes an available craft. A patrol travels from its hub to the
incident instead of teleporting to the player, can be struck and destroyed by
incursion fire, and leaves a titled wreck through the ordinary destruction and
salvage path. A deployed or destroyed craft cannot be dispatched again. Scanner
events now require the physical patrol; the old synthetic hub-traffic patrol
scan has been removed.

This intentionally remains the smallest useful foundation. The viewport still
streams one active patrol encounter at a time; the other five craft persist as
institutional capacity rather than six simultaneously simulated off-screen
fighters.

## Current checkpoint: protection demand becomes institutional work

Hubs now carry different authored protection policies: direct, contracted, or
hybrid. A shared evaluator reacts to a real nearby incursion using distance,
hostile force, population and inventory exposure, available owned capacity,
cash, and protected reserve. It records the expected loss and the reason for
the response.

Direct hubs assign their own available patrol. Contracting hubs publish open
threat-response work on the common contract board. Hybrid hubs use owned
capacity below their configured severity threshold and seek outside help for a
larger incident. A hub unable to fund a response without crossing its reserve
publishes a visible blocked request rather than receiving free protection.
Requests close when their originating threat is destroyed.

The next implementation slice is provider-side bidding and execution. Open
requests do not yet choose or pay an independent mercenary company.

## Next patrol/incursion steps

1. Instantiate the first independent patrol company and let qualified providers
   bid on open threat-response work by price, distance, risk, relationships,
   current damage, and commitments.
2. Execute accepted patrol, escort, and incursion-clearance contracts with a
   physical craft. Leave the player eligibility seam open for the same jobs.
3. Charge deployment and damage costs to the patrol office and pay successful
   work from the hiring institution's account.
4. Route damaged patrol craft through public repair matching. A destroyed craft
   should create a replacement need that must be funded, built, titled, and
   registered before local capacity returns.
5. Expand encounter streaming so multiple distant patrol outcomes can resolve
   without inventing phantom scans or combat.

## Invariants

- No dispatch without an available owned craft.
- No scan, interception, or attack without a physically represented participant.
- Damage, destruction, title, wreck ownership, payment, and replacement remain
  ledger-visible institutional facts.
- Patrol capacity is finite. Losing a craft creates a real coverage gap.
- The player and NPC providers should eventually use the same public contracts.
