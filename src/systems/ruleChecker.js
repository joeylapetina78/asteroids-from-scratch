import { getRightTypeForAction, isRecordActive, limitsAllowAction } from "./authorityModel.js?v=fresh-20260719-2101-381ce20";
import { actorHasPower, getAuthorityGrant } from "./authorityRegistry.js?v=fresh-20260719-2101-381ce20";
import { isSameOrChildPlace } from "./placeRegistry.js?v=fresh-20260719-2101-381ce20";
import { getWorldDocument } from "./worldRecords.js?v=fresh-20260719-2101-381ce20";

export function canActorDoAction(state, {
  actorId,
  action,
  placeId,
  assetId = null,
  documentId = null,
  resourceType = null,
  at = Date.now(),
} = {}) {
  if (!actorId || !action || !placeId) {
    return { allowed: false, reason: "Rule checks need actorId, action, and placeId." };
  }

  if (!documentId) {
    return actorHasPower(state, { actorId, action, placeId, assetId, resourceType, at });
  }

  const document = getWorldDocument(state, documentId);
  const rightType = getRightTypeForAction(action);

  if (!isRecordActive(document, at)) {
    return { allowed: false, reason: `Document '${documentId}' is not active.` };
  }

  const grants = document.grants ?? {};
  const placeIds = grants.placeIds ?? grants.places ?? [];
  const actionAllowed = !grants.actions || grants.actions.includes(action);
  const rightAllowed = !grants.rightTypes || grants.rightTypes.includes(rightType);
  const placeAllowed = placeIds.length === 0 || placeIds.some((grantedPlaceId) => isSameOrChildPlace(state, placeId, grantedPlaceId));
  const limitsAllowed = limitsAllowAction(grants.limits, { action, rightType, assetId, resourceType });

  if (!actionAllowed || !rightAllowed || !placeAllowed || !limitsAllowed) {
    return { allowed: false, reason: `Document '${documentId}' does not grant ${action} at ${placeId}.`, document };
  }

  if (!document.authorityId) {
    return { allowed: true, document };
  }

  const backingAuthority = getAuthorityGrant(state, document.authorityId);

  if (!isRecordActive(backingAuthority, at)) {
    return {
      allowed: false,
      reason: `Document '${documentId}' is backed by inactive authority '${document.authorityId}'.`,
      document,
      authorityGrant: backingAuthority,
    };
  }

  if (!isSameOrChildPlace(state, placeId, backingAuthority.jurisdictionId)) {
    return {
      allowed: false,
      reason: `Document '${documentId}' is outside backing authority '${document.authorityId}'.`,
      document,
      authorityGrant: backingAuthority,
    };
  }

  return { allowed: true, document, authorityGrant: backingAuthority };
}
