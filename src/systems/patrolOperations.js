import { FIRST_REACH_SETTLEMENTS } from "../content/economy/firstReachSettlements.js";
import { createCommercialCraftPublicIdentity } from "./publicIdentity.js";

const PATROL_OPENING_BALANCE = 1800;

export function createInitialPatrolOperations(now = Date.now()) {
  return Object.fromEntries(FIRST_REACH_SETTLEMENTS.map((seed, index) => {
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
  const defaults = createInitialPatrolOperations(now);
  Object.entries(defaults).forEach(([siteId, seed]) => {
    state.patrolOperations[siteId] ??= seed;
    const operation = state.patrolOperations[siteId];
    operation.craft.maxHull ??= 150;
    operation.craft.hull ??= operation.craft.maxHull;
    operation.craft.status ??= "available";
    operation.craft.publicIdentity ??= seed.craft.publicIdentity;
    if (state.logistics?.institutions) {
      state.logistics.institutions[operation.institution.id] ??= operation.institution;
      state.logistics.institutions[operation.controller.id] ??= operation.controller;
    }
  });
  return state.patrolOperations;
}

export function getAvailablePatrolCraft(state, siteId) {
  const craft = ensurePatrolOperations(state)[siteId]?.craft;
  return craft?.status === "available" && craft.hull > 0 ? craft : null;
}

export function markPatrolCraftStatus(state, siteId, status) {
  const craft = ensurePatrolOperations(state)[siteId]?.craft;
  if (!craft) return null;
  craft.status = status;
  return craft;
}

