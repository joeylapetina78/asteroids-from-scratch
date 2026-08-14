import { getActorAccount } from "./actorConfig.js?v=fresh-20260813-2123-6af9350";

const DEFAULT_RECOVERY_FEE = 120;
const DEFAULT_DISMANTLING_COST = 40;

function plannedYield(record) {
  return {
    produced: { "hull-plate": 2, "machine-part": 2 },
    raw: { silicate: 1, ...(record.sequence % 3 === 0 ? { copper: 1 } : {}) },
  };
}

export function registerOwnedWreck(state, { shipId, shipName, identity, position, cause, at = Date.now() }) {
  state.wrecks ??= { records: {}, counter: 0 };
  state.wrecks.records ??= {};
  state.wrecks.counter = (state.wrecks.counter ?? 0) + 1;
  const id = `wreck:${shipId}:${state.wrecks.counter}`;
  const record = {
    id, sequence: state.wrecks.counter, shipId, shipName,
    shipVin: identity?.shipVin ?? null,
    ownerInstitutionId: identity?.ownerInstitutionId ?? null,
    titleId: identity?.titleId ?? null,
    titleStatus: identity?.titleStatus === "active" ? "wreck-title" : "unestablished",
    position: { x: Math.round(position.x), y: Math.round(position.y) },
    cause, status: "awaiting-owner-disposition",
    salvageAuthorizationId: null, authorizedSalvagerId: null, createdAt: at,
  };
  record.plannedSalvageYield = plannedYield(record);
  state.wrecks.records[id] = record;
  return record;
}

export function evaluateSprcWreckAcquisition(state, { wreckId, recoveryFee = DEFAULT_RECOVERY_FEE, dismantlingCost = DEFAULT_DISMANTLING_COST } = {}) {
  const record = state.wrecks?.records?.[wreckId];
  if (!record || record.status !== "awaiting-owner-disposition" || !record.ownerInstitutionId) return { eligible: false, reason: "no-titled-wreck" };
  const sprc = state.sprc;
  const ownerAccount = getActorAccount(state, record.ownerInstitutionId);
  if (!sprc?.account || !ownerAccount) return { eligible: false, reason: "unresolved-account" };
  const produced = sprc.inventories?.produced ?? {};
  const targets = sprc.operatingPlan?.inventoryTargets ?? {};
  const openRepairs = (sprc.repairQueue ?? []).map((id) => sprc.repairOrders?.[id])
    .filter((repair) => repair && !["completed", "canceled"].includes(repair.status));
  const demanded = openRepairs.length > 0 || (produced["hull-plate"] ?? 0) < (targets["hull-plate"] ?? 0) || (produced["machine-part"] ?? 0) < (targets["machine-part"] ?? 0);
  if (!demanded) return { eligible: false, reason: "no-recovery-demand" };
  const acquisitionPrice = 60 + (record.plannedSalvageYield?.raw?.copper ? 20 : 0);
  const totalCommitment = acquisitionPrice + recoveryFee + dismantlingCost;
  const protectedCash = sprc.operatingPlan?.protectedCashReserve ?? 0;
  const available = (sprc.account.balance ?? 0) - (sprc.account.committed ?? 0) - protectedCash;
  return { eligible: available >= totalCommitment, reason: available >= totalCommitment ? null : "protected-cash", acquisitionPrice, recoveryFee, dismantlingCost, totalCommitment, available, expectedYield: record.plannedSalvageYield };
}

export function acquireWreckForSprc(state, { wreckId, at = Date.now(), ...costs } = {}) {
  const evaluation = evaluateSprcWreckAcquisition(state, { wreckId, ...costs });
  if (!evaluation.eligible) return { acquired: false, evaluation };
  const record = state.wrecks.records[wreckId];
  const previousOwnerInstitutionId = record.ownerInstitutionId;
  const ownerAccount = getActorAccount(state, previousOwnerInstitutionId);
  state.sprc.account.balance -= evaluation.acquisitionPrice;
  state.sprc.account.committed = (state.sprc.account.committed ?? 0) + evaluation.recoveryFee + evaluation.dismantlingCost;
  ownerAccount.balance += evaluation.acquisitionPrice;
  record.previousOwnerInstitutionId = previousOwnerInstitutionId;
  record.ownerInstitutionId = state.sprc.institution.id;
  record.titleStatus = "transferred-for-salvage";
  record.status = "sprc-owned-awaiting-recovery";
  record.acquiredAt = at;
  record.acquisitionPrice = evaluation.acquisitionPrice;
  record.recoveryBudget = evaluation.recoveryFee;
  record.dismantlingCost = evaluation.dismantlingCost;
  record.reservedFutureCost = evaluation.recoveryFee + evaluation.dismantlingCost;
  return { acquired: true, record, evaluation };
}

export function authorizeWreckSalvage(state, { wreckId, authorizationId, salvagerId, destinationSiteId, at = Date.now() }) {
  const record = state.wrecks?.records?.[wreckId];
  if (!record || !["awaiting-owner-disposition", "sprc-owned-awaiting-recovery"].includes(record.status)) return null;
  record.status = "salvage-authorized";
  record.salvageAuthorizationId = authorizationId;
  record.authorizedSalvagerId = salvagerId;
  record.destinationSiteId = destinationSiteId;
  record.authorizedAt = at;
  return record;
}

export function createWreckSalvageContract(state, { wreckId, destinationSiteId = "scrap-porch", rewardCredits = null }) {
  const record = state.wrecks?.records?.[wreckId];
  if (!record || record.status !== "sprc-owned-awaiting-recovery") return null;
  const contractId = `salvage-contract:${wreckId}`;
  const reward = rewardCredits ?? record.recoveryBudget ?? DEFAULT_RECOVERY_FEE;
  record.salvageContractId = contractId;
  return {
    id: contractId, type: "wreck-salvage", group: "wreck-salvage",
    title: `Recover ${record.shipName}`, issuer: state.sprc?.institution?.name ?? "Scrap Porch Recovery Cooperative",
    description: `Tow SPRC's titled wreck of ${record.shipName} to Scrap Porch for dismantling.`,
    terms: { wreckId, destinationSiteId, amount: 1 }, reward: { credits: reward },
    presentation: { offerSiteId: destinationSiteId },
    notes: [`Title ${record.titleId ?? "unestablished"} transferred to SPRC before posting.`, "Acceptance grants recovery authority for this wreck only.", "Delivery begins a real dismantling order; materials are not created until The Maw finishes."],
  };
}

export function completeWreckSalvage(state, { wreckId, salvagerId, destinationSiteId, at = Date.now() }) {
  const record = state.wrecks?.records?.[wreckId];
  if (!record || record.status !== "salvage-authorized") return null;
  if (record.authorizedSalvagerId !== salvagerId || record.destinationSiteId !== destinationSiteId) return null;
  record.status = "delivered-for-dismantling";
  record.deliveredAt = at;
  record.deliveredBy = salvagerId;
  return record;
}
