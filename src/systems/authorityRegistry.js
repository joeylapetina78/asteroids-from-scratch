import { getPowerTypeForAction, getRightTypeForAction, isRecordActive, limitsAllowAction } from "./authorityModel.js?v=fresh-20260717-2312-49de7be";
import { isSameOrChildPlace } from "./placeRegistry.js?v=fresh-20260717-2312-49de7be";
import { ensureWorldRecords } from "./worldRecords.js?v=fresh-20260717-2312-49de7be";

export function upsertAuthorityGrant(state, grant) {
  const records = ensureWorldRecords(state);
  records.authorityGrants[grant.id] = {
    ...(records.authorityGrants[grant.id] ?? {}),
    ...grant,
    updatedAt: Date.now(),
  };
  return records.authorityGrants[grant.id];
}

export function getAuthorityGrant(state, authorityId) {
  return ensureWorldRecords(state).authorityGrants[authorityId] ?? null;
}

export function findAuthorityGrants(state, { holderId = null, powerType = null, jurisdictionId = null } = {}) {
  return Object.values(ensureWorldRecords(state).authorityGrants).filter((grant) => {
    if (holderId && grant.holderId !== holderId) {
      return false;
    }
    if (powerType && grant.powerType !== powerType) {
      return false;
    }
    if (jurisdictionId && grant.jurisdictionId !== jurisdictionId) {
      return false;
    }

    return true;
  });
}

export function actorHasPower(state, { actorId, action, placeId, assetId = null, resourceType = null, at = Date.now() }) {
  const powerType = getPowerTypeForAction(action);
  const rightType = getRightTypeForAction(action);

  if (!powerType) {
    return { allowed: false, reason: `No power type is mapped for action '${action}'.` };
  }

  const grant = findAuthorityGrants(state, { holderId: actorId, powerType }).find((candidate) => (
    isRecordActive(candidate, at) &&
    isSameOrChildPlace(state, placeId, candidate.jurisdictionId) &&
    limitsAllowAction(candidate.limits, { action, rightType, assetId, resourceType })
  ));

  if (!grant) {
    return {
      allowed: false,
      reason: `${actorId} lacks ${powerType} authority for ${action} at ${placeId}.`,
    };
  }

  return { allowed: true, authorityGrant: grant };
}
