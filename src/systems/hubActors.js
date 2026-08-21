import { ACTOR_ROLE, getActorRecord, listActors } from "./actorRegistry.js?v=fresh-20260820-1911-46d9453";
import { getActorCapabilityPortfolio } from "./assetCapabilities.js?v=fresh-20260820-1911-46d9453";
import { getPopulationLaborSummary } from "./populationLabor.js?v=fresh-20260820-1911-46d9453";
import { getHubTerritory } from "./hubTerritories.js?v=fresh-20260820-1911-46d9453";
import { getHubSimulationRecord } from "./simulationMode.js?v=fresh-20260820-1911-46d9453";

// The coherent settlement actor.
//
// This is an aggregate over live domain records, not a second economy. A hub's
// treasury and warehouse remain the institution's real account and inventory;
// population, factories and relationships remain owned by their domain. The
// hub API returns those SAME objects beside the durable needs, projects and
// history that belong to the organisation itself. Future planners therefore
// have one surface without introducing duplicate balances that can drift.

export const HUB_ACTOR_VERSION = 1;
const FACILITY_ARCHETYPES = new Set(["parts-factory", "repair-facility", "recovery-mill", "farm"]);
const CLOSED_ORDER_STATUSES = new Set(["delivered", "completed", "canceled", "cancelled", "expired"]);
const MAX_HUB_HISTORY = 120;

export function listHubIds(state) {
  return listActors(state, { role: ACTOR_ROLE.INSTITUTION })
    .filter(({ record }) => record.actorKind === "institutional-npc" || record.agency?.kind === "institutional")
    .map(({ id }) => id);
}

export function ensureHubActorState(state, hubId, at = Date.now()) {
  const institution = getActorRecord(state, hubId);
  if (!institution || (institution.actorKind !== "institutional-npc" && institution.agency?.kind !== "institutional")) return null;
  institution.hubState ??= {
    version: HUB_ACTOR_VERSION,
    populationId: institution.assets?.find((asset) => asset.archetypeId === "population-constituency")?.scope?.populationId ?? null,
    needs: {},
    projects: {},
    departments: {},
    history: [{ id: `hub-history:${hubId}:founded`, type: "institution.founded", at }],
    counters: { need: 0, project: 0, history: 0 },
  };
  institution.hubState.version ??= HUB_ACTOR_VERSION;
  institution.hubState.populationId ??= institution.assets?.find((asset) => asset.archetypeId === "population-constituency")?.scope?.populationId ?? null;
  institution.hubState.needs ??= {};
  institution.hubState.projects ??= {};
  institution.hubState.departments ??= {};
  institution.hubState.history ??= [];
  institution.hubState.counters ??= { need: 0, project: 0, history: 0 };
  return institution.hubState;
}

export function ensureAllHubActors(state, at = Date.now()) {
  return listHubIds(state).map((hubId) => ensureHubActorState(state, hubId, at));
}

export function getHubActor(state, hubId, { at = Date.now() } = {}) {
  const institution = getActorRecord(state, hubId);
  const durable = ensureHubActorState(state, hubId, at);
  if (!institution || !durable) return null;
  const portfolio = getActorCapabilityPortfolio(state, hubId);
  const population = state.population?.populations?.[durable.populationId]
    ?? Object.values(state.population?.populations ?? {}).find((entry) => entry.hubInstitutionId === hubId)
    ?? null;
  if (population && durable.populationId !== population.id) durable.populationId = population.id;

  const purchaseOrders = Object.values(state.hubProcurement?.orders ?? {})
    .filter((order) => order.buyerInstitutionId === hubId);
  const projectedNeeds = [
    ...projectPopulationNeeds(population),
    ...projectProcurementNeeds(purchaseOrders),
  ];
  const relationships = Object.values(state.relationships?.projections ?? {})
    .filter((entry) => entry.fromId === hubId || entry.toId === hubId);

  return {
    id: hubId,
    name: institution.name,
    actorKind: institution.actorKind,
    agency: institution.agency,
    siteId: institution.siteId,
    territory: getHubTerritory(institution.siteId, state),
    simulation: getHubSimulationRecord(state, hubId),
    representativeIds: institution.agency?.representativeIds ?? [institution.controllerInstitutionId].filter(Boolean),
    treasury: institution.accounts?.operating ?? null,
    inventory: institution.inventories ?? null,
    population,
    labor: population ? getPopulationLaborSummary(state, population) : null,
    assets: portfolio.assets,
    facilities: portfolio.assets.filter((asset) => FACILITY_ARCHETYPES.has(asset.archetypeId)),
    capabilities: portfolio.capabilities,
    offerTypes: portfolio.offerTypes,
    needs: [...Object.values(durable.needs), ...projectedNeeds],
    projects: Object.values(durable.projects),
    planning: {
      openNeeds: Object.values(durable.needs).filter((need) => need.status === "open"),
      activeProjects: Object.values(durable.projects).filter((project) => !["completed", "failed", "canceled"].includes(project.status)),
      decisions: Object.values(durable.projects).filter((project) => project.decision).map((project) => project.decision),
    },
    development: {
      operators: Object.values(state.npcDevelopment?.records ?? {}).filter((record) => record.homeInstitutionId === hubId),
      spinouts: Object.values(state.npcDevelopment?.institutions ?? {}).filter((record) => record.parentInstitutionId === hubId),
    },
    departments: Object.values(durable.departments),
    policies: {
      operating: institution.policies ?? {},
      protection: institution.protectionPolicy ?? {},
      institutional: institution.agency?.traits ?? {},
      development: durable.baseline ?? {},
    },
    relationships,
    history: durable.history,
    domain: {
      purchaseOrders,
      finishedGoods: institution.finishedGoods ?? {},
      settlementTrade: institution.settlementTrade ?? null,
    },
    durable,
    institution,
  };
}

export function listHubActors(state, options = {}) {
  return listHubIds(state).map((hubId) => getHubActor(state, hubId, options)).filter(Boolean);
}

export function recordHubNeed(state, hubId, need, at = Date.now()) {
  const hub = ensureHubActorState(state, hubId, at);
  if (!hub || !need) return null;
  const id = need.id ?? `hub-need:${hubId}:${++hub.counters.need}`;
  hub.needs[id] = {
    ...(hub.needs[id] ?? {}),
    ...need,
    id,
    status: need.status ?? hub.needs[id]?.status ?? "open",
    createdAt: hub.needs[id]?.createdAt ?? at,
    updatedAt: at,
  };
  appendHubHistory(state, hubId, { type: "hub.needRecorded", subjectId: id, detail: { kind: need.kind, urgency: need.urgency } }, at);
  return hub.needs[id];
}

export function resolveHubNeed(state, hubId, needId, resolution = {}, at = Date.now()) {
  const hub = ensureHubActorState(state, hubId, at);
  const need = hub?.needs?.[needId];
  if (!need) return null;
  Object.assign(need, resolution, { status: resolution.status ?? "resolved", resolvedAt: at, updatedAt: at });
  appendHubHistory(state, hubId, { type: "hub.needResolved", subjectId: needId, detail: resolution }, at);
  return need;
}

export function upsertHubProject(state, hubId, project, at = Date.now()) {
  const hub = ensureHubActorState(state, hubId, at);
  if (!hub || !project) return null;
  const id = project.id ?? `hub-project:${hubId}:${++hub.counters.project}`;
  hub.projects[id] = {
    ...(hub.projects[id] ?? {}),
    ...project,
    id,
    status: project.status ?? hub.projects[id]?.status ?? "proposed",
    createdAt: hub.projects[id]?.createdAt ?? at,
    updatedAt: at,
  };
  appendHubHistory(state, hubId, { type: "hub.projectUpdated", subjectId: id, detail: { status: hub.projects[id].status, kind: project.kind } }, at);
  return hub.projects[id];
}

export function transitionHubProject(state, hubId, projectId, status, detail = {}, at = Date.now()) {
  const hub = ensureHubActorState(state, hubId, at);
  const project = hub?.projects?.[projectId];
  if (!project) return null;
  Object.assign(project, detail, { status, updatedAt: at });
  if (["completed", "failed", "canceled"].includes(status)) project.closedAt = at;
  appendHubHistory(state, hubId, { type: "hub.projectTransitioned", subjectId: projectId, detail: { status, ...detail } }, at);
  return project;
}

export function appendHubHistory(state, hubId, event, at = Date.now()) {
  const hub = ensureHubActorState(state, hubId, at);
  if (!hub || !event) return null;
  const record = {
    ...event,
    id: event.id ?? `hub-history:${hubId}:${++hub.counters.history}`,
    at: event.at ?? at,
  };
  hub.history.push(record);
  if (hub.history.length > MAX_HUB_HISTORY) hub.history.splice(0, hub.history.length - MAX_HUB_HISTORY);
  return record;
}

function projectPopulationNeeds(population) {
  if (!population) return [];
  return Object.values(population.needs ?? {})
    .filter((need) => (need.backlog ?? 0) > 0)
    .map((need) => ({
      id: `population-need:${population.id}:${need.needId}`,
      kind: "population-demand",
      source: "population",
      subjectId: population.id,
      itemId: need.needId,
      shortage: need.backlog,
      status: "open",
      createdAt: need.unmetSince ?? need.lastDemandAt ?? null,
    }));
}

function projectProcurementNeeds(orders) {
  return orders.filter((order) => !CLOSED_ORDER_STATUSES.has(order.status)).map((order) => ({
    id: `procurement-need:${order.id}`,
    kind: "procurement",
    source: "hubProcurement",
    subjectId: order.id,
    itemId: order.resourceId ?? order.family,
    shortage: Math.max(0, (order.units ?? 0) - (order.deliveredUnits ?? 0)),
    status: order.status,
    createdAt: order.createdAt ?? null,
  }));
}
