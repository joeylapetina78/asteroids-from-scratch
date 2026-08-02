const DEFAULT_POLICY = Object.freeze({
  premiumRate: 0.06,
  hullClaimRate: 0.6,
  deductible: 600,
  maximumClaim: 3600,
});

export function createInitialFleetInsuranceState(now = Date.now()) {
  return {
    institution: {
      id: "first-reach-mutual",
      name: "First Reach Mutual",
      archetypeId: "fleet-insurer",
      accounts: { operating: { id: "FRM-ACCT-01", balance: 18000, committed: 0, transactions: [] } },
      policies: { protectedCash: 5000 },
    },
    policies: {}, claims: {}, counters: { policy: 0, claim: 0, transaction: 0 },
    lastLedgerEventId: 0, createdAt: now,
  };
}

export function ensureFleetInsuranceState(state, now = Date.now()) {
  state.fleetInsurance ??= createInitialFleetInsuranceState(now);
  state.fleetInsurance.policies ??= {};
  state.fleetInsurance.claims ??= {};
  state.fleetInsurance.counters ??= { policy: 0, claim: 0, transaction: 0 };
  state.fleetInsurance.lastLedgerEventId ??= 0;
  return state.fleetInsurance;
}

export function createFleetInsuranceManager({ state, now = () => Date.now() }) {
  const insurance = ensureFleetInsuranceState(state, now());

  function update() {
    ensureEligiblePolicies();
    for (const event of state.ledger.getEventsAfterId(insurance.lastLedgerEventId, { includeHidden: true })) {
      insurance.lastLedgerEventId = Math.max(insurance.lastLedgerEventId, event.id);
      if (["carrier.contractFulfilled", "mining.deliveryCompleted"].includes(event.type)) collectPremium(event);
      if (event.type === "wreck.created") settleHullClaim(event);
    }
  }

  function ensureEligiblePolicies() {
    const miningInstitutions = Object.values(state.miningOperations ?? {}).map((operation) => operation.institution).filter(Boolean);
    const institutions = [...Object.values(state.logistics?.institutions ?? {}), ...miningInstitutions];
    institutions
      .filter((institution) => ["hauling-business", "mining-contractor"].includes(institution.archetypeId))
      .forEach((institution) => {
        if (insurance.policies[institution.id]) return;
        const id = `POL-${String(++insurance.counters.policy).padStart(4, "0")}`;
        insurance.policies[institution.id] = { id, holderInstitutionId: institution.id, status: "active", ...DEFAULT_POLICY, premiumsPaid: 0, claimsPaid: 0, lossCount: 0, startedAt: now() };
        state.ledger.recordEvent("insurance.policyBound", { institutionId: insurance.institution.id, policyId: id, holderInstitutionId: institution.id }, { visible: true, message: `${institution.name} bound fleet cover with ${insurance.institution.name}; claims cover part of a lost hull, not its entire replacement.` });
      });
  }

  function resolveEarningInstitution(payload) {
    return payload.carrierInstitutionId ?? payload.institutionId ?? payload.operatorInstitutionId ?? null;
  }

  function collectPremium(event) {
    const holderId = resolveEarningInstitution(event.payload);
    const policy = insurance.policies[holderId];
    const holder = findInstitution(holderId);
    const income = event.payload.payment ?? event.payload.revenue ?? event.payload.amount ?? 0;
    if (!policy || policy.status !== "active" || !holder?.accounts?.operating || income <= 0) return;
    const premium = Math.max(1, Math.round(income * policy.premiumRate));
    if (holder.accounts.operating.balance < premium) return;
    transfer(holder, insurance.institution, premium, "fleet-insurance-premium", policy.id);
    policy.premiumsPaid += premium;
    state.ledger.recordEvent("insurance.premiumPaid", { institutionId: insurance.institution.id, policyId: policy.id, holderInstitutionId: holderId, premium, income }, { visible: false });
  }

  function resolveOwner(wreck) {
    const owner = findInstitution(wreck.ownerInstitutionId);
    if (!owner) return null;
    return findInstitution(owner.controllerInstitutionId) ?? owner;
  }

  function findInstitution(id) {
    if (!id) return null;
    const logistics = state.logistics?.institutions?.[id];
    if (logistics) return logistics;
    for (const operation of Object.values(state.miningOperations ?? {})) {
      if (operation.institution?.id === id) return operation.institution;
      if (operation.ships?.[id]) return operation.ships[id];
    }
    return null;
  }

  function settleHullClaim(event) {
    const wreck = state.wrecks?.records?.[event.payload.wreckId];
    const holder = resolveOwner(wreck ?? event.payload);
    const policy = holder && insurance.policies[holder.id];
    if (!wreck || !holder || !policy || policy.status !== "active") return null;
    if (Object.values(insurance.claims).some((claim) => claim.wreckId === wreck.id)) return null;
    const requested = Math.max(0, Math.round(6000 * policy.hullClaimRate - policy.deductible));
    const reserve = insurance.institution.policies.protectedCash ?? 0;
    const available = Math.max(0, insurance.institution.accounts.operating.balance - reserve);
    const paid = Math.min(requested, policy.maximumClaim, available);
    const id = `CLM-${String(++insurance.counters.claim).padStart(4, "0")}`;
    const claim = insurance.claims[id] = { id, policyId: policy.id, wreckId: wreck.id, holderInstitutionId: holder.id, requested, paid, status: paid === requested ? "paid" : paid > 0 ? "partially-paid" : "reserve-blocked", createdAt: now() };
    policy.lossCount += 1;
    if (paid > 0) {
      transfer(insurance.institution, holder, paid, "insured-hull-claim", id);
      policy.claimsPaid += paid;
    }
    // Claims make future cover dearer, but the increase is bounded.
    policy.premiumRate = Math.min(0.14, DEFAULT_POLICY.premiumRate + policy.lossCount * 0.015);
    state.ledger.recordEvent("insurance.claimSettled", { institutionId: insurance.institution.id, claimId: id, policyId: policy.id, holderInstitutionId: holder.id, wreckId: wreck.id, requested, paid, nextPremiumRate: policy.premiumRate }, { visible: true, message: `${insurance.institution.name} paid ${paid} cr toward ${holder.name}'s lost hull; the owner still bears the deductible and uncovered replacement cost.` });
    return claim;
  }

  function transfer(from, to, amount, type, referenceId) {
    const source = from.accounts.operating;
    const destination = to.accounts.operating;
    source.transactions ??= []; destination.transactions ??= [];
    source.balance -= amount; destination.balance += amount;
    const id = `INS-TX-${String(++insurance.counters.transaction).padStart(5, "0")}`;
    source.transactions.push({ id: `${id}-OUT`, at: now(), type, amount: -amount, balance: source.balance, referenceId });
    destination.transactions.push({ id: `${id}-IN`, at: now(), type, amount, balance: destination.balance, referenceId });
  }

  return { update, getState: () => insurance };
}
