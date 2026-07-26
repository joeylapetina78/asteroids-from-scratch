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
- A completed shipment debits the issuer's committed payment and credits the carrier's named operating account (or the player's normal contract payment path). Carrier income and repair expenses are retained as account transactions.
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
- Authored destinations and connections live in `content/transportation/firstReachNetwork.js`. The known network includes The Ledge and its premium outbound and return freight offers.
- Each carrier institution owns its known destinations, expected wear rate, maximum wear, minimum return margin, operating-distance cost, and repair-provider preferences.
- Dispatch evaluates every local offer before execution. An unreachable destination, missing maintenance path, or maintenance-policy violation makes an offer ineligible and records the reason.
- Shipment mutation happens only after route execution accepts the evaluated path. A rejected path cannot renew or remove source inventory, create custody, or commit issuer payment.
- Multi-stop paths are executable by the ship, but only arrival at the contracted final destination completes the shipment.
- Authored connections may define a physical freight corridor. The shared corridor builder turns that data into a deterministic curved centerline, navigation waypoints, widened hub approaches, and a generation clearance envelope. The Yard Exchange-The Ledge connection is the first instance.
- Haulers and recovery towing follow the same physical corridor route. Local navigation samples several headings ahead of the vehicle, favors wide forward openings, and accounts for the larger towing envelope before close-range avoidance takes over.
- Navigation wear is charged by distance traveled rather than elapsed struggle time. Corridor entry, exit, and obstacle replanning are recorded with carrier identity and can be inspected in the ledger.
- A corridor may also define an authored course profile over the procedural centerline. The first freight corridor uses alternating switchbacks, tight esses, broad sweepers, small seeded variation, a narrower cleared road, and arc-length-spaced navigation points. NPC haulers reduce speed according to upcoming turn angle; ordinary corridor travel receives the lower wear expected from an engineered road.
- Maintenance eligibility is calculated explicitly as `current wear + contract-route wear + destination-to-selected-provider wear + minimum return margin <= maximum wear`. Route wear is authored expected wear per distance.
- Provider selection considers every institution-listed repair option whose destination is known and reachable from the contract destination, ordered by authored priority and then distance. Provider capacity and operating status are not yet modeled.

## The Ledge transfer proof

- Yard Exchange posts higher-paying iron-nickel freight to The Ledge; The Ledge posts renewable silicate freight back to Yard Exchange.
- A healthy carrier scores the longer Ledge work above the Scrap Porch return. A worn carrier makes the Ledge offer ineligible and can still choose the shorter SPRC-compatible work.
- If no freight remains eligible near the wear limit, the carrier creates a cargo-free service-return movement to its selected repair provider. This movement commits no inventory, custody, or freight payment.
- A maintenance-policy rejection itself forces reconsideration for service; there is no gap where a carrier can be too worn for every route but below an unrelated repair threshold.
- Preventive return to SPRC creates a small service order. Repair completion resets persistent ship wear and makes the carrier reconsider work.
- Each carrier, controlling person, and ship has its own public references; the carrier owns an operating account and bounded transaction history. Repair completion transfers the service fee from that account to SPRC instead of creating revenue from nothing.
- Carrier accept, load, fulfillment, idle/blocked reasoning, breakdown, maintenance return, repair payment, and restoration events are published to the visible ledger with the pilot and carrier identity attached.
- Hub, patrol, flyby, and player resource scans publish named scanner/subject events to the same ledger.

## Completion evidence

The testable history connects:

`institution demand -> shipment order -> container -> custody -> load -> travel/fuel/wear -> unload/inventory -> payment -> maintenance need -> SPRC response -> repair/downtime -> return to service`

The first upstream production proof now precedes that chain. Each active hub publishes one evergreen local extraction order. Cinder Contracting, controlled by licensed miner Ivo Cinder, owns three registered worker ships: Cinder One, Two, and Three. Each uses shared flight physics to select a rock by its real dominant yield, fly to it, fire physical mining shots, collect the resulting world pickups, return to the buyer, and settle payment between persistent institutional accounts. Their tractor fields currently use evergreen prototype power. They recover their own mined pickups plus loose unclaimed resources, but do not treat another claim's loose cargo as free salvage. Delivered water ice, iron nickel, or silicate enters the same hub inventory used to create freight containers. Empty freight sources no longer synthesize replacement stock; haulers wait for real inventory.

## Institutional recovery

- First Reach Recovery is a `recovery-service` institution controlled by licensed operator Nell Winch. It owns the Blue Hook recovery ship and a persistent operating account.
- Player and carrier rescues create service requests with a destination, purpose, quote, status, and payment record. Completed service credits the provider instead of destroying the tow fee.
- A hauler disabled with contracted cargo is recovered to the freight destination first so custody and issuer payment remain conserved. After unloading, a second paid service leg takes the ship to SPRC and releases its wear issue into the repair queue.
- A loaded freight payment can secure the first recovery quote as a receivable; ordinary recovery must still preserve the carrier's minimum operating cash. Unaffordable or unreachable requests remain blocked and visible in the ledger.
- In the viewport, a carrier under recovery shows Blue Hook ahead of it with a live tow line rather than moving invisibly under its own power.

Every material, custody, condition, and payment transition must remain conserved and reload-safe.
