# Asteroids RPG

A browser-based space RPG built around a world-centric institutional simulation. The player pilots a ship through a procedurally zoned field, but the core of the game is navigating institutions — banks, registries, mining authorities, employers, patrol organizations, shipping companies, factions, and courts — that issue documents, own assets, hire people, lend money, enforce laws, inspect ships, and write contracts.

Mining is one profession within that world. Hauling is another. Salvage, patrol, bounty work, piracy, and search-and-rescue are others. The same underlying systems — documents, contracts, components, inspection rules, and AI behaviors — should support all of them.

For the current implementation and future-agent handoff, start with [docs/HANDOFF.md](docs/HANDOFF.md). For the deeper system map, see [docs/project-map.md](docs/project-map.md).

---

## Design Direction

**The world is the object. The player is one entity inside it.**

Ships have VINs. Documents are issued by institutions and held by people, ships, or companies. Contracts create obligations and grant permissions. Hubs and patrols check documents through inspection rules. The important question is always: *does this person have a valid document that grants permission to do this action, in this place, with this asset, right now?*

This means:

- You own the ship but the bank holds the title.
- A hub checks registration but not title.
- A repo crew has a document giving them legal authority to seize it.
- A criminal has the ship but not the paperwork.
- The player has the paperwork but not the ship.

Ships are hulls with components attached. A mining ship is not a special hardcoded type — it is a hull with mining-capable components, valid documents, and the right contracts. A patrol ship is a hull with patrol-related components, patrol authority, and enforcement behavior. The same structure applies to haulers, tow trucks, drones, player ships, and NPC ships.

Documents follow the same philosophy. Pilot licenses, mining licenses, ship registrations, titles, loan agreements, delivery contracts, patrol permits, cargo manifests, and identity documents should be built from a shared authority framework — not as isolated one-off systems. A document can be issued, held, inspected, expired, revoked, forged, transferred, or used as collateral.

The game should feel like a living institutional world that the player participates in, not a set of systems built around the player character.

---

## Run It

```powershell
python -m http.server 8123
```

Open `http://127.0.0.1:8123/`.

Dev shortcuts:

- `?resetSave=1` — clears the local save
- `?devStart=red-work` — starts fresh near Yard Exchange with the starter mining setup

---

## Controls

| Key / Button | Action |
|---|---|
| A / D | Rotate left / right |
| W | Thrust |
| S | Brake |
| Space | Fire mining charge |
| Power Ship | Toggle ship systems on/off |
| Thrust mode | Forward or low-power reverse |
| Blaster armed | Enable/disable mining shots |
| Tractor Field | Hold to pull nearby loose resources |
| Processor output | Choose where crushed units go |
| Processor click | Crush a collected unit into selected output |
| Panel title drag | Move component panels on snap grid |

---

## Current State

The opening chapter runs a guided prologue that introduces the institutional world through Rook Industries and Yard Exchange:

1. Rook issues a provisional flight license under RTC authority (Form RTC–109–P).
2. The player files the license in the paperwork drawer.
3. Rook offers a delivery contract — 500 credits to fly the yard skiff to Yard Exchange.
4. The player powers up, navigates using the beacon locator, and docks.
5. Completing the contract pays out. Rook evaluates the run.
6. Barvis at Yard Exchange Shipyard shows the Rook special mining ship.
7. Mr. Mako at Yard Exchange Finance provides a 20,000-credit starter ship loan.
8. The player buys the ship, now holding title and debt simultaneously.
9. Rook opens a repeatable resource-delivery contract board at Rook Industries.

The mission system runs on authored **beats** — discrete story units each with an objective, help text, ambient considerations, and event-driven transitions. Mission-level considerations scope ambient dialogue to beat ranges so Rook's rock-collision commentary fires from the first flight beat through the end of the mission without being duplicated across every beat. The tow truck system is global — it operates independently of any mission through a separate event listener in main.

The event ledger records meaningful career and world events. Contracts, legal records, ship state, and hub services all read from the same ledger rather than each building their own state.

The prototype now runs a six-hub institutional economy. Populations create demand; hubs produce, discover competing suppliers, buy physical material, hire freight, and expose prices and blockers; Cinder and Flint compete for extraction; several carriers move purchase-backed manifests and can expand from sustained demand; SPRC repairs compatible craft from conserved inputs; patrol offices and independent providers answer real incursion threats. The player increasingly accepts the same procedural mining, freight, bounty, salvage, and protection work through the same underlying records. See [docs/HANDOFF.md](docs/HANDOFF.md), [docs/session-2026-08-06.md](docs/session-2026-08-06.md), and [docs/multi-actor-economy-expansion-audit.md](docs/multi-actor-economy-expansion-audit.md).

The Yard Exchange-The Ledge route is also a reusable procedural freight corridor: an authored connection produces a deterministic curved centerline, navigable shoulders, NPC waypoints, debris-clearing pressure, and bidirectional kinetic speed pads. Institutional recovery uses the same transportation network when a carrier cannot finish under its own power.

Recent architecture prep has focused on keeping future content from becoming one-off script glue:

- Mission rules and mission actions now have named system modules.
- Contract fulfillment rules now have a reusable predicate layer.
- Hub services now have behavior and contract-selection helpers instead of burying every decision in the page coordinator.
- `state.worldRecords` now stores the first generic entity/document/relationship records alongside the older `state.legal` compatibility shape.
- `npm run validate:content` checks mission, contract, hub-service, panel, component, and attention references before content reaches the game.

The save system is browser-local and for playtesting only. Save keys may be intentionally bumped as architecture evolves.

---

## What's Next

The immediate milestone is long-run validation of the six-hub economy: watch effective material prices, supplier capacity, freight waiting time, carrier capitalization, settlement production, repair queues, protection losses, and retained-record growth. Use the new `carrier.hireDeferred` ledger events to decide whether ordinary fleet growth should rely on retained earnings, loans, leases, or hub guarantees.

The next larger system should complete public maintenance for patrol and recovery craft and use a second provider to prove that repair/recovery are truly configurable. Merchant ownership and brokerage, manufacturing, used parts, criminality, piracy, and higher authority rights remain the larger progression described in [docs/HANDOFF.md](docs/HANDOFF.md).

The near-term track is building out the document/authority framework so that pilot licenses, ship titles, registrations, loan liens, mining permits, and hub access passes share structure instead of being isolated systems. That foundation enables inspections, zone enforcement, document forgery, debt mechanics, repo events, and new professions without rewriting the core player systems.

The parallel track is a mission and contract designer backend — a web interface for authoring beats, considerations, transitions, and contract terms without touching code.
