import { MiningWorkerShip } from "../entities/MiningWorkerShip.js?v=fresh-20260801-2156-8671710";
import { getOreClusterSeedsInRadius } from "./asteroidField.js?v=fresh-20260801-2156-8671710";
import { getResourceFamily, getResourceTradeValue } from "./resourceDefinitions.js?v=fresh-20260801-2156-8671710";
import { canActorDoAction } from "./ruleChecker.js?v=fresh-20260801-2156-8671710";
import { getMiningWorkWear } from "./wearRates.js?v=fresh-20260801-2156-8671710";
import { evaluateMiningJob, evaluateProcurement, urgencyFromCoverage } from "./valuation.js?v=fresh-20260801-2156-8671710";
import { getInventoryPosition } from "./hubInventory.js?v=fresh-20260801-2156-8671710";
import { getServiceCost, recordAcquisition, recordServiceCost } from "./costBasis.js?v=fresh-20260801-2156-8671710";
import { getActorProtectedCash, getActorTraits } from "./actorConfig.js?v=fresh-20260801-2156-8671710";
import { adaptMiningAllocation } from "./intentions.js?v=fresh-20260801-2156-8671710";
import { createExtractionOffer, filterUncommittedOffers, listExtractionOffers, registerExtractionOfferSource } from "./extractionOffers.js?v=fresh-20260801-2156-8671710";
import { BLOCKER_KIND, DIAGNOSTIC_STATE, clearBlocker, createBlocker, recordBlocker, recordDecision, recordDiagnostic } from "./diagnostics.js?v=fresh-20260801-2156-8671710";
import { settlementExtractionDefinitions } from "../content/economy/firstReachSettlements.js?v=fresh-20260801-2156-8671710";
import { CINDER_MINING_SEED } from "../content/economy/miningInstitutions.js";

// Identity only: which hub extracts which material at which site.
//
// The authored quantity and price are gone. Both are derived per tick by
// getPostedMiningOrders from a real inventory gap and the shared valuation
// framework, and the order is withheld entirely when the hub needs nothing —
// so what remains here is not an order, it is the fact that this hub is the one
// that digs this material. The material itself is the representative member of
// the family the hub holds mining rights to.
export const STANDING_MINING_ORDERS = Object.freeze(settlementExtractionDefinitions());

// What a worker lifts in one trip. Exported because an issuer sizes its offer
// to the carrier's capacity, and a reader showing the board has to ask the same
// question the miner asks.
export const MINING_ALLOCATION_SIZE = 6;
const EXPANSION_DEMAND_SECONDS = 12;
// Rolling fleet policy. Cinder hires when the whole fleet has been busy long
// enough that work is plainly being turned away, and lets a ship go when it has
// sat idle long enough that it is plainly not needed.
const HIRE_AFTER_BUSY_SECONDS = 60;
const RELEASE_AFTER_IDLE_SECONDS = 120;
const HIRE_COST = 3500;
// Never go to nothing, and never grow without limit.
const MIN_FLEET = 1;
const MAX_FLEET = 8;
const CREW_NAMES = ["One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve"];
const DEPOSIT_SURVEY_RADIUS = 12000;

const MINING_ISSUES = Object.freeze([
  { issueType: "structural-fatigue", requiredCapabilities: ["structural-repair", "mechanical-repair"] },
  { issueType: "tractor-field-instability", requiredCapabilities: ["tractor-field", "mechanical-repair"] },
  { issueType: "field-control-failure", requiredCapabilities: ["field-control"] },
  { issueType: "preventive-calibration", requiredCapabilities: ["field-control"] },
]);
const MINING_SERVICE_PRICE = 2200;

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
  STANDING_MINING_ORDERS.forEach((definition) => {
    const family = getResourceFamily(definition.resourceId);
    const position = getInventoryPosition(state, definition.buyerInstitutionId, family);
    if (position.gap <= 0) return;

    const buyer = state.logistics?.institutions?.[definition.buyerInstitutionId];
    if (!buyer) return;
    const valuation = evaluateProcurement({
      itemId: definition.resourceId,
      baseUnitPrice: getResourceTradeValue(definition.resourceId),
      marketUnitValue: getResourceTradeValue(definition.resourceId),
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
    posted[definition.id] = {
      ...definition,
      amount: valuation.metrics.units,
      paymentPerUnit: valuation.recommendedPrice,
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
    type: "resource-delivery",
    group: "standing-mining",
    jobKind: "mining",
    repeatable: true,
    jobTier: "standing",
    jobTierLabel: "Open Extraction",
    title: `${order.resourceName} for ${order.siteName}`,
    issuer: issuer ?? order.siteName,
    summary: `${order.siteName} maintains an evergreen local purchase order for ${order.amount} units of ${order.resourceName}.`,
    terms: { resourceType: order.resourceId, resourceName: order.resourceName, amount: order.amount, destinationSiteId: order.siteId, destinationName: order.siteName, standingMiningOrderId: order.id },
    reward: { credits: order.amount * order.paymentPerUnit },
    clauses: ["This order is shared with licensed independent and institutional miners.", "Only real collected material is accepted.", `Deliver at ${order.siteName}; another contractor may fill later allocations.`],
  }));
}

// The live board, preferring the cache the operation refreshes each tick but
// falling back to computing it. Without the fallback, settling a delivery would
// silently depend on a mining operation having been constructed first.
function resolvePostedOrder(state, orderId) {
  const cached = state.miningOperation?.postedOrders?.[orderId];
  if (cached) return cached;
  return getPostedMiningOrders(state)[orderId] ?? null;
}

export function settleStandingMiningOrder({ state, orderId, resourceId, amount, supplierAccount = null, referenceId = null, now = Date.now() }) {
  const order = STANDING_MINING_ORDERS.find((candidate) => candidate.id === orderId);
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
  if (supplierAccount) {
    supplierAccount.balance += payment;
    supplierAccount.transactions?.push({ id: `MIN-TX-${referenceId ?? now}`, at: now, type: "mining-income", amount: payment, balance: supplierAccount.balance, referenceId });
  }
  return { order, buyer, delivered, payment, unitPrice };
}

export function canFundStandingMiningOrder({ state, orderId, amount = null }) {
  const order = STANDING_MINING_ORDERS.find((candidate) => candidate.id === orderId);
  const buyer = state.logistics?.institutions?.[order?.buyerInstitutionId];
  if (!order || !buyer) return false;
  const posted = resolvePostedOrder(state, orderId);
  if (!posted || posted.withheld) return false;
  const units = Math.min(Math.max(0, amount ?? posted.amount), posted.amount);
  return (buyer.accounts.operating.balance ?? 0) >= units * posted.paymentPerUnit;
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
  operation.postedOrders ??= {};
  // The settlements' demand becomes visible on the board because this operation
  // exists to serve it, not because the board knows what a settlement is.
  registerExtractionOfferSource(state, "hub-standing-orders", hubStandingOfferSource);
  operation.projects ??= seed.expansionProject ? { [seed.expansionProject.id]: { ...seed.expansionProject, status: "planned", demandSince: null, approvedAt: null, completedAt: null } } : {};
  seed.workers.forEach((defaults) => {
    operation.ships[defaults.id] ??= createWorkerRecord(defaults, seed.institution.id);
    operation.ships[defaults.id].capabilities ??= { miningLaser: true, cargoCollector: true, tractorField: { powered: true, powerSource: "evergreen" } };
    operation.ships[defaults.id].maintenanceStatus ??= "available";
    operation.ships[defaults.id].issueCount ??= 0;
    operation.ships[defaults.id].pendingIssue ??= null;
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

  function update() {
    // Recompute what each hub is asking for before any worker reads the board,
    // so an order reflects this tick's inventory rather than last tick's.
    refreshPostedOrders();
    consumeMaintenanceEvents();
    assessExpansion();
    assessHiring();
    publishFleetDiagnostic();
    workers.forEach((worker) => {
      const shipRecord = operation.ships[worker.id];
      shipRecord.position = { x: worker.position.x, y: worker.position.y };
      shipRecord.status = worker.state;
      shipRecord.cargo = { ...worker.cargo };
      if (shipRecord.maintenanceStatus !== "available") return;
      // Non-preemptive by design: a worker keeps its commitment until the
      // delivery completes. Only idle workers reconsider.
      if (worker.assignment) return;
      const order = chooseOrder(worker);
      if (!order) { publishIdleDecision(shipRecord); return; }
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
        const reservation = order.reserve();
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
      shipRecord.lastDecisionKey = null;
      worker.assign({
        allocationId: allocation.id, contractId: order.contractId ?? order.id, resourceId: order.resourceId, quantity: order.amount, destination,
        harvestTargetQuantity: order.harvestTarget ?? order.amount,
        depositCandidates: getDepositCandidates(order.resourceId, worker.position),
      });
      // Diagnostics: this actor is now committed, and we keep why it chose this
      // job over the alternatives it weighed.
      const selection = operation.lastSelection;
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
      if (selection?.chosenOrderId === order.id) {
        recordDecision(state, worker.id, {
          chosen: { id: order.id, label: `${order.resourceName} → ${order.siteName}`, score: selection.netValue },
          alternatives: (selection.rejected ?? []).map((entry) => ({
            id: entry.orderId,
            label: entry.orderId,
            score: entry.netValue,
            rejectedBecause: `lower net value (${entry.netValue} vs ${selection.netValue})`,
          })),
          reasons: selection.reasons ?? [],
          at: now(),
        });
      }
      record("mining.contractAccepted", `${operation.controller.name} dispatched ${worker.name} for ${order.amount} ${order.resourceName} at ${order.siteName}.`, { orderId: order.id, allocationId: allocation.id, siteId: order.siteId, resourceId: order.resourceId, quantity: order.amount, shipInstitutionId: worker.id, shipName: worker.name });
    });
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

  // Publish the live board onto state so other systems (and the inventory
  // module's incoming calculation) can read it without importing this one.
  function refreshPostedOrders() {
    const posted = getPostedMiningOrders(state, now());
    Object.keys(operation.postedOrders).forEach((orderId) => {
      if (!posted[orderId]) delete operation.postedOrders[orderId];
    });
    Object.entries(posted).forEach(([orderId, order]) => { operation.postedOrders[orderId] = order; });
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
    const runnerUp = scored[1] ?? null;
    operation.lastSelection = {
      workerShipId: worker?.id ?? null,
      chosenOrderId: best.order.id,
      netValue: Math.round(best.valuation.metrics.netValue),
      reasons: best.valuation.reasons,
      rejected: scored.slice(1, 4).map((entry) => ({ orderId: entry.order.id, netValue: Math.round(entry.valuation.metrics.netValue) })),
      at: now(),
    };
    if (worker) {
      state.ledger.recordEvent("institution.jobValued", {
        institutionId: operation.institution.id, shipInstitutionId: worker.id, shipName: worker.name,
        chosenOrderId: best.order.id, netValue: Math.round(best.valuation.metrics.netValue),
        runnerUpOrderId: runnerUp?.order.id ?? null, runnerUpNetValue: runnerUp ? Math.round(runnerUp.valuation.metrics.netValue) : null,
        reasons: best.valuation.reasons,
      }, { visible: false });
    }
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
    const surplusPayout = surplusUnits * Math.max(1, Math.floor(getResourceTradeValue(order.resourceId) * 0.7));
    const payout = contractPayout + surplusPayout;

    return evaluateMiningJob({
      jobId: order.id,
      payout,
      units: order.amount,
      travelDistance: toDeposit + toBuyer,
      // Price wear against what a service REALLY costs now, not a constant —
      // this is how a repair-price rise reaches the miner's own decisions.
      wearCostPerPoint: getServiceCost(state, operation.institution.id, "maintenance", MINING_SERVICE_PRICE),
      risk: 0,
      traits: operation.controller?.traits ?? {},
      policy: {},
      opportunityCost: 0,
    });
  }

  function publishIdleDecision(shipRecord) {
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
    recordBlocker(state, shipRecord.id, createBlocker({
      kind: BLOCKER_KIND.NO_ELIGIBLE_WORK,
      summary: `${shipRecord.name} is idle: no mining order is both open and worth its cost`,
      subjectId: shipRecord.id,
      waitingFor: "an open order that clears its cost, or a buyer that can fund one",
      wakeOn: ["order-posted", "order-repriced", "allocation-released", "buyer-funded"],
      detail: { candidates: reasons },
      at: now(),
    }), { state: DIAGNOSTIC_STATE.WAITING, at: now() });

    const key = reasons.join("|");
    if (shipRecord.lastDecisionKey === key) return;
    shipRecord.lastDecisionKey = key;
    record("mining.waitingForFundedWork", `${shipRecord.name} is idle: available mining orders are already allocated or their buyers cannot fund the posted price.`, { shipInstitutionId: shipRecord.id, shipName: shipRecord.name, reasons });
  }

  function seedDepositKnowledge() {
    if (Object.keys(operation.depositKnowledge).length > 0 || !game.resourceField) return;
    const chunkSize = game.canvas?.width ?? 1200;
    sites.forEach((site) => {
      getOreClusterSeedsInRadius(site.position.x, site.position.y, DEPOSIT_SURVEY_RADIUS, chunkSize, game.resourceField).forEach((seed) => {
        const id = `deposit:${Math.round(seed.x)}:${Math.round(seed.y)}:${seed.resourceId}`;
        operation.depositKnowledge[id] ??= { id, resourceId: seed.resourceId, x: seed.x, y: seed.y, source: "regional-survey", confidence: 0.65, successfulSelections: 0 };
      });
    });
  }

  function getDepositCandidates(resourceId, position) {
    return Object.values(operation.depositKnowledge)
      .filter((deposit) => deposit.resourceId === resourceId)
      .sort((a, b) => {
        const aScore = (a.confidence + a.successfulSelections * 0.15) / Math.max(500, Math.hypot(a.x - position.x, a.y - position.y));
        const bScore = (b.confidence + b.successfulSelections * 0.15) / Math.max(500, Math.hypot(b.x - position.x, b.y - position.y));
        return bScore - aScore;
      })
      .slice(0, 12)
      .map((deposit) => ({ id: deposit.id, x: deposit.x, y: deposit.y }));
  }

  // Hire when work is being turned away, let a ship go when it plainly is not
  // needed. Both decisions are made on SUSTAINED conditions rather than a
  // single tick, so a moment of everyone being busy does not buy a ship.
  function assessHiring() {
    operation.fleetPolicy ??= { allBusySince: null };
    const policy = operation.fleetPolicy;
    const serviceable = workers.filter((worker) => operation.ships[worker.id]?.maintenanceStatus === "available");
    if (serviceable.length === 0) { policy.allBusySince = null; return; }

    // ── hiring ────────────────────────────────────────────────────────────
    const allBusy = serviceable.every((worker) => worker.assignment);
    if (!allBusy) policy.allBusySince = null;
    else policy.allBusySince ??= now();

    const account = operation.institution.accounts.operating;
    const busyLongEnough = policy.allBusySince != null
      && now() - policy.allBusySince >= HIRE_AFTER_BUSY_SECONDS * 1000;
    const canAfford = account.balance - getActorProtectedCash(state, operation.institution.id) >= HIRE_COST;

    if (busyLongEnough && workers.length < MAX_FLEET) {
      if (!canAfford) {
        recordBlocker(state, operation.institution.id, createBlocker({
          kind: BLOCKER_KIND.PAYER_CANNOT_AFFORD,
          summary: `${operation.controller.name} has had every ship committed for a minute but cannot fund a ${HIRE_COST} cr hire`,
          subjectId: operation.institution.id,
          waitingFor: "delivery income",
          wakeOn: ["mining.contractFulfilled"],
          detail: { balance: Math.round(account.balance), hireCost: HIRE_COST, fleetSize: workers.length },
          at: now(),
        }), { state: DIAGNOSTIC_STATE.WAITING, at: now() });
      } else {
        hireWorker(account);
        policy.allBusySince = null;   // earn the next hire from scratch
        return;
      }
    }

    // ── letting one go ────────────────────────────────────────────────────
    if (workers.length <= MIN_FLEET) return;
    serviceable.forEach((worker) => {
      const shipRecord = operation.ships[worker.id];
      if (!shipRecord) return;
      if (worker.assignment) { shipRecord.idleSince = null; return; }
      shipRecord.idleSince ??= now();
      if (now() - shipRecord.idleSince < RELEASE_AFTER_IDLE_SECONDS * 1000) return;
      // Never let a ship go while it is still carrying something: the cargo
      // would vanish with it.
      const carrying = Object.values(worker.cargo ?? {}).reduce((sum, units) => sum + units, 0);
      if (carrying > 0) return;
      if (workers.length <= MIN_FLEET) return;
      releaseWorker(worker, shipRecord);
    });
  }

  function hireWorker(account) {
    const index = (operation.hiredCount ?? 0) + 1;
    operation.hiredCount = index;
    const seat = workers.length + 1;
    const defaults = {
      id: `worker:${seed.fleetPrefix}-hire-${index}`,
      name: `${seed.fleetName} ${CREW_NAMES[seat - 1] ?? seat}`,
      referenceId: `MW-${seed.fleetPrefix.toUpperCase()}-${String(index).padStart(2, "0")}`,
      currentSiteId: seed.homeSiteId,
      initialWear: 0.08,
      offset: { x: -120 + (index % 4) * 80, y: 60 + (index % 3) * 40 },
    };
    account.balance -= HIRE_COST;
    account.transactions.push({ id: `MIN-HIRE-${now()}-${index}`, at: now(), type: "capital-expense", amount: -HIRE_COST, balance: account.balance, referenceId: defaults.id });
    const shipRecord = createWorkerRecord(defaults, operation.institution.id);
    operation.ships[shipRecord.id] = shipRecord;
    addPhysicalWorker(shipRecord);
    record("mining.workerHired", `${operation.controller.name} hired ${defaults.name} for ${HIRE_COST} cr — the whole fleet had been committed for a minute with work still waiting.`, {
      shipInstitutionId: shipRecord.id, shipName: shipRecord.name, cost: HIRE_COST,
      fleetSize: workers.length, accountBalance: Math.round(account.balance),
    });
  }

  function releaseWorker(worker, shipRecord) {
    const idleSeconds = Math.round((now() - (shipRecord.idleSince ?? now())) / 1000);
    worker.isAlive = false;              // the game drops it on the next frame
    const index = workers.indexOf(worker);
    if (index >= 0) workers.splice(index, 1);
    delete operation.ships[shipRecord.id];
    clearBlocker(state, shipRecord.id, { state: DIAGNOSTIC_STATE.FREE, summary: `${shipRecord.name} was stood down`, at: now() });
    record("mining.workerReleased", `${operation.controller.name} stood ${shipRecord.name} down after ${idleSeconds}s with nothing to do.`, {
      shipInstitutionId: shipRecord.id, shipName: shipRecord.name, idleSeconds,
      fleetSize: workers.length,
    });
  }

  function assessExpansion() {
    const project = seed.expansionProject ? operation.projects[seed.expansionProject.id] : null;
    if (!project || project.status === "completed") return;
    const serviceable = workers.filter((worker) => operation.ships[worker.id]?.maintenanceStatus === "available");
    const criticalAllocations = Object.values(operation.allocations).filter((allocation) => allocation.orderKind === "sprc" && allocation.status === "active");
    const underPressure = criticalAllocations.length >= 2 && serviceable.length > 0 && serviceable.every((worker) => worker.assignment);
    if (project.status === "planned") {
      if (!underPressure) project.demandSince = null;
      else project.demandSince ??= now();
      const requiredSeconds = state._devStartId ? 5 : EXPANSION_DEMAND_SECONDS;
      if (project.demandSince != null && now() - project.demandSince >= requiredSeconds * 1000) {
        project.status = "approved";
        project.approvedAt = now();
        record("mining.expansionApproved", `${operation.controller.name} approved ${project.name} after sustained repair-supply demand occupied the available fleet.`, { projectId: project.id, requiredCredits: project.requiredCredits });
      }
    }
    if (project.status !== "approved") return;
    const account = operation.institution.accounts.operating;
    if (account.balance - getActorProtectedCash(state, operation.institution.id) < project.requiredCredits) return;
    account.balance -= project.requiredCredits;
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
    const order = STANDING_MINING_ORDERS.find((candidate) => candidate.id === contractId);
    if (!order) return refusePermanently(allocation, ship, "order-missing");
    const settlement = settleStandingMiningOrder({ state, orderId: contractId, resourceId, amount: Math.min(amount, allocation.amount), supplierAccount: operation.institution.accounts.operating, referenceId: allocation.id, now: now() });
    if (!settlement) {
      // A standing order only fails to settle when the buyer cannot fund it or
      // the material does not match. Funding can recover; a mismatch cannot.
      const mismatched = order.resourceId !== resourceId;
      return mismatched
        ? refusePermanently(allocation, ship, "resource-mismatch")
        : refuseForNow("buyer-cannot-fund");
    }
    const { delivered, payment } = settlement;
    finishDelivery({ allocation, ship, siteId: order.siteId, resourceId, delivered, payment, orderLabel: order.id });
    const surplusSoldUnits = sellSurplusAtHub({ ship, siteId: order.siteId, resourceId, acceptedUnits: delivered });
    return { acceptedUnits: delivered, paid: payment, surplusSoldUnits };
  }

  function sellSurplusAtHub({ ship, siteId, resourceId, acceptedUnits }) {
    const surplus = Math.max(0, (ship.cargo[resourceId] ?? 0) - acceptedUnits);
    if (surplus <= 0) return 0;
    const buyerInstitutionId = siteId === "scrap-porch" ? "scrap-forge" : siteId;
    const buyer = state.logistics?.institutions?.[buyerInstitutionId];
    const unitPrice = Math.max(1, Math.floor(getResourceTradeValue(resourceId) * 0.7));
    const affordableUnits = Math.min(surplus, Math.floor((buyer?.accounts?.operating?.balance ?? 0) / unitPrice));
    if (!buyer || affordableUnits <= 0) return 0;
    const payment = affordableUnits * unitPrice;
    buyer.inventories[resourceId] = (buyer.inventories[resourceId] ?? 0) + affordableUnits;
    buyer.accounts.operating.balance -= payment;
    operation.institution.accounts.operating.balance += payment;
    operation.institution.accounts.operating.transactions.push({ id: `MIN-SURPLUS-${now()}-${ship.id}`, at: now(), type: "wholesale-income", amount: payment, balance: operation.institution.accounts.operating.balance, referenceId: buyerInstitutionId });
    record("mining.surplusSold", `${ship.name} sold ${affordableUnits} surplus ${resourceId.replaceAll("-", " ")} to ${siteName(siteId)} supply for ${payment} cr.`, { siteId, resourceId, quantity: affordableUnits, payment, shipInstitutionId: ship.id, shipName: ship.name, buyerInstitutionId });
    return affordableUnits;
  }

  function finishDelivery({ allocation, ship, siteId, resourceId, delivered, payment, orderLabel }) {
    allocation.status = "completed";
    allocation.delivered = delivered;
    allocation.paid = payment;
    allocation.completedAt = now();
    const shipRecord = operation.ships[ship.id];
    shipRecord.currentSiteId = siteId;
    const workWear = getMiningWorkWear();
    shipRecord.wear = Math.min(1, (shipRecord.wear ?? 0) + workWear);
    operation.completedContracts += 1;
    operation.wear = Object.values(operation.ships).reduce((sum, record) => sum + (record.wear ?? 0), 0) / Object.keys(operation.ships).length;
    record("mining.contractFulfilled", `${ship.name} delivered ${delivered} ${resourceId.replaceAll("-", " ")} to ${siteName(siteId)}, earned ${payment} cr, and completed ${orderLabel}. Wear is now ${shipRecord.wear.toFixed(2)}.`, { orderId: allocation.orderId, siteId, resourceId, quantity: delivered, payment, accountBalance: operation.institution.accounts.operating.balance, wear: operation.wear, shipWear: shipRecord.wear, shipInstitutionId: ship.id, shipName: ship.name });
    if (shipRecord.wear >= 1 && shipRecord.maintenanceStatus === "available") beginMaintenance(shipRecord, ship);
  }

  function siteName(siteId) {
    return sites.get(siteId)?.name ?? siteId.replaceAll("-", " ");
  }

  function beginMaintenance(shipRecord, ship) {
    const issue = MINING_ISSUES[shipRecord.issueCount % MINING_ISSUES.length];
    const serviceSite = sites.get("scrap-porch");
    if (!serviceSite) return;
    shipRecord.issueCount += 1;
    shipRecord.pendingIssue = issue.issueType;
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
      detail: { issueType: issue.issueType, requiredCapabilities: issue.requiredCapabilities, wear: shipRecord.wear },
      at: now(),
    }), { state: DIAGNOSTIC_STATE.DISABLED, at: now() });
    record("mining.maintenanceRequired", `${shipRecord.name} developed ${issue.issueType.replaceAll("-", " ")} after mining work and is returning to Scrap Porch.`, { shipInstitutionId: shipRecord.id, shipName: shipRecord.name, issueType: issue.issueType, wear: shipRecord.wear, requiredCapabilities: issue.requiredCapabilities });
  }

  function consumeMaintenanceEvents() {
    for (const event of state.ledger.getEventsAfterId(operation.lastMaintenanceEventId, { includeHidden: true })) {
      operation.lastMaintenanceEventId = Math.max(operation.lastMaintenanceEventId, event.id);
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
    shipRecord.wear = 0;
    shipRecord.pendingIssue = null;
    shipRecord.maintenanceStatus = "available";
    shipRecord.currentSiteId = "scrap-porch";
    workers.find((worker) => worker.id === shipRecord.id)?.completeService();
    // Diagnostics: serviced, paid, and free again.
    clearBlocker(state, shipRecord.id, {
      state: DIAGNOSTIC_STATE.FREE,
      summary: `${shipRecord.name} paid ${price} cr for service and is available for work`,
      at: now(),
    });
    record("mining.maintenanceCompleted", `${shipRecord.name} paid SPRC ${price} cr, completed service, and returned to mining duty.`, { shipInstitutionId: shipRecord.id, shipName: shipRecord.name, repairOrderId, payment: price, accountBalance: account.balance });
  }

  function recordWorkerEvent(shipRecord, actionType, payload) {
    const messages = {
      "assignment.accepted": `${operation.controller.name} dispatched ${shipRecord.name} on a mining allocation.`,
      "prospect.selected": `${shipRecord.name} selected a real ${payload.resourceId} rock and is approaching it.`,
      "resource.collected": `${shipRecord.name} collected ${payload.quantity} ${payload.resourceId}.`,
      "delivery.completed": `${shipRecord.name} completed its physical delivery.`,
      "service.arrived": payload.issueType ? `${shipRecord.name} arrived at Scrap Porch and requested service for ${payload.issueType.replaceAll("-", " ")}.` : `${shipRecord.name} arrived at Scrap Porch for service.`,
    };
    if (actionType === "prospect.selected") {
      const id = `deposit:${payload.x}:${payload.y}:${payload.resourceId}`;
      const deposit = operation.depositKnowledge[id] ??= { id, resourceId: payload.resourceId, x: payload.x, y: payload.y, source: "worker-observation", confidence: 0.85, successfulSelections: 0 };
      deposit.confidence = Math.min(1, deposit.confidence + 0.05);
      deposit.successfulSelections += 1;
      deposit.lastObservedAt = now();
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
      }, { visible: false });
    }
  }

  function record(type, message, payload = {}) {
    operation.history.push({ id: `mining-history-${operation.history.length + 1}`, type, at: now(), ...payload });
    state.ledger.recordEvent(type, { institutionId: operation.institution.id, institutionName: operation.institution.name, actorInstitutionId: operation.controller.id, actorName: operation.controller.name, ...payload }, { visible: true, message });
  }

  update();
  // `chooseOrder` is exposed because selection is a question the shared layer
  // will want to ask without committing an actor to the answer: what would this
  // miner take right now, and why. It only records the reasoning.
  return { update, getState: () => operation, chooseOrder, listOffers: () => listExtractionOffers(state, offerContext()), worker: workers[0], workers };
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
  return { id: defaults.id, name: defaults.name, archetypeId: "mining-worker", ownerInstitutionId, referenceId: defaults.referenceId, currentSiteId: defaults.currentSiteId, status: "idle", cargo: {}, wear: defaults.initialWear ?? 0, issueCount: 0, pendingIssue: null, maintenanceStatus: "available", lastDecisionKey: null, capabilities: { miningLaser: true, cargoCollector: true, tractorField: { powered: true, powerSource: "evergreen" } } };
}
