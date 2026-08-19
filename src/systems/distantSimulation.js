import { DETAIL, resolveDetailLevel, setSimulationFocus } from "./detailLevel.js?v=fresh-20260819-0621-e0ba4c1";
import { getEconomySamples } from "./economySampler.js?v=fresh-20260819-0621-e0ba4c1";
import { advanceRegionFlow, createRegionFlow } from "./regionFlow.js?v=fresh-20260819-0621-e0ba4c1";
import { getMiningOrderBook } from "./miningOrderBook.js?v=fresh-20260819-0621-e0ba4c1";
import { listHubActors } from "./hubActors.js?v=fresh-20260819-0621-e0ba4c1";
import { getResourceEffectiveYield, getResourceFamily } from "./resourceDefinitions.js?v=fresh-20260819-0621-e0ba4c1";
import { DISTANT_SIMULATION_VERSION, ensureDistantSimulationState, getHubSimulationRecord, isHubAggregated } from "./simulationMode.js?v=fresh-20260819-0621-e0ba4c1";

export { DISTANT_SIMULATION_VERSION, ensureDistantSimulationState, getHubSimulationRecord, isHubAggregated };
export const DISTANT_DEFAULTS = Object.freeze({ aggregateAfterMs: 30_000 });
const OPEN_ORDER_STATUSES = new Set(["offered", "accepted", "ready", "shipped"]);
const OPEN_SHIPMENT_STATUSES = new Set(["assigned", "loaded"]);
const OPEN_PROTECTION_STATUSES = new Set(["offered", "contracted", "active"]);
const FAMILY_RESOURCE = Object.freeze({ structural: "iron-nickel", industrial: "silicate", volatile: "water-ice" });

export function explainAggregationEligibility(state, hubId) {
  const hub = state.logistics?.institutions?.[hubId];
  if (!hub?.siteId) return { eligible: false, blockers: ["hub-missing"] };
  const blockers = [];
  const orders = Object.values(state.hubProcurement?.orders ?? {})
    .filter((order) => (order.buyerInstitutionId === hubId || order.supplierInstitutionId === hubId)
      && OPEN_ORDER_STATUSES.has(order.status));
  if (orders.length) blockers.push(`open-orders:${orders.length}`);
  const shipments = Object.values(state.logistics?.shipments ?? {})
    .filter((shipment) => OPEN_SHIPMENT_STATUSES.has(shipment.status)
      && (shipment.originSiteId === hub.siteId || shipment.destinationSiteId === hub.siteId
        || shipment.sourceInstitutionId === hubId || shipment.destinationInstitutionId === hubId));
  if (shipments.length) blockers.push(`active-shipments:${shipments.length}`);
  const book = getMiningOrderBook(state);
  const allocations = Object.values(state.miningOperations ?? (state.miningOperation ? { legacy: state.miningOperation } : {}))
    .flatMap((operation) => Object.values(operation?.allocations ?? {}))
    .filter((allocation) => allocation.status === "active" && book[allocation.orderId]?.buyerInstitutionId === hubId);
  if (allocations.length) blockers.push(`active-extraction:${allocations.length}`);
  const production = Object.values(state.population?.productionOrders ?? {})
    .filter((order) => order.hubInstitutionId === hubId && !["completed", "canceled"].includes(order.status));
  if (production.length) blockers.push(`population-production:${production.length}`);
  const protection = Object.values(state.protectionPlanning?.requests ?? {})
    .filter((request) => request.issuerInstitutionId === hubId && OPEN_PROTECTION_STATUSES.has(request.status));
  if (protection.length) blockers.push(`active-protection:${protection.length}`);
  const factories = Object.values(state.industrial?.factories ?? {})
    .filter((factory) => factory.institutionId === hubId && factory.activeRun);
  const construction = Object.values(state.industrial?.constructionProjects ?? {})
    .filter((project) => project.institutionId === hubId && project.status === "building");
  if (factories.length || construction.length) blockers.push(`industrial-work:${factories.length + construction.length}`);
  return { eligible: blockers.length === 0, blockers };
}

export function createDistantSimulationOperation({
  state,
  getFocusPoints = () => [],
  now = () => Date.now(),
  policy = DISTANT_DEFAULTS,
} = {}) {
  const simulation = ensureDistantSimulationState(state);
  const startedAt = now();
  // A saved aggregate resumes from the current session, not from wall-clock
  // time spent with the game closed. Offline progression needs its own policy.
  Object.values(simulation.hubs).filter((record) => record.mode === "aggregate")
    .forEach((record) => { record.lastAdvancedAt = startedAt; });

  function observe() {
    const at = now();
    setSimulationFocus(state, getFocusPoints(), at);
    const samples = getEconomySamples(state, { windowMs: Infinity, now: at });
    listHubActors(state, { at }).forEach((hub) => {
      const record = simulation.hubs[hub.id] ??= {
        institutionId: hub.id, siteId: hub.siteId, mode: "detailed", detail: DETAIL.NEAR,
        farSince: null, lastTransitionAt: at, flow: null, blockers: [], transitionCount: 0,
      };
      const detail = resolveDetailLevel(state, hub.id);
      record.detail = detail;
      record.lastObservedAt = at;

      if (record.mode === "aggregate") {
        if (detail !== DETAIL.FAR) restoreHub(record, at);
        else advanceHub(record, at);
        return;
      }

      if (detail !== DETAIL.FAR) {
        record.farSince = null;
        record.blockers = [];
        return;
      }
      record.farSince ??= at;
      const eligibility = explainAggregationEligibility(state, hub.id);
      record.blockers = eligibility.blockers;
      if (!eligibility.eligible || at - record.farSince < policy.aggregateAfterMs) return;
      const flow = createRegionFlow(state, hub.id, { samples, at });
      if (!flow.supply) {
        record.blockers = ["supply-rate-unknown"];
        return;
      }
      enterAggregate(record, flow, at);
    });
    return simulation;
  }

  function enterAggregate(record, flow, at) {
    record.mode = "aggregate";
    record.flow = flow;
    record.aggregatedAt = at;
    record.lastAdvancedAt = at;
    record.lastTransitionAt = at;
    record.blockers = [];
    record.transitionCount += 1;
    noteTransition(record, "aggregated", at, { observedSeconds: flow.observedSeconds });
  }

  function advanceHub(record, at) {
    const seconds = Math.max(0, (at - (record.lastAdvancedAt ?? record.flow?.at ?? at)) / 1000);
    if (!(seconds > 0)) return;
    record.flow = advanceRegionFlow(record.flow, seconds);
    record.lastAdvancedAt = at;
    applyFlowToLiveState(state, record.flow, at);
  }

  function restoreHub(record, at) {
    advanceHub(record, at);
    applyFlowToLiveState(state, record.flow, at);
    resetDetailedCadences(state, record.institutionId, at);
    record.mode = "detailed";
    record.restoredAt = at;
    record.lastTransitionAt = at;
    record.farSince = null;
    noteTransition(record, "restored", at, { aggregateSeconds: Math.max(0, (at - record.aggregatedAt) / 1000) });
  }

  function noteTransition(record, type, at, detail) {
    simulation.counters.transition += 1;
    simulation.transitions.push({ id: `distant-transition:${simulation.counters.transition}`, type, institutionId: record.institutionId, at, detail });
    if (simulation.transitions.length > 100) simulation.transitions.splice(0, simulation.transitions.length - 100);
    state.ledger?.recordEvent?.(`simulation.${type}`, { institutionId: record.institutionId, siteId: record.siteId, ...detail }, { visible: false });
  }

  return { observe, update: observe, getState: () => simulation };
}

export function applyFlowToLiveState(state, flow, at = Date.now()) {
  const institution = state.logistics?.institutions?.[flow?.institutionId];
  if (!institution || !flow) return null;
  institution.accounts.operating.balance = flow.cash;
  applyFamilyStock(institution, flow.stock);
  const trade = institution.settlementTrade ??= { unitsSold: 0, revenue: 0, costOfGoodsSold: 0, margin: 0, productionSpend: 0 };
  const revenueDelta = Math.max(0, (flow.revenueCumulative ?? 0) - (flow.appliedRevenueCumulative ?? 0));
  const burnDelta = Math.max(0, (flow.burnedCumulative ?? 0) - (flow.appliedBurnedCumulative ?? 0));
  trade.revenue += revenueDelta;
  trade.productionSpend += burnDelta;
  trade.margin = trade.revenue - (trade.costOfGoodsSold ?? 0);
  flow.appliedRevenueCumulative = flow.revenueCumulative ?? 0;
  flow.appliedBurnedCumulative = flow.burnedCumulative ?? 0;
  Object.values(state.population?.populations ?? {})
    .filter((population) => population.hubInstitutionId === flow.institutionId)
    .forEach((population) => {
      const aggregate = flow.populations?.[population.id];
      if (!aggregate) return;
      population.householdCash = aggregate.cash;
      population.totalIncome = aggregate.totalIncome;
      population.totalSpent = aggregate.totalSpent;
      population.lastIncomeAt = at;
    });
  return institution;
}

function applyFamilyStock(institution, stock) {
  Object.entries(stock ?? {}).forEach(([family, units]) => {
    const resources = new Set([
      ...Object.keys(institution.inventories ?? {}).filter((resourceId) => getResourceFamily(resourceId) === family),
      ...(institution.renewableResources ?? []).filter((resourceId) => getResourceFamily(resourceId) === family),
    ]);
    const preferred = [...resources][0] ?? FAMILY_RESOURCE[family];
    if (!preferred) return;
    institution.inventories ??= {};
    resources.forEach((resourceId) => { institution.inventories[resourceId] = 0; });
    institution.inventories[preferred] = Math.max(0, units ?? 0) / getResourceEffectiveYield(preferred);
  });
}

function resetDetailedCadences(state, hubId, at) {
  Object.values(state.population?.populations ?? {}).filter((population) => population.hubInstitutionId === hubId)
    .forEach((population) => {
      population.lastIncomeAt = at;
      Object.values(population.needs ?? {}).forEach((need) => { need.lastDemandAt = at; });
    });
}
