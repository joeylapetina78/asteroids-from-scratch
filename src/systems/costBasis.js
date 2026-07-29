// CostBasis projection.
//
// A compact, per-institution record of what materials ACTUALLY cost to acquire,
// updated from transaction events rather than recomputed by scanning the
// ledger. This is what makes seller pricing real: a service is quoted from the
// live cost of the inputs it consumes, so a price shock upstream propagates
// downstream on its own instead of being hand-set at every link.
//
// Two figures are kept per item:
//   averageUnitCost — weighted average across all acquisitions (the book cost)
//   lastUnitCost    — the most recent price paid (the replacement signal)
//
// Produced goods derive their basis from the inputs consumed to make them
// (see `recordProduction`), so cost flows raw material → produced part →
// service price.

export function ensureCostBasis(state) {
  state.costBasis ??= { institutions: {} };
  state.costBasis.institutions ??= {};
  return state.costBasis;
}

function ensureInstitutionBasis(state, institutionId) {
  const projection = ensureCostBasis(state);
  projection.institutions[institutionId] ??= { institutionId, items: {} };
  projection.institutions[institutionId].items ??= {};
  return projection.institutions[institutionId];
}

function ensureItemBasis(state, institutionId, itemId) {
  const institution = ensureInstitutionBasis(state, institutionId);
  institution.items[itemId] ??= {
    itemId,
    averageUnitCost: 0,
    lastUnitCost: 0,
    unitsAcquired: 0,
    totalSpent: 0,
    acquisitionCount: 0,
    lastAcquiredAt: null,
    lastSource: null,
  };
  return institution.items[itemId];
}

// Record a real purchase. `units` and `totalCost` must be what actually
// changed hands — this projection is only meaningful if it stays truthful.
export function recordAcquisition(state, { institutionId, itemId, units, totalCost, source = "procurement", at = Date.now() }) {
  if (!institutionId || !itemId || !(units > 0)) return null;
  const basis = ensureItemBasis(state, institutionId, itemId);
  const unitCost = totalCost / units;

  basis.unitsAcquired += units;
  basis.totalSpent += totalCost;
  basis.averageUnitCost = basis.unitsAcquired > 0 ? basis.totalSpent / basis.unitsAcquired : unitCost;
  basis.lastUnitCost = unitCost;
  basis.acquisitionCount += 1;
  basis.lastAcquiredAt = at;
  basis.lastSource = source;
  return basis;
}

// Derive a produced item's cost from the inputs consumed to make it, plus any
// conversion overhead. This is the step that carries raw-material prices into
// finished goods (feedstock → hull plate → repair price).
export function recordProduction(state, { institutionId, outputItemId, outputUnits, inputs = {}, conversionCost = 0, at = Date.now() }) {
  if (!institutionId || !outputItemId || !(outputUnits > 0)) return null;
  const inputCost = Object.entries(inputs).reduce(
    (sum, [inputItemId, amount]) => sum + getUnitCost(state, institutionId, inputItemId) * amount,
    0,
  );
  return recordAcquisition(state, {
    institutionId,
    itemId: outputItemId,
    units: outputUnits,
    totalCost: inputCost + conversionCost,
    source: "production",
    at,
  });
}

// Record what a SERVICE actually cost this institution (a repair bill it paid).
// Same projection idea as materials: suppliers price their own work from what
// their upkeep really costs, so a repair shop's price increase propagates into
// its customers' asks instead of being absorbed silently.
export function recordServiceCost(state, { institutionId, serviceType = "maintenance", price, at = Date.now() }) {
  if (!institutionId || !(price > 0)) return null;
  const projection = ensureCostBasis(state);
  projection.services ??= {};
  projection.services[institutionId] ??= {};
  const record = projection.services[institutionId][serviceType] ??= {
    serviceType, averagePrice: 0, lastPrice: 0, count: 0, totalSpent: 0, lastPaidAt: null,
  };
  record.count += 1;
  record.totalSpent += price;
  record.averagePrice = record.totalSpent / record.count;
  record.lastPrice = price;
  record.lastPaidAt = at;
  return record;
}

// Live cost of a service to this institution; `fallback` until one is paid.
export function getServiceCost(state, institutionId, serviceType = "maintenance", fallback = 0) {
  const record = state.costBasis?.services?.[institutionId]?.[serviceType];
  if (!record || record.count <= 0) return fallback;
  // Weight the most recent bill: prices are moving, and the next one will look
  // more like the last one than like the long-run average.
  return record.lastPrice * 0.6 + record.averagePrice * 0.4;
}

export function getCostBasis(state, institutionId, itemId) {
  return state.costBasis?.institutions?.[institutionId]?.items?.[itemId] ?? null;
}

// Best available unit cost: book average, else last paid, else the caller's
// fallback (an authored reference) when nothing has been bought yet.
export function getUnitCost(state, institutionId, itemId, fallback = 0) {
  const basis = getCostBasis(state, institutionId, itemId);
  if (!basis || basis.unitsAcquired <= 0) return fallback;
  return basis.averageUnitCost || basis.lastUnitCost || fallback;
}

// What it would cost to buy this again right now — the replacement signal,
// which prices a part-swap and caps what a repair may charge.
export function getReplacementUnitCost(state, institutionId, itemId, fallback = 0) {
  const basis = getCostBasis(state, institutionId, itemId);
  if (!basis || basis.unitsAcquired <= 0) return fallback;
  return basis.lastUnitCost || basis.averageUnitCost || fallback;
}

// Total live cost of a recipe's material requirements.
export function getBundleCost(state, institutionId, requirements = {}, fallbacks = {}) {
  return Object.entries(requirements).reduce(
    (sum, [itemId, amount]) => sum + getUnitCost(state, institutionId, itemId, fallbacks[itemId] ?? 0) * amount,
    0,
  );
}
