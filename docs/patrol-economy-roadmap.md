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

## Next patrol/incursion steps

1. Make hubs and institutions evaluate local threat, expected loss, cash, and
   existing coverage before requesting protection.
2. Publish patrol, escort, and incursion-clearance contracts rather than creating
   free responders. Allow qualified patrol providers and the player to compete.
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
