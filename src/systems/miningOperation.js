import { MiningWorkerShip } from "../entities/MiningWorkerShip.js?v=fresh-20260726-1139-3d379b8";

export const STANDING_MINING_ORDERS = Object.freeze([
  { id: "mine-yard-iron", siteId: "yard-exchange", siteName: "Yard Exchange", buyerInstitutionId: "yard-exchange", resourceId: "iron-nickel", resourceName: "Iron Nickel", amount: 3, paymentPerUnit: 42 },
  { id: "mine-porch-water", siteId: "scrap-porch", siteName: "Scrap Porch", buyerInstitutionId: "scrap-forge", resourceId: "water-ice", resourceName: "Water Ice", amount: 3, paymentPerUnit: 46 },
  { id: "mine-ledge-silicate", siteId: "the-ledge", siteName: "The Ledge", buyerInstitutionId: "the-ledge", resourceId: "silicate", resourceName: "Silicate", amount: 3, paymentPerUnit: 70 },
]);

const MINING_WORKER_DEFAULTS = Object.freeze([
  { id: "worker:cinder-one", name: "Cinder One", referenceId: "MW-031-CINDER", currentSiteId: "scrap-porch", offset: { x: -100, y: 80 } },
  { id: "worker:cinder-two", name: "Cinder Two", referenceId: "MW-032-CINDER", currentSiteId: "yard-exchange", offset: { x: -90, y: -90 } },
  { id: "worker:cinder-three", name: "Cinder Three", referenceId: "MW-033-CINDER", currentSiteId: "the-ledge", offset: { x: 100, y: 80 } },
]);

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

export function createMiningOperation({ state, game, now = () => Date.now() }) {
  const operation = state.miningOperation ??= createInitialState(now());
  operation.ships ??= {};
  operation.allocations ??= {};
  operation.completedContracts ??= 0;
  operation.wear ??= 0;
  MINING_WORKER_DEFAULTS.forEach((defaults) => {
    operation.ships[defaults.id] ??= createWorkerRecord(defaults);
    operation.ships[defaults.id].capabilities ??= { miningLaser: true, cargoCollector: true, tractorField: { powered: true, powerSource: "evergreen" } };
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
    workers.forEach((worker) => {
      const shipRecord = operation.ships[worker.id];
      shipRecord.position = { x: worker.position.x, y: worker.position.y };
      shipRecord.status = worker.state;
      shipRecord.cargo = { ...worker.cargo };
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
    const delivered = Math.min(amount, allocation.amount);
    const buyer = state.logistics?.institutions?.[order.buyerInstitutionId];
    if (!buyer) return;
    const payment = Math.min(delivered * order.paymentPerUnit, buyer.accounts.operating.balance);
    buyer.inventories[resourceId] = (buyer.inventories[resourceId] ?? 0) + delivered;
    buyer.accounts.operating.balance -= payment;
    operation.institution.accounts.operating.balance += payment;
    operation.institution.accounts.operating.transactions.push({ id: `MIN-TX-${operation.counter}`, at: now(), type: "mining-income", amount: payment, balance: operation.institution.accounts.operating.balance, referenceId: allocation.id });
    allocation.status = "completed";
    allocation.delivered = delivered;
    allocation.paid = payment;
    allocation.completedAt = now();
    const shipRecord = operation.ships[ship.id];
    shipRecord.currentSiteId = order.siteId;
    shipRecord.wear = Math.min(1, (shipRecord.wear ?? 0) + 0.035);
    operation.completedContracts += 1;
    operation.wear = Math.min(1, operation.wear + 0.035);
    record("mining.contractFulfilled", `${ship.name} delivered ${delivered} ${order.resourceName} to ${order.siteName}, earned ${payment} cr, and added it to the hub's freight inventory.`, { orderId: order.id, siteId: order.siteId, resourceId, quantity: delivered, payment, accountBalance: operation.institution.accounts.operating.balance, wear: operation.wear, shipInstitutionId: ship.id, shipName: ship.name });
  }

  function recordWorkerEvent(shipRecord, actionType, payload) {
    const messages = {
      "assignment.accepted": `${operation.controller.name} dispatched ${shipRecord.name} on a mining allocation.`,
      "prospect.selected": `${shipRecord.name} selected a real ${payload.resourceId} rock and is approaching it.`,
      "resource.collected": `${shipRecord.name} collected ${payload.quantity} ${payload.resourceId}.`,
      "delivery.completed": `${shipRecord.name} completed its physical delivery.`,
    };
    record(`worker.${actionType}`, messages[actionType] ?? `${shipRecord.name}: ${actionType}`, { shipInstitutionId: shipRecord.id, shipName: shipRecord.name, ...payload });
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
    allocations: {}, history: [{ id: "mining-history-1", type: "institution.instantiated", at: now }], nextOrderIndex: 1, counter: 0, completedContracts: 0, wear: 0,
  };
}

function createWorkerRecord(defaults) {
  return { id: defaults.id, name: defaults.name, archetypeId: "mining-worker", ownerInstitutionId: "miner:cinder-contracting", referenceId: defaults.referenceId, currentSiteId: defaults.currentSiteId, status: "idle", cargo: {}, wear: 0, capabilities: { miningLaser: true, cargoCollector: true, tractorField: { powered: true, powerSource: "evergreen" } } };
}
