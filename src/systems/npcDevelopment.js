import { getActorProtectedCash } from "./actorConfig.js?v=fresh-20260822-1304-slipway";
import { appendHubHistory } from "./hubActors.js?v=fresh-20260822-1304-slipway";
import { isHubAggregated } from "./simulationMode.js?v=fresh-20260822-1304-slipway";

export const PROMOTION_SCORE = 100;
export const PROMOTION_MINIMUM_AGE_MS = 120 * 1000;
export const FACTORY_SPINOUT_RUNS = 8;
export const FACTORY_SPINOUT_ORDERS = 2;
export const FACTORY_SPINOUT_CAPITAL = 1200;
const CLOSED_ORDER_STATUSES = new Set(["delivered", "completed", "canceled", "cancelled", "expired", "withheld", "declined"]);

export function createInitialNpcDevelopmentState() {
  return { version: 1, records: {}, institutions: {}, lastEvaluatedAt: null };
}

export function ensureNpcDevelopmentState(state) {
  state.npcDevelopment ??= createInitialNpcDevelopmentState();
  state.npcDevelopment.records ??= {};
  state.npcDevelopment.institutions ??= {};
  return state.npcDevelopment;
}

function findFactory(state, operatorId) {
  return Object.values(state.industrial?.factories ?? {}).find((factory) => factory.operatorId === operatorId) ?? null;
}

function findCarrier(state, operator) {
  const direct = state.logistics?.institutions?.[operator.employerInstitutionId];
  if (direct?.archetypeId === "hauling-business") return direct;
  return Object.values(state.logistics?.institutions ?? {}).find((institution) =>
    institution.archetypeId === "hauling-business" && institution.controllerInstitutionId === operator.id) ?? null;
}

// The craft this person crews, across every mining company in the world.
//
// Mining was the one vocation with no evidence path: crews were anonymous, so
// nothing they did was ever recorded and the whole trade was invisible to
// promotion and to skill. The craft now carries its crew's id and its own
// operating history, in the same shape freight and factories already use.
function findMiningCraft(state, operatorId) {
  const operations = state.miningOperations ?? (state.miningOperation ? { legacy: state.miningOperation } : {});
  return Object.values(operations)
    .flatMap((operation) => Object.values(operation?.ships ?? {}))
    .find((ship) => ship?.operatorId === operatorId) ?? null;
}

export function deriveOperatorEvidence(state, operator) {
  const carrier = findCarrier(state, operator);
  const factory = findFactory(state, operator.id);
  const miningCraft = !carrier && !factory ? findMiningCraft(state, operator.id) : null;
  if (miningCraft) {
    const history = miningCraft.operatingHistory ?? {};
    const runs = history.completedExtractions ?? 0;
    const units = history.unitsCut ?? 0;
    const fields = history.servedSiteIds?.length ?? 0;
    return {
      vocation: "extraction operator", sourceKind: "extraction", sourceId: miningCraft.id,
      score: runs * 18 + Math.min(36, units / 4) + fields * 8,
      measures: { completedExtractions: runs, unitsCut: units, servedSites: fields },
    };
  }
  if (carrier) {
    const history = carrier.operatingHistory ?? {};
    const completed = history.completedFreight ?? 0;
    const revenue = history.lifetimeFreightRevenue ?? 0;
    const sites = history.servedSiteIds?.length ?? 0;
    return { vocation: "freight proprietor", sourceKind: "freight", sourceId: carrier.id,
      score: completed * 20 + Math.min(40, revenue / 100) + sites * 8,
      measures: { completedFreight: completed, lifetimeRevenue: revenue, servedSites: sites } };
  }
  if (factory) {
    const history = factory.operatingHistory ?? {};
    return { vocation: "industrial proprietor", sourceKind: "factory", sourceId: factory.id,
      score: (factory.completedRuns ?? 0) * 14 + (history.ordersAccepted ?? 0) * 12 + Math.min(30, (history.contractedRevenue ?? 0) / 100),
      measures: { completedRuns: factory.completedRuns ?? 0, ordersAccepted: history.ordersAccepted ?? 0,
        contractedRevenue: history.contractedRevenue ?? 0 } };
  }
  return { vocation: operator.role ?? "operator", sourceKind: "assignment", sourceId: operator.assignmentId,
    score: 0, measures: {} };
}

function syncOperatorMirror(state, operator) {
  const mirror = state.logistics?.institutions?.[operator.id];
  if (mirror && mirror !== operator) Object.assign(mirror, structuredClone(operator));
}

export function evaluateOperatorPromotion(state, operatorId, at = Date.now()) {
  const development = ensureNpcDevelopmentState(state);
  const operator = state.population?.operators?.[operatorId];
  if (!operator) return null;
  const evidence = deriveOperatorEvidence(state, operator);
  const record = development.records[operatorId] ??= {
    operatorId, stage: operator.actorKind === "bespoke-npc" ? "bespoke" : "operational",
    homeInstitutionId: operator.homeInstitutionId, firstEvaluatedAt: at, history: [], lastEvidence: null,
  };
  const evidenceKey = JSON.stringify(evidence.measures);
  if (record.lastEvidenceKey !== evidenceKey) {
    record.history.push({ at, type: "career.evaluated", score: evidence.score, evidence: structuredClone(evidence) });
    if (record.history.length > 40) record.history.splice(0, record.history.length - 40);
    record.lastEvidenceKey = evidenceKey;
  }
  record.lastEvidence = evidence;
  record.score = evidence.score;
  record.lastEvaluatedAt = at;
  if (record.stage === "bespoke" || operator.actorKind === "bespoke-npc") return record;
  if (at - (operator.createdAt ?? at) < PROMOTION_MINIMUM_AGE_MS || evidence.score < PROMOTION_SCORE) return record;

  record.stage = "bespoke";
  record.promotedAt = at;
  record.promotionBasis = structuredClone(evidence);
  operator.actorKind = "bespoke-npc";
  operator.developmentStage = "bespoke";
  operator.bespoke = {
    promotedAt: at, vocation: evidence.vocation, basis: structuredClone(evidence.measures),
    biography: `${operator.name} emerged from ${operator.homeInstitutionId} through a recorded career as ${evidence.vocation}.`,
    anchorEventIds: [],
  };
  syncOperatorMirror(state, operator);
  appendHubHistory(state, operator.homeInstitutionId, {
    type: "operator.promoted", subjectId: operator.id,
    detail: { name: operator.name, vocation: evidence.vocation, score: evidence.score, sourceId: evidence.sourceId },
  }, at);
  const event = state.ledger?.recordEvent?.("operator.promotedToBespoke", {
    operatorId: operator.id, operatorName: operator.name, homeInstitutionId: operator.homeInstitutionId,
    vocation: evidence.vocation, score: evidence.score, evidence: evidence.measures,
  }, { visible: true, message: `${operator.name}'s record of ${evidence.vocation} made them a recognized independent figure in First Reach.` });
  if (event) operator.bespoke.anchorEventIds.push(event.id);
  return record;
}

function transferUnits(from, to, itemId, units) {
  const moved = Math.min(Math.max(0, from[itemId] ?? 0), Math.max(0, units));
  if (moved <= 0) return 0;
  from[itemId] -= moved;
  to[itemId] = (to[itemId] ?? 0) + moved;
  return moved;
}

export function trySpinOutFactory(state, factoryId, at = Date.now()) {
  const development = ensureNpcDevelopmentState(state);
  const factory = state.industrial?.factories?.[factoryId];
  const operator = state.population?.operators?.[factory?.operatorId];
  const parent = state.logistics?.institutions?.[factory?.institutionId];
  if (!factory?.emergedFromPressure || !operator || operator.actorKind !== "bespoke-npc"
    || isHubAggregated(state, factory.institutionId)
    || parent?.actorKind !== "institutional-npc" || factory.activeRun
    || (factory.completedRuns ?? 0) < FACTORY_SPINOUT_RUNS
    || (factory.operatingHistory?.ordersAccepted ?? 0) < FACTORY_SPINOUT_ORDERS) return null;
  const openOrder = Object.values(state.hubProcurement?.orders ?? {})
    .some((order) => order.factoryId === factory.id && !CLOSED_ORDER_STATUSES.has(order.status));
  if (openOrder) return null;
  const businessId = `business:${factory.id}`;
  if (state.logistics.institutions[businessId]) return state.logistics.institutions[businessId];
  if ((parent.accounts?.operating?.balance ?? 0) - FACTORY_SPINOUT_CAPITAL < getActorProtectedCash(state, parent.id)) return null;
  const recipe = factory.recipes?.[0];
  if (!recipe || !Object.entries(recipe.inputs ?? {}).every(([itemId, units]) => (parent.inventories?.[itemId] ?? 0) >= units * 3)) return null;

  const inventories = {};
  Object.entries(recipe.inputs).forEach(([itemId, units]) => transferUnits(parent.inventories, inventories, itemId, units * 3));
  transferUnits(parent.inventories, inventories, recipe.output, 3);
  parent.accounts.operating.balance -= FACTORY_SPINOUT_CAPITAL;
  const business = state.logistics.institutions[businessId] = {
    id: businessId, name: factory.name, archetypeId: "parts-business", actorKind: "independent-business",
    controllerInstitutionId: operator.id, siteId: parent.siteId, homeSiteId: parent.siteId,
    foundedAt: at, parentInstitutionId: parent.id, sponsoredByInstitutionId: parent.id,
    accounts: { operating: { id: `ACCT-${businessId}`, balance: FACTORY_SPINOUT_CAPITAL, committed: 0,
      transactions: [{ id: `CAP-${businessId}`, at, type: "spinout-capital", amount: FACTORY_SPINOUT_CAPITAL,
        balance: FACTORY_SPINOUT_CAPITAL, referenceId: parent.id }] } },
    inventories, policies: { protectedCash: 600 }, motivation: operator.motivation,
    supplyAgreement: { supplierInstitutionId: parent.id, siteId: parent.siteId, pricing: "local-trade-value-plus-five-percent" },
    history: [{ at, type: "institution.spunOut", parentInstitutionId: parent.id, assetId: factory.id }],
  };
  parent.accounts.operating.transactions ??= [];
  parent.accounts.operating.transactions.push({ id: `CAP-${businessId}-OUT`, at, type: "spinout-capital",
    amount: -FACTORY_SPINOUT_CAPITAL, balance: parent.accounts.operating.balance, referenceId: businessId });
  factory.formerInstitutionId = parent.id;
  factory.institutionId = businessId;
  factory.spunOutAt = at;
  factory.spinoutInstitutionId = businessId;
  operator.employerInstitutionId = businessId;
  operator.controls = [...new Set([...(operator.controls ?? []), businessId])];
  operator.charter = { ...(operator.charter ?? {}), holderInstitutionId: businessId, status: "independent" };
  syncOperatorMirror(state, operator);
  const assignment = state.population?.laborAssignments?.[factory.laborAssignmentId];
  if (assignment) assignment.employerInstitutionId = businessId;
  development.institutions[businessId] = {
    id: businessId, founderOperatorId: operator.id, parentInstitutionId: parent.id,
    originatingAssetId: factory.id, foundedAt: at, status: "independent",
  };
  appendHubHistory(state, parent.id, { type: "department.spunOut", subjectId: factory.id,
    detail: { institutionId: businessId, operatorId: operator.id, capital: FACTORY_SPINOUT_CAPITAL } }, at);
  state.ledger?.recordEvent?.("institution.spunOut", {
    institutionId: businessId, institutionName: business.name, parentInstitutionId: parent.id,
    operatorId: operator.id, assetId: factory.id, capital: FACTORY_SPINOUT_CAPITAL,
  }, { visible: true, message: `${operator.name} took ${factory.name} independent with a charter and working capital from ${parent.name}.` });
  return business;
}

export function createNpcDevelopmentOperation({ state, now = () => Date.now() } = {}) {
  ensureNpcDevelopmentState(state);
  function observe() {
    Object.keys(state.population?.operators ?? {}).forEach((operatorId) => evaluateOperatorPromotion(state, operatorId, now()));
    Object.keys(state.industrial?.factories ?? {}).forEach((factoryId) => trySpinOutFactory(state, factoryId, now()));
    state.npcDevelopment.lastEvaluatedAt = now();
  }
  return { observe, decide() {}, update: observe, getState: () => state.npcDevelopment };
}
