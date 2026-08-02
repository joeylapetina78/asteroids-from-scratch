import { createCommercialCraftPublicIdentity } from "./publicIdentity.js";
import { getRelationshipProjection } from "./relationshipProjections.js";
import { evaluateSupplierAsk, getSpendable } from "./valuation.js";
import { DIAGNOSTIC_STATE, recordDiagnostic } from "./diagnostics.js";

const PROVIDER_SEEDS = Object.freeze([
  {
    institution: {
      id: "sable-meridian-security",
      name: "Sable Meridian Security",
      archetypeId: "patrol-service",
      controllerInstitutionId: "person:orin-sable",
      siteId: "blue-lantern",
      accounts: { operating: { id: "SMS-OPERATING", balance: 3200, committed: 0, transactions: [] } },
      policies: { protectedCash: 700, mobilizationCost: 120, operatingCostPerDistance: 0.018, riskCostAtMaximum: 280, routineMaintenanceCost: 60 },
    },
    controller: {
      id: "person:orin-sable", name: "Orin Sable", archetypeId: "person",
      controls: ["sable-meridian-security"],
      traits: { caution: 0.62, growthBias: 0.38, urgencyBias: 0.55 },
      license: { id: "PSC-SABLE-01", class: "contract-patrol", status: "active" },
      authority: { mayInspect: false, mayPatrol: true, mayDefend: true },
    },
    craft: {
      id: "patrol-craft:sable-one", name: "Sable One", referenceId: "SMS-SABLE-ONE",
      ownerInstitutionId: "sable-meridian-security", siteId: "blue-lantern",
      status: "available", hull: 150, maxHull: 150,
    },
  },
]);

export function createInitialProtectionProviders(now = Date.now()) {
  return Object.fromEntries(PROVIDER_SEEDS.map((seed) => {
    const institution = structuredClone(seed.institution);
    const controller = structuredClone(seed.controller);
    const craft = { ...structuredClone(seed.craft), createdAt: now };
    craft.publicIdentity = createCommercialCraftPublicIdentity({
      ship: craft, owner: institution, operator: controller,
      registeredHubIds: [institution.siteId],
      authorizedActivities: ["contract-patrol", "defend-shipping", "interdict-threat"],
    });
    return [institution.id, { institution, controller, craft }];
  }));
}

export function ensureProtectionProviders(state, now = Date.now()) {
  state.protectionProviders ??= createInitialProtectionProviders(now);
  Object.values(state.protectionProviders).forEach((provider) => {
    if (!state.logistics?.institutions) return;
    state.logistics.institutions[provider.institution.id] ??= provider.institution;
    state.logistics.institutions[provider.controller.id] ??= provider.controller;
    recordProtectionCraftDiagnostic(state, provider, now);
  });
  return state.protectionProviders;
}

function recordProtectionCraftDiagnostic(state, provider, now = Date.now(), patch = {}) {
  const craft = provider?.craft;
  if (!craft) return null;
  const diagnosticState = craft.status === "destroyed"
    ? DIAGNOSTIC_STATE.DISABLED
    : craft.status === "available"
      ? DIAGNOSTIC_STATE.FREE
      : craft.status === "committed"
        ? DIAGNOSTIC_STATE.COMMITTED
        : DIAGNOSTIC_STATE.WORKING;
  return recordDiagnostic(state, craft.id, {
    actorName: craft.name,
    actorKind: "ship",
    controllerId: provider.institution.id,
    state: diagnosticState,
    summary: craft.status === "available" ? `Available at ${provider.institution.siteId}` : `Protection craft is ${craft.status}`,
    locationSiteId: craft.siteId ?? provider.institution.siteId,
    detail: { hull: craft.hull, maxHull: craft.maxHull, ownerInstitutionId: craft.ownerInstitutionId, referenceId: craft.referenceId },
    ...patch,
  }, now);
}

export function quoteProtectionRequest(state, sites, provider, request) {
  const origin = sites.find((site) => site.id === provider.craft.siteId);
  const destination = sites.find((site) => site.id === request.siteId);
  const travelDistance = origin && destination
    ? Math.hypot(destination.position.x - origin.position.x, destination.position.y - origin.position.y)
    : Infinity;
  const policy = provider.institution.policies;
  const costComponents = {
    mobilization: policy.mobilizationCost,
    travel: Number.isFinite(travelDistance) ? travelDistance * policy.operatingCostPerDistance : Infinity,
    risk: request.severity * policy.riskCostAtMaximum,
    maintenance: policy.routineMaintenanceCost + (1 - provider.craft.hull / provider.craft.maxHull) * 300,
  };
  const relationship = getRelationshipProjection(state, { fromId: provider.institution.id, toId: request.issuerInstitutionId });
  const valuation = evaluateSupplierAsk({
    workId: request.id, costComponents, offeredPrice: request.maximumPayment,
    traits: provider.controller.traits, policy, relationship,
  });
  const operatingCash = getSpendable(provider.institution.accounts.operating, policy);
  const eligible = provider.craft.status === "available"
    && provider.craft.hull > 0
    && Number.isFinite(travelDistance)
    && operatingCash >= valuation.minAcceptablePrice
    && valuation.acceptable;
  return {
    providerInstitutionId: provider.institution.id,
    craftId: provider.craft.id,
    askingPrice: valuation.recommendedPrice,
    floorPrice: valuation.minAcceptablePrice,
    offeredPrice: request.maximumPayment,
    acceptedPrice: eligible ? Math.min(request.maximumPayment, valuation.recommendedPrice) : null,
    travelDistance, eligible,
    relationship,
    reasons: [
      ...valuation.reasons,
      ...(operatingCash < valuation.minAcceptablePrice ? [`Only ${Math.round(operatingCash)} operating credits are riskable.`] : []),
      ...(provider.craft.status !== "available" ? [`${provider.craft.name} is ${provider.craft.status}.`] : []),
    ],
  };
}

export function allocateProtectionProviders(state, sites, requests, now = Date.now()) {
  const providers = ensureProtectionProviders(state, now);
  const accepted = [];
  requests.filter((request) => request.status === "offered").forEach((request) => {
    const bids = Object.values(providers)
      .map((provider) => quoteProtectionRequest(state, sites, provider, request))
      .sort((left, right) => {
        if (left.eligible !== right.eligible) return left.eligible ? -1 : 1;
        if ((left.acceptedPrice ?? Infinity) !== (right.acceptedPrice ?? Infinity)) return (left.acceptedPrice ?? Infinity) - (right.acceptedPrice ?? Infinity);
        return left.providerInstitutionId.localeCompare(right.providerInstitutionId);
      });
    request.bids = bids.map((bid) => ({ ...bid, relationship: bid.relationship ? { id: bid.relationship.id } : null }));
    const winner = bids.find((bid) => bid.eligible);
    if (!winner) return;
    const provider = providers[winner.providerInstitutionId];
    const buyer = state.logistics?.institutions?.[request.issuerInstitutionId];
    if (!buyer?.accounts?.operating) return;
    request.status = "contracted";
    request.providerInstitutionId = winner.providerInstitutionId;
    request.craftId = winner.craftId;
    request.agreedPayment = winner.acceptedPrice;
    request.acceptedAt = now;
    provider.craft.status = "committed";
    provider.craft.activeRequestId = request.id;
    recordProtectionCraftDiagnostic(state, provider, now, {
      summary: `Committed to protect ${request.siteId}`,
      refs: { contractIds: [request.id], targetIds: [request.threatId] },
    });
    buyer.accounts.operating.committed = (buyer.accounts.operating.committed ?? 0) + winner.acceptedPrice;
    accepted.push(request);
    state.ledger?.recordEvent("protection.contractAccepted", {
      requestId: request.id, institutionId: request.issuerInstitutionId,
      providerInstitutionId: request.providerInstitutionId, craftId: request.craftId,
      siteId: request.siteId, threatId: request.threatId, agreedPayment: request.agreedPayment,
    }, { visible: true });
  });
  return accepted;
}

export function releaseProtectionContract(state, request) {
  const releasableStatuses = new Set(["contracted", "active"]);
  if (!releasableStatuses.has(request.previousStatus) && !releasableStatuses.has(request.status)) return false;
  const provider = state.protectionProviders?.[request.providerInstitutionId];
  const buyer = state.logistics?.institutions?.[request.issuerInstitutionId];
  if (provider?.craft?.activeRequestId === request.id) {
    provider.craft.status = provider.craft.hull <= 0 ? "destroyed" : (request.dispatchedAt ? "returning" : "available");
    if (!request.dispatchedAt) provider.craft.activeRequestId = null;
    recordProtectionCraftDiagnostic(state, provider, Date.now(), {
      summary: request.dispatchedAt ? `Returning after ${request.siteId} resolved the threat` : `Available at ${provider.institution.siteId}`,
      locationSiteId: request.dispatchedAt ? request.siteId : provider.institution.siteId,
      refs: request.dispatchedAt ? { contractIds: [request.id], targetIds: [request.threatId] } : { contractIds: [], targetIds: [] },
    });
  }
  if (buyer?.accounts?.operating && request.agreedPayment) {
    buyer.accounts.operating.committed = Math.max(0, (buyer.accounts.operating.committed ?? 0) - request.agreedPayment);
  }
  request.paymentReleased = true;
  return true;
}

export function startProtectionContract(state, requestId, now = Date.now()) {
  const request = state.protectionPlanning?.requests?.[requestId];
  const provider = request && state.protectionProviders?.[request.providerInstitutionId];
  if (!request || request.status !== "contracted" || !provider || provider.craft.activeRequestId !== request.id) return null;
  request.status = "active";
  request.dispatchedAt = now;
  provider.craft.status = "deployed";
  recordProtectionCraftDiagnostic(state, provider, now, {
    summary: `Responding to threat at ${request.siteId}`,
    locationSiteId: request.siteId,
    refs: { contractIds: [request.id], targetIds: [request.threatId] },
  });
  state.ledger?.recordEvent("protection.craftDispatched", {
    requestId, institutionId: request.issuerInstitutionId, providerInstitutionId: request.providerInstitutionId,
    craftId: request.craftId, siteId: request.siteId, threatId: request.threatId,
  }, { visible: true });
  return request;
}

export function completeProtectionContract(state, requestId, { hull = null, now = Date.now() } = {}) {
  const request = state.protectionPlanning?.requests?.[requestId];
  const provider = request && state.protectionProviders?.[request.providerInstitutionId];
  const buyer = request && state.logistics?.institutions?.[request.issuerInstitutionId];
  if (!request || request.status !== "active" || !provider || !buyer?.accounts?.operating) return null;
  const payment = request.agreedPayment ?? 0;
  buyer.accounts.operating.committed = Math.max(0, (buyer.accounts.operating.committed ?? 0) - payment);
  buyer.accounts.operating.balance = Math.max(0, (buyer.accounts.operating.balance ?? 0) - payment);
  provider.institution.accounts.operating.balance += payment;
  if (hull != null) provider.craft.hull = Math.max(0, hull);
  provider.craft.status = "returning";
  recordProtectionCraftDiagnostic(state, provider, now, {
    summary: `Returning after protecting ${request.siteId}`,
    locationSiteId: request.siteId,
  });
  request.status = "fulfilled";
  request.paidAmount = payment;
  request.settledAt = now;
  state.ledger?.recordEvent("protection.contractPaid", {
    requestId, institutionId: request.issuerInstitutionId, providerInstitutionId: request.providerInstitutionId,
    craftId: request.craftId, siteId: request.siteId, threatId: request.threatId, payment,
  }, { visible: true });
  return request;
}

export function failProtectionContract(state, requestId, { hull = 0, reason = "craft-destroyed", now = Date.now() } = {}) {
  const request = state.protectionPlanning?.requests?.[requestId];
  const provider = request && state.protectionProviders?.[request.providerInstitutionId];
  const buyer = request && state.logistics?.institutions?.[request.issuerInstitutionId];
  if (!request || !["contracted", "active"].includes(request.status) || !provider) return null;
  if (buyer?.accounts?.operating) buyer.accounts.operating.committed = Math.max(0, (buyer.accounts.operating.committed ?? 0) - (request.agreedPayment ?? 0));
  provider.craft.hull = Math.max(0, hull);
  provider.craft.status = provider.craft.hull > 0 ? "returning" : "destroyed";
  provider.craft.activeRequestId = provider.craft.hull > 0 ? request.id : null;
  request.status = "failed";
  request.failureReason = reason;
  request.failedAt = now;
  request.paymentReleased = true;
  recordProtectionCraftDiagnostic(state, provider, now, {
    summary: provider.craft.hull > 0 ? `Returning after failed protection at ${request.siteId}` : `Destroyed while protecting ${request.siteId}`,
    locationSiteId: request.siteId,
  });
  state.ledger?.recordEvent("protection.contractFailed", {
    requestId, institutionId: request.issuerInstitutionId, providerInstitutionId: request.providerInstitutionId,
    craftId: request.craftId, siteId: request.siteId, threatId: request.threatId, reason,
  }, { visible: true });
  return request;
}

export function finishProtectionReturn(state, requestId, hull, now = Date.now()) {
  const request = state.protectionPlanning?.requests?.[requestId];
  const provider = request && state.protectionProviders?.[request.providerInstitutionId];
  if (!provider || provider.craft.activeRequestId !== requestId || provider.craft.hull <= 0) return null;
  provider.craft.hull = Math.max(0, hull);
  provider.craft.status = "available";
  provider.craft.siteId = provider.institution.siteId;
  provider.craft.activeRequestId = null;
  request.returnedAt = now;
  recordProtectionCraftDiagnostic(state, provider, now, {
    summary: `Available at ${provider.institution.siteId}`,
    refs: { contractIds: [], targetIds: [] },
  });
  return provider.craft;
}

export function listProtectionProviders(state) {
  return Object.values(state.protectionProviders ?? {});
}
