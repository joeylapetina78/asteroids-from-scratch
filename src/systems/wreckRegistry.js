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

export function createWreckSalvageContract(state, { wreckId, destinationSiteId = "scrap-porch", rewardCredits = 480 }) {
  const record = state.wrecks?.records?.[wreckId];
  if (!record || record.status !== "awaiting-owner-disposition") return null;
  const contractId = `salvage-contract:${wreckId}`;
  record.salvageContractId = contractId;
  return {
    id: contractId,
    type: "wreck-salvage",
    group: "wreck-salvage",
    title: `Recover ${record.shipName}`,
    issuer: record.ownerInstitutionId ?? "Registered title holder",
    description: `Tow the titled wreck of ${record.shipName} to Scrap Porch for authorized scraping.`,
    terms: { wreckId, destinationSiteId, amount: 1 },
    reward: { credits: rewardCredits },
    presentation: { offerSiteId: destinationSiteId },
    notes: [
      `Title ${record.titleId ?? "unestablished"} remains with the owner until delivery.`,
      "Acceptance grants salvage authority for this wreck only.",
      "Deliver the attached wreck to Scrap Porch; ordinary repairs to your own ship are separate.",
    ],
  };
}

export function completeWreckSalvage(state, { wreckId, salvagerId, destinationSiteId, at = Date.now() }) {
  const record = state.wrecks?.records?.[wreckId];
  if (!record || record.status !== "salvage-authorized") return null;
  if (record.authorizedSalvagerId !== salvagerId || record.destinationSiteId !== destinationSiteId) return null;
  const salvageYield = { "iron-nickel": 2, silicate: 1 };
  state.sprc?.inventories?.raw && Object.entries(salvageYield).forEach(([itemId, amount]) => {
    state.sprc.inventories.raw[itemId] = (state.sprc.inventories.raw[itemId] ?? 0) + amount;
  });
  record.status = "salvaged";
  record.titleStatus = "retired-after-salvage";
  record.deliveredAt = at;
  record.deliveredBy = salvagerId;
  record.salvageYield = salvageYield;
  return record;
}
