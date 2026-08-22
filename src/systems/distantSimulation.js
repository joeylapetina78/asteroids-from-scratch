import { DETAIL, resolveDetailLevel, setSimulationFocus } from "./detailLevel.js?v=fresh-20260822-1334-internal";
import { getEconomySamples } from "./economySampler.js?v=fresh-20260822-1334-internal";
import { advanceRegionFlow, createRegionFlow } from "./regionFlow.js?v=fresh-20260822-1334-internal";
import { listHubActors } from "./hubActors.js?v=fresh-20260822-1334-internal";
import { getResourceEffectiveYield, getResourceFamily } from "./resourceDefinitions.js?v=fresh-20260822-1334-internal";
import { DISTANT_SIMULATION_VERSION, ensureDistantSimulationState, getHubSimulationRecord, isHubAggregated } from "./simulationMode.js?v=fresh-20260822-1334-internal";
import { clearRegionalTrade } from "./regionalClearing.js?v=fresh-20260822-1334-internal";

export { DISTANT_SIMULATION_VERSION, ensureDistantSimulationState, getHubSimulationRecord, isHubAggregated };
export const DISTANT_DEFAULTS = Object.freeze({ aggregateAfterMs: 30_000 });
const OPEN_PROTECTION_STATUSES = new Set(["offered", "contracted", "active"]);
const FAMILY_RESOURCE = Object.freeze({ structural: "iron-nickel", industrial: "silicate", volatile: "water-ice" });

// What must still be quiet before a region may be handed to its flow.
//
// This used to include everything anyone was doing WITH the hub — open orders,
// shipments in flight, extraction working for it. Those were listed because the
// aggregate wrote its modelled stock and cash straight over the live records,
// so any delivery or payment landing meanwhile was destroyed. A 31-minute live
// run then showed the cost of that caution: not one far hub became eligible in
// a single sample, because a settlement with a live economy is never quiet.
//
// The aggregate now reads before it writes and writes only its own delta, and
// nets real arrivals against modelled supply. Work done TO the hub by somebody
// else is therefore safe to leave running, and is no longer a blocker.
//
// What remains blocking is the hub's OWN internal work — production runs,
// factory and construction work, protection it commissioned. Those the flow
// also models, so letting both run would count the same activity twice. They
// need their own conserved checkpoint before they can be released.
export function explainAggregationEligibility(state, hubId) {
  const hub = state.logistics?.institutions?.[hubId];
  if (!hub?.siteId) return { eligible: false, blockers: ["hub-missing"] };
  const blockers = [];
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
        farSince: null, blockedSince: null, lastTransitionAt: at, flow: null, blockers: [], transitionCount: 0,
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
        record.blockedSince = null;
        return;
      }
      record.farSince ??= at;
      const eligibility = explainAggregationEligibility(state, hub.id);
      record.blockers = eligibility.blockers;
      // How long this hub has been CONTINUOUSLY refused, not how long it has
      // been far. A hub whose work churns clears this every time it goes quiet
      // for a tick; a hub whose orders never move keeps counting, which is the
      // difference between "busy" and "stuck" and is not otherwise visible.
      record.blockedSince = eligibility.eligible ? null : (record.blockedSince ?? at);
      if (!eligibility.eligible || at - record.farSince < policy.aggregateAfterMs) return;
      const flow = createRegionFlow(state, hub.id, { samples, at });
      if (!flow.supply) {
        record.blockers = ["supply-rate-unknown"];
        record.blockedSince ??= at;
        return;
      }
      enterAggregate(record, flow, at);
    });
    // Distant regions still trade with each other. Run after every hub has
    // advanced, so shortfalls and surpluses are all from the same instant.
    settleRegionalTrade(at);
    return simulation;
  }

  function settleRegionalTrade(at) {
    const settlement = clearRegionalTrade(state, simulation.hubs, { at });
    if (settlement.trades.length === 0) return settlement;
    simulation.lastClearing = { at, ...settlement };
    settlement.trades.forEach((trade) => {
      state.ledger?.recordEvent?.("region.traded", trade, { visible: false });
    });
    return settlement;
  }

  function enterAggregate(record, flow, at) {
    record.mode = "aggregate";
    record.flow = flow;
    record.appliedStock = { ...flow.stock };
    record.aggregatedAt = at;
    record.lastAdvancedAt = at;
    record.lastTransitionAt = at;
    record.blockers = [];
    record.blockedSince = null;
    record.transitionCount += 1;
    noteTransition(record, "aggregated", at, { observedSeconds: flow.observedSeconds });
  }

  // Read the world, advance the model, write back only what the model changed.
  //
  // The aggregate does not own this hub's books; it is one more participant in
  // them. A hauler that was already carrying its cargo still arrives, a buyer
  // still settles an invoice, a supplier still ships from its warehouse — and
  // those counterparties are running in full detail, possibly right next to the
  // player. Writing the model's absolute stock and cash over the top of live
  // records silently destroyed every one of those, which is why aggregation had
  // to wait for a hub with nothing happening to it at all.
  //
  // Syncing first absorbs whatever the world did; applying a delta afterwards
  // states only what the aggregate itself did. Both halves of every external
  // transaction stay intact because the aggregate never touches them.
  function advanceHub(record, at) {
    const seconds = Math.max(0, (at - (record.lastAdvancedAt ?? record.flow?.at ?? at)) / 1000);
    if (!(seconds > 0)) return;
    const before = syncFlowFromLiveState(state, record.flow);
    // What the world really delivered since the aggregate last wrote. Measured,
    // not assumed: the difference between what the warehouse holds now and what
    // this aggregate last left in it.
    const externalInflow = measureExternalInflow(record.appliedStock, before.stock);
    const after = advanceRegionFlow(before, seconds, { externalInflow });
    record.flow = after;
    record.lastAdvancedAt = at;
    applyFlowDeltaToLiveState(state, before, after, at);
    record.appliedStock = { ...after.stock };
  }

  function restoreHub(record, at) {
    advanceHub(record, at);
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

// Material this region gained from outside the model since the aggregate last
// wrote its own result. Only gains count: a drawdown is either the model's own
// consumption or an external pickup, and neither is supply.
function measureExternalInflow(appliedStock, liveStock) {
  if (!appliedStock) return null;
  return Object.fromEntries(Object.entries(liveStock ?? {})
    .map(([family, units]) => [family, Math.max(0, (units ?? 0) - (appliedStock[family] ?? 0))]));
}

// Pull live records into the flow, so the model starts each step from what the
// world actually holds rather than from what it last believed.
export function syncFlowFromLiveState(state, flow) {
  const institution = state.logistics?.institutions?.[flow?.institutionId];
  if (!institution || !flow) return flow;
  const stock = Object.fromEntries(Object.keys(flow.stock ?? {}).map((family) => [family, 0]));
  Object.entries(institution.inventories ?? {}).forEach(([resourceId, units]) => {
    const family = getResourceFamily(resourceId);
    if (stock[family] !== undefined && units > 0) stock[family] += units * getResourceEffectiveYield(resourceId);
  });
  const populations = Object.fromEntries(Object.entries(flow.populations ?? {}).map(([id, population]) => {
    const live = state.population?.populations?.[id];
    return [id, live
      ? {
        ...population,
        cash: live.householdCash ?? population.cash,
        totalIncome: live.totalIncome ?? population.totalIncome,
        totalSpent: live.totalSpent ?? population.totalSpent,
        totalDiscarded: live.totalDiscarded ?? population.totalDiscarded ?? 0,
        cashCap: live.householdCashCap ?? population.cashCap ?? null,
      }
      : population];
  }));
  return {
    ...flow,
    stock,
    cash: institution.accounts?.operating?.balance ?? flow.cash,
    populations,
  };
}

// Write back the difference the aggregate itself made, and nothing else.
export function applyFlowDeltaToLiveState(state, before, after, at = Date.now()) {
  const institution = state.logistics?.institutions?.[after?.institutionId];
  if (!institution || !before || !after) return null;

  institution.accounts.operating.balance += (after.cash ?? 0) - (before.cash ?? 0);
  applyFamilyStockDelta(institution, before.stock, after.stock);

  const trade = institution.settlementTrade ??= { unitsSold: 0, revenue: 0, costOfGoodsSold: 0, margin: 0, productionSpend: 0 };
  trade.revenue += Math.max(0, (after.revenueCumulative ?? 0) - (before.revenueCumulative ?? 0));
  trade.productionSpend += Math.max(0, (after.burnedCumulative ?? 0) - (before.burnedCumulative ?? 0));
  trade.margin = trade.revenue - (trade.costOfGoodsSold ?? 0);

  Object.entries(after.populations ?? {}).forEach(([populationId, aggregate]) => {
    const population = state.population?.populations?.[populationId];
    const previous = before.populations?.[populationId];
    if (!population || !previous) return;
    population.householdCash = Math.max(0, (population.householdCash ?? 0) + (aggregate.cash - previous.cash));
    population.totalIncome = (population.totalIncome ?? 0) + (aggregate.totalIncome - previous.totalIncome);
    population.totalSpent = (population.totalSpent ?? 0) + (aggregate.totalSpent - previous.totalSpent);
    // Income the cap refused. Reported the same way the detailed path reports
    // it, so the money reconciler sees one consistent story either side of the
    // aggregation boundary.
    population.totalDiscarded = (population.totalDiscarded ?? 0)
      + ((aggregate.totalDiscarded ?? 0) - (previous.totalDiscarded ?? 0));
    population.lastIncomeAt = at;
  });
  return institution;
}

// Effective units in, physical units out. A positive delta lands on the family's
// preferred resource; a negative one is drawn across whatever the warehouse
// actually holds, so the aggregate can never take stock that is not there.
function applyFamilyStockDelta(institution, beforeStock, afterStock) {
  institution.inventories ??= {};
  Object.entries(afterStock ?? {}).forEach(([family, units]) => {
    const delta = (units ?? 0) - (beforeStock?.[family] ?? 0);
    if (!delta) return;
    const resources = [
      ...Object.keys(institution.inventories).filter((resourceId) => getResourceFamily(resourceId) === family),
      ...(institution.renewableResources ?? []).filter((resourceId) => getResourceFamily(resourceId) === family),
    ].filter((resourceId, index, all) => all.indexOf(resourceId) === index);
    const preferred = resources[0] ?? FAMILY_RESOURCE[family];
    if (!preferred) return;
    if (delta > 0) {
      institution.inventories[preferred] = (institution.inventories[preferred] ?? 0) + delta / getResourceEffectiveYield(preferred);
      return;
    }
    let remaining = -delta;
    resources.forEach((resourceId) => {
      if (remaining <= 0) return;
      const held = institution.inventories[resourceId] ?? 0;
      if (held <= 0) return;
      const yieldRate = getResourceEffectiveYield(resourceId);
      const drawn = Math.min(held * yieldRate, remaining);
      institution.inventories[resourceId] = Math.max(0, held - drawn / yieldRate);
      remaining -= drawn;
    });
  });
}

function resetDetailedCadences(state, hubId, at) {
  Object.values(state.population?.populations ?? {}).filter((population) => population.hubInstitutionId === hubId)
    .forEach((population) => {
      population.lastIncomeAt = at;
      Object.values(population.needs ?? {}).forEach((need) => { need.lastDemandAt = at; });
    });
}
