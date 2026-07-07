export const POWER_TYPES = Object.freeze({
  DEFINE_PLACE: "define-place",
  OWN_PROPERTY: "own-property",
  AUTHORIZE_WORK: "authorize-work",
  CONDUCT_COMMERCE: "conduct-commerce",
  ENFORCE_RULES: "enforce-rules",
});

export const PLACE_TYPES = Object.freeze({
  UNIVERSE: "universe",
  SYSTEM: "system",
  REGION: "region",
  ZONE: "zone",
  PLOT: "plot",
  CLAIM: "claim",
  JURISDICTION: "jurisdiction",
  CORRIDOR: "corridor",
  HUB: "hub",
});

export const RIGHT_TYPES = Object.freeze({
  TRANSIT: "transit",
  MINING: "mining",
  PATROL: "patrol",
  SALVAGE: "salvage",
  CONSTRUCTION: "construction",
  TRADE: "trade",
  ENFORCEMENT: "enforcement",
  DOCKING: "docking",
  TOWING: "towing",
  OWNERSHIP: "ownership",
});

export const ACTION_RIGHTS = Object.freeze({
  build: RIGHT_TYPES.CONSTRUCTION,
  buy: RIGHT_TYPES.TRADE,
  cite: RIGHT_TYPES.ENFORCEMENT,
  dock: RIGHT_TYPES.DOCKING,
  enforce: RIGHT_TYPES.ENFORCEMENT,
  fly: RIGHT_TYPES.TRANSIT,
  haul: RIGHT_TYPES.TRADE,
  hire: RIGHT_TYPES.TRADE,
  inspect: RIGHT_TYPES.ENFORCEMENT,
  lease: RIGHT_TYPES.TRADE,
  mine: RIGHT_TYPES.MINING,
  patrol: RIGHT_TYPES.PATROL,
  repair: RIGHT_TYPES.TRADE,
  salvage: RIGHT_TYPES.SALVAGE,
  sell: RIGHT_TYPES.TRADE,
  seize: RIGHT_TYPES.ENFORCEMENT,
  tow: RIGHT_TYPES.TOWING,
  transferTitle: RIGHT_TYPES.OWNERSHIP,
});

export const ACTION_POWERS = Object.freeze({
  build: POWER_TYPES.AUTHORIZE_WORK,
  buy: POWER_TYPES.CONDUCT_COMMERCE,
  cite: POWER_TYPES.ENFORCE_RULES,
  definePlace: POWER_TYPES.DEFINE_PLACE,
  dock: POWER_TYPES.AUTHORIZE_WORK,
  enforce: POWER_TYPES.ENFORCE_RULES,
  fly: POWER_TYPES.AUTHORIZE_WORK,
  haul: POWER_TYPES.AUTHORIZE_WORK,
  hire: POWER_TYPES.CONDUCT_COMMERCE,
  inspect: POWER_TYPES.ENFORCE_RULES,
  lease: POWER_TYPES.CONDUCT_COMMERCE,
  mine: POWER_TYPES.AUTHORIZE_WORK,
  patrol: POWER_TYPES.AUTHORIZE_WORK,
  repair: POWER_TYPES.CONDUCT_COMMERCE,
  salvage: POWER_TYPES.AUTHORIZE_WORK,
  sell: POWER_TYPES.CONDUCT_COMMERCE,
  seize: POWER_TYPES.ENFORCE_RULES,
  tow: POWER_TYPES.AUTHORIZE_WORK,
  transferTitle: POWER_TYPES.OWN_PROPERTY,
});

export function getRightTypeForAction(action) {
  return ACTION_RIGHTS[action] ?? action;
}

export function getPowerTypeForAction(action) {
  return ACTION_POWERS[action] ?? null;
}

export function isRecordActive(record, at = Date.now()) {
  if (!record || record.status === "revoked" || record.status === "expired" || record.status === "void") {
    return false;
  }

  if (record.validFrom && record.validFrom > at) {
    return false;
  }

  if (record.validUntil && record.validUntil < at) {
    return false;
  }

  return record.status === undefined || ACTIVE_RECORD_STATUSES.has(record.status);
}

export function limitsAllowAction(limits = {}, { action, rightType, assetId = null, resourceType = null } = {}) {
  if (limits.actions && action && !limits.actions.includes(action)) {
    return false;
  }

  if (limits.rightTypes && rightType && !limits.rightTypes.includes(rightType)) {
    return false;
  }

  if (limits.assetIds && assetId && !limits.assetIds.includes(assetId)) {
    return false;
  }

  if (limits.resources && resourceType && !limits.resources.includes(resourceType)) {
    return false;
  }

  return true;
}

const ACTIVE_RECORD_STATUSES = new Set([
  "active",
  "accepted",
  "cleared",
  "filed",
  "issued",
  "lien-held",
  "owned",
  "temporary",
]);
