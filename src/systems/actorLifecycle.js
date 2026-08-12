import { retireDiagnostic } from "./diagnostics.js?v=fresh-20260812-1719-c76abb5";

// Close every present-tense intention owned by a physical actor that no longer
// exists. Destruction is shared lifecycle state; mining, freight, service and
// towing must not each leave their own ghost behind.
export function terminateDestroyedActor(state, ship, { at = Date.now() } = {}) {
  const result = { allocations: 0, movements: 0, towRequests: 0 };

  Object.values(state.miningOperations ?? {}).forEach((operation) => {
    const record = operation.ships?.[ship.id];
    if (!record) return;
    record.status = "destroyed";
    record.maintenanceStatus = "destroyed";
    record.destroyedAt = at;
    Object.values(operation.allocations ?? {}).forEach((allocation) => {
      if (allocation.workerShipId !== ship.id || allocation.status !== "active") return;
      allocation.status = "released";
      allocation.outcomeReason = "ship-destroyed";
      result.allocations += 1;
    });
    ship.assignment = null;
    ship.serviceReturn = null;
    ship.deliveryBlock = null;
    ship.targetAsteroid = null;
    ship.miningDisabled = true;
    ship.state = "destroyed";
  });

  const logistics = state.logistics;
  const hauler = logistics?.haulers?.[ship.id];
  if (hauler) {
    const movement = logistics.movements?.[hauler.activeMovementId];
    if (movement && movement.status === "active") {
      movement.status = "interrupted";
      movement.outcomeReason = "ship-destroyed";
      movement.interruptedAt = at;
      result.movements += 1;
    }
    hauler.activeShipmentId = null;
    hauler.activeShipmentIds = [];
    hauler.activeMovementId = null;
    hauler.status = "destroyed";
    const shipInstitution = logistics.institutions?.[hauler.shipInstitutionId];
    if (shipInstitution) shipInstitution.operationalStatus = "destroyed";
  }

  ship.activeShipmentId = null;
  ship.activeTowRequestId = null;
  ship.towDestinationSiteId = null;
  ship.operationalStatus = "destroyed";

  const towing = state.towing;
  Object.values(towing?.requests ?? {}).forEach((request) => {
    if (request.haulerId !== ship.id || !["dispatched", "attached", "delivered-cargo"].includes(request.status)) return;
    const carrier = logistics?.institutions?.[request.carrierInstitutionId];
    if (carrier?.accounts?.operating && request.committedPayment > 0) {
      carrier.accounts.operating.committed = Math.max(0, (carrier.accounts.operating.committed ?? 0) - request.committedPayment);
    }
    request.committedPayment = 0;
    request.status = "canceled";
    request.outcomeReason = "ship-destroyed";
    request.canceledAt = at;
    result.towRequests += 1;
  });
  if (result.towRequests > 0 && towing?.vehicle) towing.vehicle.status = "available";

  retireDiagnostic(state, ship.id, {
    summary: `${ship.name} was destroyed; all active work and movement were terminated`,
    at,
  });
  return result;
}
