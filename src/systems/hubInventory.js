// What a hub actually needs to hold, and why.
//
// Standing mining and freight were authored: fixed quantity, fixed price,
// always open, regardless of whether anyone wanted the material. This module
// replaces the "why" behind them. A hub's target stock is derived from what its
// population actually consumes, so an order exists only when there is a real
// gap between what the hub holds and what it needs to keep supplying.
//
// Targets are per resource FAMILY rather than per material, because production
// draws from a family and substitutes freely within it. A hub does not need
// iron-nickel specifically; it needs structural material.

import { getResourceFamily } from "./resourceDefinitions.js?v=fresh-20260802-2159-698bdac";
import { NEED_KIND, POPULATION_NEEDS, POPULATION_PROFILES } from "./populationDemand.js?v=fresh-20260802-2159-698bdac";
import { INSTITUTION_MINING_RIGHTS } from "./authoritySeeds.js?v=fresh-20260802-2159-698bdac";

// How many seconds of consumption a hub tries to keep on the shelf. Higher
// means fatter buffers and less frequent, larger orders.
export const TARGET_COVERAGE_SECONDS = 600;

// The families a hub trades in at all. A flexible need with no family
// restriction is spread across these.
export const TRADED_FAMILIES = Object.freeze(["structural", "industrial", "volatile"]);

// Consumption rate per family, in units per second, for one hub.
//
// A need draws its material from any of its families, so its rate is split
// evenly across them: each family has to be able to carry its share. A need
// with a single family (Life-Support Packs, volatile) carries the whole rate,
// which is why volatile targets come out highest.
export function getFamilyConsumptionRates(hubInstitutionId) {
  const rates = Object.fromEntries(TRADED_FAMILIES.map((family) => [family, 0]));
  const profiles = POPULATION_PROFILES.filter((profile) => profile.hubInstitutionId === hubInstitutionId);

  profiles.forEach((profile) => {
    profile.needIds.forEach((needId) => {
      const need = POPULATION_NEEDS[needId];
      if (!need) return;
      const families = need.families ?? TRADED_FAMILIES;
      const perSecond = (need.materialUnits ?? 0) / Math.max(1, need.demandIntervalSeconds);
      const share = perSecond / families.length;
      families.forEach((family) => {
        if (rates[family] === undefined) return;
        rates[family] += share;
      });
    });
  });
  return rates;
}

export function getFamilyTargets(hubInstitutionId, coverageSeconds = TARGET_COVERAGE_SECONDS) {
  const rates = getFamilyConsumptionRates(hubInstitutionId);
  return Object.fromEntries(Object.entries(rates).map(([family, rate]) => [family, Math.ceil(rate * coverageSeconds)]));
}

// Units of a family currently on the hub's shelf, across every material in it.
export function getFamilyOnHand(hub, family) {
  return Object.entries(hub?.inventories ?? {})
    .filter(([resourceId, units]) => units > 0 && getResourceFamily(resourceId) === family)
    .reduce((sum, [, units]) => sum + units, 0);
}

// Material of this family already promised to the hub: ore a miner is carrying
// against an open allocation, plus freight in flight toward it. Counting this
// is what stops a hub from re-ordering the same shortfall every tick.
export function getFamilyIncoming(state, hubInstitutionId, family) {
  const miningOperations = Object.values(state.miningOperations ?? (state.miningOperation ? { legacy: state.miningOperation } : {}));
  const allocations = miningOperations.flatMap((operation) => Object.values(operation?.allocations ?? {}))
    .filter((allocation) => allocation.status === "active");
  const fromMining = allocations.reduce((sum, allocation) => {
    const order = miningOperations.map((operation) => operation?.postedOrders?.[allocation.orderId]).find(Boolean);
    if (!order || order.buyerInstitutionId !== hubInstitutionId) return sum;
    return getResourceFamily(order.resourceId) === family ? sum + (allocation.amount ?? 0) : sum;
  }, 0);

  const fromFreight = Object.values(state.logistics?.shipments ?? {})
    .filter((shipment) => ["assigned", "loaded"].includes(shipment.status)
      && shipment.destinationInstitutionId === hubInstitutionId
      && getResourceFamily(shipment.commodity) === family)
    .reduce((sum, shipment) => sum + (shipment.quantity ?? 0), 0);

  return fromMining + fromFreight;
}

// Units this hub has agreed to sell to another hub and not yet delivered.
//
// Read straight off state rather than importing the procurement module, which
// depends on this one. An accepted sale raises the supplier's own target, and
// that is precisely what makes it commission more mining: it digs for a sale it
// agreed to, not because an authored order said so.
export function getCommittedSales(state, hubInstitutionId, family) {
  return Object.values(state.hubProcurement?.orders ?? {})
    .filter((order) => order.supplierInstitutionId === hubInstitutionId
      && order.family === family
      && ["accepted", "ready"].includes(order.status))
    .reduce((sum, order) => sum + Math.max(0, (order.units ?? 0) - (order.deliveredUnits ?? 0)), 0);
}

// The full picture for one hub and one family: what it holds, what is coming,
// what it owes, what it wants, and the gap that justifies an order.
export function getInventoryPosition(state, hubInstitutionId, family, coverageSeconds = TARGET_COVERAGE_SECONDS) {
  const hub = state.logistics?.institutions?.[hubInstitutionId] ?? null;
  const ownTarget = getFamilyTargets(hubInstitutionId, coverageSeconds)[family] ?? 0;
  const committedSales = getCommittedSales(state, hubInstitutionId, family);
  const target = ownTarget + committedSales;
  const onHand = getFamilyOnHand(hub, family);
  const incoming = getFamilyIncoming(state, hubInstitutionId, family);
  return { family, target, ownTarget, committedSales, onHand, incoming, gap: Math.max(0, target - onHand - incoming) };
}

// Families this hub may commission extraction for.
export function getMinedFamilies(hubInstitutionId) {
  return INSTITUTION_MINING_RIGHTS
    .filter((right) => right.institutionId === hubInstitutionId)
    .flatMap((right) => right.families);
}

// Families a hub needs but may not mine, so it has to buy them. This is the
// list a procurement order will eventually be built from.
export function getImportFamilies(state, hubInstitutionId, coverageSeconds = TARGET_COVERAGE_SECONDS) {
  const mined = getMinedFamilies(hubInstitutionId);
  return TRADED_FAMILIES
    .filter((family) => !mined.includes(family))
    .map((family) => getInventoryPosition(state, hubInstitutionId, family, coverageSeconds))
    .filter((position) => position.target > 0);
}

// Every family position for a hub, for diagnostics and inspection.
export function getInventoryPositions(state, hubInstitutionId, coverageSeconds = TARGET_COVERAGE_SECONDS) {
  const mined = getMinedFamilies(hubInstitutionId);
  return TRADED_FAMILIES.map((family) => ({
    ...getInventoryPosition(state, hubInstitutionId, family, coverageSeconds),
    canMine: mined.includes(family),
  }));
}
