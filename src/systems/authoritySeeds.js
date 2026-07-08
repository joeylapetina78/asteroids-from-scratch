import { POWER_TYPES, RIGHT_TYPES } from "./authorityModel.js?v=fresh-20260707-flash4";
import { upsertAuthorityGrant } from "./authorityRegistry.js?v=fresh-20260707-flash4";
import { ensureRegionPlace, upsertPlace } from "./placeRegistry.js?v=fresh-20260707-flash4";
import { WORLD_REGIONS } from "./worldRegions.js?v=fresh-20260707-flash4";

const RIGHT_TO_POWER = Object.freeze({
  [RIGHT_TYPES.TRANSIT]: POWER_TYPES.AUTHORIZE_WORK,
  [RIGHT_TYPES.MINING]: POWER_TYPES.AUTHORIZE_WORK,
  [RIGHT_TYPES.PATROL]: POWER_TYPES.AUTHORIZE_WORK,
  [RIGHT_TYPES.SALVAGE]: POWER_TYPES.AUTHORIZE_WORK,
  [RIGHT_TYPES.CONSTRUCTION]: POWER_TYPES.AUTHORIZE_WORK,
  [RIGHT_TYPES.TRADE]: POWER_TYPES.CONDUCT_COMMERCE,
  [RIGHT_TYPES.ENFORCEMENT]: POWER_TYPES.ENFORCE_RULES,
});

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
}

function normalizeInstitutionId(id) {
  if (!id) {
    return null;
  }

  return id.startsWith("institution:") ? id : `institution:${id}`;
}
