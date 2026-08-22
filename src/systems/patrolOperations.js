import { FIRST_REACH_SETTLEMENTS } from "../content/economy/firstReachSettlements.js?v=fresh-20260822-0043-8abca575";
import { createCommercialCraftPublicIdentity } from "./publicIdentity.js?v=fresh-20260822-0043-8abca575";
import { DIAGNOSTIC_STATE, recordDiagnostic } from "./diagnostics.js?v=fresh-20260822-0043-8abca575";
import { applyCraftUse, ensureCraftComponents, getWorstComponent, serviceCraftComponent } from "./componentCondition.js?v=fresh-20260822-0043-8abca575";
import { listGeneratedSettlements } from "./settlementSeedPipeline.js?v=fresh-20260822-0043-8abca575";

const PATROL_OPENING_BALANCE = 1800;
const PATROL_COMPONENTS = Object.freeze([
  { id: "propulsion", label: "Patrol Propulsion", capabilityIds: ["intercept"] },
  { id: "flight-control", label: "Flight Control", capabilityIds: ["maneuver"] },
  { id: "sensor-suite", label: "Sensor Suite", capabilityIds: ["inspect", "track-threat"] },
  { id: "weapons", label: "Weapons", capabilityIds: ["interdict-threat"] },
  { id: "hull", label: "Hull Structure", capabilityIds: ["survive-combat"] },
]);

function ensurePatrolCraftCondition(craft) {
  ensureCraftComponents(craft, PATROL_COMPONENTS);
  return craft;
}

function applyPatrolSortieWear(craft, hullBefore, hullAfter, now) {
  const damageFraction = Math.max(0, (hullBefore - hullAfter) / Math.max(1, craft.maxHull));
  return applyCraftUse(craft, {
    propulsion: 0.025,
    "flight-control": 0.018,
    "sensor-suite": 0.012,
    weapons: 0.03,
    hull: damageFraction,
  }, { at: now });
}

export function createInitialPatrolOperations(now = Date.now(), settlements = FIRST_REACH_SETTLEMENTS) {
  return Object.fromEntries(settlements
    .filter((seed) => seed.institution.protectionPolicy?.mode !== "contract")
    .map((seed, index) => {
    const siteId = seed.institution.siteId;
    const institution = {
      id: `patrol:${siteId}`,
      name: `${seed.institution.name} Patrol Office`,
      archetypeId: "patrol-service",
      controllerInstitutionId: `person:patrol-chief:${siteId}`,
      siteId,
      accounts: { operating: { id: `PATROL-ACCT-${siteId.toUpperCase()}`, balance: PATROL_OPENING_BALANCE, committed: 0, transactions: [] } },
      policies: { protectedCash: 400, defensePriority: "local-jurisdiction", replacementObjective: 1 },
    };
    const controller = {
      id: institution.controllerInstitutionId,
      name: `${seed.institution.name} Watch Chief`,
      archetypeId: "person",
      controls: [institution.id],
      traits: { caution: 0.45 + (index % 3) * 0.12, urgencyBias: 0.65, growthBias: 0.05 },
      license: { id: `ENF-${siteId.toUpperCase()}-01`, class: "patrol-officer", status: "active" },
      authority: { mayInspect: true, mayPatrol: true, mayDefend: true },
    };
    const craft = {
      id: `patrol-craft:${siteId}`,
      name: `${seed.institution.name} Watch One`,
      referenceId: `PATROL-${siteId.toUpperCase()}-01`,
      ownerInstitutionId: institution.id,
      siteId,
      status: "available",
      hull: 150,
      maxHull: 150,
      createdAt: now,
    };
    ensurePatrolCraftCondition(craft);
    craft.publicIdentity = createCommercialCraftPublicIdentity({
      ship: craft,
      owner: institution,
      operator: controller,
      registeredHubIds: [siteId],
      authorizedActivities: ["patrol", "inspect-traffic", "defend-jurisdiction"],
    });
      return [siteId, { institution, controller, craft }];
    }));
}

export function ensurePatrolOperations(state, now = Date.now()) {
  state.patrolOperations ??= createInitialPatrolOperations(now);
  const settlements = [...FIRST_REACH_SETTLEMENTS, ...listGeneratedSettlements(state)];
  // Migrate older saves that synthesized a watch for every settlement. Only
  // remove the known generated operation; a separately authored patrol firm at
  // an outsourcing hub is a different institution and remains valid.
  settlements
    .filter((seed) => seed.institution.protectionPolicy?.mode === "contract")
    .forEach((seed) => {
      const siteId = seed.institution.siteId;
      if (state.patrolOperations[siteId]?.institution?.id === `patrol:${siteId}`) {
        delete state.patrolOperations[siteId];
      }
    });
  const defaults = createInitialPatrolOperations(now, settlements);
  Object.entries(defaults).forEach(([siteId, seed]) => {
    state.patrolOperations[siteId] ??= seed;
    const operation = state.patrolOperations[siteId];
    operation.craft.maxHull ??= 150;
    operation.craft.hull ??= operation.craft.maxHull;
    operation.craft.status ??= "available";
    operation.craft.publicIdentity ??= seed.craft.publicIdentity;
    ensurePatrolCraftCondition(operation.craft);
    if (state.logistics?.institutions) {
      state.logistics.institutions[operation.institution.id] ??= operation.institution;
      state.logistics.institutions[operation.controller.id] ??= operation.controller;
    }
  });
  return state.patrolOperations;
}

export function getAvailablePatrolCraft(state, siteId) {
  const craft = ensurePatrolOperations(state)[siteId]?.craft;
  const worst = craft ? getWorstComponent(craft) : null;
  return craft?.status === "available" && craft.hull > 0 && worst?.condition?.stage !== "failed" ? craft : null;
}

export function markPatrolCraftStatus(state, siteId, status) {
  const craft = ensurePatrolOperations(state)[siteId]?.craft;
  if (!craft) return null;
  craft.status = status;
  recordPatrolCraftDiagnostic(state, siteId);
  return craft;
}

export function recordPatrolCraftDiagnostic(state, siteId, now = Date.now(), patch = {}) {
  const operation = ensurePatrolOperations(state)[siteId];
  const craft = operation?.craft;
  if (!craft) return null;
  const diagnosticState = craft.status === "destroyed"
    ? DIAGNOSTIC_STATE.DISABLED
    : craft.status === "available"
      ? DIAGNOSTIC_STATE.FREE
      : DIAGNOSTIC_STATE.WORKING;
  return recordDiagnostic(state, craft.id, {
    actorName: craft.name,
    actorKind: "ship",
    controllerId: operation.institution.id,
    state: diagnosticState,
    summary: craft.status === "available" ? `On station at ${siteId}` : `Watch craft is ${craft.status}`,
    locationSiteId: craft.siteId ?? siteId,
    detail: { hull: craft.hull, maxHull: craft.maxHull, ownerInstitutionId: craft.ownerInstitutionId, referenceId: craft.referenceId, components: craft.components },
    ...patch,
  }, now);
}

// ── A settlement answering a threat with its OWN craft ──────────────────────
//
// `covered-internally` used to be where a request went to die: the planning
// layer named the hub's craft on it and nothing ever launched, so the watch
// declared cover it never provided AND locked the site out of covering anything
// else (one INTERNAL request per site is the rule). These four give that status
// the same dispatch → engage → return → settle lifecycle the contracted path
// has had all along.
//
// The difference from a contract is only who pays: nobody. A settlement using
// its own craft moves no money, so there is no agreed payment to release and no
// provider to credit — the cost is the hull it comes home with.

export function startInternalProtectionResponse(state, request, now = Date.now()) {
  const craft = ensurePatrolOperations(state)[request?.siteId]?.craft;
  if (!request || request.status !== "covered-internally" || !craft || craft.status !== "available" || craft.hull <= 0) return null;
  request.status = "active";
  request.dispatchedAt = now;
  craft.status = "deployed";
  recordPatrolCraftDiagnostic(state, request.siteId, now, {
    summary: `Responding to ${request.threatId} for ${request.siteId}`,
    refs: { contractIds: [request.id], targetIds: [request.threatId] },
  });
  state.ledger?.recordEvent("protection.craftDispatched", {
    requestId: request.id, institutionId: request.issuerInstitutionId,
    providerInstitutionId: request.providerInstitutionId, craftId: craft.id,
    siteId: request.siteId, threatId: request.threatId, internal: true,
  }, { visible: true });
  return request;
}

export function completeInternalProtectionResponse(state, request, { hull = null, now = Date.now() } = {}) {
  const craft = ensurePatrolOperations(state)[request?.siteId]?.craft;
  if (!request || request.status !== "active" || !craft) return null;
  const hullBefore = craft.hull;
  if (hull != null) craft.hull = Math.max(0, hull);
  applyPatrolSortieWear(craft, hullBefore, craft.hull, now);
  craft.status = "returning";
  request.status = "fulfilled";
  request.paidAmount = 0;
  request.settledAt = now;
  recordPatrolCraftDiagnostic(state, request.siteId, now, { summary: `Returning after clearing ${request.threatId}` });
  state.ledger?.recordEvent("protection.threatCleared", {
    requestId: request.id, institutionId: request.issuerInstitutionId, craftId: craft.id,
    siteId: request.siteId, threatId: request.threatId, internal: true,
  }, { visible: true });
  return request;
}

export function failInternalProtectionResponse(state, request, { hull = 0, reason = "craft-destroyed", now = Date.now() } = {}) {
  const craft = ensurePatrolOperations(state)[request?.siteId]?.craft;
  if (!request || !["covered-internally", "active"].includes(request.status) || !craft) return null;
  const hullBefore = craft.hull;
  craft.hull = Math.max(0, hull);
  applyPatrolSortieWear(craft, hullBefore, craft.hull, now);
  craft.status = craft.hull > 0 ? "returning" : "destroyed";
  request.status = "failed";
  request.failureReason = reason;
  request.failedAt = now;
  recordPatrolCraftDiagnostic(state, request.siteId, now, {
    summary: craft.hull > 0 ? `Returning after failing to hold ${request.siteId}` : `Destroyed defending ${request.siteId}`,
  });
  state.ledger?.recordEvent("protection.responseFailed", {
    requestId: request.id, institutionId: request.issuerInstitutionId, craftId: craft.id,
    siteId: request.siteId, threatId: request.threatId, reason, internal: true,
  }, { visible: true });
  return request;
}

// A settlement's watch craft is destroyed exactly as permanently as a security
// firm's was: `patrol.craftDestroyed` even says so out loud ("has no available
// patrol craft") and nothing ever brought one back. The settlement owns the
// watch, so the settlement funds the replacement out of its own treasury —
// bounded by the protected cash its protection policy already declares.
const WATCH_REPLACEMENT_COST = 2400;
const WATCH_REPLACEMENT_SECONDS = 240;

export function servicePatrolCraft(state, now = Date.now()) {
  const operations = ensurePatrolOperations(state, now);
  const replaced = [];
  [...FIRST_REACH_SETTLEMENTS, ...listGeneratedSettlements(state)].forEach((seed) => {
    const siteId = seed.institution.siteId;
    const craft = operations[siteId]?.craft;
    if (!craft || craft.status !== "destroyed") return;
    craft.replacementStartedAt ??= craft.destroyedAt ?? now;
    const owner = state.logistics?.institutions?.[seed.institution.id];
    const treasury = owner?.accounts?.operating;
    const protectedCash = seed.institution.protectionPolicy?.protectedCash ?? 0;
    const spendable = Math.max(0, (treasury?.balance ?? 0) - (treasury?.committed ?? 0) - protectedCash);
    if (!treasury || spendable < WATCH_REPLACEMENT_COST) {
      recordPatrolCraftDiagnostic(state, siteId, now, {
        summary: `${seed.institution.name} has no watch craft and cannot fund a ${WATCH_REPLACEMENT_COST} cr replacement`,
        waitingFor: `${Math.max(0, Math.round(WATCH_REPLACEMENT_COST - spendable))} more credits`,
        wakeOn: ["hub-income"],
      });
      return;
    }
    if (now - craft.replacementStartedAt < WATCH_REPLACEMENT_SECONDS * 1000) return;
    treasury.balance -= WATCH_REPLACEMENT_COST;
    // Declared on the LIVE record, not the content seed — the sampler reads
    // `state.logistics.institutions`, so booking it against the seed would leave
    // the burn invisible and the replacement looking like money vanishing.
    owner.capitalSpend = (owner.capitalSpend ?? 0) + WATCH_REPLACEMENT_COST;
    treasury.transactions?.push({ id: `WATCH-HULL-${siteId}-${now}`, at: now, type: "capital-expense", amount: -WATCH_REPLACEMENT_COST, balance: treasury.balance, referenceId: craft.id });
    craft.hull = craft.maxHull;
    craft.status = "available";
    craft.siteId = siteId;
    craft.destroyedAt = null;
    craft.replacementStartedAt = null;
    craft.replacementCount = (craft.replacementCount ?? 0) + 1;
    craft.components = {};
    ensurePatrolCraftCondition(craft);
    replaced.push(siteId);
    recordPatrolCraftDiagnostic(state, siteId, now, { summary: `Replacement watch craft on station at ${siteId}` });
    state.ledger?.recordEvent("patrol.craftReplaced", {
      siteId, institutionId: seed.institution.id, craftId: craft.id, cost: WATCH_REPLACEMENT_COST,
      replacementCount: craft.replacementCount, accountBalance: Math.round(treasury.balance),
    }, { visible: true, message: `${seed.institution.name} commissioned a replacement watch craft for ${WATCH_REPLACEMENT_COST} cr.` });
  });
  return replaced;
}

export function finishInternalProtectionReturn(state, request, hull, now = Date.now()) {
  const craft = ensurePatrolOperations(state)[request?.siteId]?.craft;
  if (!craft || craft.hull <= 0) return null;
  craft.hull = Math.max(0, hull);
  craft.status = "available";
  craft.siteId = request.siteId;
  if (request) request.returnedAt = now;
  recordPatrolCraftDiagnostic(state, request.siteId, now, {
    summary: `On station at ${request.siteId}`,
    refs: { contractIds: [], targetIds: [] },
  });
  return craft;
}

export function servicePatrolCraftComponent(state, siteId, { componentId = null, repairOrderId = null, now = Date.now() } = {}) {
  const craft = ensurePatrolOperations(state, now)[siteId]?.craft;
  if (!craft) return null;
  const component = componentId ? craft.components?.[componentId] : getWorstComponent(craft);
  if (!component) return null;
  return serviceCraftComponent(craft, component.id, { at: now, providerId: "sprc", repairOrderId });
}
