import { FIRST_REACH_SETTLEMENTS } from "../content/economy/firstReachSettlements.js";
import { ensurePatrolOperations } from "./patrolOperations.js";

export const PROTECTION_REQUEST_STATUS = Object.freeze({
  INTERNAL: "covered-internally",
  OFFERED: "offered",
  WITHHELD: "withheld",
  CLOSED: "closed",
});

const clamp01 = (value) => Math.max(0, Math.min(1, value));

export function ensureProtectionPlanning(state) {
  state.protectionPlanning ??= { requests: {}, nextRequestId: 1 };
  state.protectionPlanning.requests ??= {};
  state.protectionPlanning.nextRequestId ??= 1;
  return state.protectionPlanning;
}

function accountFor(seed, state) {
  return state.logistics?.institutions?.[seed.institution.id]?.accounts?.operating
    ?? seed.institution.accounts?.operating
    ?? { balance: 0, committed: 0 };
}

export function assessProtectionThreat({ seed, site, threat, state }) {
  const policy = seed.institution.protectionPolicy;
  const dx = threat.position.x - site.position.x;
  const dy = threat.position.y - site.position.y;
  const distance = Math.hypot(dx, dy);
  const proximity = clamp01(1 - distance / policy.jurisdictionRadius);
  const force = clamp01(((threat.enemyCount ?? 1) + (threat.waveCount ?? 0) * 1.5) / 12);
  const inventoryUnits = Object.values(seed.institution.inventories ?? {}).reduce((sum, units) => sum + units, 0);
  const exposure = clamp01((seed.population.size / 180) * 0.7 + (inventoryUnits / 30) * 0.3);
  const severity = clamp01(proximity * 0.5 + force * 0.3 + exposure * 0.2);
  const account = accountFor(seed, state);
  const spendable = Math.max(0, (account.balance ?? 0) - (account.committed ?? 0) - policy.protectedCash);
  const expectedLoss = Math.round(250 + severity * (900 + seed.population.size * 9 + inventoryUnits * 20));
  const maximumPayment = Math.max(0, Math.min(spendable, Math.round(expectedLoss * (0.55 + severity * 0.35))));
  return { distance, proximity, force, exposure, severity, expectedLoss, maximumPayment, spendable };
}

function chooseResponse(policy, assessment, ownedCraft) {
  if (assessment.severity < policy.responseThreshold) return { status: null, reason: "below-response-threshold" };
  if (policy.mode === "direct" && ownedCraft) return { status: PROTECTION_REQUEST_STATUS.INTERNAL, reason: "owned-capacity" };
  if (policy.mode === "hybrid" && ownedCraft && assessment.severity < (policy.contractSeverity ?? 0.65)) {
    return { status: PROTECTION_REQUEST_STATUS.INTERNAL, reason: "hybrid-owned-capacity" };
  }
  if (assessment.maximumPayment > 0) return { status: PROTECTION_REQUEST_STATUS.OFFERED, reason: ownedCraft ? "policy-prefers-market" : "no-owned-capacity" };
  return { status: PROTECTION_REQUEST_STATUS.WITHHELD, reason: "protected-cash" };
}

export function evaluateProtectionThreat(state, sites, threat, now = Date.now()) {
  const planning = ensureProtectionPlanning(state);
  const patrols = ensurePatrolOperations(state, now);
  const created = [];
  FIRST_REACH_SETTLEMENTS.forEach((seed) => {
    const site = sites.find((candidate) => candidate.id === seed.institution.siteId);
    if (!site) return;
    const policy = seed.institution.protectionPolicy;
    const assessment = assessProtectionThreat({ seed, site, threat, state });
    if (assessment.distance > policy.jurisdictionRadius) return;
    const existing = Object.values(planning.requests).find((request) => request.threatId === threat.id && request.siteId === site.id && request.status !== PROTECTION_REQUEST_STATUS.CLOSED);
    if (existing) return;
    const ownedCapacityCommitted = Object.values(planning.requests).some((request) =>
      request.siteId === site.id
      && request.status === PROTECTION_REQUEST_STATUS.INTERNAL,
    );
    const ownedCraft = !ownedCapacityCommitted && patrols[site.id]?.craft?.status === "available"
      ? patrols[site.id].craft
      : null;
    const response = chooseResponse(policy, assessment, ownedCraft);
    if (!response.status) return;
    const id = `protection:${planning.nextRequestId++}`;
    const request = {
      id, kind: "threat-response", status: response.status,
      issuerInstitutionId: seed.institution.id, siteId: site.id, threatId: threat.id,
      threatType: threat.type ?? "incursion", requiredCapabilities: ["interdict-threat", "defend-shipping"],
      policyMode: policy.mode, reason: response.reason,
      severity: assessment.severity, expectedLoss: assessment.expectedLoss,
      maximumPayment: assessment.maximumPayment, distance: assessment.distance,
      providerInstitutionId: response.status === PROTECTION_REQUEST_STATUS.INTERNAL ? patrols[site.id].institution.id : null,
      craftId: response.status === PROTECTION_REQUEST_STATUS.INTERNAL ? ownedCraft.id : null,
      createdAt: now, closedAt: null,
    };
    planning.requests[id] = request;
    created.push(request);
    state.ledger?.recordEvent("protection.requestCreated", {
      requestId: id, institutionId: request.issuerInstitutionId, siteId: site.id,
      threatId: threat.id, status: request.status, policyMode: request.policyMode,
      severity: request.severity, expectedLoss: request.expectedLoss, maximumPayment: request.maximumPayment,
      providerInstitutionId: request.providerInstitutionId,
    }, { visible: true });
  });
  return created;
}

export function closeProtectionRequestsForThreat(state, threatId, now = Date.now()) {
  const planning = ensureProtectionPlanning(state);
  const closed = [];
  Object.values(planning.requests).forEach((request) => {
    if (request.threatId !== threatId || request.status === PROTECTION_REQUEST_STATUS.CLOSED) return;
    request.previousStatus = request.status;
    request.status = PROTECTION_REQUEST_STATUS.CLOSED;
    request.closedAt = now;
    closed.push(request);
  });
  return closed;
}

export function listProtectionRequests(state) {
  return Object.values(state.protectionPlanning?.requests ?? {});
}
