import { FIRST_REACH_SETTLEMENTS } from "../content/economy/firstReachSettlements.js?v=fresh-20260821-0638-453f3f93";
import { listGeneratedSettlements } from "./settlementSeedPipeline.js?v=fresh-20260821-0638-453f3f93";
import { isHubAggregated } from "./simulationMode.js?v=fresh-20260821-0638-453f3f93";
import { ensurePatrolOperations } from "./patrolOperations.js?v=fresh-20260821-0638-453f3f93";
import { allocateProtectionProviders, releaseProtectionContract } from "./protectionProviders.js?v=fresh-20260821-0638-453f3f93";

export const PROTECTION_REQUEST_STATUS = Object.freeze({
  INTERNAL: "covered-internally",
  OFFERED: "offered",
  WITHHELD: "withheld",
  CONTRACTED: "contracted",
  ACTIVE: "active",
  FULFILLED: "fulfilled",
  FAILED: "failed",
  CLOSED: "closed",
});

const clamp01 = (value) => Math.max(0, Math.min(1, value));

// How often an unanswered offer goes back out to the security market, and how
// long a settlement gets to actually launch its own craft before the claim is
// treated as one it cannot honour.
const REOFFER_INTERVAL_MS = 20 * 1000;
const INTERNAL_DISPATCH_GRACE_MS = 45 * 1000;

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
  [...FIRST_REACH_SETTLEMENTS, ...listGeneratedSettlements(state)].forEach((seed) => {
    if (isHubAggregated(state, seed.institution.id)) return;
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
      // When this last went to the market, so an unanswered offer can be put
      // back out rather than expiring silently on the one attempt.
      lastOfferedAt: response.status === PROTECTION_REQUEST_STATUS.OFFERED ? now : null,
      offerAttempts: response.status === PROTECTION_REQUEST_STATUS.OFFERED ? 1 : 0,
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
  allocateProtectionProviders(state, sites, created, now);
  return created;
}

// Open requests are alive, not filed.
//
// `evaluateProtectionThreat` ran the market EXACTLY ONCE, at the moment the
// threat appeared, over the requests it had just created. If no provider could
// take the job in that instant — the only security firm's craft was a wreck,
// say — the request sat at `offered` with `providerInstitutionId: null` for the
// rest of the run while the settlement kept credits earmarked for it. And an
// `covered-internally` claim that never launched blocked its own site from
// covering anything else, because one internal request per site is the rule.
//
// This is the periodic pass that makes both recoverable: stale offers go back
// to the market, undeliverable internal claims are demoted to offers, and
// requests whose threat is gone are closed.
export function reviewProtectionRequests(state, sites, activeThreatIds, now = Date.now()) {
  const planning = ensureProtectionPlanning(state);
  const live = activeThreatIds instanceof Set ? activeThreatIds : new Set(activeThreatIds ?? []);
  const open = [PROTECTION_REQUEST_STATUS.OFFERED, PROTECTION_REQUEST_STATUS.INTERNAL, PROTECTION_REQUEST_STATUS.CONTRACTED];
  const reoffered = [];

  Object.values(planning.requests).forEach((request) => {
    if (!open.includes(request.status)) return;

    // The threat is gone and nobody closed this out.
    if (!live.has(request.threatId)) {
      request.previousStatus = request.status;
      releaseProtectionContract(state, request);
      request.status = PROTECTION_REQUEST_STATUS.CLOSED;
      request.closedAt = now;
      request.closeReason = "threat-no-longer-present";
      return;
    }

    // A settlement said it would handle this itself and then did not launch.
    // Rather than hold the site's own capacity hostage indefinitely, it admits
    // it cannot cover this one and puts it out to the market.
    if (request.status === PROTECTION_REQUEST_STATUS.INTERNAL
      && !request.dispatchedAt
      && now - request.createdAt >= INTERNAL_DISPATCH_GRACE_MS
      && request.maximumPayment > 0) {
      request.status = PROTECTION_REQUEST_STATUS.OFFERED;
      request.reason = "own-craft-could-not-launch";
      request.providerInstitutionId = null;
      request.craftId = null;
      request.lastOfferedAt = now;
      request.offerAttempts = (request.offerAttempts ?? 0) + 1;
      reoffered.push(request);
      state.ledger?.recordEvent("protection.coverageLapsed", {
        requestId: request.id, institutionId: request.issuerInstitutionId,
        siteId: request.siteId, threatId: request.threatId, waitedMs: now - request.createdAt,
      }, { visible: true });
      return;
    }

    if (request.status !== PROTECTION_REQUEST_STATUS.OFFERED) return;

    // ...and it can take that coverage back once its craft is free again.
    // Without this the lapse is a one-way door: the request would sit waiting on
    // a market that may have nobody in it, while the settlement's own craft sat
    // on station a short flight from the threat. Only a request that WAS
    // internal can return to it — the policy already judged that this threat at
    // this severity was one the hub should handle itself.
    if (request.reason === "own-craft-could-not-launch" && !request.dispatchedAt) {
      const craft = ensurePatrolOperations(state, now)[request.siteId]?.craft;
      const siteAlreadyCovering = Object.values(planning.requests).some((other) => other !== request
        && other.siteId === request.siteId
        && other.status === PROTECTION_REQUEST_STATUS.INTERNAL);
      if (!siteAlreadyCovering && craft?.status === "available" && craft.hull > 0) {
        request.status = PROTECTION_REQUEST_STATUS.INTERNAL;
        request.reason = "own-craft-free-again";
        request.providerInstitutionId = `patrol:${request.siteId}`;
        request.craftId = craft.id;
        state.ledger?.recordEvent("protection.coverageReclaimed", {
          requestId: request.id, institutionId: request.issuerInstitutionId,
          siteId: request.siteId, threatId: request.threatId, craftId: craft.id,
        }, { visible: true });
        return;
      }
    }

    if (now - (request.lastOfferedAt ?? request.createdAt) < REOFFER_INTERVAL_MS) return;
    request.lastOfferedAt = now;
    request.offerAttempts = (request.offerAttempts ?? 0) + 1;
    reoffered.push(request);
  });

  if (reoffered.length === 0) return [];
  const accepted = allocateProtectionProviders(state, sites, reoffered, now);
  accepted.forEach((request) => {
    state.ledger?.recordEvent("protection.reofferAccepted", {
      requestId: request.id, institutionId: request.issuerInstitutionId,
      providerInstitutionId: request.providerInstitutionId, siteId: request.siteId,
      threatId: request.threatId, attempts: request.offerAttempts,
    }, { visible: true });
  });
  return accepted;
}

export function closeProtectionRequestsForThreat(state, threatId, now = Date.now()) {
  const planning = ensureProtectionPlanning(state);
  const closed = [];
  Object.values(planning.requests).forEach((request) => {
    if (request.threatId !== threatId || request.status === PROTECTION_REQUEST_STATUS.CLOSED) return;
    request.previousStatus = request.status;
    releaseProtectionContract(state, request);
    request.status = PROTECTION_REQUEST_STATUS.CLOSED;
    request.closedAt = now;
    closed.push(request);
  });
  return closed;
}

export function listProtectionRequests(state) {
  return Object.values(state.protectionPlanning?.requests ?? {});
}

export function getPlayerProtectionJobsForSite(state, siteId, issuer = null) {
  return listProtectionRequests(state)
    .filter((request) => request.status === PROTECTION_REQUEST_STATUS.OFFERED && request.siteId === siteId && request.maximumPayment > 0)
    .map((request) => ({
      id: `player-${request.id}`,
      opportunityId: request.id,
      acceptanceSiteId: request.siteId,
      type: "protection-response",
      group: "standing-protection",
      jobKind: "protection",
      repeatable: false,
      jobTier: "standing",
      jobTierLabel: "Live Protection Request",
      title: `Protect ${issuer ?? request.siteId}`,
      issuer: issuer ?? request.issuerInstitutionId,
      // The hub that posted the job is the hub that pays for it.
      issuerInstitutionId: request.issuerInstitutionId,
      summary: `Respond to the active ${request.threatType} threatening ${request.siteId}.`,
      terms: {
        protectionRequestId: request.id, threatId: request.threatId,
        acceptanceSiteId: request.siteId, destinationSiteId: request.siteId,
        requiredCapabilities: [...request.requiredCapabilities],
      },
      reward: { credits: request.maximumPayment },
      clauses: ["Accept locally before another provider takes the request.", "Payment is reserved by the threatened institution.", "Destroy the named threat to complete the response."],
    }));
}
