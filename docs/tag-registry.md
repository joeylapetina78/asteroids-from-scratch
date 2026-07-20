# World Tag Registry

World tags are small authored facts about a place. They are not atmosphere-only
labels: each tag must have at least one running system that reads it.

The canonical vocabulary lives in `src/systems/tagRegistry.js`. Startup content
validation rejects a zone or region that declares an unknown tag.

## Authoring Rule

When adding a tag:

1. Add it to `TAG_REGISTRY` with an axis and the system(s) that read it.
2. Add the reader in the same change. Do not register future intent.
3. Declare it on a zone or region only after its reader exists.
4. Prefer an existing tag when the behavior is already covered.

## Axes

| Axis | What it describes | Current readers |
| --- | --- | --- |
| Navigation | Flight geometry and local traversal | `worldTerrain`, selected life fields |
| Geology | Rock and field character | `worldTerrain` |
| Survival | Availability of fuel, charge, and scanergy materials | `resourceField` |
| Life | Ambient ecology and strange encounters | life fields |
| Danger | Encounter pressure and survey hazard | `incursionDirector`, `surveyContracts` |
| Authority | Who has a relationship to local work | `surveyContracts` today; claims and inspection next |
| Economy | Why a place offers particular work | `surveyContracts` |

## Current Shared Consumers

- `resourceField` uses survival tags to bias resource availability.
- `surveyContracts` reads blended zone plus region tags to describe survey
  ground and apply transparent hazard, frontier, prospecting, and demand pay.
- `game.js` translates danger tags into local incursion pacing which is then
  combined with the Encounter Director's player-pressure response.
- `worldTerrain` keeps navigation and geology tags responsible for the shape
  of space, rather than using economic tags to make terrain decisions.

## Next Readers

Authority tags should next feed the claim and charter records, then the rule
checker and inspections. A tag can describe why a place is interesting; the
claim, authority, and document records must remain the source of truth for
who is legally allowed to act there.
