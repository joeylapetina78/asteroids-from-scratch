# Used-universe condition and maintenance roadmap

## Design objective

Ships are persistent collections of installed components, not disposable actors
with one health number. Engines, hull sections, steering, docking gear, scanners,
mining equipment, tractor fields, shields, and later equipment carry their own
condition and history through use, service, transfer, salvage, and recycling.

Every component condition has two independent values:

- **Current condition** is repairable damage and ordinary wear.
- **Lifetime degradation** permanently lowers maximum recoverable condition.

`maxRecoverableCondition` is derived from lifetime degradation. Ordinary service
restores current condition to that ceiling; it does not make an old component
factory-new. Replacement, rebuilding, or remanufacturing will eventually be the
ways to change the ceiling.

## Failure progression

The common progression is `healthy -> degraded -> emergency -> failed`.
Component-specific rules translate those stages into symptoms:

1. reduced efficiency, output, accuracy, or speed;
2. sputtering, dragging, intermittent operation, and warnings;
3. control problems and temporary failures;
4. shutdown, loss of capability, or stranding.

Continued use after a warning accelerates wear. Stage thresholds and symptoms
belong to the component archetype, while the condition transition machinery is
shared.

## Wear sources

Wear is caused by recorded work, never wall-clock age alone:

- thrust, travel distance, boost, route hazards, and heavy cargo;
- mining shots, tractor-field operation, and completed extraction work;
- collisions, combat damage, shield load, and operation while damaged;
- later, poor installation, low-quality parts, and inadequate maintenance.

Actors must evaluate projected component wear, route risk, maintenance access,
cargo value, insurance, and cash reserve before accepting work. A low headline
payout should not justify consuming more component value than a run creates.

## Economic lifecycle

Component faults enter public maintenance matching and a physical repair queue.
Service consumes compatible capability, berth time, labor, materials, parts, and
money. Missing inputs create procurement or manufacturing demand. Failure may
cause towing, delayed or lost freight, insurance claims, debt, reputation loss,
piracy exposure, salvage, or permanent loss.

Components remain assets when removed. Later milestones can support used-part
sales, inspection, claimed versus actual condition, rebuilding, liens,
repossession, title transfer, stripping, and recycling without inventing a second
condition representation.

## Reliability

Reliability is an actor history derived from maintenance choices and outcomes,
not a fixed trait. Safe completion, preventive service, shields, and insurance
should improve access to valuable contracts and rates. Deferred maintenance,
breakdowns, cargo loss, and misrepresented condition should worsen it.

## Implementation sequence

1. **Shared component record — implemented.** `panelMaintenance.js` now tracks
   current condition, lifetime degradation, maximum recoverable condition,
   service count, stage, and the legacy wear projection. Old saves migrate.
   Deferred maintenance accelerates subsequent wear; service respects the aged
   ceiling. Player engine and hull records use this shape.
2. **Mining-craft proof.** Give structure, mining laser, tractor field, and field
   control separate records. Mining actions wear the relevant component and
   existing SPRC issue recipes repair the actual failed component.
3. **Freight proof.** Give haulers propulsion, steering, docking, hull, and cargo
   handling records. Job valuation reads the real components and projected trip
   use; the scalar wear field becomes a compatibility projection only.
4. **Physical repair completion.** Repair orders name component IDs, preserve
   lifetime degradation and service history, and distinguish repair from
   replacement or rebuilding.
5. **Expand craft classes.** Patrol, recovery, incursion, and gate machinery use
   the same records with different component archetypes and service rights.
6. **Used assets and reliability.** Persist ownership and service history through
   resale, wreckage, salvage, recycling, insurance, lending, and reputation.

## Guardrails

- No component condition resets merely because an entity respawns or changes
  owners.
- No repair bypasses the public service/material/payment lifecycle.
- No shared condition code names a specific NPC, institution, craft class, or
  component type.
- Scalar hull or wear fields may remain during migration, but must be documented
  as projections and must not become a competing source of truth.
- Accelerated development controls change cadence only; they do not use a
  different failure model.
