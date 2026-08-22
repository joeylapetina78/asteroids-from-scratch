import { PLACE_TYPES, POWER_TYPES, RIGHT_TYPES } from "./authorityModel.js?v=fresh-20260822-1218-d80c6f63";
import { upsertAuthorityGrant } from "./authorityRegistry.js?v=fresh-20260822-1218-d80c6f63";
import { ensureRegionPlace, upsertPlace } from "./placeRegistry.js?v=fresh-20260822-1218-d80c6f63";
import { WORLD_REGIONS } from "./worldRegions.js?v=fresh-20260822-1218-d80c6f63";
import { settlementMiningRights, settlementPlaces } from "../content/economy/firstReachSettlements.js?v=fresh-20260822-1218-d80c6f63";
import { seedHubTerritories } from "./hubTerritories.js?v=fresh-20260822-1218-d80c6f63";

const RIGHT_TO_POWER = Object.freeze({
  [RIGHT_TYPES.TRANSIT]: POWER_TYPES.AUTHORIZE_WORK,
  [RIGHT_TYPES.MINING]: POWER_TYPES.AUTHORIZE_WORK,
  [RIGHT_TYPES.PATROL]: POWER_TYPES.AUTHORIZE_WORK,
  [RIGHT_TYPES.SALVAGE]: POWER_TYPES.AUTHORIZE_WORK,
  [RIGHT_TYPES.CONSTRUCTION]: POWER_TYPES.AUTHORIZE_WORK,
  [RIGHT_TYPES.TRADE]: POWER_TYPES.CONDUCT_COMMERCE,
  [RIGHT_TYPES.ENFORCEMENT]: POWER_TYPES.ENFORCE_RULES,
});

// Which resource families each institution may commission EXTRACTION for.
//
// Step three gives each hub foundational authority across every family so it
// can later charter missing extraction. Authority is not an installed mine:
// extraction definitions and assets still name current production, preserving
// real imports and freight outside a hub's specialty.
//
// This is the whole rule. Nothing downstream checks a hub by name: the seed
// turns each row into an ordinary authority grant, and the existing rule
// checker enforces it like any other right. Adding a hub, moving a family, or
// granting a second family is a data edit here.
//
// The Scrap Porch hub institution is `scrap-forge`; SPRC is a separate
// cooperative at the same site. SPRC's repair supply spans three families, so
// it holds a broad grant rather than a single-family one — gating a
// cooperative that buys copper, silicate, iron-nickel and aluminum to one
// family would stop the repair economy dead.
export const INSTITUTION_MINING_RIGHTS = Object.freeze([
  ...settlementMiningRights(),
  { institutionId: "sprc", placeId: "hub:scrap-porch", families: ["structural", "industrial", "conductor"] },
]);

// Trade is deliberately unlimited by family. A hub may buy or sell anything
// from anyone; only extraction is specialized. Nothing enforces trade rights
// yet, so these grants are declarative today — they exist so the split between
// "what I may dig up" and "what I may deal in" is visible in the records rather
// than implied by an absence of checks.
const BROAD_TRADE_RIGHT_HOLDERS = Object.freeze([
  ...settlementMiningRights().map((right) => ({ institutionId: right.institutionId, placeId: right.placeId })),
  { institutionId: "sprc", placeId: "hub:scrap-porch" },
]);

const MINING_RIGHT_HUBS = Object.freeze(settlementPlaces());

export function seedAuthorityFoundation(state) {
  upsertPlace(state, {
    id: "universe:known-space",
    type: "universe",
    name: "Known Space",
  });
  upsertPlace(state, {
    id: "system:first-reach",
    type: "system",
    name: "First Reach",
    parentPlaceId: "universe:known-space",
  });

  WORLD_REGIONS.forEach((region) => {
    const place = ensureRegionPlace(state, region);

    Object.entries(region.rights ?? {}).forEach(([rightType, right]) => {
      const holderId = normalizeInstitutionId(right.authorityId);
      const powerType = RIGHT_TO_POWER[rightType];

      if (!holderId || !powerType) {
        return;
      }

      upsertAuthorityGrant(state, {
        id: `authority:${holderId}:${rightType}:${region.id}`,
        holderId,
        powerType,
        jurisdictionType: place.type,
        jurisdictionId: place.id,
        grantedById: "institution:frontier-regional-authority",
        status: "active",
        limits: {
          rightTypes: [rightType],
          regionRightStatus: right.status,
        },
      });
    });
  });

  seedInstitutionMiningRights(state);
  seedHubTerritories(state);
}

// Hubs become places so a mining right can be scoped to one, and each
// institution gets a family-limited grant the shared rule checker enforces.
function seedInstitutionMiningRights(state) {
  MINING_RIGHT_HUBS.forEach((hub) => {
    upsertPlace(state, {
      id: hub.id,
      type: PLACE_TYPES.HUB,
      sourceId: hub.sourceId,
      name: hub.name,
      parentPlaceId: "system:first-reach",
    });
  });

  INSTITUTION_MINING_RIGHTS.forEach((right) => {
    const holderId = normalizeInstitutionId(right.institutionId);

    upsertAuthorityGrant(state, {
      id: `authority:${holderId}:${RIGHT_TYPES.MINING}:${right.placeId}`,
      holderId,
      powerType: RIGHT_TO_POWER[RIGHT_TYPES.MINING],
      jurisdictionType: PLACE_TYPES.HUB,
      jurisdictionId: right.placeId,
      grantedById: "institution:frontier-regional-authority",
      status: "active",
      limits: {
        rightTypes: [RIGHT_TYPES.MINING],
        resourceFamilies: [...right.families],
      },
    });
  });

  BROAD_TRADE_RIGHT_HOLDERS.forEach((holder) => {
    const holderId = normalizeInstitutionId(holder.institutionId);

    upsertAuthorityGrant(state, {
      id: `authority:${holderId}:${RIGHT_TYPES.TRADE}:${holder.placeId}`,
      holderId,
      powerType: RIGHT_TO_POWER[RIGHT_TYPES.TRADE],
      jurisdictionType: PLACE_TYPES.HUB,
      jurisdictionId: holder.placeId,
      grantedById: "institution:frontier-regional-authority",
      status: "active",
      // No resourceFamilies limit: any material, any counterparty.
      limits: { rightTypes: [RIGHT_TYPES.TRADE] },
    });
  });
}

function normalizeInstitutionId(id) {
  if (!id) {
    return null;
  }

  return id.startsWith("institution:") ? id : `institution:${id}`;
}
