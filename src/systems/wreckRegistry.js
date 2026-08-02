export function registerOwnedWreck(state, { shipId, shipName, identity, position, cause, at = Date.now() }) {
  state.wrecks ??= { records: {}, counter: 0 };
  state.wrecks.records ??= {};
  state.wrecks.counter = (state.wrecks.counter ?? 0) + 1;
  const id = `wreck:${shipId}:${state.wrecks.counter}`;
  const record = {
    id,
    shipId,
    shipName,
    shipVin: identity?.shipVin ?? null,
    ownerInstitutionId: identity?.ownerInstitutionId ?? null,
    titleId: identity?.titleId ?? null,
    titleStatus: identity?.titleStatus === "active" ? "wreck-title" : "unestablished",
    position: { x: Math.round(position.x), y: Math.round(position.y) },
    cause,
    status: "awaiting-owner-disposition",
    salvageAuthorizationId: null,
    authorizedSalvagerId: null,
    createdAt: at,
  };
  state.wrecks.records[id] = record;
  return record;
}

export function authorizeWreckSalvage(state, { wreckId, authorizationId, salvagerId, destinationSiteId, at = Date.now() }) {
  const record = state.wrecks?.records?.[wreckId];
  if (!record || record.status !== "awaiting-owner-disposition") return null;
  record.status = "salvage-authorized";
  record.salvageAuthorizationId = authorizationId;
  record.authorizedSalvagerId = salvagerId;
  record.destinationSiteId = destinationSiteId;
  record.authorizedAt = at;
  return record;
}

