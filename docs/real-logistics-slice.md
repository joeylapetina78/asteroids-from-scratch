# Real logistics and wear

This slice closes a small regional freight loop with two standing offers, two NPC carriers, and the player using the same shipment lifecycle.

## Scope

- Scrap Forge renewably supplies water ice to Yard Exchange; Yard Exchange renewably supplies iron-nickel to Scrap Forge.
- Two standing offers create work at the source sites. NPC carriers must be docked at the recorded origin before accepting one and only move after assignment; the player sees the same offers in the normal local job board.
- One cargo container receives an identity, contents, owner, custodian, source, destination, and manifest.
- Loading transfers custody to the hauler without transferring ownership.
- Docking tethers visualize those recorded custody transitions only: the transferred commodity's authored color and shape moves hub-to-ship on loading and ship-to-hub on unloading. The same renderer is used for player cargo sales and contract transfers; there is no ambient fake cargo flow.
- The existing visual route advances a real assigned shipment record.
- Carrier movement continues outside the player's local simulation radius; leaving a hub no longer pauses regional freight.
- Travel incurs persistent wear. Careful mode accelerates maneuvering strain, so it has a physical cost.
- Unloading transfers conserved inventory to Scrap Porch and closes custody.
- A completed shipment debits the issuer's committed payment and credits the carrier (or the player's normal contract payment path).
- Accumulated wear creates inspection, maintenance, or breakdown state instead of the provisional route-count trigger.
- Downtime removes the hauler from transport capacity while the existing SPRC institution loop procures, produces, and repairs.
- Wear discovered in transit is held as a pending issue until the current shipment is conserved and the carrier reaches its maintenance hub; maintenance cannot strand paid cargo in deep space.

## Explicit non-goals

- No general freight market.
- No fleet dispatcher or route optimizer.
- No hub ruler, taxes, employment simulation, or macroeconomic counters.
- No arbitrary cargo spawning or payment without matching account debits.
- No additional Sal planning unless a concrete logistics condition requires it.

## Transportation planning seam

- `transportationPlanning.js` contains domain-neutral network construction, shortest-route discovery, projected wear, reachable-maintenance, policy eligibility, and candidate scoring.
- Authored destinations and connections live in `content/transportation/firstReachNetwork.js`. The known network currently includes The Ledge so path transfer is testable, but no Ledge freight offer is authored yet.
- Each carrier institution owns its known destinations, expected wear rate, maximum wear, minimum return margin, operating-distance cost, and repair-provider preferences.
- Dispatch evaluates every local offer before execution. An unreachable destination, missing maintenance path, or maintenance-policy violation makes an offer ineligible and records the reason.
- Shipment mutation happens only after route execution accepts the evaluated path. A rejected path cannot renew or remove source inventory, create custody, or commit issuer payment.
- Multi-stop paths are executable by the ship, but only arrival at the contracted final destination completes the shipment.

## Completion evidence

The testable history connects:

`institution demand -> shipment order -> container -> custody -> load -> travel/fuel/wear -> unload/inventory -> payment -> maintenance need -> SPRC response -> repair/downtime -> return to service`

Every material, custody, condition, and payment transition must remain conserved and reload-safe.
