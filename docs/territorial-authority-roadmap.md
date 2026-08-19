# Territorial authority and player access

This is an explicit later step in the institutional-hub sequence, not an
unrelated side system. A procedural institutional NPC needs territory to be an
asset it can govern, license, defend, expand and lose.

## Required outcomes

- Every hub controls a coherent, visible area derived from world geography.
  Neighboring claims may meet, leave frontier gaps, or overlap as disputes;
  they are not arbitrary circles painted only for the player UI.
- Flight, docking, extraction and other access rights are separate scoped
  grants. Purchasing one writes a real authority record and immediately changes
  both enforcement and the rights overlay.
- The pilot's displayed authorization summarizes the grants actually held. A
  provisional label must not remain the only visible identity after permanent
  or specialized rights are acquired.
- First arrival has an authored legal answer. Frontier transit, approach
  corridors, visitor permits, distress exceptions, sponsorship and regional
  umbrella authorities are candidate mechanisms; the game should not make
  every undiscovered settlement an unavoidable crime scene.
- Territory is an institutional asset. It can provide resources, tolls, safety,
  settlement room or prestige and impose patrol, rescue, infrastructure and
  stewardship obligations.
- Expansion is a hub project driven by institutional motivation and knowledge.
  A hub may survey, claim, negotiate, buy, lease, contest or decline nearby
  space. Conflict emerges from incompatible claims rather than a scripted war
  flag.

## Sequence position

Implement this after the general hub planner and operational-NPC promotion
groundwork, and before authored and generated hubs converge on one seed
pipeline. That ordering lets territorial ambitions use the same durable need,
response, project, capability and history model, while ensuring procedural hubs
are born into the final authority system rather than migrated into it later.

## Implemented foundation — 2026-08-18

- All nine authored settlements now receive a `territory-charter` asset and a
  deterministic geographic jurisdiction derived from the shared world-site
  positions. Nearby domains meet at nearest-hub boundaries; isolated outer hubs
  are capped, leaving genuine frontier gaps.
- Each jurisdiction is a real `Place` and gives its institutional owner scoped
  governing and enforcement grants in the shared authority registry.
- Visitor approach remains lawful without a work pass. Extraction and standing
  commercial privileges are separate rights.
- The Yard Exchange Travel Authority now offers a work pass for every current
  hub. A purchase creates a territory-scoped authority grant, pays the issuing
  hub's real treasury, changes the overlay immediately, persists in saves, and
  upgrades the pilot document to Regional Operator.
- Hub inspection exposes the jurisdiction beside the hub's other assets,
  capabilities, treasury, population, projects, and history.

Still deliberately later: active patrol enforcement, territorial upkeep and
income policy, procedural surveying/claim projects, negotiation between
institutions, contested overlaps, transfer or loss of territory, and generating
new jurisdiction seeds for newly created hubs.

## Overlay and catalog second pass — 2026-08-18

- Each hub jurisdiction now owns a stable, distinct overlay color. Adjacent
  territories remain separate visual clusters and their shared border blends the
  two institutional colors.
- A restricted cluster labels the controlling hub, states `MINING RIGHTS
  REQUIRED`, and directs the pilot to `YARD EXCHANGE TRAVEL AUTHORITY`.
- Unclaimed space is explicitly open. Legacy world-region mining restrictions,
  provisional zone-flight violations, and their inspection flags are dormant;
  the current overlay is driven only by hub territory.
- Flight remains open in this policy pass. The only blocked action visualized is
  mining/work inside a hub jurisdiction without that hub's pass.
- The Travel Authority storefront contains exactly nine entries: one complete
  work pass per current hub. Standalone zone-flight, Copper Wake mining, and
  Ledge docking permits are no longer offered.
