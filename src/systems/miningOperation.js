import { MiningWorkerShip } from "../entities/MiningWorkerShip.js?v=fresh-20260731-2007-6bc3845";
import { getOreClusterSeedsInRadius } from "./asteroidField.js?v=fresh-20260731-2007-6bc3845";
import { getResourceFamily, getResourceTradeValue } from "./resourceDefinitions.js?v=fresh-20260731-2007-6bc3845";
import { canActorDoAction } from "./ruleChecker.js?v=fresh-20260731-2007-6bc3845";
import { getMiningWorkWear } from "./wearRates.js?v=fresh-20260731-2007-6bc3845";
import { evaluateMiningJob, evaluateProcurement } from "./valuation.js?v=fresh-20260731-2007-6bc3845";
import { getInventoryPosition } from "./hubInventory.js?v=fresh-20260731-2007-6bc3845";
import { getServiceCost, recordAcquisition, recordServiceCost } from "./costBasis.js?v=fresh-20260731-2007-6bc3845";
import { BLOCKER_KIND, DIAGNOSTIC_STATE, clearBlocker, createBlocker, recordBlocker, recordDecision, recordDiagnostic } from "./diagnostics.js?v=fresh-20260731-2007-6bc3845";

// Identity only: which hub extracts which material at which site.
//
// The authored quantity and price are gone. Both are derived per tick by
// getPostedMiningOrders from a real inventory gap and the shared valuation
// framework, and the order is withheld entirely when the hub needs nothing —
// so what remains here is not an order, it is the fact that this hub is the one
// that digs this material. The material itself is the representative member of
// the family the hub holds mining rights to.
export const STANDING_MINING_ORDERS = Object.freeze([
  { id: "mine-yard-iron", siteId: "yard-exchange", siteName: "Yard Exchange", buyerInstitutionId: "yard-exchange", resourceId: "iron-nickel", resourceName: "Iron Nickel" },
  { id: "mine-porch-water", siteId: "scrap-porch", siteName: "Scrap Porch", buyerInstitutionId: "scrap-forge", resourceId: "water-ice", resourceName: "Water Ice" },
  { id: "mine-ledge-silicate", siteId: "the-ledge", siteName: "The Ledge", buyerInstitutionId: "the-ledge", resourceId: "silicate", resourceName: "Silicate" },
]);

const MINING_WORKER_DEFAULTS = Object.freeze([
  { id: "worker:cinder-one", name: "Cinder One", referenceId: "MW-031-CINDER", currentSiteId: "scrap-porch", initialWear: 0.65, offset: { x: -100, y: 80 } },
  { id: "worker:cinder-two", name: "Cinder Two", referenceId: "MW-032-CINDER", currentSiteId: "yard-exchange", initialWear: 0.25, offset: { x: -90, y: -90 } },
  { id: "worker:cinder-three", name: "Cinder Three", referenceId: "MW-033-CINDER", currentSiteId: "the-ledge", initialWear: 0, offset: { x: 100, y: 80 } },
]);
const EXPANSION_WORKER_DEFAULTS = Object.freeze({ id: "worker:cinder-four", name: "Cinder Four", referenceId: "MW-034-CINDER", currentSiteId: "scrap-porch", initialWear: 0.15, offset: { x: 110, y: -80 } });
const MINING_ALLOCATION_SIZE = 6;
const EXPANSION_COST = 350;
const EXPANSION_DEMAND_SECONDS = 12;
const DEPOSIT_SURVEY_RADIUS = 12000;

const MINING_ISSUES = Object.freeze([
  { issueType: "structural-fatigue", requiredCapabilities: ["structural-repair", "mechanical-repair"] },
  { issueType: "tractor-field-instability", requiredCapabilities: ["tractor-field", "mechanical-repair"] },
  { issueType: "field-control-failure", requiredCapabilities: ["field-control"] },
  { issueType: "preventive-calibration", requiredCapabilities: ["field-control"] },
]);
const MINING_SERVICE_PRICE = 220;
const MINING_PROTECTED_CASH = 120;

// Largest single order a hub will place, so a big gap becomes several runs
// rather than one impossible haul.
const MAX_ORDER_UNITS = 6;
// A hub keeps a working float back so buying ore never leaves it unable to pay
// for the production the ore is for.
const HUB_PROTECTED_CASH = 400;
const HUB_TRAITS = Object.freeze({ urgencyBias: 0.5, caution: 0.5, growthBias: 0.3 });

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
      urgency: position.onHand === 0 ? "critical" : "routine",
      inventory: position,
      requestedUnits: Math.min(position.gap, MAX_ORDER_UNITS),
      account: buyer.accounts?.operating ?? {},
      policy: { protectedCash: HUB_PROTECTED_CASH },
      traits: HUB_TRAITS,
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

export function createMiningOperation({ state, game, sprcOperation = null, now = () => Date.now() }) {
  const operation = state.miningOperation ??= createInitialState(now());
  operation.ships ??= {};
  operation.allocations ??= {};
  operation.completedContracts ??= 0;
  operation.wear ??= 0;
  operation.lastMaintenanceEventId ??= 0;
  operation.depositKnowledge ??= {};
  operation.rightsDenied ??= {};
  operation.postedOrders ??= {};
  operation.projects ??= { "cinder-four": { id: "cinder-four", name: "Commission Cinder Four", status: "planned", requiredCredits: EXPANSION_COST, demandSince: null, approvedAt: null, completedAt: null } };
  MINING_WORKER_DEFAULTS.forEach((defaults) => {
    operation.ships[defaults.id] ??= createWorkerRecord(defaults);
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
    const defaults = [...MINING_WORKER_DEFAULTS, EXPANSION_WORKER_DEFAULTS].find((entry) => entry.id === shipRecord.id) ?? EXPANSION_WORKER_DEFAULTS;
    const home = sites.get(shipRecord.currentSiteId) ?? sites.get("scrap-porch");
    const worker = new MiningWorkerShip({
      id: shipRecord.id,
      name: shipRecord.name,
      institutionId: shipRecord.ownerInstitutionId,
      controllerInstitutionId: operation.institution.controllerInstitutionId,
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
        status: "active",
        acceptedAt: now(),
      };
      if (order.kind === "sprc") {
        const reservation = sprcOperation.reserveProcurementAllocation({
          contractId: order.contractId,
          supplierInstitutionId: operation.institution.id,
          equivalentUnits: order.equivalentAmount,
        });
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
        harvestTargetQuantity: order.kind === "sprc" ? MINING_ALLOCATION_SIZE : order.amount,
        depositCandidates: getDepositCandidates(order.resourceId, worker.position),
      });
      if (order.kind !== "sprc") operation.nextOrderIndex = (STANDING_MINING_ORDERS.indexOf(order) + 1) % STANDING_MINING_ORDERS.length;
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
        intention: { id: allocation.id, kind: "extraction", goal: `deliver ${order.amount} ${order.resourceId} to ${order.siteName}`, objectId: order.id, contractId: order.contractId ?? order.id, reserved: { equivalentUnits: allocation.equivalentAmount } },
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
        summary: `Every Cinder ship is committed; those jobs currently have higher net value`,
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
        summary: `${idle} Cinder ship(s) have no order worth their cost`,
        subjectId: operation.institution.id,
        waitingFor: "an order that clears cost",
        wakeOn: ["order-posted", "order-repriced"],
        causedBy: idleWorker ? [{ actorId: idleWorker.id }] : [],
        detail: { fleetSize: ships.length, committed, idle, inService },
        at: now(),
      });
    }

    recordDiagnostic(state, operation.institution.id, {
      actorName: operation.institution.name ?? "Cinder Contracting",
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
        availableCash: Math.round(Math.max(0, (account.balance ?? 0) - MINING_PROTECTED_CASH)),
        protectedCash: MINING_PROTECTED_CASH,
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

  function chooseOrder(worker = null) {
    const position = worker?.position ?? sites.get("scrap-porch")?.position ?? { x: 0, y: 0 };
    const candidates = [...getSprcMiningOrders(), ...getAvailableStandingOrders()];
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

  function getAvailableStandingOrders() {
    return Object.values(operation.postedOrders ?? {}).filter((order) => {
      if (order.withheld || order.amount <= 0) return false;
      if (!mayPostMiningOrder(order)) return false;
      const alreadyAssigned = Object.values(operation.allocations).some((allocation) => allocation.orderId === order.id && allocation.status === "active");
      const buyer = state.logistics?.institutions?.[order.buyerInstitutionId];
      return !alreadyAssigned && (buyer?.accounts?.operating?.balance ?? 0) >= order.amount * order.paymentPerUnit;
    });
  }

  // A hub may only post mining demand for resource families it holds the right
  // to. This defers entirely to the shared rule checker — no hub is named here,
  // and moving a family between hubs is a data edit in the authority seeds.
  //
  // Denials are recorded ONCE per order, not per evaluation: this runs on every
  // idle worker every tick, and an unconditional record here would flood the
  // ledger the way the delivery rejections did.
  function mayPostMiningOrder(order) {
    const decision = canActorDoAction(state, {
      actorId: order.buyerInstitutionId.startsWith("institution:") ? order.buyerInstitutionId : `institution:${order.buyerInstitutionId}`,
      action: "mine",
      placeId: `hub:${order.siteId}`,
      resourceType: order.resourceId,
      at: now(),
    });
    if (decision.allowed) {
      delete operation.rightsDenied[order.id];
      return true;
    }
    if (!operation.rightsDenied[order.id]) {
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
    return false;
  }

  function valueOrderForWorker(order, position) {
    const destination = sites.get(order.siteId)?.position ?? position;
    const deposit = getDepositCandidates(order.resourceId, position)[0] ?? null;
    // Round trip: out to the nearest known deposit, then in to the buyer.
    const toDeposit = deposit ? Math.hypot(deposit.x - position.x, deposit.y - position.y) : Math.hypot(destination.x - position.x, destination.y - position.y);
    const toBuyer = deposit ? Math.hypot(destination.x - deposit.x, destination.y - deposit.y) : 0;
    // A worker on an SPRC run harvests a full load regardless of order size and
    // sells the remainder into local supply, so a small remainder order is
    // still worth taking. Counting that surplus keeps short orders viable.
    const contractPayout = order.kind === "sprc"
      ? (order.equivalentAmount ?? order.amount) * (order.pricePerEquivalent ?? 0)
      : order.amount * (order.paymentPerUnit ?? 0);
    const harvestTarget = order.kind === "sprc" ? MINING_ALLOCATION_SIZE : order.amount;
    const surplusUnits = Math.max(0, harvestTarget - order.amount);
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

  function getSprcMiningOrders() {
    if (!sprcOperation || !state.sprc) return [];
    return Object.values(state.sprc.procurementOrders)
      .filter((order) => ["offered", "active"].includes(order.status) && (order.committedPayment ?? 0) > 0)
      .map((order) => {
        const resourceId = ["copper", "silicate", "iron-nickel", "aluminum"].find((id) => (order.acceptedMaterials?.[id] ?? 0) > 0);
        const equivalence = order.acceptedMaterials?.[resourceId] ?? 0;
        const activeReserved = Object.values(operation.allocations)
          .filter((allocation) => allocation.orderId === order.id && allocation.status === "active")
          .reduce((sum, allocation) => sum + (allocation.equivalentAmount ?? allocation.amount ?? 0), 0);
        const remainingEquivalents = Math.max(0, order.requiredEquivalentUnits - order.deliveredEquivalentUnits - activeReserved);
        if (!resourceId || equivalence <= 0 || remainingEquivalents <= 0) return null;
        return {
          kind: "sprc", id: order.id, contractId: order.contractId, siteId: order.destinationSiteId, siteName: "Scrap Porch",
          resourceId, resourceName: resourceId.replaceAll("-", " "), amount: Math.ceil(Math.min(remainingEquivalents, MINING_ALLOCATION_SIZE * equivalence) / equivalence),
          equivalentAmount: Math.min(remainingEquivalents, MINING_ALLOCATION_SIZE * equivalence),
          // No hidden priority constant: the order competes on the price Sal
          // is actually offering, evaluated as net value like any other job.
          pricePerEquivalent: order.pricePerEquivalent ?? 0,
          objectiveType: order.objectiveType,
        };
      })
      .filter(Boolean);
  }

  function publishIdleDecision(shipRecord) {
    const reasons = [...getSprcMiningOrders(), ...STANDING_MINING_ORDERS].map((order) => {
      const occupied = Object.values(operation.allocations).some((allocation) => allocation.orderId === order.id && allocation.status === "active");
      if (order.kind === "sprc") return `${order.id}:${occupied ? "allocated" : "open"}`;
      const balance = state.logistics?.institutions?.[order.buyerInstitutionId]?.accounts?.operating?.balance ?? 0;
      return `${order.id}:${occupied ? "allocated" : balance < order.amount * order.paymentPerUnit ? "unfunded" : "open"}`;
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

  function assessExpansion() {
    const project = operation.projects["cinder-four"];
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
        record("mining.expansionApproved", `${operation.controller.name} approved Cinder Four after sustained repair-supply demand occupied the available fleet.`, { projectId: project.id, requiredCredits: project.requiredCredits });
      }
    }
    if (project.status !== "approved") return;
    const account = operation.institution.accounts.operating;
    if (account.balance - MINING_PROTECTED_CASH < project.requiredCredits) return;
    account.balance -= project.requiredCredits;
    account.transactions.push({ id: `MIN-EXP-${now()}`, at: now(), type: "capital-expense", amount: -project.requiredCredits, balance: account.balance, referenceId: project.id });
    const shipRecord = createWorkerRecord(EXPANSION_WORKER_DEFAULTS);
    operation.ships[shipRecord.id] = shipRecord;
    addPhysicalWorker(shipRecord);
    project.status = "completed";
    project.completedAt = now();
    record("mining.expansionCompleted", `${operation.controller.name} commissioned Cinder Four for ${project.requiredCredits} cr; the new worker entered service at Scrap Porch.`, { projectId: project.id, shipInstitutionId: shipRecord.id, shipName: shipRecord.name, cost: project.requiredCredits, accountBalance: account.balance });
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
        payer: { balance: operation.institution.accounts.operating.balance, committed: operation.institution.accounts.operating.committed ?? 0, protectedCash: MINING_PROTECTED_CASH },
        servicePrice: MINING_SERVICE_PRICE, wear: shipRecord.wear, issueCount: shipRecord.issueCount,
      }, { visible: false });
    }
  }

  function record(type, message, payload = {}) {
    operation.history.push({ id: `mining-history-${operation.history.length + 1}`, type, at: now(), ...payload });
    state.ledger.recordEvent(type, { institutionId: operation.institution.id, institutionName: operation.institution.name, actorInstitutionId: operation.controller.id, actorName: operation.controller.name, ...payload }, { visible: true, message });
  }

  update();
  return { update, getState: () => operation, worker: workers[0], workers };
}

function createInitialState(now) {
  return {
    version: 1,
    institution: { id: "miner:cinder-contracting", name: "Cinder Contracting", archetypeId: "mining-contractor", controllerInstitutionId: "person:ivo-cinder", referenceId: "FR-MIN-031", accounts: { operating: { id: "FR-ACCT-031", balance: 260, committed: 0, transactions: [] } } },
    controller: { id: "person:ivo-cinder", name: "Ivo Cinder", archetypeId: "person", controls: ["miner:cinder-contracting"], license: { id: "MEX-031-CINDER", class: "commercial-extraction", status: "active" } },
    ships: Object.fromEntries(MINING_WORKER_DEFAULTS.map((defaults) => [defaults.id, createWorkerRecord(defaults)])),
    allocations: {}, history: [{ id: "mining-history-1", type: "institution.instantiated", at: now }], nextOrderIndex: 1, counter: 0, completedContracts: 0, wear: 0, lastMaintenanceEventId: 0,
  };
}

function createWorkerRecord(defaults) {
  return { id: defaults.id, name: defaults.name, archetypeId: "mining-worker", ownerInstitutionId: "miner:cinder-contracting", referenceId: defaults.referenceId, currentSiteId: defaults.currentSiteId, status: "idle", cargo: {}, wear: defaults.initialWear ?? 0, issueCount: 0, pendingIssue: null, maintenanceStatus: "available", lastDecisionKey: null, capabilities: { miningLaser: true, cargoCollector: true, tractorField: { powered: true, powerSource: "evergreen" } } };
}
