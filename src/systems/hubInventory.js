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

import { getEffectiveMaterialUnits, getInstitutionalFeedstockTradeValue, getResourceFamily } from "./resourceDefinitions.js?v=fresh-20260910-1849-b6bf5552";
import { recordAcquisition } from "./costBasis.js?v=fresh-20260910-1849-b6bf5552";
import { NEED_KIND, POPULATION_NEEDS, POPULATION_PROFILES, getScaledDemandInterval } from "./populationDemand.js?v=fresh-20260910-1849-b6bf5552";
import { settlementExtractionDefinitions } from "../content/economy/firstReachSettlements.js?v=fresh-20260910-1849-b6bf5552";
import { listGeneratedExtractionDefinitions } from "./settlementSeedPipeline.js?v=fresh-20260910-1849-b6bf5552";
// The store only — deliberately not `miningOperation`, which imports THIS
// module. See `miningOrderBook` for why the derivation lives elsewhere.
import { getMiningOrderBook } from "./miningOrderBook.js?v=fresh-20260910-1849-b6bf5552";

// How many seconds of consumption a hub tries to keep on the shelf. Higher
// means fatter buffers and less frequent, larger orders.
export const TARGET_COVERAGE_SECONDS = 600;

// The families a hub trades in at all. A flexible need with no family
// restriction is spread across these.
export const TRADED_FAMILIES = Object.freeze(["structural", "industrial", "volatile"]);
export const ANOMALY_SHARD_TYPE = "anomaly-shard";
export const STABILIZED_ANOMALY_SAMPLE_TYPE = "stabilized-anomaly-sample";
export const ANOMALY_SHARDS_PER_SAMPLE = 5;
export const ANOMALY_SAMPLE_PRICE = 100;
export const ANOMALY_SITE_SESSION_QUOTA = 25;
const ANOMALY_RESEARCH_SITES = new Set(["yard-exchange", "deep-research"]);

// Consumption rate per family, in units per second, for one hub.
//
// A need draws its material from any of its families, so its rate is split
// evenly across them: each family has to be able to carry its share. A need
// with a single family (Life-Support Packs, volatile) carries the whole rate,
// which is why volatile targets come out highest.
export function getFamilyConsumptionRates(hubInstitutionId, state = null) {
  const rates = Object.fromEntries(TRADED_FAMILIES.map((family) => [family, 0]));
  const profiles = state
    ? Object.values(state.population?.populations ?? {}).filter((profile) => profile.hubInstitutionId === hubInstitutionId)
      .map((profile) => ({ ...profile, needIds: Object.keys(profile.needs ?? {}) }))
    : POPULATION_PROFILES.filter((profile) => profile.hubInstitutionId === hubInstitutionId);

  profiles.forEach((profile) => {
    profile.needIds.forEach((needId) => {
      const need = POPULATION_NEEDS[needId];
      if (!need) return;
      const families = need.families ?? TRADED_FAMILIES;
      // Read through the SAME scaled interval the population actually waits, so
      // the planning rate and the real consumption cannot drift apart. If these
      // two ever disagree one of them has a bug — they are not two estimates.
      const perSecond = (need.materialUnits ?? 0) / Math.max(1, getScaledDemandInterval(need, profile));
      const share = perSecond / families.length;
      families.forEach((family) => {
        if (rates[family] === undefined) return;
        rates[family] += share;
      });
    });
  });
  return rates;
}

export function getFamilyTargets(hubInstitutionId, coverageSeconds = TARGET_COVERAGE_SECONDS, state = null) {
  const rates = getFamilyConsumptionRates(hubInstitutionId, state);
  return Object.fromEntries(Object.entries(rates).map(([family, rate]) => [family, Math.ceil(rate * coverageSeconds)]));
}

// Units of a family currently on the hub's shelf, across every material in it.
export function getFamilyOnHand(hub, family) {
  return Object.entries(hub?.inventories ?? {})
    .filter(([resourceId, units]) => units > 0 && getResourceFamily(resourceId) === family)
    .reduce((sum, [resourceId, units]) => sum + getEffectiveMaterialUnits(resourceId, units), 0);
}

// Material of this family already promised to the hub: ore a miner is carrying
// against an open allocation, plus freight in flight toward it. Counting this
// is what stops a hub from re-ordering the same shortfall every tick.
export function getFamilyIncoming(state, hubInstitutionId, family) {
  const miningOperations = Object.values(state.miningOperations ?? (state.miningOperation ? { legacy: state.miningOperation } : {}));
  const allocations = miningOperations.flatMap((operation) => Object.values(operation?.allocations ?? {}))
    .filter((allocation) => allocation.status === "active");
  const book = getMiningOrderBook(state);
  const fromMining = allocations.reduce((sum, allocation) => {
    // One book for the world. This used to search every operation's private
    // copy for the first one that happened to hold the order.
    const order = book[allocation.orderId];
    if (!order || order.buyerInstitutionId !== hubInstitutionId) return sum;
    return getResourceFamily(order.resourceId) === family
      ? sum + getEffectiveMaterialUnits(order.resourceId, allocation.amount ?? 0)
      : sum;
  }, 0);

  const fromFreight = Object.values(state.logistics?.shipments ?? {})
    .filter((shipment) => ["assigned", "loaded"].includes(shipment.status)
      && shipment.destinationInstitutionId === hubInstitutionId
      && getResourceFamily(shipment.commodity) === family)
    .reduce((sum, shipment) => sum + getEffectiveMaterialUnits(shipment.commodity, shipment.quantity ?? 0), 0);

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
    .reduce((sum, order) => {
      const physicalRemaining = Math.max(0, (order.units ?? 0) - (order.deliveredUnits ?? 0));
      return sum + getEffectiveMaterialUnits(order.resourceId, physicalRemaining);
    }, 0);
}

// Raw feedstock required to honor accepted manufactured-parts orders.
//
// A parts order used to raise the factory's output target but never the hub's
// input target. The works would consume its opening ore, stop, and miners would
// truthfully see no raw-material demand. Translate the remaining production
// commitment into its recipes here so extraction and import procurement can
// see the plant's need through the same inventory position as population use.
export function getIndustrialInputCommitment(state, hubInstitutionId, family) {
  const hub = state.logistics?.institutions?.[hubInstitutionId];
  if (!hub) return 0;
  const factories = Object.values(state.industrial?.factories ?? {})
    .filter((factory) => factory.institutionId === hubInstitutionId);

  return factories.reduce((total, factory) => {
    return total + (factory.recipes ?? []).reduce((recipeTotal, recipe) => {
      const orders = Object.values(state.hubProcurement?.orders ?? {})
        .filter((order) => order.orderKind === "industrial-part"
          && order.supplierInstitutionId === hubInstitutionId
          && order.resourceId === recipe.output
          && ["accepted", "ready"].includes(order.status));
      if (orders.length === 0) return recipeTotal;
      const reserved = orders.reduce((sum, order) => sum + (hub.saleReserve?.[order.id] ?? 0), 0);
      const owed = orders.reduce((sum, order) => sum + Math.max(0, (order.units ?? 0) - (order.deliveredUnits ?? 0)), 0);
      const produced = hub.inventories?.[recipe.output] ?? 0;
      const inProcess = factory.activeRun?.output === recipe.output ? (factory.activeRun.amount ?? 0) : 0;
      const outputNeeded = Math.max(0, owed - reserved - produced - inProcess);
      const runsNeeded = Math.ceil(outputNeeded / Math.max(1, recipe.amount ?? 1));
      const familyInputs = Object.entries(recipe.inputs ?? {})
        .filter(([resourceId]) => getResourceFamily(resourceId) === family)
        .reduce((sum, [resourceId, units]) => sum + getEffectiveMaterialUnits(resourceId, units * runsNeeded), 0);
      return recipeTotal + familyInputs;
    }, 0);
  }, 0);
}

// The full picture for one hub and one family: what it holds, what is coming,
// what it owes, what it wants, and the gap that justifies an order.
export function getInventoryPosition(state, hubInstitutionId, family, coverageSeconds = TARGET_COVERAGE_SECONDS) {
  const hub = state.logistics?.institutions?.[hubInstitutionId] ?? null;
  const ownTarget = getFamilyTargets(hubInstitutionId, coverageSeconds, state)[family] ?? 0;
  const committedSales = getCommittedSales(state, hubInstitutionId, family);
  const industrialInputs = getIndustrialInputCommitment(state, hubInstitutionId, family);
  const target = ownTarget + committedSales + industrialInputs;
  const onHand = getFamilyOnHand(hub, family);
  const incoming = getFamilyIncoming(state, hubInstitutionId, family);
  return { family, target, ownTarget, committedSales, industrialInputs, onHand, incoming, gap: Math.max(0, target - onHand - incoming) };
}

// Families this hub may commission extraction for.
export function getMinedFamilies(hubInstitutionId, state = null) {
  // Authority says what a hub MAY establish; an extraction definition says
  // what it has actually installed. Procurement must read capacity or a broad
  // enabling charter would make the hub behave as though every mine existed.
  const definitions = state
    ? [...settlementExtractionDefinitions(), ...listGeneratedExtractionDefinitions(state)]
    : settlementExtractionDefinitions();
  return Array.from(new Set(definitions
    .filter((order) => order.buyerInstitutionId === hubInstitutionId)
    .flatMap((order) => order.miningFamilies ?? [getResourceFamily(order.resourceId)])));
}

// Families a hub needs but may not mine, so it has to buy them. This is the
// list a procurement order will eventually be built from.
export function getImportFamilies(state, hubInstitutionId, coverageSeconds = TARGET_COVERAGE_SECONDS) {
  const mined = getMinedFamilies(hubInstitutionId, state);
  return TRADED_FAMILIES
    .filter((family) => !mined.includes(family))
    .map((family) => getInventoryPosition(state, hubInstitutionId, family, coverageSeconds))
    .filter((position) => position.target > 0);
}

// Every family position for a hub, for diagnostics and inspection.
export function getInventoryPositions(state, hubInstitutionId, coverageSeconds = TARGET_COVERAGE_SECONDS) {
  const mined = getMinedFamilies(hubInstitutionId, state);
  return TRADED_FAMILIES.map((family) => ({
    ...getInventoryPosition(state, hubInstitutionId, family, coverageSeconds),
    canMine: mined.includes(family),
  }));
}

// ── Selling raw material into a hub ─────────────────────────────────────────

// The one way loose material becomes hub stock, for anybody holding it.
//
// WHY THIS IS SHARED: this logic already existed, privately, inside the mining
// operation — a miner with cargo left over after a contract sold the remainder
// to the local hub, and the hub paid for it out of its own account and put it
// on its shelf. That is exactly what should happen when the PLAYER sells ore at
// a dock, and it is not what happened: the player's sale credited the pilot from
// nowhere and the material simply vanished. Two paths for one transaction, and
// only one of them obeyed conservation.
//
// So the rule lives here once. A sale is a transfer: the buyer's balance falls
// by what the seller's rises, and the material the buyer paid for lands on its
// shelf. Nothing is created and nothing evaporates.
//
// A HUB CAN RUN OUT OF MONEY, and that is a feature rather than an obstacle.
// It is what makes a settlement's treasury mean something, and what stops any
// holder of ore — player or company — from being an infinite credit faucet.
// Partial fills are honest: it buys what it can afford and says so.

// Some docks are a different legal entity from the settlement that trades there.
const HUB_TRADE_ENTITY = Object.freeze({ "scrap-porch": "scrap-forge" });

export function getHubTradeInstitutionId(siteId) {
  return HUB_TRADE_ENTITY[siteId] ?? siteId;
}

// What a hub pays per unit for raw feedstock. Below the retail worth of the
// material, because a hub is a wholesale buyer and has to make its margin
// somewhere — the same rate its contracted suppliers get.
export function getHubWholesalePrice(resourceId) {
  return Math.max(1, Math.floor(getInstitutionalFeedstockTradeValue(resourceId) * 0.7));
}

// Sell up to `units` of `resourceId` into the hub at `siteId`.
//
// Returns what was ACTUALLY bought — never more than the buyer can pay for —
// along with the reason when that is less than offered, so a caller can tell the
// seller why rather than silently shorting them.
export function sellMaterialToHub(state, {
  siteId,
  resourceId,
  units,
  unitPrice = null,
  source = "wholesale",
  now = Date.now(),
} = {}) {
  const offered = Math.max(0, Math.floor(units ?? 0));
  const buyerId = getHubTradeInstitutionId(siteId);
  const buyer = state.logistics?.institutions?.[buyerId];

  if (!buyer?.accounts?.operating) {
    return { acceptedUnits: 0, payment: 0, unitPrice: 0, buyerId, reason: "no-buyer-here" };
  }
  if (offered <= 0) {
    return { acceptedUnits: 0, payment: 0, unitPrice: 0, buyerId, reason: "nothing-offered" };
  }

  // Raw anomaly shards are not industrial ore and no supply desk has unlimited
  // appetite for them. Authorized research desks stabilize five shards into one
  // sample, pay for the sample rather than every glittering fragment, and close
  // intake after a small session quota. This preserves the discovery without
  // letting an unattended field drain every hub treasury.
  if (resourceId === ANOMALY_SHARD_TYPE) {
    if (!ANOMALY_RESEARCH_SITES.has(siteId)) {
      return { acceptedUnits: 0, payment: 0, unitPrice: 0, buyerId, buyer, reason: "specialist-buyer-required" };
    }
    state.anomalyExchange ??= { acceptedBySite: {} };
    const alreadyAccepted = state.anomalyExchange.acceptedBySite[siteId] ?? 0;
    const remainingQuota = Math.max(0, ANOMALY_SITE_SESSION_QUOTA - alreadyAccepted);
    const affordableSamples = Math.floor(Math.max(0, buyer.accounts.operating.balance ?? 0) / ANOMALY_SAMPLE_PRICE);
    const acceptedUnits = Math.min(offered - (offered % ANOMALY_SHARDS_PER_SAMPLE),
      remainingQuota - (remainingQuota % ANOMALY_SHARDS_PER_SAMPLE),
      affordableSamples * ANOMALY_SHARDS_PER_SAMPLE);
    if (acceptedUnits <= 0) {
      return { acceptedUnits: 0, payment: 0, unitPrice: ANOMALY_SAMPLE_PRICE / ANOMALY_SHARDS_PER_SAMPLE,
        buyerId, buyer, reason: remainingQuota < ANOMALY_SHARDS_PER_SAMPLE ? "research-quota-filled" : "insufficient-sample" };
    }
    const samples = acceptedUnits / ANOMALY_SHARDS_PER_SAMPLE;
    const payment = samples * ANOMALY_SAMPLE_PRICE;
    buyer.inventories[STABILIZED_ANOMALY_SAMPLE_TYPE] = (buyer.inventories[STABILIZED_ANOMALY_SAMPLE_TYPE] ?? 0) + samples;
    buyer.accounts.operating.balance -= payment;
    state.anomalyExchange.acceptedBySite[siteId] = alreadyAccepted + acceptedUnits;
    buyer.accounts.operating.transactions ??= [];
    buyer.accounts.operating.transactions.push({
      id: `ANOMALY-INTAKE-${now}-${siteId}`, at: now, type: "research-intake",
      amount: -payment, balance: buyer.accounts.operating.balance, referenceId: source,
    });
    recordAcquisition(state, { institutionId: buyer.id ?? buyerId, itemId: STABILIZED_ANOMALY_SAMPLE_TYPE,
      units: samples, totalCost: payment, source: "anomaly-stabilization", at: now });
    state.ledger?.recordEvent?.("anomaly.sampleStabilized", { siteId, buyerId, shards: acceptedUnits, samples, payment },
      { visible: true, message: `${acceptedUnits} anomaly shards stabilized into ${samples} research sample${samples === 1 ? "" : "s"}.` });
    return { acceptedUnits, payment, unitPrice: ANOMALY_SAMPLE_PRICE / ANOMALY_SHARDS_PER_SAMPLE,
      buyerId, buyer, convertedUnits: samples, convertedResourceId: STABILIZED_ANOMALY_SAMPLE_TYPE,
      reason: acceptedUnits < offered ? "research-intake-limited" : null };
  }

  const price = Math.max(1, Math.floor(unitPrice ?? getHubWholesalePrice(resourceId)));
  const spendable = Math.max(0, buyer.accounts.operating.balance ?? 0);
  const acceptedUnits = Math.min(offered, Math.floor(spendable / price));

  if (acceptedUnits <= 0) {
    return { acceptedUnits: 0, payment: 0, unitPrice: price, buyerId, buyer, reason: "buyer-cannot-fund" };
  }

  const payment = acceptedUnits * price;
  buyer.inventories[resourceId] = (buyer.inventories[resourceId] ?? 0) + acceptedUnits;
  buyer.accounts.operating.balance -= payment;
  buyer.accounts.operating.transactions ??= [];
  buyer.accounts.operating.transactions.push({
    id: `HUB-BUY-${now}-${resourceId}`,
    at: now,
    type: "wholesale-purchase",
    amount: -payment,
    balance: buyer.accounts.operating.balance,
    referenceId: source,
  });

  // Book what the hub actually paid. Without it the hub's cost basis stays zero,
  // so anything it builds from this ore looks like it cost only the conversion
  // fee and it cannot price its own goods honestly.
  recordAcquisition(state, {
    institutionId: buyer.id ?? buyerId,
    itemId: resourceId,
    units: acceptedUnits,
    totalCost: payment,
    source,
    at: now,
  });

  return {
    acceptedUnits,
    payment,
    unitPrice: price,
    buyerId,
    buyer,
    reason: acceptedUnits < offered ? "buyer-partly-funded" : null,
  };
}
