export function createNeedRecord({ id, kind, subject, target = null, current = null, shortage = 0, urgency = "routine", purpose = null, context = {}, createdAt = Date.now() }) {
  return { id, recordType: "need", kind, subject, target, current, shortage, urgency, purpose, context, status: "open", responseIds: [], createdAt };
}

export function createProblemRecord({ id, kind, subjectId = null, severity = 0, requirements = [], consequences = [], context = {}, createdAt = Date.now() }) {
  return { id, recordType: "problem", kind, subjectId, severity, requirements, consequences, context, status: "open", responseIds: [], createdAt };
}

export function createResponseRecord({ id, needIds = [], problemIds = [], capabilityId, action, rationale, estimatedCost = 0, priorityScore = 0, reconsiderWhen = [], selectedAt = Date.now() }) {
  return { id, recordType: "response", needIds, problemIds, capabilityId, action, rationale, estimatedCost, priorityScore, reconsiderWhen, status: "proposed", selectedAt };
}

export function createPolicyRecord(values = {}) {
  return {
    protectedCash: 0,
    priorityWeights: { routine: 10, urgent: 50, emergency: 100 },
    purposeWeights: {},
    capabilityWeights: {},
    ...values,
  };
}

export function resolveInstitutionPolicy({ archetypePolicy = {}, institutionPolicy = {}, controllerModifiers = {} } = {}) {
  return createPolicyRecord({
    ...archetypePolicy,
    ...institutionPolicy,
    ...controllerModifiers,
    priorityWeights: { ...archetypePolicy.priorityWeights, ...institutionPolicy.priorityWeights, ...controllerModifiers.priorityWeights },
    purposeWeights: { ...archetypePolicy.purposeWeights, ...institutionPolicy.purposeWeights, ...controllerModifiers.purposeWeights },
    capabilityWeights: { ...archetypePolicy.capabilityWeights, ...institutionPolicy.capabilityWeights, ...controllerModifiers.capabilityWeights },
  });
}

export function evaluateAffordability({ account, policy, cost, allowPartial = false }) {
  const spendable = Math.max(0, (account?.balance ?? 0) - (account?.committed ?? 0) - (policy?.protectedCash ?? 0));
  const affordableAmount = Math.min(spendable, Math.max(0, cost));
  return {
    affordable: cost <= spendable,
    partiallyAffordable: allowPartial && affordableAmount > 0 && affordableAmount < cost,
    affordableAmount,
    requiredAmount: cost,
    spendable,
    protectedAmount: policy?.protectedCash ?? 0,
  };
}

export function scoreResponse({ proposal, need = null, problem = null, policy, controllerTraits = {} }) {
  const urgency = need?.urgency ?? proposal.urgency ?? "routine";
  const severity = problem?.severity ?? proposal.severity ?? 0;
  const purpose = need?.purpose ?? proposal.purpose;
  return (policy.priorityWeights?.[urgency] ?? 0)
    + severity * 100
    + (policy.purposeWeights?.[purpose] ?? 0)
    + (policy.capabilityWeights?.[proposal.capabilityId] ?? 0)
    + (controllerTraits.urgencyBias ?? 0) * (urgency === "routine" ? 0 : 10)
    + (controllerTraits.growthBias ?? 0) * (purpose === "growth" ? 10 : 0)
    - (controllerTraits.caution ?? 0) * (proposal.risk ?? 0) * 10;
}

export function generateCapabilityResponses({ institution, controller = null, needs = [], problems = [], capabilities = [], policy, context = {} }) {
  const proposals = [];
  for (const need of needs.filter((entry) => entry.status === "open")) {
    for (const capability of capabilities) {
      if (!capability.canAddress({ institution, controller, need, problem: null, policy, context })) continue;
      for (const proposal of capability.propose({ institution, controller, need, problem: null, policy, context })) {
        proposals.push({ ...proposal, needId: need.id, problemId: null, priorityScore: scoreResponse({ proposal, need, policy, controllerTraits: controller?.traits }) });
      }
    }
  }
  for (const problem of problems.filter((entry) => entry.status === "open")) {
    for (const capability of capabilities) {
      if (!capability.canAddress({ institution, controller, need: null, problem, policy, context })) continue;
      for (const proposal of capability.propose({ institution, controller, need: null, problem, policy, context })) {
        proposals.push({ ...proposal, needId: null, problemId: problem.id, priorityScore: scoreResponse({ proposal, problem, policy, controllerTraits: controller?.traits }) });
      }
    }
  }
  return proposals.sort((a, b) => b.priorityScore - a.priorityScore);
}

export function shouldReconsiderResponse(response, events = []) {
  return response?.status === "blocked" && events.some((event) => response.reconsiderWhen?.includes(event.type));
}

export function deriveInventoryNeeds({ targets = {}, quantities = {}, incoming = {}, makeId, now = Date.now() }) {
  return Object.entries(targets).flatMap(([resourceId, target]) => {
    const current = (quantities[resourceId] ?? 0) + (incoming[resourceId] ?? 0);
    if (current >= target) return [];
    return [createNeedRecord({
      id: makeId(resourceId),
      kind: "inventory-reserve",
      subject: { resourceId },
      target,
      current,
      shortage: target - current,
      urgency: "routine",
      purpose: "restore-operating-reserve",
      createdAt: now,
    })];
  });
}

export function reconcileNeeds({ records, derivedNeeds, now = Date.now() }) {
  const derivedById = new Map(derivedNeeds.map((need) => [need.id, need]));
  for (const derived of derivedNeeds) {
    const existing = records[derived.id];
    if (!existing || existing.status === "resolved") {
      records[derived.id] = derived;
      continue;
    }
    Object.assign(existing, {
      subject: derived.subject,
      target: derived.target,
      current: derived.current,
      shortage: derived.shortage,
      urgency: derived.urgency,
      purpose: derived.purpose,
      context: derived.context,
      status: "open",
      lastAssessedAt: now,
    });
  }
  for (const existing of Object.values(records)) {
    if (existing.kind !== "inventory-reserve" || existing.status !== "open" || derivedById.has(existing.id)) continue;
    existing.status = "resolved";
    existing.shortage = 0;
    existing.resolvedAt = now;
  }
  return records;
}
