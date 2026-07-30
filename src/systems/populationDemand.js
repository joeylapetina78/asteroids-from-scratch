// Population demand: the first place material leaves the economy for good.
//
// Until now every hub inventory only ever grew. Ore arrived and sat there, so a
// hub had no reason to want anything and no revenue of its own. A population
// closes that loop: it earns background income, generates recurring needs, buys
// goods from its hub, and CONSUMES them. Material and credits both leave the
// system through an explicit event rather than quietly vanishing.
//
// Two shapes of need, because not everything deserves a recipe:
//
//   Manufactured needs are produced by the hub from raw material drawn from the
//   families that need pulls on, plus a conversion cost. Production is still
//   deliberately abstract — there is no bill of materials naming exact parts,
//   only "this many units from these families" — but it is REAL consumption, so
//   a hub genuinely needs ore and genuinely needs to trade for the families it
//   cannot mine itself.
//
//   Direct needs skip production entirely and are satisfied by approved
//   substitute material straight from hub stock. This is how miscellaneous
//   civilian consumption is represented without inventing a recipe per object.
//
// The definitions below are data. The three current hubs are instances of them,
// and replacing an abstract need with a real recipe later should not require
// touching the purchase-and-consumption machinery.

import { getResourceFamily } from "./resourceDefinitions.js?v=fresh-20260730-1853-344c233";
import { getBundleCost, getUnitCost, recordProduction } from "./costBasis.js?v=fresh-20260730-1853-344c233";
import { BLOCKER_KIND, DIAGNOSTIC_STATE, clearBlocker, createBlocker, recordBlocker, recordDiagnostic } from "./diagnostics.js?v=fresh-20260730-1853-344c233";

export const NEED_KIND = Object.freeze({
  MANUFACTURED: "manufactured",
  DIRECT: "direct",
});

// `families: null` means any family is an approved substitute.
export const POPULATION_NEEDS = Object.freeze({
  "settlement-supply-unit": {
    id: "settlement-supply-unit",
    label: "Settlement Supply Unit",
    kind: NEED_KIND.MANUFACTURED,
    description: "Tools, pumps, replacement hardware, utility equipment, general infrastructure.",
    families: ["structural", "industrial"],
    materialUnits: 2,
    productionCost: 300,
    productionSeconds: 90,
    price: 400,
    demandIntervalSeconds: 180,
    maxBacklog: 3,
  },
  "life-support-pack": {
    id: "life-support-pack",
    label: "Life-Support Pack",
    kind: NEED_KIND.MANUFACTURED,
    description: "Water, coolant, filters, air-processing supplies, basic consumables.",
    families: ["volatile"],
    materialUnits: 2,
    productionCost: 240,
    productionSeconds: 75,
    price: 330,
    demandIntervalSeconds: 150,
    maxBacklog: 3,
  },
  "household-goods-unit": {
    id: "household-goods-unit",
    label: "Household Goods Unit",
    kind: NEED_KIND.MANUFACTURED,
    description: "Furniture, containers, appliances, clothing, simple electronics, everyday replacements.",
    families: ["structural", "industrial", "volatile"],
    materialUnits: 2,
    productionCost: 260,
    productionSeconds: 80,
    price: 360,
    demandIntervalSeconds: 210,
    maxBacklog: 3,
  },
  "general-materials": {
    id: "general-materials",
    label: "General Materials",
    kind: NEED_KIND.DIRECT,
    description: "Miscellaneous maintenance and civilian consumption, met by any approved substitute.",
    families: null,
    materialUnits: 1,
    price: 90,
    demandIntervalSeconds: 120,
    maxBacklog: 4,
  },
});

export const POPULATION_PROFILES = Object.freeze([
  {
    id: "population:yard-exchange",
    name: "Yard Exchange Population",
    hubInstitutionId: "yard-exchange",
    siteId: "yard-exchange",
    size: 140,
    householdCash: 1200,
    householdCashCap: 1200,
    incomeAmount: 400,
    incomeIntervalSeconds: 180,
    needIds: ["settlement-supply-unit", "life-support-pack", "household-goods-unit", "general-materials"],
  },
]);

export function createInitialPopulationState(now = Date.now()) {
  const populations = {};
  POPULATION_PROFILES.forEach((profile) => {
    populations[profile.id] = createPopulationRecord(profile, now);
  });
  return { populations, productionOrders: {}, counter: 0 };
}

function createPopulationRecord(profile, now) {
  const needs = {};
  profile.needIds.forEach((needId) => {
    needs[needId] = { needId, backlog: 0, lastDemandAt: now, purchased: 0, consumed: 0, unmetSince: null, spent: 0 };
  });
  return {
    id: profile.id,
    name: profile.name,
    archetypeId: "population",
    hubInstitutionId: profile.hubInstitutionId,
    siteId: profile.siteId,
    size: profile.size,
    householdCash: profile.householdCash,
    householdCashCap: profile.householdCashCap,
    incomeAmount: profile.incomeAmount,
    incomeIntervalSeconds: profile.incomeIntervalSeconds,
    lastIncomeAt: now,
    totalIncome: 0,
    totalSpent: 0,
    needs,
  };
}

export function createPopulationOperation({ state, now = () => Date.now() }) {
  state.population ??= createInitialPopulationState(now());
  const population = state.population;
  population.populations ??= {};
  population.productionOrders ??= {};
  population.counter ??= 0;
  // Late-added profiles and needs appear without wiping an existing save.
  POPULATION_PROFILES.forEach((profile) => {
    population.populations[profile.id] ??= createPopulationRecord(profile, now());
    const record = population.populations[profile.id];
    profile.needIds.forEach((needId) => {
      record.needs[needId] ??= { needId, backlog: 0, lastDemandAt: now(), purchased: 0, consumed: 0, unmetSince: null, spent: 0 };
    });
    // A timestamp ahead of the clock would park this population forever, since
    // every cadence check is "is now past due". That happens whenever the
    // seeded state and the operation disagree about what time it is — a save
    // restored against a different clock, or an injected test clock.
    if (record.lastIncomeAt > now()) record.lastIncomeAt = now();
    Object.values(record.needs).forEach((needState) => {
      if (needState.lastDemandAt > now()) needState.lastDemandAt = now();
    });
  });

  function getHub(record) {
    return state.logistics?.institutions?.[record.hubInstitutionId] ?? null;
  }

  function hubStock(hub) {
    return hub?.inventories ?? {};
  }

  // Goods the hub has finished and not yet sold, kept beside raw inventory so a
  // finished unit is never confused with the material it came from.
  function finishedGoods(hub) {
    hub.finishedGoods ??= {};
    return hub.finishedGoods;
  }

  // The seller's own books: what it earned selling to its population, what
  // those goods cost it, and the margin between. Separate from the buyer's
  // household cash in every respect.
  function sellerTrade(hub) {
    hub.settlementTrade ??= { unitsSold: 0, revenue: 0, costOfGoodsSold: 0, margin: 0, productionSpend: 0 };
    return hub.settlementTrade;
  }

  function emit(type, message, payload) {
    state.ledger.recordEvent(type, payload, { visible: true, message });
  }

  // Which materials in hub stock may satisfy this need, cheapest first so the
  // hub spends its least valuable eligible material and substitution has real
  // economics behind it.
  function eligibleMaterials(hub, need) {
    return Object.entries(hubStock(hub))
      .filter(([resourceId, units]) => units > 0 && (need.families === null || need.families.includes(getResourceFamily(resourceId))))
      .map(([resourceId, units]) => ({
        resourceId,
        units,
        family: getResourceFamily(resourceId),
        unitCost: getUnitCost(state, hub.id, resourceId) || 0,
      }))
      .sort((first, second) => first.unitCost - second.unitCost || second.units - first.units);
  }

  // Draw `units` of material spread across whatever eligible stock exists.
  // Returns null when the hub cannot cover it, so nothing is partially consumed.
  function planDraw(hub, need, units) {
    const draw = {};
    let remaining = units;
    for (const candidate of eligibleMaterials(hub, need)) {
      if (remaining <= 0) break;
      const take = Math.min(candidate.units, remaining);
      draw[candidate.resourceId] = (draw[candidate.resourceId] ?? 0) + take;
      remaining -= take;
    }
    return remaining > 0 ? null : draw;
  }

  function applyDraw(hub, draw) {
    Object.entries(draw).forEach(([resourceId, units]) => {
      hub.inventories[resourceId] = Math.max(0, (hub.inventories[resourceId] ?? 0) - units);
    });
  }

  function accrueIncome(populationRecord) {
    const dueAt = populationRecord.lastIncomeAt + populationRecord.incomeIntervalSeconds * 1000;
    if (now() < dueAt) return;
    populationRecord.lastIncomeAt = now();
    const before = populationRecord.householdCash;
    populationRecord.householdCash = Math.min(populationRecord.householdCashCap, populationRecord.householdCash + populationRecord.incomeAmount);
    const received = populationRecord.householdCash - before;
    populationRecord.totalIncome += received;
    if (received <= 0) return;
    emit("population.incomeReceived", `${populationRecord.name} received ${received} cr of background income.`, {
      populationId: populationRecord.id, amount: received, householdCash: populationRecord.householdCash,
      cappedAway: populationRecord.incomeAmount - received,
    });
  }

  function generateDemand(populationRecord) {
    Object.values(populationRecord.needs).forEach((needState) => {
      const need = POPULATION_NEEDS[needState.needId];
      if (!need) return;
      const dueAt = needState.lastDemandAt + need.demandIntervalSeconds * 1000;
      if (now() < dueAt) return;
      needState.lastDemandAt = now();
      if (needState.backlog >= need.maxBacklog) return;
      needState.backlog += 1;
      if (needState.unmetSince === null) needState.unmetSince = now();
      emit("population.demandRaised", `${populationRecord.name} needs ${need.label} (${needState.backlog} outstanding).`, {
        populationId: populationRecord.id, needId: need.id, needLabel: need.label, backlog: needState.backlog,
      });
    });
  }

  function startProduction(populationRecord, hub, need) {
    const alreadyRunning = Object.values(population.productionOrders)
      .some((order) => order.status === "running" && order.hubInstitutionId === hub.id && order.needId === need.id);
    if (alreadyRunning) return null;
    if ((hub.accounts?.operating?.balance ?? 0) < need.productionCost) return { blocked: "hub-cannot-fund-production" };
    const draw = planDraw(hub, need, need.materialUnits);
    if (!draw) return { blocked: "hub-lacks-input-material" };

    applyDraw(hub, draw);
    hub.accounts.operating.balance -= need.productionCost;
    sellerTrade(hub).productionSpend += need.productionCost;
    const id = `production:${need.id}:${++population.counter}`;
    population.productionOrders[id] = {
      id, hubInstitutionId: hub.id, needId: need.id, inputs: draw,
      conversionCost: need.productionCost, status: "running",
      startedAt: now(), completesAt: now() + need.productionSeconds * 1000,
    };
    emit("population.productionStarted", `${hub.id} began producing one ${need.label} from ${describeDraw(draw)}.`, {
      productionOrderId: id, hubInstitutionId: hub.id, needId: need.id, inputs: draw,
      conversionCost: need.productionCost, materialCost: Math.round(getBundleCost(state, hub.id, draw)),
    });
    return { started: id };
  }

  function completeDueProduction() {
    Object.values(population.productionOrders).forEach((order) => {
      if (order.status !== "running" || order.completesAt > now()) return;
      const hub = state.logistics?.institutions?.[order.hubInstitutionId];
      const need = POPULATION_NEEDS[order.needId];
      if (!hub || !need) return;
      order.status = "completed";
      order.completedAt = now();
      finishedGoods(hub)[need.id] = (finishedGoods(hub)[need.id] ?? 0) + 1;
      // Carry the material cost into the finished good so the hub knows what the
      // unit actually cost it, the same way SPRC prices a repair.
      recordProduction(state, {
        institutionId: hub.id, outputItemId: need.id, outputUnits: 1,
        inputs: order.inputs, conversionCost: order.conversionCost, at: now(),
      });
      emit("population.productionCompleted", `${hub.id} finished one ${need.label}.`, {
        productionOrderId: order.id, hubInstitutionId: hub.id, needId: need.id,
        unitCost: Math.round(getUnitCost(state, hub.id, need.id)),
      });
    });
  }

  // A manufactured good is bought from finished stock; a direct need is bought
  // as raw material. Either way credits move population -> hub and the goods
  // are consumed by an explicit event.
  function tryPurchase(populationRecord, hub, needState) {
    const need = POPULATION_NEEDS[needState.needId];
    if (!need || needState.backlog <= 0) return null;
    if (populationRecord.householdCash < need.price) return { blocked: "population-cannot-afford" };

    let consumedDescription = null;
    if (need.kind === NEED_KIND.MANUFACTURED) {
      if ((finishedGoods(hub)[need.id] ?? 0) < 1) return { blocked: "hub-has-no-stock" };
      finishedGoods(hub)[need.id] -= 1;
      consumedDescription = need.label;
    } else {
      const draw = planDraw(hub, need, need.materialUnits);
      if (!draw) return { blocked: "hub-lacks-substitute-material" };
      applyDraw(hub, draw);
      consumedDescription = describeDraw(draw);
    }

    // Two distinct accounts. The buyer's household cash and the seller's
    // treasury are different balances in different records, and the sale is the
    // only thing that moves value between them.
    const buyerCashBefore = populationRecord.householdCash;
    const sellerTreasuryBefore = hub.accounts.operating.balance;

    populationRecord.householdCash -= need.price;
    populationRecord.totalSpent += need.price;
    needState.spent += need.price;
    hub.accounts.operating.balance += need.price;
    needState.backlog -= 1;
    needState.purchased += 1;
    needState.consumed += 1;
    if (needState.backlog === 0) needState.unmetSince = null;

    const unitCost = Math.round(getUnitCost(state, hub.id, need.id)) || 0;
    const trade = sellerTrade(hub);
    trade.unitsSold += 1;
    trade.revenue += need.price;
    trade.costOfGoodsSold += unitCost;
    trade.margin = trade.revenue - trade.costOfGoodsSold;

    emit("population.goodsPurchased", `${populationRecord.name} paid ${hub.id} ${need.price} cr for ${need.label}.`, {
      // Both sides of the transaction, named, with before and after balances so
      // the ledger alone proves nothing was created or destroyed.
      buyerId: populationRecord.id,
      buyerName: populationRecord.name,
      sellerId: hub.id,
      sellerName: hub.id,
      product: need.id,
      productLabel: need.label,
      price: need.price,
      buyerCashBefore: Math.round(buyerCashBefore),
      buyerCashAfter: Math.round(populationRecord.householdCash),
      sellerTreasuryBefore: Math.round(sellerTreasuryBefore),
      sellerTreasuryAfter: Math.round(hub.accounts.operating.balance),
      unitCost,
      margin: need.price - unitCost,
      // Kept for existing ledger filters and references.
      populationId: populationRecord.id, hubInstitutionId: hub.id, needId: need.id,
      householdCash: Math.round(populationRecord.householdCash),
      hubBalance: Math.round(hub.accounts.operating.balance),
    });
    // Consumption is its own event: this is where the goods leave the world.
    emit("population.goodsConsumed", `${populationRecord.name} consumed ${consumedDescription}.`, {
      populationId: populationRecord.id, needId: need.id, needLabel: need.label,
      consumed: consumedDescription, remainingBacklog: needState.backlog,
    });
    return { purchased: need.id };
  }

  function publishDiagnostic(populationRecord, blockers) {
    const outstanding = Object.values(populationRecord.needs).reduce((sum, entry) => sum + entry.backlog, 0);
    const summary = outstanding === 0
      ? `${populationRecord.name} has everything it needs (${Math.round(populationRecord.householdCash)} cr on hand)`
      : `${populationRecord.name} is waiting on ${outstanding} order(s), ${Math.round(populationRecord.householdCash)} cr on hand`;
    recordDiagnostic(state, populationRecord.id, {
      actorName: populationRecord.name,
      actorKind: "population",
      controllerId: populationRecord.hubInstitutionId,
      locationSiteId: populationRecord.siteId,
      state: blockers.length > 0 ? DIAGNOSTIC_STATE.WAITING : DIAGNOSTIC_STATE.FREE,
      summary,
      detail: {
        size: populationRecord.size,
        householdCash: Math.round(populationRecord.householdCash),
        totalIncome: Math.round(populationRecord.totalIncome),
        totalSpent: Math.round(populationRecord.totalSpent),
        needs: Object.values(populationRecord.needs).map((entry) => ({
          need: POPULATION_NEEDS[entry.needId]?.label ?? entry.needId,
          backlog: entry.backlog, purchased: entry.purchased, consumed: entry.consumed,
        })),
      },
    }, now());

    if (blockers.length === 0) {
      // clearBlocker nulls the summary unless one is supplied, which would
      // leave the population nameless in the observatory list.
      clearBlocker(state, populationRecord.id, { state: DIAGNOSTIC_STATE.FREE, summary, at: now() });
      return;
    }
    const worst = blockers[0];
    recordBlocker(state, populationRecord.id, createBlocker({
      kind: worst.kind,
      summary: worst.summary,
      subjectId: populationRecord.id,
      objectId: populationRecord.hubInstitutionId,
      waitingFor: worst.waitingFor,
      wakeOn: ["material-delivered", "order-posted", "population.incomeReceived"],
      causedBy: [{ actorId: populationRecord.hubInstitutionId, note: worst.cause }],
      detail: { needId: worst.needId, blockedNeeds: blockers.map((entry) => entry.needId) },
      at: now(),
    }), { state: DIAGNOSTIC_STATE.WAITING, at: now() });
  }

  function describeBlocker(needId, reason, populationRecord) {
    const need = POPULATION_NEEDS[needId];
    const label = need?.label ?? needId;
    switch (reason) {
      case "population-cannot-afford":
        return { needId, kind: BLOCKER_KIND.PAYER_CANNOT_AFFORD, summary: `${populationRecord.name} cannot afford ${label} at ${need.price} cr`, waitingFor: "background income", cause: "the household has not been paid yet" };
      case "hub-lacks-input-material":
        return { needId, kind: BLOCKER_KIND.AWAITING_MATERIAL, summary: `${populationRecord.hubInstitutionId} cannot build ${label}: no ${describeFamilies(need)} material in stock`, waitingFor: `${describeFamilies(need)} material`, cause: "the hub has nothing eligible to convert" };
      case "hub-lacks-substitute-material":
        return { needId, kind: BLOCKER_KIND.AWAITING_MATERIAL, summary: `${populationRecord.hubInstitutionId} has no material to meet ${label}`, waitingFor: "any approved substitute material", cause: "the hub is out of stock entirely" };
      case "hub-cannot-fund-production":
        return { needId, kind: BLOCKER_KIND.PAYER_CANNOT_AFFORD, summary: `${populationRecord.hubInstitutionId} cannot fund ${label} production`, waitingFor: "revenue or a cheaper input", cause: "the hub's operating account is short" };
      default:
        return { needId, kind: BLOCKER_KIND.AWAITING_MATERIAL, summary: `${label} is unavailable`, waitingFor: "stock", cause: reason };
    }
  }

  function update() {
    completeDueProduction();
    Object.values(population.populations).forEach((populationRecord) => {
      const hub = getHub(populationRecord);
      if (!hub) return;
      accrueIncome(populationRecord);
      generateDemand(populationRecord);

      const blockers = [];
      Object.values(populationRecord.needs).forEach((needState) => {
        const need = POPULATION_NEEDS[needState.needId];
        if (!need || needState.backlog <= 0) return;
        const bought = tryPurchase(populationRecord, hub, needState);
        if (bought?.purchased) return;
        // Could not buy. For a manufactured need the usual answer is that the
        // hub has not built one yet, so ask it to start.
        if (need.kind === NEED_KIND.MANUFACTURED && bought?.blocked === "hub-has-no-stock") {
          const started = startProduction(populationRecord, hub, need);
          if (started?.blocked) blockers.push(describeBlocker(need.id, started.blocked, populationRecord));
          return;
        }
        if (bought?.blocked) blockers.push(describeBlocker(need.id, bought.blocked, populationRecord));
      });

      publishDiagnostic(populationRecord, blockers);
    });
  }

  update();
  return { update, getState: () => population };
}

function describeDraw(draw) {
  return Object.entries(draw).map(([resourceId, units]) => `${units} ${resourceId.replaceAll("-", " ")}`).join(" + ");
}

function describeFamilies(need) {
  return need?.families === null || need?.families === undefined ? "any" : need.families.join("/");
}
