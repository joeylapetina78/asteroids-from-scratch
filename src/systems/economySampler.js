// Economy sampler: the only thing in this codebase that remembers a NUMBER
// over time rather than an event.
//
// Everything the economy knows about itself is either an append-only event or a
// current-value projection. Both answer "what is true now"; neither answers
// "which way is this going". The diagnostics layer deliberately refuses to scan
// the ledger to answer present-tense questions, and reconstructing a price
// series from `institution.offerRepriced` events after the fact would be
// exactly that scan, run over a stream that rotates at 6000 entries.
//
// So this takes periodic snapshots instead. It is read-only over live state,
// it holds a bounded ring of samples, and it is deliberately NOT saved: a
// history is a diagnostic of one session, and persisting it would put an
// unbounded array inside a localStorage save that is already an allowlist.
//
// Two rules keep the charts honest:
//
//   1. **Stocks are read, flows are derived.** Cash, inventory and open orders
//      are levels and are sampled directly. Income, spend and production burn
//      are cumulative counters the domain systems already maintain, so a rate
//      is a difference between two samples — never a guess.
//   2. **Nothing is invented.** If a number is not already tracked by a domain
//      system, it does not appear here. Where a total cannot be reconciled the
//      residual is reported as a residual rather than smoothed away.

import { getResourceFamily } from "./resourceDefinitions.js?v=fresh-20260802-2208-f8594ea";
import { TRADED_FAMILIES, getInventoryPosition } from "./hubInventory.js?v=fresh-20260802-2208-f8594ea";
import { STANDING_MINING_ORDERS } from "./miningOperation.js?v=fresh-20260802-2208-f8594ea";
import { getSupplierAskPrice, listSettlementIds } from "./hubProcurement.js?v=fresh-20260802-2208-f8594ea";
import { getActorFinances, getArchetypeId } from "./actorConfig.js?v=fresh-20260802-2208-f8594ea";
import { POPULATION_NEEDS } from "./populationDemand.js?v=fresh-20260802-2208-f8594ea";

// 5 s is fast enough to see a repricing (throttled to 60 s) as a step rather
// than a jump, and slow enough that two hours of history is a few thousand
// small objects.
export const SAMPLE_INTERVAL_MS = 5000;
export const MAX_SAMPLES = 1440;

export const ECONOMY_WINDOWS = Object.freeze([
  { id: "5m", label: "5 min", ms: 5 * 60 * 1000 },
  { id: "15m", label: "15 min", ms: 15 * 60 * 1000 },
  { id: "1h", label: "1 hour", ms: 60 * 60 * 1000 },
  { id: "all", label: "session", ms: Infinity },
]);

export function createInitialEconomyHistory() {
  return { samples: [], startedAt: null, lastSampleAt: 0, dropped: 0 };
}

export function ensureEconomyHistory(state) {
  state.economyHistory ??= createInitialEconomyHistory();
  state.economyHistory.samples ??= [];
  return state.economyHistory;
}

// ── Who holds money ─────────────────────────────────────────────────────────

// Every actor in the world that keeps a treasury, wherever its operation stores
// it. Deliberately mirrors the roots `findActorRecord` searches, because an
// operation with its own institution is a balance sheet no matter which state
// key it happens to live under.
//
// The first version of this read `state.logistics.institutions` plus a special
// case for SPRC, which is how the money side of this codebase LOOKS from the
// outside. It left five treasuries invisible — two mining contractors, the
// insurer, the recovery service and the farm — so every payment into one of
// them read as credits vanishing from the world. The money reconciliation
// caught it within three minutes of the tab existing, which is the whole
// argument for reporting a residual instead of smoothing it away.
export function listAccountHolders(state) {
  const holders = new Map();
  const add = (record, inventories = null) => {
    if (!record?.id || holders.has(record.id)) return;
    // No operating account means a ship or a person, not a balance sheet.
    // Counting those would double-count the controller's money.
    const finances = getActorFinances(state, record.id);
    if (!finances) return;
    holders.set(record.id, { record, finances, inventories: inventories ?? record.inventories ?? {} });
  };

  Object.values(state.logistics?.institutions ?? {}).forEach((record) => add(record));
  Object.values(state.miningOperations ?? (state.miningOperation ? { legacy: state.miningOperation } : {}))
    .forEach((operation) => add(operation?.institution));
  // SPRC keeps its account and its shelf beside the institution rather than on
  // it, so its stock has to be handed in explicitly.
  add(state.sprc?.institution, state.sprc?.inventories);
  add(state.towing?.institution);
  add(state.fleetInsurance?.institution);
  add(state.farm?.institution);

  return [...holders.values()];
}

// ── Snapshot ────────────────────────────────────────────────────────────────

// One complete reading of the economy. Pure: it mutates nothing, so it is safe
// to call from a test, a console, or a render pass.
export function readEconomySnapshot(state, { now = Date.now() } = {}) {
  const settlementIds = new Set(listSettlementIds(state));
  const populations = Object.values(state.population?.populations ?? {});

  const actors = {};
  let institutionCash = 0;
  let hubMaterialUnits = 0;
  let finishedGoodsUnits = 0;
  let productionSpendCumulative = 0;
  let capitalSpendCumulative = 0;
  let revenueCumulative = 0;
  let cogsCumulative = 0;
  let unitsSoldCumulative = 0;

  listAccountHolders(state).forEach(({ record: institution, finances, inventories }) => {
    const byFamily = Object.fromEntries(TRADED_FAMILIES.map((family) => [family, 0]));
    const byResource = {};
    let inventoryUnits = 0;
    Object.entries(inventories).forEach(([resourceId, units]) => {
      if (!(units > 0)) return;
      inventoryUnits += units;
      byResource[resourceId] = units;
      const family = getResourceFamily(resourceId);
      if (byFamily[family] !== undefined) byFamily[family] += units;
    });

    const finished = Object.values(institution.finishedGoods ?? {}).reduce((sum, units) => sum + units, 0);
    const trade = institution.settlementTrade ?? null;
    const isSettlement = settlementIds.has(institution.id);

    // Coverage is the number the hub itself decides on: stock against the
    // target its population's consumption implies. Below 1 it is running down.
    const coverage = isSettlement
      ? Object.fromEntries(TRADED_FAMILIES.map((family) => {
        const position = getInventoryPosition(state, institution.id, family);
        return [family, position.target > 0 ? (position.onHand + position.incoming) / position.target : null];
      }))
      : null;

    actors[institution.id] = {
      id: institution.id,
      name: institution.name ?? institution.id,
      archetypeId: getArchetypeId(state, institution.id) ?? null,
      isSettlement,
      cash: round(finances.balance),
      committed: round(finances.committed),
      available: round(finances.available),
      inventoryUnits,
      byFamily,
      byResource,
      finishedGoods: finished,
      coverage,
      wear: Number.isFinite(institution.wear) ? round2(institution.wear) : null,
      revenue: round(trade?.revenue ?? 0),
      costOfGoodsSold: round(trade?.costOfGoodsSold ?? 0),
      margin: round(trade?.margin ?? 0),
      unitsSold: trade?.unitsSold ?? 0,
      productionSpend: round(trade?.productionSpend ?? 0),
      capitalSpend: round(institution.capitalSpend ?? 0),
    };

    institutionCash += finances.balance;
    hubMaterialUnits += inventoryUnits;
    finishedGoodsUnits += finished;
    productionSpendCumulative += trade?.productionSpend ?? 0;
    capitalSpendCumulative += institution.capitalSpend ?? 0;
    revenueCumulative += trade?.revenue ?? 0;
    cogsCumulative += trade?.costOfGoodsSold ?? 0;
    unitsSoldCumulative += trade?.unitsSold ?? 0;
  });

  // ── Populations: the demand side, and the only place credits are created ──
  const populationRecords = {};
  let householdCash = 0;
  let incomeCumulative = 0;
  let discardedCumulative = 0;
  let spentCumulative = 0;
  let backlogTotal = 0;

  populations.forEach((record) => {
    const needs = Object.values(record.needs ?? {});
    const backlog = needs.reduce((sum, need) => sum + (need.backlog ?? 0), 0);
    const consumed = needs.reduce((sum, need) => sum + (need.consumed ?? 0), 0);
    // How long the oldest outstanding need has gone unmet: the clearest single
    // signal that a settlement is being starved rather than merely served late.
    const unmetSince = needs.map((need) => need.unmetSince).filter(Boolean);
    populationRecords[record.id] = {
      id: record.id,
      name: record.name,
      hubInstitutionId: record.hubInstitutionId,
      size: record.size ?? null,
      cash: round(record.householdCash ?? 0),
      cashCap: record.householdCashCap ?? null,
      atCap: record.saturated === true,
      totalIncome: round(record.totalIncome ?? 0),
      totalDiscarded: round(record.totalDiscarded ?? 0),
      totalSpent: round(record.totalSpent ?? 0),
      backlog,
      consumed,
      unmetForMs: unmetSince.length > 0 ? Math.max(0, now - Math.min(...unmetSince)) : 0,
      byNeed: Object.fromEntries(needs.map((need) => [need.needId, {
        backlog: need.backlog ?? 0,
        purchased: need.purchased ?? 0,
        spent: round(need.spent ?? 0),
      }])),
    };
    householdCash += record.householdCash ?? 0;
    incomeCumulative += record.totalIncome ?? 0;
    discardedCumulative += record.totalDiscarded ?? 0;
    spentCumulative += record.totalSpent ?? 0;
    backlogTotal += backlog;
  });

  const playerCash = state.accounts?.records?.[state.accounts?.currentAccountId]?.balance ?? state.credits ?? 0;

  // ── Prices ───────────────────────────────────────────────────────────────
  const prices = {
    ask: {},        // what a supplier is currently asking, per hub × material
    order: {},      // what open purchase orders are actually priced at
    freight: {},    // posted freight rates
    retail: {},     // what a population pays for a finished good
  };

  STANDING_MINING_ORDERS.forEach((definition) => {
    const supplierId = definition.buyerInstitutionId;
    const supplier = actors[supplierId];
    if (!supplier) return;
    const ask = getSupplierAskPrice(state, supplierId, definition.resourceId);
    prices.ask[`${supplierId}|${definition.resourceId}`] = {
      key: `${supplierId}|${definition.resourceId}`,
      sellerId: supplierId,
      sellerName: supplier.name,
      resourceId: definition.resourceId,
      value: round(ask.ask),
      floor: round(ask.marginalCost),
      ceiling: round(ask.firmCost),
      concession: ask.concession,
    };
  });

  const openOrders = Object.values(state.hubProcurement?.orders ?? {});
  const orderPriceAccumulator = {};
  const orderCounts = { offered: 0, accepted: 0, ready: 0, shipped: 0, delivered: 0, withheld: 0, declined: 0 };
  openOrders.forEach((order) => {
    if (orderCounts[order.status] !== undefined) orderCounts[order.status] += 1;
    if (!["offered", "accepted", "ready", "shipped"].includes(order.status)) return;
    const bucket = orderPriceAccumulator[order.resourceId] ??= { units: 0, value: 0, orders: 0 };
    bucket.units += order.units ?? 0;
    bucket.value += (order.pricePerUnit ?? 0) * (order.units ?? 0);
    bucket.orders += 1;
  });
  Object.entries(orderPriceAccumulator).forEach(([resourceId, bucket]) => {
    // Unit-weighted, so one six-unit order does not read the same as one
    // two-unit order at a wild price.
    prices.order[resourceId] = {
      key: resourceId,
      resourceId,
      value: bucket.units > 0 ? round(bucket.value / bucket.units) : null,
      units: bucket.units,
      orders: bucket.orders,
    };
  });

  Object.entries(state.logistics?.postedFreightRates ?? {}).forEach(([templateId, rate]) => {
    prices.freight[templateId] = { key: templateId, templateId, value: round(rate) };
  });

  Object.values(POPULATION_NEEDS).forEach((need) => {
    prices.retail[need.id] = { key: need.id, label: need.label, value: need.price };
  });

  // ── Movement and friction ────────────────────────────────────────────────
  const shipments = Object.values(state.logistics?.shipments ?? {});
  const inFlight = shipments
    .filter((shipment) => ["assigned", "loaded"].includes(shipment.status))
    .reduce((sum, shipment) => sum + (shipment.quantity ?? 0), 0);

  const miningOperations = Object.values(state.miningOperations ?? (state.miningOperation ? { legacy: state.miningOperation } : {}));
  const allocations = miningOperations.flatMap((operation) => Object.values(operation?.allocations ?? {}));
  const activeAllocations = allocations.filter((allocation) => allocation.status === "active");
  const unitsUnderExtraction = activeAllocations.reduce((sum, allocation) => sum + (allocation.amount ?? 0), 0);

  const diagnostics = Object.values(state.diagnostics?.actors ?? {});
  const blockedActors = diagnostics.filter((record) => record.blocker && record.state !== "retired").length;

  const money = {
    populations: round(householdCash),
    institutions: round(institutionCash),
    player: round(playerCash),
    total: round(householdCash + institutionCash + playerCash),
    incomeCumulative: round(incomeCumulative),
    discardedCumulative: round(discardedCumulative),
    spentCumulative: round(spentCumulative),
    productionSpendCumulative: round(productionSpendCumulative),
    capitalSpendCumulative: round(capitalSpendCumulative),
  };

  return {
    t: now,
    money,
    material: {
      onShelf: hubMaterialUnits,
      finishedGoods: finishedGoodsUnits,
      inFlight,
      underExtraction: unitsUnderExtraction,
      total: hubMaterialUnits + finishedGoodsUnits + inFlight,
    },
    trade: {
      revenueCumulative: round(revenueCumulative),
      cogsCumulative: round(cogsCumulative),
      marginCumulative: round(revenueCumulative - cogsCumulative),
      unitsSoldCumulative,
    },
    actors,
    populations: populationRecords,
    prices,
    orders: orderCounts,
    health: {
      blockedActors,
      backlog: backlogTotal,
      activeShipments: shipments.filter((shipment) => ["assigned", "loaded"].includes(shipment.status)).length,
      activeAllocations: activeAllocations.length,
    },
  };
}

// ── Recording ───────────────────────────────────────────────────────────────

// Append a sample if one is due. Returns the sample when it took one, else null,
// so a caller can cheaply drive this from an existing interval.
export function recordEconomySample(state, { now = Date.now(), intervalMs = SAMPLE_INTERVAL_MS, force = false } = {}) {
  const history = ensureEconomyHistory(state);
  if (!force && history.lastSampleAt && now - history.lastSampleAt < intervalMs) return null;

  const sample = readEconomySnapshot(state, { now });
  history.samples.push(sample);
  history.lastSampleAt = now;
  history.startedAt ??= now;
  while (history.samples.length > MAX_SAMPLES) {
    history.samples.shift();
    history.dropped += 1;
  }
  return sample;
}

export function getEconomySamples(state, { windowMs = Infinity, now = Date.now() } = {}) {
  const samples = ensureEconomyHistory(state).samples;
  if (!Number.isFinite(windowMs)) return samples;
  const cutoff = now - windowMs;
  return samples.filter((sample) => sample.t >= cutoff);
}

// ── Series extraction ───────────────────────────────────────────────────────

// A level, read straight off each sample. `accessor` returns null when the
// series has no value at that moment; nulls become gaps rather than zeroes, so
// a hub that did not exist yet does not appear to have been broke.
export function toSeries(samples, accessor) {
  return samples.map((sample) => ({ t: sample.t, v: normalizeValue(accessor(sample)) }));
}

// A flow, derived from a cumulative counter. The value at sample n is the
// increase since sample n-1, scaled to `perMs` (a minute by default). The first
// sample has no predecessor and is therefore a gap, not a zero — reporting zero
// there draws a fake trough at the left edge of every rate chart.
export function toRateSeries(samples, accessor, { perMs = 60_000 } = {}) {
  return samples.map((sample, index) => {
    if (index === 0) return { t: sample.t, v: null };
    const previous = samples[index - 1];
    const elapsed = sample.t - previous.t;
    const before = normalizeValue(accessor(previous));
    const after = normalizeValue(accessor(sample));
    if (elapsed <= 0 || before === null || after === null) return { t: sample.t, v: null };
    return { t: sample.t, v: ((after - before) / elapsed) * perMs };
  });
}

// Every key that appeared in a keyed map at any point in the window, so a
// series that only exists for part of the window still gets a line.
export function collectSeriesKeys(samples, accessor) {
  const keys = new Map();
  samples.forEach((sample) => {
    Object.entries(accessor(sample) ?? {}).forEach(([key, entry]) => {
      if (!keys.has(key)) keys.set(key, entry);
    });
  });
  return keys;
}

// The last sample in which a series had a value — what the legend should show
// as its current reading.
export function latestValue(points) {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    if (points[index].v !== null) return points[index].v;
  }
  return null;
}

// Change across the window, for the "which way is this going" badge. Uses the
// first and last non-null readings, so a gap at either end does not read as a
// collapse.
export function seriesChange(points) {
  const values = points.filter((point) => point.v !== null);
  if (values.length < 2) return null;
  const first = values[0].v;
  const last = values[values.length - 1].v;
  return { first, last, delta: last - first, ratio: first === 0 ? null : last / first };
}

// ── Reconciliation ──────────────────────────────────────────────────────────

// Where the money in the world came from and went, across a window.
//
// Credits are created in exactly one place (population background income) and
// destroyed in exactly one place this layer knows of (the conversion cost a hub
// burns turning material into a finished good). Everything else is a transfer.
// So the change in total money should equal created minus burned — and the
// `residual` is the honest report of how much it does not. A non-zero residual
// is a real finding about the simulation, not a rounding artefact to hide.
export function reconcileMoney(samples) {
  if (samples.length < 2) return null;
  const first = samples[0];
  const last = samples[samples.length - 1];
  const created = last.money.incomeCumulative - first.money.incomeCumulative;
  const productionBurned = (last.money.productionSpendCumulative ?? 0) - (first.money.productionSpendCumulative ?? 0);
  const capitalBurned = (last.money.capitalSpendCumulative ?? 0) - (first.money.capitalSpendCumulative ?? 0);
  const burned = productionBurned + capitalBurned;
  const observed = last.money.total - first.money.total;
  return {
    fromMs: first.t,
    toMs: last.t,
    created: round(created),
    burned: round(burned),
    productionBurned: round(productionBurned),
    capitalBurned: round(capitalBurned),
    notCreatedAtCap: round(last.money.discardedCumulative - first.money.discardedCumulative),
    expected: round(created - burned),
    observed: round(observed),
    residual: round(observed - (created - burned)),
    finalConsumption: round(last.money.spentCumulative - first.money.spentCumulative),
  };
}

function normalizeValue(value) {
  return Number.isFinite(value) ? value : null;
}

function round(value) {
  return Number.isFinite(value) ? Math.round(value) : 0;
}

function round2(value) {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}
