import { MiningWorkerShip } from "../entities/MiningWorkerShip.js?v=fresh-20260726-1502-ed63a1c";

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
  const payment = Math.min(delivered * order.paymentPerUnit, buyer.accounts.operating.balance);
  buyer.inventories[resourceId] = (buyer.inventories[resourceId] ?? 0) + delivered;
  buyer.accounts.operating.balance -= payment;
  if (supplierAccount) {
    supplierAccount.balance += payment;
    supplierAccount.transactions?.push({ id: `MIN-TX-${referenceId ?? now}`, at: now, type: "mining-income", amount: payment, balance: supplierAccount.balance, referenceId });
  }
  return { order, buyer, delivered, payment };
}

export function createMiningOperation({ state, game, now = () => Date.now() }) {
  const operation = state.miningOperation ??= createInitialState(now());
  operation.ships ??= {};
  operation.allocations ??= {};
  operation.completedContracts ??= 0;
  operation.wear ??= 0;
  operation.lastMaintenanceEventId ??= 0;
  MINING_WORKER_DEFAULTS.forEach((defaults) => {
    operation.ships[defaults.id] ??= createWorkerRecord(defaults);
    operation.ships[defaults.id].capabilities ??= { miningLaser: true, cargoCollector: true, tractorField: { powered: true, powerSource: "evergreen" } };
    operation.ships[defaults.id].maintenanceStatus ??= "available";
    operation.ships[defaults.id].issueCount ??= 0;
    operation.ships[defaults.id].pendingIssue ??= null;
  });
  const sites = new Map(game.worldSites.map((site) => [site.id, site]));
  const workers = MINING_WORKER_DEFAULTS.map((defaults) => {
    const shipRecord = operation.ships[defaults.id];
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
    return worker;
  });

  function update() {
    consumeMaintenanceEvents();
    workers.forEach((worker) => {
      const shipRecord = operation.ships[worker.id];
      shipRecord.position = { x: worker.position.x, y: worker.position.y };
      shipRecord.status = worker.state;
      shipRecord.cargo = { ...worker.cargo };
      if (shipRecord.maintenanceStatus !== "available") return;
      if (worker.assignment) return;
      const order = chooseOrder();
      if (!order) return;
      const destination = sites.get(order.siteId)?.position;
      if (!destination) return;
      const allocation = {
        id: `allocation:${order.id}:${++operation.counter}`,
        orderId: order.id,
        supplierInstitutionId: operation.institution.id,
        workerShipId: worker.id,
        amount: order.amount,
        status: "active",
        acceptedAt: now(),
      };
      operation.allocations[allocation.id] = allocation;
      worker.assign({ allocationId: allocation.id, contractId: order.id, resourceId: order.resourceId, quantity: order.amount, destination });
      operation.nextOrderIndex = (STANDING_MINING_ORDERS.indexOf(order) + 1) % STANDING_MINING_ORDERS.length;
      record("mining.contractAccepted", `${operation.controller.name} dispatched ${worker.name} for ${order.amount} ${order.resourceName} at ${order.siteName}.`, { orderId: order.id, allocationId: allocation.id, siteId: order.siteId, resourceId: order.resourceId, quantity: order.amount, shipInstitutionId: worker.id, shipName: worker.name });
    });
  }

  function chooseOrder() {
    for (let offset = 0; offset < STANDING_MINING_ORDERS.length; offset += 1) {
      const order = STANDING_MINING_ORDERS[(operation.nextOrderIndex + offset) % STANDING_MINING_ORDERS.length];
      const alreadyAssigned = Object.values(operation.allocations).some((allocation) => allocation.orderId === order.id && allocation.status === "active");
      const buyer = state.logistics?.institutions?.[order.buyerInstitutionId];
      if (!alreadyAssigned && (buyer?.accounts?.operating?.balance ?? 0) >= order.amount * order.paymentPerUnit) return order;
    }
    return null;
  }

  function completeDelivery({ allocationId, contractId, resourceId, amount, ship }) {
    const order = STANDING_MINING_ORDERS.find((candidate) => candidate.id === contractId);
    const allocation = operation.allocations[allocationId];
    if (!order || !allocation || allocation.status !== "active") return;
    const settlement = settleStandingMiningOrder({ state, orderId: contractId, resourceId, amount: Math.min(amount, allocation.amount), supplierAccount: operation.institution.accounts.operating, referenceId: allocation.id, now: now() });
    if (!settlement) return;
    const { delivered, payment } = settlement;
    allocation.status = "completed";
    allocation.delivered = delivered;
    allocation.paid = payment;
    allocation.completedAt = now();
    const shipRecord = operation.ships[ship.id];
    shipRecord.currentSiteId = order.siteId;
    const workWear = state._devStartId ? ACCELERATED_WORK_WEAR : NORMAL_WORK_WEAR;
    shipRecord.wear = Math.min(1, (shipRecord.wear ?? 0) + workWear);
    operation.completedContracts += 1;
    operation.wear = Object.values(operation.ships).reduce((sum, record) => sum + (record.wear ?? 0), 0) / Object.keys(operation.ships).length;
    record("mining.contractFulfilled", `${ship.name} delivered ${delivered} ${order.resourceName} to ${order.siteName}, earned ${payment} cr, and added it to the hub's freight inventory. Wear is now ${shipRecord.wear.toFixed(2)}.`, { orderId: order.id, siteId: order.siteId, resourceId, quantity: delivered, payment, accountBalance: operation.institution.accounts.operating.balance, wear: operation.wear, shipWear: shipRecord.wear, shipInstitutionId: ship.id, shipName: ship.name });
    if (shipRecord.wear >= 1 && shipRecord.maintenanceStatus === "available") beginMaintenance(shipRecord, ship);
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
      const price = event.payload.serviceRevenue ?? MINING_SERVICE_PRICE;
      const account = operation.institution.accounts.operating;
      if (account.balance < price) continue;
      account.balance -= price;
      account.transactions.push({ id: `MIN-SVC-${event.id}`, at: now(), type: "maintenance-expense", amount: -price, balance: account.balance, referenceId: event.payload.repairOrderId });
      if (state.sprc?.account) state.sprc.account.balance += price;
      shipRecord.wear = 0;
      shipRecord.pendingIssue = null;
      shipRecord.maintenanceStatus = "available";
      shipRecord.currentSiteId = "scrap-porch";
      workers.find((worker) => worker.id === shipRecord.id)?.completeService();
      record("mining.maintenanceCompleted", `${shipRecord.name} paid SPRC ${price} cr, completed service, and returned to mining duty.`, { shipInstitutionId: shipRecord.id, shipName: shipRecord.name, repairOrderId: event.payload.repairOrderId, payment: price, accountBalance: account.balance });
    }
  }

  function recordWorkerEvent(shipRecord, actionType, payload) {
    const messages = {
      "assignment.accepted": `${operation.controller.name} dispatched ${shipRecord.name} on a mining allocation.`,
      "prospect.selected": `${shipRecord.name} selected a real ${payload.resourceId} rock and is approaching it.`,
      "resource.collected": `${shipRecord.name} collected ${payload.quantity} ${payload.resourceId}.`,
      "delivery.completed": `${shipRecord.name} completed its physical delivery.`,
      "service.arrived": payload.issueType ? `${shipRecord.name} arrived at Scrap Porch and requested service for ${payload.issueType.replaceAll("-", " ")}.` : `${shipRecord.name} arrived at Scrap Porch for service.`,
    };
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
  return { id: defaults.id, name: defaults.name, archetypeId: "mining-worker", ownerInstitutionId: "miner:cinder-contracting", referenceId: defaults.referenceId, currentSiteId: defaults.currentSiteId, status: "idle", cargo: {}, wear: defaults.initialWear ?? 0, issueCount: 0, pendingIssue: null, maintenanceStatus: "available", capabilities: { miningLaser: true, cargoCollector: true, tractorField: { powered: true, powerSource: "evergreen" } } };
}
