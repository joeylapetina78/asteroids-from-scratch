# Operating rights & enforcement roadmap

Making the world's rights real for the pilot: where you may fly and mine, seeing
where you may not, buying in, and being stopped when you don't. This is the
gameplay layer on top of the authority skeleton (`authorityModel` / `ruleChecker`
/ `authoritySeeds`) — see [authority-model.md](authority-model.md).

Three slices, built in order because each depends on the last:

1. **Foundation + viewport visuals** — the pilot's rights become real, and they can
   see where the lines are. **BUILT 2026-08-08.**
2. **Rights marketplace** — the capital Authority sells rights (a bundled work
   pass + individual permits), scoped to what it controls. **BUILT 2026-08-09.**
3. **Enforcement + fine/tow** — a funded patrol catches a ship operating without
   rights, stops it, and tows it to a hub to pay a fine or buy the missing right.

---

## Slice 1 — foundation + visuals (BUILT 2026-08-08)

### The model

`src/systems/operatingRights.js` is the **read** side of the rights model — it
grants nothing and enforces nothing, it answers "may I mine here?" so the viewport
(and, later, a patrol and a hub) can ask instead of hardcoding player state.

- A plot only needs a mining right when its region's mining status is a
  charter/claim/lease/permit (`*-required` / `restricted`). Open or unassigned
  frontier needs none and is never flagged. The status and controlling
  `authorityId` come from the region data via the claim field — no hub is named.
- The pilot holds a set of mining **authorities** (`state.legal.operatingRights.mining.authorityIds`).
  To start this is only `rook-industries` — Rook's sponsoring permit RI-7A3, matching
  the license card. Controlled ground under any other claims office reads as
  off-limits until the pilot buys or is granted the right (slice 2).
- An **active source-limited contract** grants its own `sourceClaimIds` for as long
  as it runs (an Ore Ridge run makes its charter plots legal without changing
  standing rights). This reuses the existing contract-claim data.
- `evaluatePlotMiningAccess(state, plot)` → `{ controlled, allowed, via, authorityId }`;
  `isPlotRestrictedForPlayer(state, plot)` is the viewport's question.

Not a `player.canMine` flag: the pilot's rights are a set of authorities, each
plot carries its own controlling authority, and access is the intersection.

### The overlay

`Game.drawRestrictedRightsOverlay` (game.js) reuses the same claim-field geometry
and dashed treatment as the contract plots, but driven by the pilot's rights:

- Shades each controlled plot the pilot may not work, and dashes **only the outer
  boundary of a cluster** (an edge restricted on exactly one side) via a flood fill
  over restricted-plot adjacency, so a region reads as one shape, not a hex grid.
- Labels each cluster at its centroid: `NO MINING RIGHTS` + the humanized authority.
- Enriches each `getPlotNetwork` plot with `getClaimAt(center)` first — the network
  returns bare hex geometry; the mining right lives on the claim beneath it. (This
  was the one real bug found in live testing.)
- **Default on**; toggled from the pilot license (`state.ui.rightsOverlayEnabled`,
  `#rights-overlay-toggle`). The viewport reads the flag live each frame.

Verified live: Cold Reach (`permit-required`, coldreach-patrol-office) and Copper
Drift (`lease-required`, copperline-prospectors) shade red near the start, while the
Rook-chartered home ground stays clear; the toggle turns it off and on.

### Tests

`tests/operatingRights.test.mjs` — open ground is never restricted; held authority
clears controlled ground; a foreign authority is off-limits; an active contract
grants its claims and reverts when it ends.

### Open follow-ups for later slices

- **Flight rights** are modeled the same way but not yet visualized or checked (this
  slice is mining-only). A "you may not FLY here" treatment is a small extension.
- Plots aren't yet `Place` records, so `canActorDoAction` can't check them by
  lineage — `operatingRights` reads the plot's own right directly for now. When plots
  become places (authority-model Next Step 2), route through `canActorDoAction`.
- Override/decay, region-scoped rights beyond authority id, and owner (`ownerId`)
  claims are all natural extensions of the same access function.

---

## Slice 2 — rights marketplace (BUILT 2026-08-09)

The capital **Yard Exchange Authority** sells the rights to operate in the territory
it controls, at the Travel Authority window. Built on the permit system that already
existed (`contractManager.purchasePermit` / `applyPermitGrant`).

- **Grant types.** `applyPermitGrant` now applies a bundle: `grantZones` (adds to the
  license's `authorizedZones` — flight) and `grantMiningAuthorities` (adds to
  `operatingRights.mining.authorityIds`), alongside the legacy single `zoneId` and
  `hub-docking`. The slice-1 overlay reflects both the instant they land.
- **What sells.** A **Yard Exchange Work Pass** (800 cr) bundles flight for Copper
  Drift + mining under the Copperline subsidiary — the whole home belt at once — plus
  a standalone **Copper Wake Mining Lease** (500 cr) and the pre-existing single
  flight/docking permits, all at the one window.
- **Bounded control.** The pass grants only what Yard Exchange controls (rook-frontier
  / red-vein-belt / copper-wake). **Ore Ridge** stays its own frontier permit and
  **Cold Reach** (Coldreach Patrol Office) stays outside entirely — verified live.
- **Funds → the authority.** `src/systems/rightsAuthority.js` seeds a
  `yard-exchange-authority` institution (`state.authorities`); permit fees accrue to
  its account via `recordAuthorityRevenue`. Its treasury is deliberately **outside**
  the tracked institutional economy (not in `listAccountHolders`), so buying a pass
  cannot distort the money reconciliation before the authority is a real spender.
- **Tests.** `tests/rightsMarket.test.mjs` — the pass grants flight + mining and pays
  the authority; the lease grants mining only; a single flight permit is not mining;
  a pass can't be bought without the credits and grants nothing.

Still open: the pass mentions hauling, but there is no haul-rights gate yet (hauling
is a carrier activity, not a player-gated one) — it is flavor until that exists.
Patrolling rights for a qualifying pilot remain a later addition.

## Slice 3 — enforcement + fine/tow (planned)

A patrol funded to watch its jurisdiction detects a ship (the pilot or an NPC)
mining/flying without the right, approaches and hails with the normal patrol
approach, and tows it to a hub (reusing the tow flow). At the hub the pilot pays a
fine or buys the missing right (slice 2) to be released. The detection asks the same
`operatingRights` question the overlay does, so what the pilot was warned about in
red is exactly what gets enforced.
