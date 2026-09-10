import { MiningWorkerShip } from "../entities/MiningWorkerShip.js?v=fresh-20260909-2126-bba49c43";
import { getResourceFamily, normalizeResourceType } from "./resourceDefinitions.js?v=fresh-20260909-2126-bba49c43";
import { registerActorSource } from "./actorRegistry.js?v=fresh-20260909-2126-bba49c43";
import { recordDiagnostic } from "./diagnostics.js?v=fresh-20260909-2126-bba49c43";

const RECOVERABLE_FAMILIES = new Set(["volatile", "structural", "industrial"]);
const COMMISSION_THRESHOLD = 6;
const COMMISSION_COST = 6000;
const SURVEY_RADIUS = 2200;

export function isEcologicalRecoveryCandidate(pickup) {
  return Boolean(pickup && (pickup.age ?? 0) >= 40
    && pickup.sourceClaimId == null
    && RECOVERABLE_FAMILIES.has(getResourceFamily(normalizeResourceType(pickup.type))));
}

export function createEcologicalRecoveryOperation({ state, game, now = Date.now } = {}) {
  state.ecologicalRecovery ??= {
    institution: { id: "yard-exchange-ecological-recovery", name: "Yard Exchange Field Recovery", type: "recovery-service", archetypeId: "recovery-service", currentState: "free", history: [] },
    ships: {}, commissions: {}, nextShip: 1, nextCommission: 1,
  };
  const operation = state.ecologicalRecovery;
  recordDiagnostic(state, operation.institution.id, { actorName: operation.institution.name, actorKind: "institution",
    state: "free", summary: "Monitoring settled material fields for ecological recovery", locationSiteId: "yard-exchange" }, now());
  registerActorSource(state, "ecological-recovery", (world) => [
    { id: operation.institution.id, record: operation.institution, role: "institution", domain: "ecological-recovery", path: "ecologicalRecovery.institution" },
    ...Object.entries(operation.ships).map(([id, record]) => ({ id, record, role: "ship", domain: "ecological-recovery", path: `ecologicalRecovery.ships.${id}` })),
  ]);
  const physical = new Map();

  function siteById(id) { return game.worldSites.find((site) => site.id === id) ?? null; }
  function nearestHub(position) {
    return game.worldSites.filter((site) => state.logistics?.institutions?.[site.id]?.accounts?.operating)
      .map((site) => ({ site, distance: Math.hypot(site.position.x - position.x, site.position.y - position.y) }))
      .filter((entry) => entry.distance <= SURVEY_RADIUS)
      .sort((a, b) => a.distance - b.distance)[0]?.site ?? null;
  }
  function candidates() { return (game.pickups ?? []).filter(isEcologicalRecoveryCandidate); }
  function dominantField(items) {
    const groups = new Map();
    items.forEach((pickup) => {
      const resourceId = normalizeResourceType(pickup.type);
      const hub = nearestHub(pickup.position);
      if (!hub) return;
      const key = `${hub.id}:${resourceId}`;
      const group = groups.get(key) ?? { hub, resourceId, items: [] };
      group.items.push(pickup); groups.set(key, group);
    });
    return [...groups.values()].sort((a, b) => b.items.length - a.items.length)[0] ?? null;
  }
  function fieldCentre(items) {
    const centre = items.reduce((sum, pickup) => ({ x: sum.x + pickup.position.x, y: sum.y + pickup.position.y }), { x: 0, y: 0 });
    centre.x /= items.length; centre.y /= items.length;
    return centre;
  }
  function assignRecovery(craft, field) {
    const contractId = `ECO-${String(operation.nextCommission++).padStart(4, "0")}`;
    const centre = fieldCentre(field.items);
    craft.assign({ allocationId: contractId, contractId, resourceId: field.resourceId,
      quantity: Math.min(6, field.items.length), destination: field.hub.position, destinationSiteId: field.hub.id,
      recoveryOnly: true, recoveryField: centre });
    operation.commissions[contractId] = { id: contractId, type: "ecological-recovery", status: "active",
      issuerInstitutionId: field.hub.id, supplierId: operation.institution.id, vehicleId: craft.id,
      resourceId: field.resourceId, quantity: Math.min(6, field.items.length), field: centre, createdAt: now() };
    return contractId;
  }
  function returnRetainedCargo(craft, record) {
    const load = Object.entries(craft.cargo ?? {}).find(([, units]) => (units ?? 0) > 0);
    const hub = siteById(record.ownerInstitutionId);
    if (!load || !hub) return false;
    const [resourceId, units] = load;
    const contractId = `ECO-${String(operation.nextCommission++).padStart(4, "0")}`;
    craft.assign({ allocationId: contractId, contractId, resourceId, quantity: units,
      destination: hub.position, destinationSiteId: hub.id, recoveryOnly: true, recoveryField: { ...craft.position } });
    operation.commissions[contractId] = { id: contractId, type: "ecological-recovery-return", status: "active",
      issuerInstitutionId: hub.id, supplierId: operation.institution.id, vehicleId: craft.id,
      resourceId, quantity: units, field: { ...craft.position }, createdAt: now() };
    return true;
  }
  function deliver(payload) {
    const record = operation.ships[payload.ship.id];
    const hub = state.logistics?.institutions?.[payload.destinationSiteId];
    if (!record || !hub) return { acceptedUnits: 0, refusal: { reason: "home-unavailable", permanent: false } };
    hub.inventories[payload.resourceId] = (hub.inventories[payload.resourceId] ?? 0) + payload.amount;
    record.totalCollected = (record.totalCollected ?? 0) + payload.amount;
    record.currentState = "free"; record.doing = "Available for ecological recovery";
    const commission = operation.commissions[payload.contractId];
    if (commission) { commission.status = "completed"; commission.completedAt = now(); commission.units = payload.amount; }
    state.ledger.recordEvent("ecology.recoveryDelivered", { institutionId: operation.institution.id, vehicleId: record.id,
      commissionId: payload.contractId, siteId: payload.destinationSiteId, resourceId: payload.resourceId, units: payload.amount },
    { visible: true, message: `${record.name} returned ${payload.amount} recovered ${payload.resourceId} to ${hub.name}.` });
    return { acceptedUnits: payload.amount, paid: 0 };
  }
  function commission(field) {
    const hub = state.logistics.institutions[field.hub.id];
    if ((hub.accounts.operating.balance ?? 0) < COMMISSION_COST) return null;
    hub.accounts.operating.balance -= COMMISSION_COST;
    hub.capitalSpend = (hub.capitalSpend ?? 0) + COMMISSION_COST;
    const id = `eco-collector-${operation.nextShip++}`;
    const contractId = `ECO-${String(operation.nextCommission++).padStart(4, "0")}`;
    const record = operation.ships[id] = { id, name: `Yard Recovery ${operation.nextShip - 1}`, type: "ship",
      ownerInstitutionId: field.hub.id, controllerInstitutionId: operation.institution.id, currentSiteId: field.hub.id,
      currentState: "committed", doing: `Recovering abandoned ${field.resourceId}`, totalCollected: 0, capitalCost: COMMISSION_COST };
    const craft = new MiningWorkerShip({ id, name: record.name, institutionId: field.hub.id,
      controllerInstitutionId: operation.institution.id, x: field.hub.position.x + 90, y: field.hub.position.y + 40,
      palette: { hullStroke: "#72ffc9", hullFill: "rgba(114,255,201,0.14)", cabStroke: "#ff9ed6" },
      onEvent: (type, payload) => state.ledger.recordEvent(`ecology.collector.${type}`, { vehicleId: id, ...payload }, { visible: false }),
      onDelivery: deliver });
    const centre = fieldCentre(field.items);
    craft.assign({ allocationId: contractId, contractId, resourceId: field.resourceId,
      quantity: Math.min(6, field.items.length), destination: field.hub.position, destinationSiteId: field.hub.id,
      recoveryOnly: true, recoveryField: centre });
    operation.commissions[contractId] = { id: contractId, type: "ecological-recovery", status: "active",
      issuerInstitutionId: field.hub.id, supplierId: operation.institution.id, vehicleId: id,
      resourceId: field.resourceId, quantity: Math.min(6, field.items.length), field: centre, createdAt: now() };
    physical.set(id, craft); game.addWorkerShip(craft);
    recordDiagnostic(state, id, { actorName: record.name, actorKind: "ship", controllerId: operation.institution.id,
      state: "committed", summary: record.doing, locationSiteId: field.hub.id, position: { ...craft.position },
      refs: { contractIds: [contractId], targetIds: [], dependencyIds: [] } }, now());
    state.ledger.recordEvent("ecology.recoveryCommissioned", { institutionId: field.hub.id, supplierId: operation.institution.id,
      vehicleId: id, commissionId: contractId, resourceId: field.resourceId, quantity: Math.min(6, field.items.length), capitalCost: COMMISSION_COST },
    { visible: true, message: `${field.hub.name} commissioned ${record.name} to recover abandoned ${field.resourceId}.` });
    return craft;
  }
  function update() {
    Object.entries(operation.ships).forEach(([id, record]) => {
      const craft = physical.get(id);
      if (craft) { record.position = { ...craft.position }; record.currentState = craft.assignment ? "committed" : "free"; record.doing = craft.assignment ? `Recovering abandoned ${craft.assignment.resourceId}` : "Available for ecological recovery";
        recordDiagnostic(state, id, { actorName: record.name, actorKind: "ship", controllerId: operation.institution.id,
          state: record.currentState, summary: record.doing, locationSiteId: record.currentSiteId, position: record.position,
          refs: { contractIds: craft.assignment ? [craft.assignment.contractId] : [], targetIds: [], dependencyIds: [] } }, now()); }
    });
    const field = dominantField(candidates());
    if (!field || field.items.length < COMMISSION_THRESHOLD) return;
    const owned = [...physical.values()].filter((craft) => operation.ships[craft.id]?.ownerInstitutionId === field.hub.id);
    if (owned.some((craft) => craft.assignment)) return;
    const carrying = owned.find((craft) => !craft.assignment && craft.totalCargoAmount() > 0);
    if (carrying) {
      returnRetainedCargo(carrying, operation.ships[carrying.id]);
      return;
    }
    const idle = owned.find((craft) => !craft.assignment && craft.totalCargoAmount() === 0);
    if (idle) {
      assignRecovery(idle, field);
      return;
    }
    // Ownership is permanent. Until there is an explicit backlog/capacity model
    // that can justify parallel capital, an extant hub-owned collector is a
    // capacity resource to recover or repair, never a reason to mint its replacement.
    if (Object.values(operation.ships).some((record) => record.ownerInstitutionId === field.hub.id)) return;
    commission(field);
  }
  return { operation, update, candidates, commission };
}
