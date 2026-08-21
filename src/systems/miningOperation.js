import { MiningWorkerShip } from "../entities/MiningWorkerShip.js?v=fresh-20260820-1911-46d9453";
import { getOreClusterSeedsInRadius } from "./asteroidField.js?v=fresh-20260820-1911-46d9453";
import { getInstitutionalFeedstockTradeValue, getResourceFamily } from "./resourceDefinitions.js?v=fresh-20260820-1911-46d9453";
import { canActorDoAction } from "./ruleChecker.js?v=fresh-20260820-1911-46d9453";
import { getMiningWorkWear } from "./wearRates.js?v=fresh-20260820-1911-46d9453";
import { evaluateMiningJob, evaluateProcurement, urgencyFromCoverage } from "./valuation.js?v=fresh-20260820-1911-46d9453";
import { getInventoryPosition, sellMaterialToHub } from "./hubInventory.js?v=fresh-20260820-1911-46d9453";
import { getServiceCost, recordAcquisition, recordServiceCost } from "./costBasis.js?v=fresh-20260820-1911-46d9453";
import { getActorProtectedCash, getActorTraits } from "./actorConfig.js?v=fresh-20260820-1911-46d9453";
import { FLEET_CAPACITY_DEFAULTS, createCommissionCapability, createHireCapability, createReleaseCapability, planFleetCapacity, resolveFleetPolicy } from "./fleetCapacity.js?v=fresh-20260820-1911-46d9453";
import { createWithdrawForServiceCapability, planCraftService, resolveServicePolicy } from "./serviceDecision.js?v=fresh-20260820-1911-46d9453";
import { createSurveyedDeposit, rankDepositCandidates, recordDepositObservation, rememberSurveyedDeposit, resolveProspectingPolicy } from "./depositKnowledge.js?v=fresh-20260820-1911-46d9453";
import { adaptMiningAllocation } from "./intentions.js?v=fresh-20260820-1911-46d9453";
import { createExtractionOffer, filterUncommittedOffers, listExtractionOffers, registerExtractionOfferSource } from "./extractionOffers.js?v=fresh-20260820-1911-46d9453";
import { clearExtractionMarket, getMarketOutbid, registerExtractionMarketParticipant } from "./extractionMarket.js?v=fresh-20260820-1911-46d9453";
import { BLOCKER_KIND, DIAGNOSTIC_STATE, clearBlocker, createBlocker, recordBlocker, recordDecision, recordDiagnostic, retireDiagnostic } from "./diagnostics.js?v=fresh-20260820-1911-46d9453";
import { settlementExtractionDefinitions } from "../content/economy/firstReachSettlements.js?v=fresh-20260820-1911-46d9453";
import { listGeneratedExtractionDefinitions } from "./settlementSeedPipeline.js?v=fresh-20260820-1911-46d9453";
import { isHubAggregated } from "./simulationMode.js?v=fresh-20260820-1911-46d9453";
import { CINDER_MINING_SEED } from "../content/economy/miningInstitutions.js?v=fresh-20260820-1911-46d9453";
import { createCommercialCraftPublicIdentity } from "./publicIdentity.js?v=fresh-20260820-1911-46d9453";
import { applyCraftUse, ensureCraftComponents, getWorstComponent, serviceCraftComponent } from "./componentCondition.js?v=fresh-20260820-1911-46d9453";
import { appendBoundedHistory } from "./boundedHistory.js?v=fresh-20260820-1911-46d9453";
import { ensureMiningOrderBook, getMiningOrderBook, getPostedMiningOrder, setMiningOrderBook } from "./miningOrderBook.js?v=fresh-20260820-1911-46d9453";

// Identity only: which hub extracts which material at which site.
//
// The authored quantity and price are gone. Both are derived per tick by
// getPostedMiningOrders from a real inventory gap and the shared valuation
// framework, and the order is withheld entirely when the hub needs nothing —
// so what remains here is not an order, it is the fact that this hub is the one
// that digs this material. The material itself is the representative member of
// the family the hub holds mining rights to.
export const STANDING_MINING_ORDERS = Object.freeze(settlementExtractionDefinitions());

export function getStandingMiningDefinitions(state = null) {
  return state ? [...STANDING_MINING_ORDERS, ...listGeneratedExtractionDefinitions(state)] : [...STANDING_MINING_ORDERS];
}

// What a worker lifts in one trip. Exported because an issuer sizes its offer
// to the carrier's capacity, and a reader showing the board has to ask the same
// question the miner asks.
export const MINING_ALLOCATION_SIZE = 6;
const EXPANSION_DEMAND_SECONDS = 12;
// Rolling fleet policy now lives in `fleetCapacity`, resolved per operator, so
// that a cautious prospector and a growth-minded contractor carry different
// amounts of steel. These were module constants applied to every mining company
// in the world, which made two carefully authored temperaments behave
// identically. Only the price of a hull stays here — it is what a ship costs,
// not how eager somebody is to buy one.
const HIRE_COST = FLEET_CAPACITY_DEFAULTS.hireCost;
const CREW_NAMES = ["One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve"];

const MINING_ISSUES = Object.freeze([
  { issueType: "structural-fatigue", requiredCapabilities: ["structural-repair", "mechanical-repair"] },
  { issueType: "tractor-field-instability", requiredCapabilities: ["tractor-field", "mechanical-repair"] },
  { issueType: "field-control-failure", requiredCapabilities: ["field-control"] },
  { issueType: "preventive-calibration", requiredCapabilities: ["field-control"] },
]);
const MINING_COMPONENT_DEFINITIONS = Object.freeze([
  { id: "structure", label: "Primary Structure", initialWearFactor: 0.35, issueType: "structural-fatigue" },
  { id: "mining-laser", label: "Mining Laser", initialWearFactor: 1, issueType: "preventive-calibration" },
  { id: "tractor-field", label: "Tractor Field", initialWearFactor: 0.65, issueType: "tractor-field-instability" },
  { id: "field-control", label: "Field Control", initialWearFactor: 0.45, issueType: "field-control-failure" },
]);
const MINING_SERVICE_PRICE = 2200;

// A severance royalty the miner owes the population whose territory it digs, for
// the mining rights that territory provides. Priced as a fraction of the ore's
// own institutional value so it scales with what is being taken rather than
// taxing a cheap crate the same as a valuable one. It is a real cost the miner
// carries into every valuation (raising its floor) and a real transfer paid to
// the site's population on delivery — never created or destroyed money.
export const MINING_ROYALTY_RATE = 0.12;
export function miningRoyaltyPerUnit(resourceId) {
  return Math.max(1, Math.round(getInstitutionalFeedstockTradeValue(resourceId) * MINING_ROYALTY_RATE));
}

// Hub-side repricing, the symmetric mirror of the freight repricer. When a hub
// posts a buy order that every idle miner refuses because it does not cover the
// cost of extracting it, the hub raises what it pays toward the cheapest miner's
// cost plus a slim margin — bounded, throttled, and gated on the hub actually
// being able to fund it. Without this, only the buyer's own inventory urgency
// pushed the price up; now a rise in what mining COSTS reaches the price too.
const MINING_REPRICE_INTERVAL_MS = 45 * 1000;
const MINING_REPRICE_MAX_MULTIPLE = 2.5;   // never above this × the ore's base value
const MINING_REPRICE_MARGIN = 0.15;        // a reason for the miner to take it, not just break even

// Largest single order a hub will place, so a big gap becomes several runs
// rather than one impossible haul.
const MAX_ORDER_UNITS = 6;
// Fallback for a settlement with nobody running it; seeded hubs all have a
// quartermaster whose traits decide how hard they chase ore.
const UNRUN_HUB_TRAITS = Object.freeze({ urgencyBias: 0.5, caution: 0.5, growthBias: 0.3 });

// The orders a hub is actually offering right now.
//
// An order exists only because the hub has a real gap between what it holds
// (plus what is already coming) and what its population's consumption requires.
// No gap, no order. Price comes from the shared valuation framework, so a hub
// short of material bids up and one that is comfortable does not.
export function getPostedMiningOrders(state, at = Date.now()) {
  const posted = {};
  getStandingMiningDefinitions(state).forEach((definition) => {
    if (isHubAggregated(state, definition.buyerInstitutionId)) return;
    const family = getResourceFamily(definition.resourceId);
    const position = getInventoryPosition(state, definition.buyerInstitutionId, family);
    if (position.gap <= 0) return;

    const buyer = state.logistics?.institutions?.[definition.buyerInstitutionId];
    if (!buyer) return;
    const valuation = evaluateProcurement({
      itemId: definition.resourceId,
      baseUnitPrice: getInstitutionalFeedstockTradeValue(definition.resourceId),
      marketUnitValue: getInstitutionalFeedstockTradeValue(definition.resourceId),
      urgency: urgencyFromCoverage(position),
      inventory: position,
      requestedUnits: Math.min(position.gap, MAX_ORDER_UNITS),
      account: buyer.accounts?.operating ?? {},
      policy: { protectedCash: getActorProtectedCash(state, definition.buyerInstitutionId) },
      traits: getActorTraits(state, definition.buyerInstitutionId, UNRUN_HUB_TRAITS),
    });
    // An unaffordable order is withheld rather than posted and left to drain
    // the treasury. The hub's own diagnostic explains the shortfall.
    if (!valuation.affordable) {
      posted[definition.id] = { ...definition, amount: 0, withheld: "buyer-cannot-fund", valuation, inventory: position, at };
      return;
    }
    const units = valuation.metrics.units;
    // A prior round of "no miner will extract this at that price" may have raised
    // the standing buy price toward the miners' cost — the symmetric mirror of
    // the freight repricer. It lives as a per-order rate the hub carries, so the
    // posted price is the higher of what urgency alone recommends and what the
    // market has already had to clear at. It still cannot exceed spendable cash:
    // if the world has moved against a stale override, fall back to the price the
    // hub can actually honour.
    const override = state.miningOrderRates?.[definition.id]?.rate ?? 0;
    let paymentPerUnit = Math.max(valuation.recommendedPrice, override);
    if (paymentPerUnit > valuation.recommendedPrice) {
      const spendable = (buyer.accounts?.operating?.balance ?? 0) - getActorProtectedCash(state, definition.buyerInstitutionId);
      if (units * paymentPerUnit > spendable) paymentPerUnit = valuation.recommendedPrice;
    }
    posted[definition.id] = {
      ...definition,
      amount: units,
      paymentPerUnit,
      valuation, inventory: position, withheld: null, at,
    };
  });
  return posted;
}

// Orders a supplier can actually take: posted, funded, and still wanted.
export function getOfferedMiningOrders(state, at = Date.now()) {
  return Object.values(getPostedMiningOrders(state, at)).filter((order) => !order.withheld && order.amount > 0);
}

// A hub may only commission extraction for the families it holds mining rights
// to. This defers entirely to the shared rule checker — no hub is named here,
// and moving a family between hubs is a data edit in the authority seeds.
function mayCommissionExtraction(state, order, at) {
  return canActorDoAction(state, {
    actorId: order.buyerInstitutionId.startsWith("institution:") ? order.buyerInstitutionId : `institution:${order.buyerInstitutionId}`,
    action: "mine",
    placeId: `hub:${order.siteId}`,
    resourceType: order.resourceId,
    at,
  });
}

// The settlements' own extraction demand, as an offer source.
//
// A pure function of (state, context) — nothing about it is privileged. A farm,
// a fourth settlement or the player becomes another issuer by registering its
// own source, with no change here or in the miner.
export function hubStandingOfferSource(state, context = {}) {
  const at = context.at ?? Date.now();
  return getOfferedMiningOrders(state, at)
    .filter((order) => {
      const decision = mayCommissionExtraction(state, order, at);
      context.noteRightsDenial?.(order, decision);
      if (!decision.allowed) return false;
      // Exclusivity is the surface's job, not this issuer's.
      const buyer = state.logistics?.institutions?.[order.buyerInstitutionId];
      return (buyer?.accounts?.operating?.balance ?? 0) >= order.amount * order.paymentPerUnit;
    })
    .map((order) => createExtractionOffer({
      id: order.id,
      issuerInstitutionId: order.buyerInstitutionId,
      siteId: order.siteId, siteName: order.siteName,
      resourceId: order.resourceId, resourceName: order.resourceName,
      amount: order.amount, paymentPerUnit: order.paymentPerUnit,
      // A settlement buys exactly what it asked for; there is no remainder.
      harvestTarget: order.amount, sellsSurplus: false,
      kind: "standing",
      source: { system: "miningOperation", record: "postedOrder" },
    }));
}

// SPRC registers its own work from `sprcOperation.js`. Nothing about it is
// known here any more.

// Requires state: the definitions carry no quantity or price any more, so a
// job can only be built from what a hub is actually posting right now.
export function getStandingMiningJobsForSite(siteId, issuer = null, state = null) {
  if (!state) return [];
  return getStandingMiningJobsFrom(getOfferedMiningOrders(state), siteId, issuer);
}

function getStandingMiningJobsFrom(orders, siteId, issuer = null) {
  return orders.filter((order) => order.siteId === siteId).map((order) => ({
    id: `player-${order.id}`,
    opportunityId: order.id,
    acceptanceSiteId: order.siteId,
    type: "resource-delivery",
    group: "standing-mining",
    jobKind: "mining",
    repeatable: true,
    jobTier: "standing",
    jobTierLabel: "Open Extraction",
    title: `${order.resourceName} for ${order.siteName}`,
    issuer: issuer ?? order.siteName,
    summary: `${order.siteName} is buying ${order.amount} units of ${order.resourceName} right now. The order closes when its stores are full or it cannot fund the buy.`,
    terms: { resourceType: order.resourceId, resourceName: order.resourceName, amount: order.amount, destinationSiteId: order.siteId, destinationName: order.siteName, acceptanceSiteId: order.siteId, opportunityId: order.id, standingMiningOrderId: order.id },
    reward: { credits: order.amount * order.paymentPerUnit },
    clauses: ["This order is shared with licensed independent and institutional miners.", "Only real collected material is accepted.", `Deliver at ${order.siteName} while the order is open; it may pause when the hub is stocked or short of cash.`],
  }));
}

// Bring the world's order book up to date. The OBSERVE step of the mining
// tick: the clock runs it once for everybody before any company decides, so
// every reader — the job board, hub inventory, both companies — sees the same
// board. See `miningOrderBook` for why the store lives in its own module.
export function refreshMiningOrderBook(state, at = Date.now()) {
  return setMiningOrderBook(state, getPostedMiningOrders(state, at), at);
}

// The live board, preferring the book but falling back to computing it. Without
// the fallback, settling a delivery would silently depend on the observe step
// having run first.
function resolvePostedOrder(state, orderId) {
  return getPostedMiningOrder(state, orderId) ?? getPostedMiningOrders(state)[orderId] ?? null;
}

export function settleStandingMiningOrder({ state, orderId, resourceId, amount, supplierAccount = null, referenceId = null, now = Date.now() }) {
  const order = getStandingMiningDefinitions(state).find((candidate) => candidate.id === orderId);
  const posted = resolvePostedOrder(state, orderId);
  // Accept up to what the hub is actually asking for. Using the authored
  // reference amount here would leave a supplier that brought the requested
  // load dumping the remainder as cheap surplus.
  const accepting = posted && !posted.withheld ? posted.amount : 0;
  const delivered = Math.min(Math.max(0, amount ?? 0), accepting);
  const buyer = state.logistics?.institutions?.[order?.buyerInstitutionId];
  if (!order || !buyer || order.resourceId !== resourceId || delivered <= 0) return null;
  // Pay the rate the hub is currently posting. A delivery against an accepted
  // contract is still honoured at the reference price when the hub has since
  // withdrawn the order, so a supplier is never stiffed for arriving late.
  const unitPrice = posted.paymentPerUnit;
  const payment = delivered * unitPrice;
  if ((buyer.accounts.operating.balance ?? 0) < payment) return null;
  buyer.inventories[resourceId] = (buyer.inventories[resourceId] ?? 0) + delivered;
  buyer.accounts.operating.balance -= payment;
  // Book what the hub actually paid for this ore. Without it the hub's cost
  // basis stays zero, so anything it builds from the ore looks like it cost
  // only the conversion fee and it cannot price its own goods honestly.
  recordAcquisition(state, {
    institutionId: buyer.id, itemId: resourceId, units: delivered,
    totalCost: payment, source: "standing-mining-order", at: now,
  });
  let royalty = 0;
  if (supplierAccount) {
    supplierAccount.balance += payment;
    supplierAccount.transactions?.push({ id: `MIN-TX-${referenceId ?? now}`, at: now, type: "mining-income", amount: payment, balance: supplierAccount.balance, referenceId });
    // The rights royalty is only real when there is both an institutional miner
    // to owe it and a population to receive it — otherwise nothing is debited,
    // so no money is ever created or lost by settling a delivery.
    royalty = payMiningRoyalty(state, { order, delivered, supplierAccount, referenceId, now });
  }
  return { order, buyer, delivered, payment, unitPrice, royalty };
}

// The severance transfer: the institutional miner pays the site's population for
// the mining rights its territory provides. A pure transfer between two tracked
// treasuries — the miner's account and the population's household cash — so the
// world's money total is unchanged. It is deliberately NOT capped by the
// population's income cap: that cap is a valve on credit CREATION (the faucet),
// not a ceiling on wealth a population has genuinely earned.
function payMiningRoyalty(state, { order, delivered, supplierAccount, referenceId, now }) {
  const population = Object.values(state.population?.populations ?? {})
    .find((record) => record.hubInstitutionId === order.buyerInstitutionId || record.siteId === order.siteId);
  if (!population) return 0;
  const royalty = delivered * miningRoyaltyPerUnit(order.resourceId);
  if (royalty <= 0) return 0;

  const minerBefore = supplierAccount.balance;
  const populationBefore = population.householdCash;
  supplierAccount.balance -= royalty;
  population.householdCash += royalty;
  population.totalRoyaltyReceived = (population.totalRoyaltyReceived ?? 0) + royalty;
  supplierAccount.transactions?.push({ id: `ROY-TX-${referenceId ?? now}`, at: now, type: "mining-royalty", amount: -royalty, balance: supplierAccount.balance, referenceId });

  state.ledger.recordEvent("population.miningRoyaltyPaid", {
    populationId: population.id, populationName: population.name,
    payerInstitutionId: order.buyerInstitutionId, siteId: order.siteId,
    resourceId: order.resourceId, units: delivered, amount: royalty,
    minerCashBefore: Math.round(minerBefore), minerCashAfter: Math.round(supplierAccount.balance),
    populationCashBefore: Math.round(populationBefore), populationCashAfter: Math.round(population.householdCash),
    totalRoyaltyReceived: Math.round(population.totalRoyaltyReceived),
  }, { visible: true, message: `${population.name} received ${royalty} cr in mining royalties for ${delivered} ${order.resourceName} taken from its territory.` });
  return royalty;
}

// Whether a standing order will accept a delivery right now, and if not, why.
// Two distinct causes are collapsed into a single `available` elsewhere, but a
// hub that is simply full ("buyer-not-buying") is not the same as one that wants
// the material and cannot pay ("buyer-cannot-fund"). Callers surface the reason
// so the player is told the truth instead of a blanket "cannot fund".
export function getStandingMiningOrderAvailability({ state, orderId, amount = null }) {
  const order = getStandingMiningDefinitions(state).find((candidate) => candidate.id === orderId);
  const buyer = state.logistics?.institutions?.[order?.buyerInstitutionId];
  if (!order || !buyer) return { available: false, reason: "order-missing" };
  const posted = resolvePostedOrder(state, orderId);
  // No posted order at all means the hub's inventory gap has closed — it is
  // stocked, not broke, so it has simply stopped buying.
  if (!posted) return { available: false, reason: "buyer-not-buying" };
  // An unaffordable order IS posted, but withheld with amount 0. Name the cash
  // shortfall before falling through to the stocked case.
  if (posted.withheld) return { available: false, reason: "buyer-cannot-fund" };
  if ((posted.amount ?? 0) <= 0) return { available: false, reason: "buyer-not-buying" };
  const units = Math.min(Math.max(0, amount ?? posted.amount), posted.amount);
  if ((buyer.accounts.operating.balance ?? 0) < units * posted.paymentPerUnit) {
    return { available: false, reason: "buyer-cannot-fund" };
  }
  return { available: true, reason: null };
}

export function canFundStandingMiningOrder({ state, orderId, amount = null }) {
  return getStandingMiningOrderAvailability({ state, orderId, amount }).available;
}

export function createMiningOperation({ state, game, sprcOperation = null, now = () => Date.now(), seed = CINDER_MINING_SEED }) {
  state.miningOperations ??= {};
  const legacy = seed === CINDER_MINING_SEED ? state.miningOperation : null;
  const operation = state.miningOperations[seed.stateKey] ??= legacy ?? createInitialState(now(), seed);
  if (seed === CINDER_MINING_SEED) state.miningOperation = operation;
  operation.ships ??= {};
  operation.allocations ??= {};
  operation.completedContracts ??= 0;
  operation.wear ??= 0;
  operation.lastMaintenanceEventId ??= 0;
  operation.depositKnowledge ??= {};
  operation.rightsDenied ??= {};
  ensureMiningOrderBook(state);
  // The settlements' demand becomes visible on the board because this operation
  // exists to serve it, not because the board knows what a settlement is.
  registerExtractionOfferSource(state, "hub-standing-orders", hubStandingOfferSource);
  // And this company enters the shared clearing as a bidder. Which orders its
  // ships get is decided against every other company's ships in one ranking,
  // not by whichever operation's `update()` runs first.
  registerExtractionMarketParticipant(state, operation.institution.id, () => listBidders());
  operation.projects ??= seed.expansionProject ? { [seed.expansionProject.id]: { ...seed.expansionProject, status: "planned", demandSince: null, approvedAt: null, completedAt: null } } : {};
  seed.workers.forEach((defaults) => {
    operation.ships[defaults.id] ??= createWorkerRecord(defaults, seed.institution.id);
    operation.ships[defaults.id].capabilities ??= { miningLaser: true, cargoCollector: true, tractorField: { powered: true, powerSource: "evergreen" } };
    operation.ships[defaults.id].maintenanceStatus ??= "available";
    operation.ships[defaults.id].issueCount ??= 0;
    operation.ships[defaults.id].pendingIssue ??= null;
    ensureCraftComponents(operation.ships[defaults.id], MINING_COMPONENT_DEFINITIONS, {
      initialWear: operation.ships[defaults.id].wear ?? defaults.initialWear ?? 0,
    });
    operation.ships[defaults.id].wear = operation.ships[defaults.id].aggregateWear;
  });
  const sites = new Map(game.worldSites.map((site) => [site.id, site]));
  seedDepositKnowledge();
  const workers = [];
  Object.values(operation.ships).forEach((shipRecord) => addPhysicalWorker(shipRecord));

  function addPhysicalWorker(shipRecord) {
    const defaults = [...seed.workers, ...(seed.expansionWorker ? [seed.expansionWorker] : [])].find((entry) => entry.id === shipRecord.id)
      ?? { offset: { x: 0, y: 0 } };
    const home = sites.get(shipRecord.currentSiteId) ?? sites.get(seed.homeSiteId) ?? sites.get("scrap-porch");
    const worker = new MiningWorkerShip({
      id: shipRecord.id,
      name: shipRecord.name,
      institutionId: shipRecord.ownerInstitutionId,
      controllerInstitutionId: operation.institution.controllerInstitutionId,
      publicIdentity: createCommercialCraftPublicIdentity({
        ship: shipRecord,
        owner: operation.institution,
        operator: operation.controller,
        registeredHubIds: game.worldSites.filter((site) => site.type === "hub").map((site) => site.id),
        authorizedActivities: ["mining", "tractor-recovery", "transport-own-cargo"],
      }),
      palette: seed.shipPalette,
      x: shipRecord.position?.x ?? home.position.x + defaults.offset.x,
      y: shipRecord.position?.y ?? home.position.y + defaults.offset.y,
      onEvent: (type, payload) => recordWorkerEvent(shipRecord, type, payload),
      onDelivery: completeDelivery,
    });
    game.addWorkerShip(worker);
    workers.push(worker);
    return worker;
  }

  // ── The tick, in phases ─────────────────────────────────────────────────
  //
  // Every step keeps the exact position it held before. See `worldClock`.

  // What has become true since last tick: what the hubs are asking for, and
  // which of this company's craft came back from service or took damage.
  //
  // The refresh is redundant on the clock path — `mining-orders` already fills
  // the book in OBSERVE, ahead of both companies — and it stays here anyway,
  // because a bare `update()` has to remain a complete tick and that is how
  // every test drives this module. It costs about a third of a millisecond.
  function observe() {
    pruneCompletedAllocations();
    refreshPostedOrders();
    consumeMaintenanceEvents();
  }

  function pruneCompletedAllocations() {
    const completed = Object.values(operation.allocations)
      .filter((allocation) => allocation.status === "completed")
      .sort((first, second) => (first.completedAt ?? first.acceptedAt ?? 0) - (second.completedAt ?? second.acceptedAt ?? 0));
    completed.slice(0, Math.max(0, completed.length - 40))
      .forEach((allocation) => { delete operation.allocations[allocation.id]; });
  }

  function decide() {
    assessExpansion();
    assessFleetCapacity();
    publishFleetDiagnostic();
    // Every idle ship in the world, ranked against every open offer, before
    // this company dispatches anybody. What comes back for its own ships was
    // decided against the competition's bids, so nothing below depends on the
    // order these operations update.
    const round = clearExtractionMarket(state, offerContext());
    workers.forEach((worker) => {
      const shipRecord = operation.ships[worker.id];
      shipRecord.position = { x: worker.position.x, y: worker.position.y };
      shipRecord.status = worker.state;
      shipRecord.cargo = { ...worker.cargo };
      // Keep the generic craft diagnostic complete regardless of which branch
      // below owns the worker's current status. Institution cards discover
      // their representative machinery through this shared record.
      recordWorkerIdentity(worker, shipRecord);
      if (shipRecord.maintenanceStatus !== "available") return;
      // Non-preemptive by design: a worker keeps its commitment until the
      // delivery completes. Only idle workers reconsider.
      if (worker.assignment || worker.marketVisit) return;
      const won = round.assignments[worker.id] ?? null;
      const order = won?.offer ?? null;
      if (!order) { publishIdleDecision(shipRecord, round); return; }
      const destination = sites.get(order.siteId)?.position;
      if (!destination) {
        recordWorkerIdentity(worker, shipRecord);
        recordBlocker(state, worker.id, createBlocker({
          kind: BLOCKER_KIND.NO_ROUTE,
          summary: `${worker.name} picked ${order.id} but ${order.siteId} is not a known destination`,
          subjectId: worker.id,
          objectId: order.siteId,
          waitingFor: "a reachable destination for the chosen order",
          wakeOn: ["order-posted"],
          at: now(),
        }), { state: DIAGNOSTIC_STATE.WAITING, at: now() });
        return;
      }
      const acceptanceSiteId = order.acceptanceSiteId ?? order.siteId;
      if (shipRecord.currentSiteId !== acceptanceSiteId
        || Math.hypot(worker.position.x - destination.x, worker.position.y - destination.y) > 150) {
        if (worker.visitMarket({ destination, destinationSiteId: acceptanceSiteId, offerId: order.id })) {
          shipRecord.status = "market-reposition";
          recordDiagnostic(state, worker.id, {
            actorName: worker.name, actorKind: "ship", controllerId: operation.institution.id,
            state: DIAGNOSTIC_STATE.WORKING,
            summary: `Travelling to ${order.siteName} to accept ${order.id}`,
            locationSiteId: shipRecord.currentSiteId,
            position: { x: Math.round(worker.position.x), y: Math.round(worker.position.y) },
            refs: { contractIds: [], targetIds: [acceptanceSiteId], dependencyIds: [order.id] },
          }, now());
        }
        return;
      }
      const allocation = {
        id: `allocation:${order.id}:${++operation.counter}`,
        orderId: order.id,
        orderKind: order.kind ?? "standing",
        supplierInstitutionId: operation.institution.id,
        workerShipId: worker.id,
        amount: order.amount,
        equivalentAmount: order.equivalentAmount ?? order.amount,
        // What was promised and where it goes. A commitment that cannot say
        // this is not readable on its own, and the intention adapter had to
        // reach back into the offer to describe it.
        resourceId: order.resourceId,
        destinationSiteName: order.siteName,
        contractId: order.contractId ?? null,
        status: "active",
        acceptedAt: now(),
      };
      // The issuer's last chance to hold these units, if it asked for one. A
      // refusal here means somebody else took them between valuing and
      // committing — not that this kind of order is special.
      if (order.reserve) {
        const reservation = order.reserve({ minerInstitutionId: operation.institution.id, workerShipId: worker.id });
        if (!reservation) {
          // The best-valued order is already fully reserved by other suppliers.
          // Without this the worker would sit silently idle with no explanation.
          recordWorkerIdentity(worker, shipRecord);
          recordBlocker(state, worker.id, createBlocker({
            kind: BLOCKER_KIND.ORDER_FULLY_ALLOCATED,
            summary: `${worker.name} wanted ${order.id} but every unit on it is already reserved`,
            subjectId: worker.id,
            objectId: order.id,
            waitingFor: "units to free up on the order, or a better-paying alternative",
            wakeOn: ["allocation-released", "order-posted", "order-repriced"],
            detail: { orderId: order.id, requestedEquivalents: order.equivalentAmount },
            at: now(),
          }), { state: DIAGNOSTIC_STATE.WAITING, at: now() });
          return;
        }
      }
      operation.allocations[allocation.id] = allocation;
      // This company's record of the last choice it actually made, kept where it
      // always was even though the ranking now happens in the shared market.
      operation.lastSelection = {
        workerShipId: worker.id,
        chosenOrderId: order.id,
        netValue: Math.round(won.netValue),
        reasons: won.reasons ?? [],
        rejected: won.rejected ?? [],
        at: now(),
      };
      shipRecord.lastDecisionKey = null;
      worker.assign({
        allocationId: allocation.id, contractId: order.contractId ?? order.id, resourceId: order.resourceId, quantity: order.amount, destination,
        destinationSiteId: order.siteId,
        harvestTargetQuantity: order.harvestTarget ?? order.amount,
        depositCandidates: getDepositCandidates(order.resourceId, worker.position),
      });
      // Diagnostics: this actor is now committed, and we keep why it chose this
      // job over the alternatives it weighed.
      recordDiagnostic(state, worker.id, {
        actorName: worker.name,
        actorKind: "ship",
        controllerId: operation.institution.id,
        state: DIAGNOSTIC_STATE.COMMITTED,
        summary: `Mining ${order.amount} ${order.resourceName} for ${order.siteName}`,
        locationSiteId: null,
        position: { x: Math.round(worker.position.x), y: Math.round(worker.position.y) },
        // The shared record, not a second shape describing the same thing.
        intention: adaptMiningAllocation(allocation, { worker, shipRecord }),
        blocker: null,
        waitingFor: null,
        wakeOn: ["delivery.completed", "ship-disabled"],
        nextReconsiderAt: null,
        refs: { contractIds: [order.contractId ?? order.id], targetIds: [order.siteId], dependencyIds: [] },
      }, now());
      recordDecision(state, worker.id, {
        chosen: { id: order.id, label: `${order.resourceName} → ${order.siteName}`, score: Math.round(won.netValue) },
        alternatives: (won.rejected ?? []).map((entry) => ({
          id: entry.orderId,
          label: entry.orderId,
          score: entry.netValue,
          rejectedBecause: `lower net value (${entry.netValue} vs ${Math.round(won.netValue)})`,
        })),
        reasons: won.reasons ?? [],
        at: now(),
      });
      state.ledger.recordEvent("institution.jobValued", {
        institutionId: operation.institution.id, shipInstitutionId: worker.id, shipName: worker.name,
        chosenOrderId: order.id, netValue: Math.round(won.netValue),
        runnerUpOrderId: won.rejected?.[0]?.orderId ?? null, runnerUpNetValue: won.rejected?.[0]?.netValue ?? null,
        // What the ranking it won was up against, so a reader can tell a
        // one-bidder walkover from a contested order.
        marketBidders: round.bidderCount, marketOffers: round.offerCount,
        reasons: won.reasons ?? [],
      }, { visible: false });
      record("mining.contractAccepted", `${operation.controller.name} dispatched ${worker.name} for ${order.amount} ${order.resourceName} at ${order.siteName}.`, { orderId: order.id, allocationId: allocation.id, siteId: order.siteId, resourceId: order.resourceId, quantity: order.amount, shipInstitutionId: worker.id, shipName: worker.name });
      fillCompatiblePortfolio(worker, order.siteId);
    });
    repriceUnfilledMiningOrders(round);
  }

  // One whole tick. The clock drives the phases separately; every test and the
  // boot sequence drives this.
  function update() {
    observe();
    decide();
  }

  // Symmetric to the freight repricer. After the market has cleared, any posted
  // order that this operation's idle miners ALL refuse — because it does not
  // cover the cost of extracting it — is a hub underpaying for work nobody will
  // take. Raise what it offers toward the cheapest refusing miner's cost plus a
  // slim margin: bounded, throttled, and only when the hub can fund it. This is
  // the missing half of cost pass-through on the mining side — before it, only
  // the buyer's own inventory urgency could lift the price, never a rise in what
  // extraction actually costs.
  function repriceUnfilledMiningOrders(round) {
    state.miningOrderRates ??= {};
    const idleWorkers = workers.filter((worker) => {
      const shipRecord = operation.ships[worker.id];
      return shipRecord?.maintenanceStatus === "available" && !worker.assignment && !worker.marketVisit;
    });
    // With no idle capacity here, an unfilled order says nothing about price —
    // these miners are simply busy. Leave repricing to whoever has a free ship.
    if (idleWorkers.length === 0) return;
    const claimed = new Set(Object.values(round.assignments).map((entry) => entry.offer?.id).filter(Boolean));

    Object.values(getMiningOrderBook(state)).forEach((order) => {
      if (order.withheld || !(order.amount > 0) || claimed.has(order.id)) return;
      const valuations = idleWorkers.map((worker) => valueOrderForWorker(order, worker.position));
      // One idle miner willing to take it means it is not underpriced — it will
      // be taken. Only a unanimous refusal is evidence the price is too low.
      if (valuations.some((valuation) => valuation.acceptable)) return;
      const minFloor = Math.min(...valuations.map((valuation) => valuation.minAcceptablePrice));
      raiseMiningOrder(order, minFloor);
    });
  }

  function raiseMiningOrder(order, minerCostFloor) {
    // `repricedAt: null` means "never repriced" and is always eligible, so a
    // fresh order can be raised at once regardless of the clock's magnitude —
    // rather than depending on now() being a real wall-clock timestamp.
    const entry = state.miningOrderRates[order.id] ??= { rate: 0, repricedAt: null };
    if (entry.repricedAt != null && now() - entry.repricedAt < MINING_REPRICE_INTERVAL_MS) return;
    entry.repricedAt = now();
    const current = order.paymentPerUnit;
    const ceiling = Math.round(getInstitutionalFeedstockTradeValue(order.resourceId) * MINING_REPRICE_MAX_MULTIPLE);
    // The miner's cost spread over the load, plus a margin so taking the run
    // beats sitting idle. Capped so a hub never chases an impossible cost to ruin.
    const target = Math.min(ceiling, Math.ceil((minerCostFloor / order.amount) * (1 + MINING_REPRICE_MARGIN)));
    if (target <= current) return;   // only ever raise, and never a no-op
    const buyer = state.logistics?.institutions?.[order.buyerInstitutionId];
    const spendable = (buyer?.accounts?.operating?.balance ?? 0) - getActorProtectedCash(state, order.buyerInstitutionId);
    if (order.amount * target > spendable) {
      state.ledger.recordEvent("institution.miningOrderRepriceDeferred", {
        institutionId: order.buyerInstitutionId, orderId: order.id, siteId: order.siteId,
        resourceId: order.resourceId, wantedUnitPrice: target, previousUnitPrice: current, spendable: Math.round(spendable),
      }, { visible: false });
      return;
    }
    entry.rate = target;
    state.ledger.recordEvent("institution.miningOrderRepriced", {
      institutionId: order.buyerInstitutionId, orderId: order.id, siteId: order.siteId,
      resourceId: order.resourceId, resourceName: order.resourceName,
      previousUnitPrice: current, unitPrice: target, minerCostFloor: Math.round(minerCostFloor),
      reasons: [`No idle miner would extract ${order.resourceName} for ${siteName(order.siteId)} at ${current} cr/unit; serving it costs about ${Math.round(minerCostFloor)} cr for ${order.amount} units.`],
    }, { visible: true, message: `${siteName(order.siteId)} raises ${order.resourceName} to ${target} cr/unit — no miner will extract it at ${current}.` });
  }

  // Once a ship wins a trip, it may fill otherwise empty hold space with work
  // going to the same destination. Each order remains an independent public
  // allocation and settlement; this only consolidates the physical expedition.
  function fillCompatiblePortfolio(worker, destinationSiteId) {
    while (worker.remainingCargoCapacity > 0) {
      const context = offerContext();
      const candidate = filterUncommittedOffers(listExtractionOffers(state, context), context.allocations)
        .filter((offer) => offer.siteId === destinationSiteId)
        .filter((offer) => !worker.commitments.some((entry) => entry.resourceId === offer.resourceId))
        .filter((offer) => (offer.harvestTarget ?? offer.amount) <= worker.remainingCargoCapacity)
        .map((offer) => ({ offer, valuation: valueOrderForWorker(offer, worker.position) }))
        .filter((entry) => entry.valuation.acceptable)
        .sort((a, b) => b.valuation.metrics.netValue - a.valuation.metrics.netValue)[0];
      if (!candidate) return;

      const order = candidate.offer;
      const destination = sites.get(order.siteId)?.position;
      if (!destination) return;
      if (order.reserve && !order.reserve({ minerInstitutionId: operation.institution.id, workerShipId: worker.id })) return;

      const allocation = {
        id: `allocation:${order.id}:${++operation.counter}`,
        orderId: order.id,
        orderKind: order.kind ?? "standing",
        supplierInstitutionId: operation.institution.id,
        workerShipId: worker.id,
        amount: order.amount,
        equivalentAmount: order.equivalentAmount ?? order.amount,
        resourceId: order.resourceId,
        destinationSiteName: order.siteName,
        contractId: order.contractId ?? null,
        status: "active",
        acceptedAt: now(),
        portfolioPosition: worker.commitments.length,
      };
      operation.allocations[allocation.id] = allocation;
      const accepted = worker.assign({
        allocationId: allocation.id,
        contractId: order.contractId ?? order.id,
        resourceId: order.resourceId,
        quantity: order.amount,
        destination,
        destinationSiteId: order.siteId,
        harvestTargetQuantity: order.harvestTarget ?? order.amount,
        depositCandidates: getDepositCandidates(order.resourceId, worker.position),
      });
      if (!accepted) {
        allocation.status = "released";
        allocation.releasedAt = now();
        allocation.outcomeReason = "portfolio-rejected";
        return;
      }
      record("mining.contractBundled", `${worker.name} added ${order.amount} ${order.resourceName} for ${order.siteName} to the same expedition.`, {
        orderId: order.id, allocationId: allocation.id, siteId: order.siteId,
        resourceId: order.resourceId, quantity: order.amount,
        shipInstitutionId: worker.id, shipName: worker.name,
        portfolioSize: worker.commitments.length,
        remainingCapacity: worker.remainingCargoCapacity,
      });
    }
  }

  // Compare every candidate job by EXPECTED NET VALUE — payout minus travel,
  // wear, and risk — instead of a hidden priority constant. Urgent SPRC work
  // wins here because Sal bids the price up, and the reasons are inspectable.
  // Identity fields every worker diagnostic needs, so a blocker written from any
  // path still names who is stuck and who controls them.
  function recordWorkerIdentity(worker, shipRecord) {
    recordDiagnostic(state, worker.id, {
      actorName: worker.name ?? shipRecord?.name ?? worker.id,
      actorKind: "ship",
      controllerId: operation.institution.id,
      locationSiteId: shipRecord?.currentSiteId ?? null,
      position: { x: Math.round(worker.position.x), y: Math.round(worker.position.y) },
      detail: {
        referenceId: shipRecord?.referenceId ?? null,
        aggregateWear: shipRecord?.wear ?? 0,
        components: shipRecord?.components ?? {},
      },
    }, now());
  }

  // The mining institution's own explanation. Blocker chains from hubs and
  // carriers point here, so this must say why its fleet is not supplying them.
  function publishFleetDiagnostic() {
    const ships = Object.values(operation.ships);
    const committed = workers.filter((worker) => worker.assignment).length;
    const inService = ships.filter((ship) => ship.maintenanceStatus !== "available").length;
    const idle = ships.length - committed - inService;
    const account = operation.institution.accounts.operating;

    let blocker = null;
    let actorState = committed > 0 ? DIAGNOSTIC_STATE.WORKING : DIAGNOSTIC_STATE.FREE;
    let summary = `${committed}/${ships.length} ship(s) working, ${idle} idle, ${inService} in service`;

    if (committed === ships.length && ships.length > 0) {
      actorState = DIAGNOSTIC_STATE.WORKING;
      summary = `All ${ships.length} ships are committed elsewhere`;
      blocker = createBlocker({
        kind: BLOCKER_KIND.ALL_SUPPLIERS_COMMITTED,
        summary: `Every ${seed.fleetName} ship is committed; those jobs currently have higher net value`,
        subjectId: operation.institution.id,
        waitingFor: "a ship to finish its run",
        wakeOn: ["delivery.completed", "order-repriced"],
        // The workers themselves explain what they chose and why.
        causedBy: workers.filter((worker) => worker.assignment).slice(0, 3).map((worker) => ({ actorId: worker.id })),
        detail: { fleetSize: ships.length, committed, idle, inService },
        at: now(),
      });
    } else if (idle > 0) {
      actorState = DIAGNOSTIC_STATE.WAITING;
      summary = `${idle} ship(s) idle with nothing worth taking`;
      const idleWorker = workers.find((worker) => !worker.assignment && operation.ships[worker.id]?.maintenanceStatus === "available");
      blocker = createBlocker({
        kind: BLOCKER_KIND.NO_ELIGIBLE_WORK,
        summary: `${idle} ${seed.fleetName} ship(s) have no order worth their cost`,
        subjectId: operation.institution.id,
        waitingFor: "an order that clears cost",
        wakeOn: ["order-posted", "order-repriced"],
        causedBy: idleWorker ? [{ actorId: idleWorker.id }] : [],
        detail: { fleetSize: ships.length, committed, idle, inService },
        at: now(),
      });
    }

    recordDiagnostic(state, operation.institution.id, {
      actorName: operation.institution.name,
      actorKind: "institution",
      controllerId: operation.controller?.id ?? operation.institution.controllerInstitutionId,
      state: actorState,
      summary,
      blocker,
      waitingFor: blocker?.waitingFor ?? null,
      wakeOn: blocker?.wakeOn ?? ["order-posted"],
      nextReconsiderAt: null,
      refs: { targetIds: ships.map((ship) => ship.id), contractIds: [], dependencyIds: [] },
      detail: {
        cash: Math.round(account.balance ?? 0),
        availableCash: Math.round(Math.max(0, (account.balance ?? 0) - getActorProtectedCash(state, operation.institution.id))),
        protectedCash: getActorProtectedCash(state, operation.institution.id),
        fleetSize: ships.length,
        committed,
        idle,
        inService,
        completedContracts: operation.completedContracts,
        maintenanceCost: Math.round(getServiceCost(state, operation.institution.id, "maintenance", 0)) || null,
      },
    }, now());
  }

  // Bring the world's order book up to date before this company decides.
  //
  // The clock also runs this in OBSERVE, once, ahead of everybody — but that is
  // not a reason to drop it here. The board genuinely CHANGES as work is
  // claimed: an allocation counts as incoming against the buying hub's gap, so
  // an order Cinder has just taken should not still be on the board when Flint
  // looks. Re-observing after the previous company has committed is what keeps
  // the second one from bidding on work that no longer exists.
  //
  // What the OBSERVE pass buys is a coherent board for READERS — the public job
  // board, hub inventory, diagnostics — at the top of every tick, rather than
  // whatever the last company to update happened to leave behind. One board,
  // not one derivation.
  //
  // It also keeps a bare `update()` a complete tick, which is how every test
  // drives this module.
  function refreshPostedOrders() {
    refreshMiningOrderBook(state, now());
  }

  // What this operation needs to hand an offer source so it can decide what is
  // still genuinely available: who is asking, and what is already committed.
  function offerContext() {
    const sharedAllocations = Object.assign({}, ...Object.values(state.miningOperations ?? {})
      .map((candidate) => candidate.allocations ?? {}));
    return {
      sprcOperation,
      allocations: sharedAllocations,
      minerInstitutionId: operation.institution.id,
      // What this operation can lift in one trip, so an issuer sizes its offer
      // to the carrier rather than guessing.
      harvestCapacity: MINING_ALLOCATION_SIZE,
      at: now(),
      noteRightsDenial,
    };
  }

  // What this company's ships are bidding into the shared clearing: every ship
  // that could take work right now, and how it would value any given offer.
  //
  // The valuation stays here because everything it needs is this company's —
  // its controller's temperament, what its own upkeep actually costs it, where
  // it believes the deposits are. The market only ranks what comes back.
  function listBidders() {
    return workers
      .filter((worker) => {
        const shipRecord = operation.ships[worker.id];
        if (!shipRecord || shipRecord.maintenanceStatus !== "available") return false;
        if (worker.assignment || worker.marketVisit) { shipRecord.waitingSince = null; return false; }
        // How long this ship has been available with nothing to do — the tie
        // break when two bids are worth exactly the same.
        shipRecord.waitingSince ??= now();
        return true;
      })
      .map((worker) => ({
        id: worker.id,
        name: worker.name,
        controllerId: operation.institution.id,
        waitingSince: operation.ships[worker.id].waitingSince,
        bid: (offer) => valueOrderForWorker(offer, worker.position),
      }));
  }

  // What this miner WOULD take, asked without committing it to anything.
  //
  // The live dispatch path no longer goes through here — it reads the shared
  // market round — but the question still has to be answerable on its own for
  // deliberation, diagnostics and comparative-choice displays. It evaluates
  // against the same offers and the same valuation; what it cannot tell you is
  // whether a competitor would have outbid it.
  function chooseOrder(worker = null) {
    const position = worker?.position ?? sites.get("scrap-porch")?.position ?? { x: 0, y: 0 };
    // Every issuer, in one list, minus anything a worker is already on. The
    // miner does not know who posted any of it.
    const context = offerContext();
    const candidates = filterUncommittedOffers(listExtractionOffers(state, context), context.allocations);
    if (candidates.length === 0) return null;

    const scored = candidates
      .map((order) => ({ order, valuation: valueOrderForWorker(order, position) }))
      .filter((entry) => entry.valuation.acceptable)
      .sort((first, second) => second.valuation.metrics.netValue - first.valuation.metrics.netValue);
    if (scored.length === 0) return null;

    const best = scored[0];
    operation.lastSelection = {
      workerShipId: worker?.id ?? null,
      chosenOrderId: best.order.id,
      netValue: Math.round(best.valuation.metrics.netValue),
      reasons: best.valuation.reasons,
      rejected: scored.slice(1, 4).map((entry) => ({ orderId: entry.order.id, netValue: Math.round(entry.valuation.metrics.netValue) })),
      at: now(),
    };
    // No ledger line: the dispatch path records `institution.jobValued` when it
    // actually commits a ship. Writing one here too would make asking a
    // hypothetical indistinguishable from taking the job.
    return best.order;
  }

  // Denials are recorded ONCE per order, not per evaluation: an offer source
  // runs for every idle worker every tick, and an unconditional record here
  // would flood the ledger the way the delivery rejections did.
  function noteRightsDenial(order, decision) {
    if (decision.allowed) {
      delete operation.rightsDenied[order.id];
      return;
    }
    if (operation.rightsDenied[order.id]) return;
    operation.rightsDenied[order.id] = { reason: decision.reason, at: now() };
    record("institution.miningRightDenied", `${siteName(order.siteId)} cannot post mining demand for ${order.resourceName}: ${getResourceFamily(order.resourceId)} is outside the resource families it holds mining rights for.`, {
      orderId: order.id,
      buyerInstitutionId: order.buyerInstitutionId,
      siteId: order.siteId,
      resourceId: order.resourceId,
      resourceFamily: getResourceFamily(order.resourceId),
      reason: decision.reason,
    });
  }

  function valueOrderForWorker(order, position) {
    const destination = sites.get(order.siteId)?.position ?? position;
    const deposit = getDepositCandidates(order.resourceId, position)[0] ?? null;
    // Round trip: out to the nearest known deposit, then in to the buyer.
    const toDeposit = deposit ? Math.hypot(deposit.x - position.x, deposit.y - position.y) : Math.hypot(destination.x - position.x, destination.y - position.y);
    const toBuyer = deposit ? Math.hypot(destination.x - deposit.x, destination.y - deposit.y) : 0;
    // Some issuers buy in their own equivalent units rather than in units of
    // the material, so which denomination pays is a property of the offer.
    const contractPayout = order.equivalentAmount != null
      ? order.equivalentAmount * (order.pricePerEquivalent ?? 0)
      : order.amount * (order.paymentPerUnit ?? 0);
    // Where a worker fills its hold past what the offer buys and may sell the
    // remainder into local supply, that surplus is what keeps a short order
    // worth taking. An offer that forbids it simply earns no surplus.
    const surplusUnits = order.sellsSurplus ? Math.max(0, (order.harvestTarget ?? order.amount) - order.amount) : 0;
    const surplusPayout = surplusUnits * Math.max(1, Math.floor(getInstitutionalFeedstockTradeValue(order.resourceId) * 0.7));
    const payout = contractPayout + surplusPayout;

    return evaluateMiningJob({
      jobId: order.id,
      payout,
      units: order.amount,
      travelDistance: toDeposit + toBuyer,
      // Price wear against what a service REALLY costs now, not a constant —
      // this is how a repair-price rise reaches the miner's own decisions.
      wearCostPerPoint: getServiceCost(state, operation.institution.id, "maintenance", MINING_SERVICE_PRICE),
      fixedOperatingCost: (seed.operatingCosts?.crewPayPerContract ?? 0)
        + (seed.operatingCosts?.consumablesPerContract ?? 0),
      // The rights royalty owed on everything this run would extract. Included
      // as a cost so a miner will not take a run that cannot cover it — which is
      // exactly what forces a hub short of that ore to post a higher price.
      royaltyCost: order.amount * miningRoyaltyPerUnit(order.resourceId),
      risk: 0,
      traits: operation.controller?.traits ?? {},
      policy: {},
      opportunityCost: 0,
    });
  }

  function publishIdleDecision(shipRecord, round = null) {
    // Losing an auction is not the same as finding nothing worth doing, and
    // reporting it as "no eligible work" would hide the competition entirely —
    // which is exactly the reading that made the wealth gap look like judgment.
    const outbid = getMarketOutbid(round, shipRecord.id);
    // What was on the board and what was wrong with each of it. Read off the
    // offers themselves, so a new issuer appears here without being named.
    const reasons = listExtractionOffers(state, offerContext()).map((offer) => {
      const occupied = Object.values(operation.allocations).some((allocation) => allocation.orderId === offer.id && allocation.status === "active");
      if (occupied) return `${offer.id}:allocated`;
      const balance = state.logistics?.institutions?.[offer.issuerInstitutionId]?.accounts?.operating?.balance ?? null;
      const due = offer.equivalentAmount != null ? offer.equivalentAmount * (offer.pricePerEquivalent ?? 0) : offer.amount * (offer.paymentPerUnit ?? 0);
      return `${offer.id}:${balance !== null && balance < due ? "unfunded" : "open"}`;
    });
    // Diagnostics: an idle worker records WHY nothing was worth taking, naming
    // the orders it looked at and their disposition.
    recordDiagnostic(state, shipRecord.id, {
      actorName: shipRecord.name,
      actorKind: "ship",
      controllerId: operation.institution.id,
      intention: null,
      refs: { targetIds: [], contractIds: [], dependencyIds: [] },
    }, now());
    recordBlocker(state, shipRecord.id, outbid ? createBlocker({
      kind: BLOCKER_KIND.OUTBID,
      summary: `${shipRecord.name} bid ${outbid.ownNetValue} on ${outbid.orderId}; ${outbid.winnerName ?? outbid.winnerId} took it at ${outbid.winningNetValue}`,
      subjectId: shipRecord.id,
      objectId: outbid.orderId,
      waitingFor: "an order it values more highly than the competition does",
      wakeOn: ["order-posted", "order-repriced", "allocation-released", "delivery.completed"],
      causedBy: outbid.winnerId ? [{ actorId: outbid.winnerId, note: "took the order on a higher bid" }] : [],
      detail: { ...outbid, candidates: reasons },
      at: now(),
    }) : createBlocker({
      kind: BLOCKER_KIND.NO_ELIGIBLE_WORK,
      summary: `${shipRecord.name} is idle: no mining order is both open and worth its cost`,
      subjectId: shipRecord.id,
      waitingFor: "an open order that clears its cost, or a buyer that can fund one",
      wakeOn: ["order-posted", "order-repriced", "allocation-released", "buyer-funded"],
      detail: { candidates: reasons },
      at: now(),
    }), { state: DIAGNOSTIC_STATE.WAITING, at: now() });

    const key = outbid ? `outbid:${outbid.orderId}:${outbid.winnerId}` : reasons.join("|");
    if (shipRecord.lastDecisionKey === key) return;
    shipRecord.lastDecisionKey = key;
    if (outbid) {
      record("mining.outbid", `${shipRecord.name} wanted ${outbid.orderId} but ${outbid.winnerName ?? outbid.winnerId} valued it higher (${outbid.winningNetValue} vs ${outbid.ownNetValue}).`, { shipInstitutionId: shipRecord.id, shipName: shipRecord.name, ...outbid });
      return;
    }
    record("mining.waitingForFundedWork", `${shipRecord.name} is idle: available mining orders are already allocated or their buyers cannot fund the posted price.`, { shipInstitutionId: shipRecord.id, shipName: shipRecord.name, reasons });
  }

  // How far this company looks, what it trusts, and what it goes to — all of it
  // resolved from whoever runs the company. See `depositKnowledge`.
  function prospectingPolicy() {
    return resolveProspectingPolicy(state, operation.institution.id);
  }

  function seedDepositKnowledge() {
    if (Object.keys(operation.depositKnowledge).length > 0 || !game.resourceField) return;
    const chunkSize = game.canvas?.width ?? 1200;
    const policy = prospectingPolicy();
    sites.forEach((site) => {
      getOreClusterSeedsInRadius(site.position.x, site.position.y, policy.surveyRadius, chunkSize, game.resourceField).forEach((seed) => {
        const deposit = createSurveyedDeposit({ x: seed.x, y: seed.y, resourceId: seed.resourceId, policy, at: now() });
        rememberSurveyedDeposit(operation.depositKnowledge, deposit);
      });
    });
  }

  function getDepositCandidates(resourceId, position) {
    return rankDepositCandidates({
      knowledge: operation.depositKnowledge,
      resourceId,
      position,
      policy: prospectingPolicy(),
    });
  }

  // Hire when work is being turned away, let a ship go when it plainly is not
  // needed. Both decisions are made on SUSTAINED conditions rather than a
  // single tick, so a moment of everyone being busy does not buy a ship.
  // The clocks the capacity policy reads: how long the whole fleet has been
  // committed, and how long each ship has had nothing to do. Bookkeeping, not
  // judgement — what those durations MEAN is `fleetCapacity`'s to decide.
  function trackFleetClocks(serviceable) {
    operation.fleetPolicy ??= { allBusySince: null };
    const fleetPolicy = operation.fleetPolicy;
    const allBusy = serviceable.every((worker) => worker.assignment || worker.marketVisit);
    if (!allBusy) fleetPolicy.allBusySince = null;
    else fleetPolicy.allBusySince ??= now();

    serviceable.forEach((worker) => {
      const shipRecord = operation.ships[worker.id];
      if (!shipRecord) return;
      if (worker.assignment) shipRecord.idleSince = null;
      else shipRecord.idleSince ??= now();
    });
  }

  function buildFleetView(serviceable, project) {
    return {
      size: workers.length,
      allBusySince: operation.fleetPolicy?.allBusySince ?? null,
      approvedProjects: project?.status === "approved" ? [project] : [],
      ships: serviceable.map((worker) => ({
        id: worker.id,
        name: operation.ships[worker.id]?.name ?? worker.name,
        busy: Boolean(worker.assignment),
        carrying: Object.values(worker.cargo ?? {}).reduce((sum, units) => sum + units, 0),
        idleSince: operation.ships[worker.id]?.idleSince ?? null,
      })),
    };
  }

  // How much fleet to carry. The thresholds, the ranking and the affordability
  // test all live in `fleetCapacity` now; what stays here is the three things
  // only a mining operation knows how to do — buy an ore worker, stand one
  // down, and commission an approved project.
  function assessFleetCapacity() {
    operation.fleetPolicy ??= { allBusySince: null };
    const serviceable = workers.filter((worker) => operation.ships[worker.id]?.maintenanceStatus === "available");
    // A fleet with nothing working cannot be turning work away, so its busy
    // clock resets — but the assessment still runs, because an already-approved
    // project is waiting on money rather than on a free ship.
    if (serviceable.length === 0) operation.fleetPolicy.allBusySince = null;
    else trackFleetClocks(serviceable);

    const account = operation.institution.accounts.operating;
    const policy = resolveFleetPolicy(state, operation.institution.id);
    const project = seed.expansionProject ? operation.projects[seed.expansionProject.id] : null;

    const plan = planFleetCapacity({
      institution: operation.institution,
      controller: operation.controller,
      fleet: buildFleetView(serviceable, project),
      policy,
      account,
      now: now(),
      capabilities: [
        createCommissionCapability({
          execute: ({ projectId } = {}) => commissionProject(operation.projects[projectId]),
        }),
        createHireCapability({
          cost: policy.hireCost,
          execute: () => {
            hireWorker(account, policy.hireCost);
            operation.fleetPolicy.allBusySince = null;   // earn the next hire from scratch
          },
        }),
        createReleaseCapability({
          execute: ({ shipId } = {}) => {
            const worker = workers.find((candidate) => candidate.id === shipId);
            const shipRecord = operation.ships[shipId];
            if (worker && shipRecord) releaseWorker(worker, shipRecord);
          },
        }),
      ],
    });

    plan.selected.forEach((response) => response.execute?.(response.subject));

    plan.blocked
      .filter((response) => response.capabilityId === "hire-worker")
      .forEach((response) => {
        recordBlocker(state, operation.institution.id, createBlocker({
          kind: BLOCKER_KIND.PAYER_CANNOT_AFFORD,
          summary: `${operation.controller.name} has had every ship committed for a minute but cannot fund a ${Math.round(response.estimatedCost)} cr hire`,
          subjectId: operation.institution.id,
          waitingFor: "delivery income",
          wakeOn: ["mining.contractFulfilled"],
          detail: { balance: Math.round(account.balance), hireCost: Math.round(response.estimatedCost), fleetSize: workers.length },
          at: now(),
        }), { state: DIAGNOSTIC_STATE.WAITING, at: now() });
      });
  }

  function hireWorker(account, hireCost = HIRE_COST) {
    const index = (operation.hiredCount ?? 0) + 1;
    operation.hiredCount = index;
    const seat = seed.workers.length + index;
    const defaults = {
      id: `worker:${seed.fleetPrefix}-hire-${index}`,
      name: `${seed.fleetName} ${CREW_NAMES[seat - 1] ?? seat}`,
      referenceId: `MW-${seed.fleetPrefix.toUpperCase()}-${String(index).padStart(2, "0")}`,
      currentSiteId: seed.homeSiteId,
      initialWear: 0.08,
      offset: { x: -120 + (index % 4) * 80, y: 60 + (index % 3) * 40 },
    };
    account.balance -= hireCost;
    operation.institution.capitalSpend = (operation.institution.capitalSpend ?? 0) + hireCost;
    account.transactions.push({ id: `MIN-HIRE-${now()}-${index}`, at: now(), type: "capital-expense", amount: -hireCost, balance: account.balance, referenceId: defaults.id });
    const shipRecord = createWorkerRecord(defaults, operation.institution.id);
    operation.ships[shipRecord.id] = shipRecord;
    addPhysicalWorker(shipRecord);
    record("mining.workerHired", `${operation.controller.name} hired ${defaults.name} for ${hireCost} cr — the whole fleet had been committed for a minute with work still waiting.`, {
      shipInstitutionId: shipRecord.id, shipName: shipRecord.name, cost: hireCost,
      fleetSize: workers.length, accountBalance: Math.round(account.balance),
    });
  }

  function releaseWorker(worker, shipRecord) {
    const idleSeconds = Math.round((now() - (shipRecord.idleSince ?? now())) / 1000);
    worker.isAlive = false;              // the game drops it on the next frame
    const index = workers.indexOf(worker);
    if (index >= 0) workers.splice(index, 1);
    delete operation.ships[shipRecord.id];
    retireDiagnostic(state, shipRecord.id, { summary: `${shipRecord.name} was stood down`, at: now() });
    record("mining.workerReleased", `${operation.controller.name} stood ${shipRecord.name} down after ${idleSeconds}s with nothing to do.`, {
      shipInstitutionId: shipRecord.id, shipName: shipRecord.name, idleSeconds,
      fleetSize: workers.length,
    });
  }

  // APPROVAL only. Whether a project is worth approving is a judgement about
  // this operation's own book of work — sustained repair-supply demand pinning
  // the fleet — which no general capacity rule can make for it. Once approved,
  // the project becomes an ordinary way of answering a capacity shortage and
  // `assessFleetCapacity` decides when to actually buy it.
  function assessExpansion() {
    const project = seed.expansionProject ? operation.projects[seed.expansionProject.id] : null;
    if (!project || project.status !== "planned") return;
    const serviceable = workers.filter((worker) => operation.ships[worker.id]?.maintenanceStatus === "available");
    const criticalAllocations = Object.values(operation.allocations).filter((allocation) => allocation.orderKind === "sprc" && allocation.status === "active");
    const underPressure = criticalAllocations.length >= 2 && serviceable.length > 0 && serviceable.every((worker) => worker.assignment);
    if (!underPressure) project.demandSince = null;
    else project.demandSince ??= now();
    const requiredSeconds = state._devStartId ? 5 : EXPANSION_DEMAND_SECONDS;
    if (project.demandSince != null && now() - project.demandSince >= requiredSeconds * 1000) {
      project.status = "approved";
      project.approvedAt = now();
      record("mining.expansionApproved", `${operation.controller.name} approved ${project.name} after sustained repair-supply demand occupied the available fleet.`, { projectId: project.id, requiredCredits: project.requiredCredits });
    }
  }

  function commissionProject(project) {
    if (!project || project.status !== "approved") return;
    const account = operation.institution.accounts.operating;
    account.balance -= project.requiredCredits;
    operation.institution.capitalSpend = (operation.institution.capitalSpend ?? 0) + project.requiredCredits;
    account.transactions.push({ id: `MIN-EXP-${now()}`, at: now(), type: "capital-expense", amount: -project.requiredCredits, balance: account.balance, referenceId: project.id });
    const shipRecord = createWorkerRecord(seed.expansionWorker, operation.institution.id);
    operation.ships[shipRecord.id] = shipRecord;
    addPhysicalWorker(shipRecord);
    project.status = "completed";
    project.completedAt = now();
    record("mining.expansionCompleted", `${operation.controller.name} commissioned ${shipRecord.name} for ${project.requiredCredits} cr; the new worker entered service at ${seed.homeSiteId}.`, { projectId: project.id, shipInstitutionId: shipRecord.id, shipName: shipRecord.name, cost: project.requiredCredits, accountBalance: account.balance });
  }

  // A refusal the worker can do nothing about: hand the allocation back so its
  // reserved units return to the order, and tell the worker to drop the
  // commitment (it keeps the cargo as uncommitted material).
  function refusePermanently(allocation, ship, reason) {
    if (allocation && allocation.status === "active") {
      allocation.status = "released";
      allocation.releasedAt = now();
      allocation.outcomeReason = reason;
    }
    const released = ship?.releaseAssignment?.(reason) ?? null;
    if (released && allocation) {
      record("mining.deliveryAbandoned", `${ship.name} could not deliver ${allocation.orderId} (${formatRefusal(reason)}); the load stays aboard as uncommitted cargo.`, {
        shipInstitutionId: ship.id, shipName: ship.name, orderId: allocation.orderId,
        allocationId: allocation.id, reason, resourceId: released.resourceId,
      });
      const shipRecord = operation.ships[ship.id];
      if (shipRecord) {
        recordWorkerIdentity(ship, shipRecord);
        recordBlocker(state, ship.id, createBlocker({
          kind: BLOCKER_KIND.NO_ELIGIBLE_WORK,
          summary: `${ship.name} is holding uncommitted ${released.resourceId} that ${allocation.orderId} would not accept (${formatRefusal(reason)})`,
          subjectId: ship.id,
          objectId: allocation.orderId,
          waitingFor: "a buyer for the cargo already aboard, or new work",
          wakeOn: ["order-posted", "order-repriced", "cargo-sold"],
          detail: { reason, orderId: allocation.orderId, resourceId: released.resourceId },
          at: now(),
        }), { state: DIAGNOSTIC_STATE.WAITING, at: now() });
      }
    }
    return { acceptedUnits: 0, paid: 0, refusal: { reason, permanent: true } };
  }

  function refuseForNow(reason) {
    return { acceptedUnits: 0, paid: 0, refusal: { reason, permanent: false } };
  }

  function formatRefusal(reason) {
    return String(reason).replaceAll("-", " ");
  }

  function completeDelivery({ allocationId, contractId, resourceId, amount, ship }) {
    const allocation = operation.allocations[allocationId];
    // The allocation is gone or already closed — nothing will ever accept this
    // load against it.
    if (!allocation || allocation.status !== "active") return refusePermanently(allocation, ship, "allocation-closed");
    if (allocation.orderKind === "sprc") {
      const procurement = state.sprc?.procurementOrders?.[allocation.orderId];
      if (!procurement) return refusePermanently(allocation, ship, "order-missing");
      const result = sprcOperation.deliverMaterial({
        contractId, materialId: resourceId, amount: Math.min(amount, allocation.amount), supplierInstitutionId: operation.institution.id,
        creditSupplier: (payment) => {
          operation.institution.accounts.operating.balance += payment;
          operation.institution.accounts.operating.transactions.push({ id: `MIN-TX-${allocation.id}`, at: now(), type: "mining-income", amount: payment, balance: operation.institution.accounts.operating.balance, referenceId: allocation.id });
        },
      });
      if (!result?.acceptedUnits) {
        // An order that is finished, expired, or already full will never take
        // this load; anything else may clear on its own.
        const closed = ["paid", "expired", "canceled", "payment-shortfall"].includes(procurement.status);
        const full = procurement.deliveredEquivalentUnits >= procurement.requiredEquivalentUnits;
        return closed || full
          ? refusePermanently(allocation, ship, closed ? `order-${procurement.status}` : "order-already-filled")
          : refuseForNow("order-not-accepting");
      }
      finishDelivery({ allocation, ship, siteId: procurement.destinationSiteId, resourceId, delivered: result.acceptedUnits, payment: result.paid, orderLabel: procurement.id });
      const surplusSoldUnits = sellSurplusAtHub({ ship, siteId: procurement.destinationSiteId, resourceId, acceptedUnits: result.acceptedUnits });
      return { ...result, surplusSoldUnits };
    }
    const order = getStandingMiningDefinitions(state).find((candidate) => candidate.id === contractId);
    if (!order) return refusePermanently(allocation, ship, "order-missing");
    const settlement = settleStandingMiningOrder({ state, orderId: contractId, resourceId, amount: Math.min(amount, allocation.amount), supplierAccount: operation.institution.accounts.operating, referenceId: allocation.id, now: now() });
    if (!settlement) {
      // A standing order fails to settle when the material does not match (a
      // mismatch cannot recover), or when the buyer has stopped buying — either
      // because it is stocked or because it cannot fund the buy. Both of the
      // latter can recover, but they are different facts, so name them honestly.
      if (order.resourceId !== resourceId) return refusePermanently(allocation, ship, "resource-mismatch");
      const availability = getStandingMiningOrderAvailability({ state, orderId: contractId, amount: Math.min(amount, allocation.amount) });
      return refuseForNow(availability.reason ?? "buyer-cannot-fund");
    }
    const { delivered, payment } = settlement;
    finishDelivery({ allocation, ship, siteId: order.siteId, resourceId, delivered, payment, orderLabel: order.id });
    const surplusSoldUnits = sellSurplusAtHub({ ship, siteId: order.siteId, resourceId, acceptedUnits: delivered });
    return { acceptedUnits: delivered, paid: payment, surplusSoldUnits };
  }

  // Selling leftovers is the same transaction the player makes at a dock, so it
  // goes through the same shared path rather than a private copy of the rule.
  function sellSurplusAtHub({ ship, siteId, resourceId, acceptedUnits }) {
    const surplus = Math.max(0, (ship.cargo[resourceId] ?? 0) - acceptedUnits);
    if (surplus <= 0) return 0;

    const sale = sellMaterialToHub(state, {
      siteId, resourceId, units: surplus, source: "mining-surplus", now: now(),
    });
    if (sale.acceptedUnits <= 0) return 0;

    operation.institution.accounts.operating.balance += sale.payment;
    operation.institution.accounts.operating.transactions.push({ id: `MIN-SURPLUS-${now()}-${ship.id}`, at: now(), type: "wholesale-income", amount: sale.payment, balance: operation.institution.accounts.operating.balance, referenceId: sale.buyerId });
    record("mining.surplusSold", `${ship.name} sold ${sale.acceptedUnits} surplus ${resourceId.replaceAll("-", " ")} to ${siteName(siteId)} supply for ${sale.payment} cr.`, { siteId, resourceId, quantity: sale.acceptedUnits, payment: sale.payment, shipInstitutionId: ship.id, shipName: ship.name, buyerInstitutionId: sale.buyerId });
    return sale.acceptedUnits;
  }

  function finishDelivery({ allocation, ship, siteId, resourceId, delivered, payment, orderLabel }) {
    allocation.status = "completed";
    allocation.delivered = delivered;
    allocation.paid = payment;
    allocation.completedAt = now();
    const shipRecord = operation.ships[ship.id];
    const crewPay = seed.operatingCosts?.crewPayPerContract ?? 0;
    const consumables = seed.operatingCosts?.consumablesPerContract ?? 0;
    const operatingExpense = crewPay + consumables;
    if (operatingExpense > 0) {
      operation.institution.accounts.operating.balance -= operatingExpense;
      // Crew wages and consumables leave the simulated economy — nobody counted
      // here receives them — so the burn is declared rather than left to surface
      // as an unexplained shrinkage in the money supply.
      operation.institution.capitalSpend = (operation.institution.capitalSpend ?? 0) + operatingExpense;
      operation.institution.accounts.operating.transactions.push({
        id: `MIN-OPS-${now()}-${ship.id}`,
        at: now(), type: "operating-expense", amount: -operatingExpense,
        balance: operation.institution.accounts.operating.balance,
        referenceId: allocation.id,
      });
      record("mining.operatingExpensePaid", `${operation.institution.name} paid ${operatingExpense} cr in crew and consumables after ${ship.name}'s run.`, {
        institutionId: operation.institution.id, shipInstitutionId: ship.id, shipName: ship.name,
        allocationId: allocation.id, crewPay, consumables, operatingExpense,
        accountBalance: operation.institution.accounts.operating.balance,
      });
    }
    shipRecord.currentSiteId = siteId;
    const workWear = getMiningWorkWear();
    const componentUse = applyCraftUse(shipRecord, {
      structure: workWear * 0.35,
      "mining-laser": workWear,
      "tractor-field": workWear * 0.65,
      "field-control": workWear * 0.45,
    }, { at: now() });
    shipRecord.wear = componentUse.aggregateWear;
    operation.completedContracts += 1;
    operation.wear = Object.values(operation.ships).reduce((sum, record) => sum + (record.wear ?? 0), 0) / Object.keys(operation.ships).length;
    record("mining.contractFulfilled", `${ship.name} delivered ${delivered} ${resourceId.replaceAll("-", " ")} to ${siteName(siteId)}, earned ${payment} cr, and completed ${orderLabel}. Wear is now ${shipRecord.wear.toFixed(2)}.`, { orderId: allocation.orderId, siteId, resourceId, quantity: delivered, payment, accountBalance: operation.institution.accounts.operating.balance, wear: operation.wear, shipWear: shipRecord.wear, shipInstitutionId: ship.id, shipName: ship.name });
    assessCraftService(shipRecord, ship);
  }

  // Whether this delivery's wear is enough to take the craft off work. The
  // threshold is the operator's, not this module's — a cautious prospector
  // pulls a worker while it still runs, a bolder contractor takes the outage.
  function assessCraftService(shipRecord, ship) {
    if (shipRecord.maintenanceStatus !== "available") return;
    const plan = planCraftService({
      institution: operation.institution,
      controller: operation.controller,
      craft: shipRecord,
      policy: resolveServicePolicy(state, operation.institution.id),
      account: operation.institution.accounts.operating,
      now: now(),
      capabilities: [
        createWithdrawForServiceCapability({
          execute: ({ preventive } = {}) => beginMaintenance(shipRecord, ship, null, preventive ? "preventive" : "work-wear"),
        }),
      ],
    });
    plan.selected.forEach((response) => response.execute?.(response.subject));
  }

  function siteName(siteId) {
    return sites.get(siteId)?.name ?? siteId.replaceAll("-", " ");
  }

  function beginMaintenance(shipRecord, ship, forcedIssue = null, cause = "work-wear") {
    const worstComponent = getWorstComponent(shipRecord);
    const worstDefinition = MINING_COMPONENT_DEFINITIONS.find((entry) => entry.id === worstComponent?.id);
    const issue = forcedIssue ?? MINING_ISSUES.find((entry) => entry.issueType === worstDefinition?.issueType)
      ?? MINING_ISSUES[shipRecord.issueCount % MINING_ISSUES.length];
    const componentDefinition = forcedIssue
      ? MINING_COMPONENT_DEFINITIONS.find((entry) => entry.issueType === forcedIssue.issueType)
      : worstDefinition;
    const serviceSite = sites.get("scrap-porch");
    if (!serviceSite) return;
    shipRecord.issueCount += 1;
    shipRecord.pendingIssue = issue.issueType;
    shipRecord.pendingComponentId = componentDefinition?.id ?? (issue.issueType === "structural-fatigue" ? "structure" : null);
    shipRecord.maintenanceStatus = "returning-for-service";
    ship.returnForService({ destination: serviceSite.position, destinationSiteId: "scrap-porch", issueType: issue.issueType });
    // Diagnostics: disabled and dependent on a service provider. The blocker
    // points at SPRC, so the why-chain continues into Sal's own state.
    recordBlocker(state, shipRecord.id, createBlocker({
      kind: BLOCKER_KIND.AWAITING_SERVICE,
      summary: `${shipRecord.name} developed ${issue.issueType.replaceAll("-", " ")} and needs service at Scrap Porch`,
      subjectId: shipRecord.id,
      objectId: "sprc",
      waitingFor: "a repair berth and the materials the fix needs",
      wakeOn: ["sprc.repairCompleted", "sprc.repairRetryAdmitted"],
      causedBy: [{ actorId: "sprc", note: "Scrap Porch Recovery Cooperative holds the repair" }],
      detail: { issueType: issue.issueType, componentId: shipRecord.pendingComponentId,
        requiredCapabilities: issue.requiredCapabilities, wear: shipRecord.wear },
      at: now(),
    }), { state: DIAGNOSTIC_STATE.DISABLED, at: now() });
    const because = cause === "combat-damage" ? "after combat damage"
      // A preventive pull is the operator's judgement, not the machine's, and
      // the log should say so — otherwise a craft leaving work in good order
      // reads as an unexplained outage.
      : cause === "preventive" ? "and was pulled before it could fail"
      : "after mining work";
    record("mining.maintenanceRequired", `${shipRecord.name}'s ${worstComponent?.label ?? "equipment"} developed ${issue.issueType.replaceAll("-", " ")} ${because} and is returning to Scrap Porch.`, { shipInstitutionId: shipRecord.id, shipName: shipRecord.name, issueType: issue.issueType, componentId: shipRecord.pendingComponentId, wear: shipRecord.wear, requiredCapabilities: issue.requiredCapabilities, cause });
  }

  function consumeMaintenanceEvents() {
    for (const event of state.ledger.getEventsAfterId(operation.lastMaintenanceEventId, { includeHidden: true })) {
      operation.lastMaintenanceEventId = Math.max(operation.lastMaintenanceEventId, event.id);
      if (event.type === "incursion.npcHit") {
        const shipRecord = operation.ships[event.payload.npcId];
        const ship = workers.find((candidate) => candidate.id === event.payload.npcId);
        if (shipRecord && ship && shipRecord.maintenanceStatus === "available"
          && event.payload.hullAfter > 0 && event.payload.hullAfter / ship.maxHull <= 0.5) {
          applyCraftUse(shipRecord, { structure: 1 }, { at: now() });
          shipRecord.wear = shipRecord.aggregateWear;
          const issue = MINING_ISSUES.find((candidate) => candidate.issueType === "structural-fatigue");
          beginMaintenance(shipRecord, ship, issue, "combat-damage");
        }
        continue;
      }
      if (event.type !== "sprc.repairCompleted") continue;
      const shipRecord = operation.ships[event.payload.subjectId];
      if (!shipRecord || shipRecord.maintenanceStatus === "available") continue;
      // Queue the settlement instead of paying inline: the event is consumed
      // once, so an unaffordable bill must persist as an explicit debt rather
      // than being skipped and stranding the ship forever.
      operation.pendingServiceSettlements ??= [];
      operation.pendingServiceSettlements.push({
        shipId: shipRecord.id,
        repairOrderId: event.payload.repairOrderId,
        price: event.payload.serviceRevenue ?? MINING_SERVICE_PRICE,
        owedSince: now(),
      });
    }
    settlePendingServiceCharges();
  }

  // Pay off completed repairs as cash allows. An unpayable bill stays queued
  // and visible rather than silently disappearing.
  function settlePendingServiceCharges() {
    const pending = operation.pendingServiceSettlements ?? [];
    if (pending.length === 0) return;
    operation.pendingServiceSettlements = pending.filter((settlement) => {
      const shipRecord = operation.ships[settlement.shipId];
      if (!shipRecord) return false;
      const account = operation.institution.accounts.operating;
      if (account.balance < settlement.price) {
        recordBlocker(state, shipRecord.id, createBlocker({
          kind: BLOCKER_KIND.UNPAID_SERVICE_DEBT,
          summary: `${shipRecord.name} owes SPRC ${settlement.price} cr for completed service and cannot pay`,
          subjectId: shipRecord.id,
          objectId: settlement.repairOrderId,
          waitingFor: `${Math.max(0, Math.round(settlement.price - account.balance))} more credits`,
          wakeOn: ["mining-income", "wholesale-income"],
          detail: { owed: settlement.price, balance: Math.round(account.balance) },
          at: now(),
        }), { state: DIAGNOSTIC_STATE.INSOLVENT, at: now() });
        if (!settlement.reported) {
          settlement.reported = true;
          record("mining.serviceDebtOutstanding", `${shipRecord.name} owes SPRC ${settlement.price} cr for completed service and cannot pay yet; the ship stays in the berth until it can.`, { shipInstitutionId: shipRecord.id, shipName: shipRecord.name, repairOrderId: settlement.repairOrderId, owed: settlement.price, accountBalance: Math.round(account.balance) });
        }
        return true; // keep owing; retried next tick
      }
      applyServiceSettlement(shipRecord, settlement, account);
      return false;
    });
  }

  function applyServiceSettlement(shipRecord, settlement, account) {
    const { price, repairOrderId } = settlement;
    account.balance -= price;
    account.transactions.push({ id: `MIN-SVC-${repairOrderId ?? now()}`, at: now(), type: "maintenance-expense", amount: -price, balance: account.balance, referenceId: repairOrderId });
    if (state.sprc?.account) state.sprc.account.balance += price;
    // Book what upkeep actually costs Cinder. Its own job pricing reads this,
    // so when Sal raises repair prices the miner's cost-to-serve rises too.
    recordServiceCost(state, { institutionId: operation.institution.id, serviceType: "maintenance", price, at: now() });
    const componentId = shipRecord.pendingComponentId ?? getWorstComponent(shipRecord)?.id;
    const service = serviceCraftComponent(shipRecord, componentId, {
      at: now(), providerId: "sprc", repairOrderId,
    });
    shipRecord.wear = shipRecord.aggregateWear;
    shipRecord.pendingIssue = null;
    shipRecord.pendingComponentId = null;
    shipRecord.maintenanceStatus = "available";
    shipRecord.currentSiteId = "scrap-porch";
    const servicedWorker = workers.find((worker) => worker.id === shipRecord.id);
    servicedWorker?.completeService();
    if (servicedWorker) servicedWorker.hull = servicedWorker.maxHull;
    // Diagnostics: serviced, paid, and free again.
    clearBlocker(state, shipRecord.id, {
      state: DIAGNOSTIC_STATE.FREE,
      summary: `${shipRecord.name} paid ${price} cr for service and is available for work`,
      at: now(),
    });
    record("mining.maintenanceCompleted", `${shipRecord.name} paid SPRC ${price} cr, serviced its ${service?.componentId ?? "affected component"}, and returned to mining duty.`, { shipInstitutionId: shipRecord.id, shipName: shipRecord.name, componentId: service?.componentId ?? null, repairOrderId, payment: price, accountBalance: account.balance });
  }

  function recordWorkerEvent(shipRecord, actionType, payload) {
    const messages = {
      "assignment.accepted": `${operation.controller.name} dispatched ${shipRecord.name} on a mining allocation.`,
      "prospect.selected": `${shipRecord.name} selected a real ${payload.resourceId} rock and is approaching it.`,
      "resource.collected": `${shipRecord.name} collected ${payload.quantity} ${payload.resourceId}.`,
      "delivery.completed": `${shipRecord.name} completed its physical delivery.`,
      "market.arrived": payload.destinationSiteId
        ? `${shipRecord.name} reached ${siteName(payload.destinationSiteId)} to seek local work.`
        : `${shipRecord.name} reached a market to seek local work.`,
      "service.arrived": payload.issueType ? `${shipRecord.name} arrived at Scrap Porch and requested service for ${payload.issueType.replaceAll("-", " ")}.` : `${shipRecord.name} arrived at Scrap Porch for service.`,
    };
    if (actionType === "prospect.selected") {
      recordDepositObservation(operation.depositKnowledge, {
        x: payload.x, y: payload.y, resourceId: payload.resourceId,
        policy: prospectingPolicy(), at: now(),
      });
    }
    if (actionType === "market.arrived") {
      shipRecord.currentSiteId = payload.destinationSiteId;
      shipRecord.status = "idle";
    }
    record(`worker.${actionType}`, messages[actionType] ?? `${shipRecord.name}: ${actionType}`, { shipInstitutionId: shipRecord.id, shipName: shipRecord.name, ...payload });
    if (actionType === "service.arrived") {
      const issue = MINING_ISSUES.find((candidate) => candidate.issueType === payload.issueType);
      shipRecord.currentSiteId = payload.destinationSiteId;
      shipRecord.maintenanceStatus = "awaiting-service";
      state.ledger.recordEvent("maintenance.requested", {
        subjectId: shipRecord.id, subjectName: shipRecord.name, referenceId: shipRecord.referenceId,
        craftClass: "mining-craft", issueType: payload.issueType, requiredCapabilities: issue?.requiredCapabilities ?? [],
        locationSiteId: payload.destinationSiteId, mobility: "self-return", payerInstitutionId: operation.institution.id,
        payer: { balance: operation.institution.accounts.operating.balance, committed: operation.institution.accounts.operating.committed ?? 0, protectedCash: getActorProtectedCash(state, operation.institution.id) },
        servicePrice: MINING_SERVICE_PRICE, wear: shipRecord.wear, issueCount: shipRecord.issueCount,
        componentId: shipRecord.pendingComponentId,
      }, { visible: false });
    }
  }

  function record(type, message, payload = {}) {
    operation.historyCounter = (operation.historyCounter ?? operation.history.length) + 1;
    appendBoundedHistory(operation.history, { id: `mining-history-${operation.historyCounter}`, type, at: now(), ...payload });
    state.ledger.recordEvent(type, { institutionId: operation.institution.id, institutionName: operation.institution.name, actorInstitutionId: operation.controller.id, actorName: operation.controller.name, ...payload }, { visible: true, message });
  }

  update();
  // `chooseOrder` is exposed because selection is a question the shared layer
  // will want to ask without committing an actor to the answer: what would this
  // miner take right now, and why. It only records the reasoning.
  // No `settle`: dispatch is recorded as it happens, and the fleet diagnostic
  // is published inside `decide` against the pre-dispatch fleet — moving it
  // after the world's decisions would change what it reports, which is a
  // reporting decision rather than a phase one.
  return { update, observe, decide, getState: () => operation, chooseOrder, listOffers: () => listExtractionOffers(state, offerContext()), worker: workers[0], workers };
}

// Exported under the same name every other system uses for its seed, so an
// actor's starting configuration can be read without standing up the whole
// operation.
export function createInitialMiningState(now = Date.now(), seed = CINDER_MINING_SEED) {
  return createInitialState(now, seed);
}

function createInitialState(now, seed = CINDER_MINING_SEED) {
  return {
    version: 1,
    institution: structuredClone(seed.institution),
    controller: structuredClone(seed.controller),
    ships: Object.fromEntries(seed.workers.map((defaults) => [defaults.id, createWorkerRecord(defaults, seed.institution.id)])),
    allocations: {}, history: [{ id: "mining-history-1", type: "institution.instantiated", at: now }], counter: 0, completedContracts: 0, wear: 0, lastMaintenanceEventId: 0,
  };
}

function createWorkerRecord(defaults, ownerInstitutionId = CINDER_MINING_SEED.institution.id) {
  const record = { id: defaults.id, name: defaults.name, archetypeId: "mining-worker", ownerInstitutionId, referenceId: defaults.referenceId, currentSiteId: defaults.currentSiteId, status: "idle", cargo: {}, wear: defaults.initialWear ?? 0, issueCount: 0, pendingIssue: null, pendingComponentId: null, maintenanceStatus: "available", lastDecisionKey: null, capabilities: { miningLaser: true, cargoCollector: true, tractorField: { powered: true, powerSource: "evergreen" } } };
  ensureCraftComponents(record, MINING_COMPONENT_DEFINITIONS, { initialWear: record.wear });
  record.wear = record.aggregateWear;
  return record;
}
