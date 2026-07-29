import { MiningWorkerShip } from "../entities/MiningWorkerShip.js?v=fresh-20260728-2032-8e0cc22";
import { getOreClusterSeedsInRadius } from "./asteroidField.js?v=fresh-20260728-2032-8e0cc22";
import { getResourceTradeValue } from "./resourceDefinitions.js?v=fresh-20260728-2032-8e0cc22";
import { evaluateMiningJob } from "./valuation.js?v=fresh-20260728-2032-8e0cc22";
import { getServiceCost, recordServiceCost } from "./costBasis.js?v=fresh-20260728-2032-8e0cc22";

export const STANDING_MINING_ORDERS = Object.freeze([
  { id: "mine-yard-iron", siteId: "yard-exchange", siteName: "Yard Exchange", buyerInstitutionId: "yard-exchange", resourceId: "iron-nickel", resourceName: "Iron Nickel", amount: 3, paymentPerUnit: 42 },
  { id: "mine-porch-water", siteId: "scrap-porch", siteName: "Scrap Porch", buyerInstitutionId: "scrap-forge", resourceId: "water-ice", resourceName: "Water Ice", amount: 3, paymentPerUnit: 46 },
  { id: "mine-ledge-silicate", siteId: "the-ledge", siteName: "The Ledge", buyerInstitutionId: "the-ledge", resourceId: "silicate", resourceName: "Silicate", amount: 3, paymentPerUnit: 70 },
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
const NORMAL_WORK_WEAR = 0.125;
const ACCELERATED_WORK_WEAR = 0.4;
const MINING_SERVICE_PRICE = 220;
const MINING_PROTECTED_CASH = 120;

export function getStandingMiningJobsForSite(siteId, issuer = null) {
  return STANDING_MINING_ORDERS.filter((order) => order.siteId === siteId).map((order) => ({
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

export function settleStandingMiningOrder({ state, orderId, resourceId, amount, supplierAccount = null, referenceId = null, now = Date.now() }) {
  const order = STANDING_MINING_ORDERS.find((candidate) => candidate.id === orderId);
  const delivered = Math.min(Math.max(0, amount ?? 0), order?.amount ?? 0);
  const buyer = state.logistics?.institutions?.[order?.buyerInstitutionId];
  if (!order || !buyer || order.resourceId !== resourceId || delivered <= 0) return null;
  const payment = delivered * order.paymentPerUnit;
  if ((buyer.accounts.operating.balance ?? 0) < payment) return null;
  buyer.inventories[resourceId] = (buyer.inventories[resourceId] ?? 0) + delivered;
  buyer.accounts.operating.balance -= payment;
  if (supplierAccount) {
    supplierAccount.balance += payment;
    supplierAccount.transactions?.push({ id: `MIN-TX-${referenceId ?? now}`, at: now, type: "mining-income", amount: payment, balance: supplierAccount.balance, referenceId });
  }
  return { order, buyer, delivered, payment };
}

export function canFundStandingMiningOrder({ state, orderId, amount = null }) {
  const order = STANDING_MINING_ORDERS.find((candidate) => candidate.id === orderId);
  const buyer = state.logistics?.institutions?.[order?.buyerInstitutionId];
  if (!order || !buyer) return false;
  const units = Math.min(Math.max(0, amount ?? order.amount), order.amount);
  return (buyer.accounts.operating.balance ?? 0) >= units * order.paymentPerUnit;
}

export function createMiningOperation({ state, game, sprcOperation = null, now = () => Date.now() }) {
  const operation = state.miningOperation ??= createInitialState(now());
  operation.ships ??= {};
  operation.allocations ??= {};
  operation.completedContracts ??= 0;
  operation.wear ??= 0;
  operation.lastMaintenanceEventId ??= 0;
  operation.depositKnowledge ??= {};
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
    consumeMaintenanceEvents();
    assessExpansion();
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
      if (!destination) return;
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
        if (!reservation) return;
      }
      operation.allocations[allocation.id] = allocation;
      shipRecord.lastDecisionKey = null;
      worker.assign({
        allocationId: allocation.id, contractId: order.contractId ?? order.id, resourceId: order.resourceId, quantity: order.amount, destination,
        harvestTargetQuantity: order.kind === "sprc" ? MINING_ALLOCATION_SIZE : order.amount,
        depositCandidates: getDepositCandidates(order.resourceId, worker.position),
      });
      if (order.kind !== "sprc") operation.nextOrderIndex = (STANDING_MINING_ORDERS.indexOf(order) + 1) % STANDING_MINING_ORDERS.length;
      record("mining.contractAccepted", `${operation.controller.name} dispatched ${worker.name} for ${order.amount} ${order.resourceName} at ${order.siteName}.`, { orderId: order.id, allocationId: allocation.id, siteId: order.siteId, resourceId: order.resourceId, quantity: order.amount, shipInstitutionId: worker.id, shipName: worker.name });
    });
  }

  // Compare every candidate job by EXPECTED NET VALUE — payout minus travel,
  // wear, and risk — instead of a hidden priority constant. Urgent SPRC work
  // wins here because Sal bids the price up, and the reasons are inspectable.
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
    return STANDING_MINING_ORDERS.filter((order) => {
      const alreadyAssigned = Object.values(operation.allocations).some((allocation) => allocation.orderId === order.id && allocation.status === "active");
      const buyer = state.logistics?.institutions?.[order.buyerInstitutionId];
      return !alreadyAssigned && (buyer?.accounts?.operating?.balance ?? 0) >= order.amount * order.paymentPerUnit;
    });
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

  function completeDelivery({ allocationId, contractId, resourceId, amount, ship }) {
    const allocation = operation.allocations[allocationId];
    if (!allocation || allocation.status !== "active") return { acceptedUnits: 0, paid: 0 };
    if (allocation.orderKind === "sprc") {
      const procurement = state.sprc?.procurementOrders?.[allocation.orderId];
      if (!procurement) return { acceptedUnits: 0, paid: 0 };
      const result = sprcOperation.deliverMaterial({
        contractId, materialId: resourceId, amount: Math.min(amount, allocation.amount), supplierInstitutionId: operation.institution.id,
        creditSupplier: (payment) => {
          operation.institution.accounts.operating.balance += payment;
          operation.institution.accounts.operating.transactions.push({ id: `MIN-TX-${allocation.id}`, at: now(), type: "mining-income", amount: payment, balance: operation.institution.accounts.operating.balance, referenceId: allocation.id });
        },
      });
      if (!result?.acceptedUnits) return { acceptedUnits: 0, paid: 0 };
      finishDelivery({ allocation, ship, siteId: procurement.destinationSiteId, resourceId, delivered: result.acceptedUnits, payment: result.paid, orderLabel: procurement.id });
      const surplusSoldUnits = sellSurplusAtHub({ ship, siteId: procurement.destinationSiteId, resourceId, acceptedUnits: result.acceptedUnits });
      return { ...result, surplusSoldUnits };
    }
    const order = STANDING_MINING_ORDERS.find((candidate) => candidate.id === contractId);
    if (!order) return { acceptedUnits: 0, paid: 0 };
    const settlement = settleStandingMiningOrder({ state, orderId: contractId, resourceId, amount: Math.min(amount, allocation.amount), supplierAccount: operation.institution.accounts.operating, referenceId: allocation.id, now: now() });
    if (!settlement) return { acceptedUnits: 0, paid: 0 };
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
    const workWear = state._devStartId ? ACCELERATED_WORK_WEAR : NORMAL_WORK_WEAR;
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
