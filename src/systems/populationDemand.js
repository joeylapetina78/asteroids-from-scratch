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

import { getResourceEffectiveYield, getResourceFamily } from "./resourceDefinitions.js?v=fresh-20260820-1818-9a1a051";
import { getBundleCost, getUnitCost, recordProduction } from "./costBasis.js?v=fresh-20260820-1818-9a1a051";
import { BLOCKER_KIND, DIAGNOSTIC_STATE, clearBlocker, createBlocker, recordBlocker, recordDiagnostic } from "./diagnostics.js?v=fresh-20260820-1818-9a1a051";
import { settlementExtractionDefinitions, settlementPopulationProfiles } from "../content/economy/firstReachSettlements.js?v=fresh-20260820-1818-9a1a051";
import { isHubAggregated } from "./simulationMode.js?v=fresh-20260820-1818-9a1a051";

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
    productionCost: 3000,
    productionSeconds: 90,
    price: 4000,
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
    productionCost: 2400,
    productionSeconds: 75,
    price: 3300,
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
    productionCost: 2600,
    productionSeconds: 80,
    price: 3600,
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
    price: 900,
    demandIntervalSeconds: 120,
    maxBacklog: 4,
  },
});

// Populations are where credits enter the world. Income has to comfortably
// outrun what the four needs cost, or the demand sink throttles itself and the
// hub economy starves for reasons that have nothing to do with supply.
//
// The four needs together cost 6.89 cr/s at full cadence:
//   Settlement Supply Unit  400 / 180s = 2.22
//   Life-Support Pack       330 / 150s = 2.20
//   Household Goods Unit    360 / 210s = 1.71
//   General Materials        90 / 120s = 0.75
//
// Income below is 10 cr/s, about 1.45x that, so a population never runs dry.
// The cash cap is the valve: income is credited only up to it and the surplus
// is discarded and logged, so credit creation stays bounded and prices keep
// meaning something over a long session. The cap is set above a full backlog of
// every need (3630 cr) so a burst of demand is always payable.
export const POPULATION_PROFILES = Object.freeze(settlementPopulationProfiles());

export function createInitialPopulationState(now = Date.now()) {
  const populations = {};
  POPULATION_PROFILES.forEach((profile, index) => {
    // Settlements do not all place their civilian orders on the same second.
    // The offset persists because each need advances from its own last demand,
    // turning one artificial production wave into continuous regional demand.
    populations[profile.id] = createPopulationRecord(profile, now + index * 17_000);
  });
  return { populations, productionOrders: {}, counter: 0, operators: {}, laborAssignments: {}, operatorCounter: 0 };
}

// ── How much a settlement of a given size actually wants ───────────────────
//
// `size` was authored on every population from the beginning and read by exactly
// one system: `protectionPlanning`, where it decides how exposed a settlement is
// and what a raid would cost it. Nothing connected it to appetite, so a crew of
// sixty ate precisely as much as a town of a hundred and forty and the number
// was decoration everywhere else.
//
// NORMALISED AT THE TOP, WHICH IS THE WHOLE CARE HERE. The reference is the
// largest authored settlement, so the biggest place keeps exactly the demand it
// has today and every smaller one wants proportionally less. Nothing in the
// world becomes hungrier than it already was — which matters because every
// settlement is currently running its shelves empty, and a change that raised
// demand anywhere would deepen a famine rather than describe one.
//
// Fixed rather than computed from whatever content happens to exist, so that
// authoring a bigger settlement later makes THAT settlement hungrier instead of
// silently making all the existing ones less so.
const REFERENCE_POPULATION_SIZE = 140;

export function getPopulationDemandScale(population) {
  const size = population?.size;
  if (!Number.isFinite(size) || size <= 0) return 1;
  return size / REFERENCE_POPULATION_SIZE;
}

// The interval a population of this size actually waits between wanting a thing.
//
// Scaling the WAIT rather than the units drawn is deliberate: a need consumes a
// whole number of material units, so scaling the draw would round every
// settlement between sixty and a hundred and twenty-five to the same integer and
// throw the distinction away. A smaller place simply needs resupplying less
// often, which is also the more natural reading.
export function getScaledDemandInterval(need, population) {
  return (need.demandIntervalSeconds ?? 1) / Math.max(0.05, getPopulationDemandScale(population));
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
    distressPolicy: profile.distressPolicy ? {
      ...profile.distressPolicy,
      essentialNeedIds: [...profile.distressPolicy.essentialNeedIds],
      deferredNeedIds: [...profile.distressPolicy.deferredNeedIds],
    } : null,
    emergencyDebt: 0,
    distressActive: false,
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
  population.operators ??= {};
  population.laborAssignments ??= {};
  population.operatorCounter ??= 0;
  // Late-added profiles and needs appear without wiping an existing save.
  POPULATION_PROFILES.forEach((profile) => {
    population.populations[profile.id] ??= createPopulationRecord(profile, now());
    const record = population.populations[profile.id];
    if (record.distressPolicy === undefined && profile.distressPolicy) {
      record.distressPolicy = {
        ...profile.distressPolicy,
        essentialNeedIds: [...profile.distressPolicy.essentialNeedIds],
        deferredNeedIds: [...profile.distressPolicy.deferredNeedIds],
      };
    }
    record.emergencyDebt ??= 0;
    record.distressActive ??= false;
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

  // Material this hub has already sold to another hub and not yet handed over.
  //
  // Read straight off state rather than importing the procurement module, which
  // depends on this one. Without this the local population eats goods that were
  // promised elsewhere: the supplier mines the units, its own Life-Support
  // production consumes them the same tick, the export order never reaches the
  // quantity it owes, and it sits in "accepted" forever.
  function reservedForSale(hub, resourceId) {
    return Object.values(state.hubProcurement?.orders ?? {})
      .filter((order) => order.supplierInstitutionId === hub.id
        && order.resourceId === resourceId
        && ["accepted", "ready"].includes(order.status))
      .reduce((sum, order) => sum + Math.max(0, (order.units ?? 0) - (order.deliveredUnits ?? 0)), 0);
  }

  // Which materials in hub stock may satisfy this need, cheapest first so the
  // hub spends its least valuable eligible material and substitution has real
  // economics behind it. Units already sold are not on the shelf: the hub took
  // the money, so that material is not its own to consume.
  function eligibleMaterials(hub, need) {
    return Object.entries(hubStock(hub))
      .map(([resourceId, units]) => [resourceId, Math.max(0, units - reservedForSale(hub, resourceId))])
      .filter(([resourceId, units]) => units > 0 && (need.families === null || need.families.includes(getResourceFamily(resourceId))))
      .map(([resourceId, units]) => ({
        resourceId,
        units,
        family: getResourceFamily(resourceId),
        unitCost: getUnitCost(state, hub.id, resourceId) || 0,
        effectiveYield: getResourceEffectiveYield(resourceId),
      }))
      .sort((first, second) => (first.unitCost / first.effectiveYield) - (second.unitCost / second.effectiveYield)
        || second.effectiveYield - first.effectiveYield || second.units - first.units);
  }

  // Draw `units` of material spread across whatever eligible stock exists.
  // Returns null when the hub cannot cover it, so nothing is partially consumed.
  function planDraw(hub, need, units) {
    const draw = {};
    let remaining = units;
    for (const candidate of eligibleMaterials(hub, need)) {
      if (remaining <= 0) break;
      const take = Math.min(candidate.units, Math.ceil(remaining / candidate.effectiveYield));
      draw[candidate.resourceId] = (draw[candidate.resourceId] ?? 0) + take;
      remaining -= take * candidate.effectiveYield;
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
    let income = populationRecord.incomeAmount;
    const policy = populationRecord.distressPolicy;
    const hub = getHub(populationRecord);
    const repayment = policy && hub && populationRecord.emergencyDebt > 0
      ? Math.min(populationRecord.emergencyDebt, Math.floor(income * policy.repaymentShare))
      : 0;
    if (repayment > 0) {
      income -= repayment;
      populationRecord.emergencyDebt -= repayment;
      hub.accounts.operating.balance += repayment;
      emit("population.emergencyCreditRepaid", `${populationRecord.name} repaid ${repayment} cr of emergency credit to ${hubName(hub)}.`, {
        populationId: populationRecord.id, hubInstitutionId: hub.id, amount: repayment,
        remainingDebt: populationRecord.emergencyDebt, hubBalance: hub.accounts.operating.balance,
      });
    }
    // Credit income additively up to the cap, and never claw an already-earned
    // balance back DOWN to it. A population can now hold more than the cap from
    // mining royalties — a real transfer of earned money — and the cap is a valve
    // on the income FAUCET, not a ceiling on wealth. Clamping to the cap here (as
    // this once did) destroyed royalty surplus the next time the faucet ticked.
    const room = Math.max(0, populationRecord.householdCashCap - populationRecord.householdCash);
    const received = Math.min(income, room);
    populationRecord.householdCash += received;
    const discarded = income - received;
    const created = received + repayment;
    populationRecord.totalIncome += created;
    populationRecord.totalDiscarded = (populationRecord.totalDiscarded ?? 0) + discarded;

    // Saturation is reported on the transition, not every interval. At the cap
    // this fires forever otherwise, and a recurring event that says nothing new
    // is how the ledger got flooded before.
    const saturated = created <= 0;
    const wasSaturated = populationRecord.saturated === true;
    populationRecord.saturated = saturated;
    if (saturated && wasSaturated) return;

    emit("population.incomeReceived", saturated
      ? `${populationRecord.name} is at its household cash cap; ${discarded} cr of income was not created.`
      : `${populationRecord.name} received ${created} cr of background income${repayment > 0 ? ` and used ${repayment} cr to repay emergency credit` : ""}.`, {
      populationId: populationRecord.id, amount: created, householdCash: populationRecord.householdCash,
      cappedAway: discarded, totalDiscarded: populationRecord.totalDiscarded, atCap: saturated,
      debtRepaid: repayment, remainingDebt: populationRecord.emergencyDebt,
    });
  }

  function updateDistress(populationRecord) {
    const policy = populationRecord.distressPolicy;
    if (!policy) return false;
    const active = populationRecord.householdCash < policy.cashThreshold || populationRecord.emergencyDebt > 0;
    if (active !== populationRecord.distressActive) {
      populationRecord.distressActive = active;
      emit(active ? "population.distressEntered" : "population.distressCleared", active
        ? `${populationRecord.name} entered its hardship plan: essential purchases continue and nonessential demand is deferred.`
        : `${populationRecord.name} left its hardship plan and resumed ordinary purchasing targets.`, {
        populationId: populationRecord.id, householdCash: populationRecord.householdCash,
        emergencyDebt: populationRecord.emergencyDebt, cashThreshold: policy.cashThreshold,
      });
    }
    return active;
  }

  function generateDemand(populationRecord) {
    Object.values(populationRecord.needs).forEach((needState) => {
      const need = POPULATION_NEEDS[needState.needId];
      if (!need) return;
      const dueAt = needState.lastDemandAt + getScaledDemandInterval(need, populationRecord) * 1000;
      if (now() < dueAt) return;
      needState.lastDemandAt = now();
      if (populationRecord.distressActive && populationRecord.distressPolicy?.deferredNeedIds.includes(need.id)) {
        needState.deferred = (needState.deferred ?? 0) + 1;
        emit("population.demandDeferred", `${populationRecord.name} deferred ${need.label} under its hardship plan.`, {
          populationId: populationRecord.id, needId: need.id, deferred: needState.deferred,
          householdCash: populationRecord.householdCash, emergencyDebt: populationRecord.emergencyDebt,
        });
        return;
      }
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
    if (populationRecord.householdCash < need.price) {
      const policy = populationRecord.distressPolicy;
      const essential = policy?.essentialNeedIds.includes(need.id);
      const shortfall = need.price - populationRecord.householdCash;
      const availableCredit = Math.max(0, (policy?.emergencyCreditLimit ?? 0) - populationRecord.emergencyDebt);
      const protectedCash = hub.protectionPolicy?.protectedCash ?? 0;
      const hubCanAdvance = Math.max(0, (hub.accounts?.operating?.balance ?? 0) - protectedCash);
      if (!essential || shortfall > availableCredit || shortfall > hubCanAdvance) {
        return { blocked: "population-cannot-afford" };
      }
      const populationCashBefore = populationRecord.householdCash;
      const hubCashBefore = hub.accounts.operating.balance;
      populationRecord.householdCash += shortfall;
      populationRecord.emergencyDebt += shortfall;
      hub.accounts.operating.balance -= shortfall;
      emit("population.emergencyCreditDrawn", `${hubName(hub)} advanced ${shortfall} cr to ${populationRecord.name} for ${need.label}.`, {
        populationId: populationRecord.id, hubInstitutionId: hub.id, needId: need.id,
        amount: shortfall, totalDebt: populationRecord.emergencyDebt,
        populationCashBefore, populationCashAfter: populationRecord.householdCash,
        hubCashBefore, hubCashAfter: hub.accounts.operating.balance,
      });
    }

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

  // The hub is its own actor with its own problems. A hub that cannot build is
  // the HUB's blocker, not its population's — the population is a customer, not
  // a manufacturer, and reporting a factory's shortage on a household's card is
  // what made these two look like one actor.
  function publishHubDiagnostic(hub, hubBlockers) {
    const books = sellerTrade(hub);
    const stockSummary = Object.entries(hub.inventories ?? {}).filter(([, units]) => units > 0)
      .map(([resourceId, units]) => `${units} ${resourceId.replaceAll("-", " ")}`).join(", ") || "no material";
    const summary = hubBlockers.length === 0
      ? `${hubName(hub)} is supplying its population (${stockSummary}, ${Math.round(hub.accounts.operating.balance)} cr)`
      : `${hubName(hub)} cannot supply ${hubBlockers.length} product(s): ${hubBlockers[0].shortfall}`;

    recordDiagnostic(state, hub.id, {
      actorName: hubName(hub),
      actorKind: "institution",
      locationSiteId: hub.id,
      state: hubBlockers.length > 0 ? DIAGNOSTIC_STATE.WAITING : DIAGNOSTIC_STATE.FREE,
      summary,
      detail: {
        treasury: Math.round(hub.accounts.operating.balance),
        materials: { ...(hub.inventories ?? {}) },
        finishedGoods: { ...(hub.finishedGoods ?? {}) },
        unitsSold: books.unitsSold, revenue: books.revenue,
        costOfGoodsSold: books.costOfGoodsSold, margin: books.margin,
        productionSpend: books.productionSpend,
        minesFamilies: minedFamilies(hub.id),
      },
    }, now());

    if (hubBlockers.length === 0) {
      clearBlocker(state, hub.id, { state: DIAGNOSTIC_STATE.FREE, summary, at: now() });
      return;
    }
    const worst = hubBlockers[0];
    recordBlocker(state, hub.id, createBlocker({
      kind: worst.kind,
      summary: worst.summary,
      subjectId: hub.id,
      objectId: worst.needId,
      waitingFor: worst.waitingFor,
      wakeOn: ["material-delivered", "order-posted", "freight-delivered"],
      // No causedBy yet: the eventual cause is an unfilled procurement order
      // against the hub that CAN mine this family, and that order does not
      // exist until the hub can post one. Pointing at itself would only be a
      // cycle, so the constraint is stated in the blocker instead.
      causedBy: [],
      detail: { needId: worst.needId, blockedProducts: hubBlockers.map((entry) => entry.needId) },
      at: now(),
    }), { state: DIAGNOSTIC_STATE.WAITING, at: now() });
  }

  function publishDiagnostic(populationRecord, blockers, waitingOnHub = []) {
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
        distressActive: populationRecord.distressActive,
        emergencyDebt: Math.round(populationRecord.emergencyDebt),
        needs: Object.values(populationRecord.needs).map((entry) => ({
          need: POPULATION_NEEDS[entry.needId]?.label ?? entry.needId,
          backlog: entry.backlog, purchased: entry.purchased, consumed: entry.consumed,
          deferred: entry.deferred ?? 0,
        })),
      },
    }, now());

    // A population is only ever blocked by two things of its own: it cannot
    // pay, or its supplier has not got the goods. The second is recorded as
    // waiting on the hub, and the WHY continues into the hub's own blocker
    // rather than being restated here.
    if (blockers.length === 0 && waitingOnHub.length === 0) {
      // clearBlocker nulls the summary unless one is supplied, which would
      // leave the population nameless in the observatory list.
      clearBlocker(state, populationRecord.id, { state: DIAGNOSTIC_STATE.FREE, summary, at: now() });
      return;
    }

    const own = blockers[0] ?? null;
    const blocker = own ?? {
      needId: waitingOnHub[0],
      kind: BLOCKER_KIND.AWAITING_PRODUCTION,
      summary: `${populationRecord.name} is waiting to buy ${POPULATION_NEEDS[waitingOnHub[0]]?.label ?? waitingOnHub[0]}`,
      waitingFor: `${hubName(getHub(populationRecord))} to have one in stock`,
    };
    recordBlocker(state, populationRecord.id, createBlocker({
      kind: blocker.kind,
      summary: blocker.summary,
      subjectId: populationRecord.id,
      objectId: populationRecord.hubInstitutionId,
      waitingFor: blocker.waitingFor,
      wakeOn: ["goods-available", "population.incomeReceived"],
      // Point at the supplier as an actor. resolveBlockerChain walks into the
      // hub's own record, so the chain reads: population waiting -> hub cannot
      // build -> hub holds no right to mine that family.
      causedBy: own ? [] : [{ actorId: populationRecord.hubInstitutionId }],
      detail: { needId: blocker.needId, unaffordable: blockers.map((entry) => entry.needId), awaitingSupply: waitingOnHub },
      at: now(),
    }), { state: DIAGNOSTIC_STATE.WAITING, at: now() });
  }

  // Population-side only: the household could not pay.
  function describePopulationBlocker(needId, populationRecord) {
    const need = POPULATION_NEEDS[needId];
    return {
      needId,
      kind: BLOCKER_KIND.PAYER_CANNOT_AFFORD,
      summary: `${populationRecord.name} cannot afford ${need?.label ?? needId} at ${need?.price ?? 0} cr`,
      waitingFor: "background income",
    };
  }

  // Hub-side only: the seller could not build or stock the product.
  function describeHubBlocker(needId, reason, hub) {
    const need = POPULATION_NEEDS[needId];
    const label = need?.label ?? needId;
    const families = describeFamilies(need);
    const cannotMine = missingFamilies(hub.id, need);
    const mustBuy = cannotMine.length > 0
      ? `${hubName(hub)} has no installed ${cannotMine.join("/")} extraction capacity, so it must buy this material or commission new capacity`
      : null;

    switch (reason) {
      case "hub-lacks-input-material":
        return { needId, kind: BLOCKER_KIND.AWAITING_MATERIAL, shortfall: `no ${families} material`, mustBuy,
          summary: `${hubName(hub)} cannot build ${label}: no ${families} material in stock${mustBuy ? ` — ${mustBuy}` : ""}`,
          waitingFor: mustBuy ? `${cannotMine.join("/")} material bought from a hub that may mine it` : `${families} material` };
      case "hub-lacks-substitute-material":
        return { needId, kind: BLOCKER_KIND.AWAITING_MATERIAL, shortfall: "no material at all", mustBuy,
          summary: `${hubName(hub)} has no material to meet ${label}`,
          waitingFor: "any approved substitute material" };
      case "hub-cannot-fund-production":
        return { needId, kind: BLOCKER_KIND.PAYER_CANNOT_AFFORD, shortfall: "no funds to convert material", mustBuy: null,
          summary: `${hubName(hub)} cannot fund ${label} production`,
          waitingFor: "sales revenue or a cheaper input" };
      default:
        return { needId, kind: BLOCKER_KIND.AWAITING_MATERIAL, shortfall: reason, mustBuy,
          summary: `${hubName(hub)} cannot supply ${label}`, waitingFor: "stock" };
    }
  }

  // ── The tick, in phases ─────────────────────────────────────────────────
  //
  // Every step keeps the exact position it held before. See `worldClock`.

  // Production whose clock has run out. The passage of time is something that
  // became true, not something anybody decided, and finished goods have to be
  // on the shelf before any population tries to buy them.
  function observe() {
    completeDueProduction();
  }

  // Income, distress, demand and buying, one population at a time.
  //
  // This loop is NOT split further, deliberately. Accruing and generating
  // demand look observational, but populations sharing a hub buy from the same
  // shelf — so hoisting every population's demand ahead of every population's
  // purchases would change which of them reaches scarce stock first. That is
  // the same contested-claim question `hubProcurement` leaves alone, and it is
  // an economic decision rather than a tidying one.
  function decide() {
    Object.values(population.populations).forEach((populationRecord) => {
      if (isHubAggregated(state, populationRecord.hubInstitutionId)) return;
      const hub = getHub(populationRecord);
      if (!hub) return;
      accrueIncome(populationRecord);
      updateDistress(populationRecord);
      generateDemand(populationRecord);

      // Two separate books of problems, because these are two separate actors.
      const populationBlockers = [];
      const hubBlockers = [];
      const waitingOnHub = [];
      Object.values(populationRecord.needs).forEach((needState) => {
        const need = POPULATION_NEEDS[needState.needId];
        if (!need || needState.backlog <= 0) return;
        const bought = tryPurchase(populationRecord, hub, needState);
        if (bought?.purchased) return;

        if (bought?.blocked === "population-cannot-afford") {
          populationBlockers.push(describePopulationBlocker(need.id, populationRecord));
          return;
        }
        // Everything else is the supplier's problem. The population is simply
        // waiting for stock it is willing and able to pay for.
        waitingOnHub.push(need.id);
        if (need.kind === NEED_KIND.MANUFACTURED && bought?.blocked === "hub-has-no-stock") {
          const started = startProduction(populationRecord, hub, need);
          if (started?.blocked) hubBlockers.push(describeHubBlocker(need.id, started.blocked, hub));
          return;
        }
        if (bought?.blocked) hubBlockers.push(describeHubBlocker(need.id, bought.blocked, hub));
      });

      publishHubDiagnostic(hub, hubBlockers);
      publishDiagnostic(populationRecord, populationBlockers, waitingOnHub);
    });
  }

  // One whole tick. The clock drives the phases separately; every test and the
  // boot sequence drives this.
  function update() {
    observe();
    decide();
  }

  update();
  // No `settle`: the diagnostics this system publishes are written inside the
  // loop, against the hub each population actually bought from, so there is
  // nothing left to report afterwards.
  return { update, observe, decide, getState: () => population };
}

function describeDraw(draw) {
  return Object.entries(draw).map(([resourceId, units]) => `${units} ${resourceId.replaceAll("-", " ")}`).join(" + ");
}

// Display name for a hub institution, off the record it already carries. This
// was the third copy of the same three-settlement table; a fourth settlement
// would simply have been unnamed.
function hubName(hub) {
  if (!hub) return "the hub";
  return hub.name ?? hub.id;
}

// Families this institution currently has installed extraction capacity for.
function minedFamilies(institutionId) {
  return settlementExtractionDefinitions()
    .filter((definition) => definition.buyerInstitutionId === institutionId)
    .flatMap((definition) => definition.miningFamilies ?? [getResourceFamily(definition.resourceId)]);
}

// Families a need pulls on that this hub does not CURRENTLY mine. Broad legal
// authority means it could build that capacity later; until it does, importing
// remains the live response and preserves interdependence.
function missingFamilies(institutionId, need) {
  if (!need?.families) return [];
  const mine = minedFamilies(institutionId);
  return need.families.filter((family) => !mine.includes(family));
}

function describeFamilies(need) {
  return need?.families === null || need?.families === undefined ? "any" : need.families.join("/");
}
