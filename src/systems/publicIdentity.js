import { getPilotLicense, getPilotName } from "./legalRecords.js?v=fresh-20260708-patrol3";
import { getShipAssetId } from "./worldRecords.js?v=fresh-20260708-patrol3";

export const PUBLIC_IDENTITY_KIND = Object.freeze({
  CONTROLLED_SHIP: "controlled-ship",
  ROUTE_HAULER: "route-hauler",
  UNKNOWN: "unknown",
});

export function createControlledShipPublicIdentity(state) {
  const license = getPilotLicense(state);
  const hull = state.components?.hull ?? {};

  return {
    kind: PUBLIC_IDENTITY_KIND.CONTROLLED_SHIP,
    entityId: hull.vinPlateAttached && hull.vin ? getShipAssetId(hull.vin) : "ship:unknown-controlled",
    pilotEntityId: state.character?.controlledPersonEntityId ?? null,
    pilotName: getPilotName(state, null),
    pilotLicenseId: license.licenseId ?? null,
    shipVin: hull.vinPlateAttached ? hull.vin : null,
    vinPlateAttached: Boolean(hull.vinPlateAttached),
    transponderStatus: "public",
  };
}

export function createNpcShipPublicIdentity(ship) {
  const shipVin = ship.publicIdentity?.shipVin ?? `NPC-${ship.id.toUpperCase()}`;

  return {
    kind: PUBLIC_IDENTITY_KIND.ROUTE_HAULER,
    entityId: getShipAssetId(shipVin),
    pilotEntityId: ship.publicIdentity?.pilotEntityId ?? `person:${ship.id}-operator`,
    pilotName: ship.publicIdentity?.pilotName ?? `${ship.name} Operator`,
    pilotLicenseId: ship.publicIdentity?.pilotLicenseId ?? `HAUL-${ship.id.toUpperCase()}`,
    shipVin,
    vinPlateAttached: true,
    transponderStatus: ship.publicIdentity?.transponderStatus ?? "public",
    registeredHubIds: ship.publicIdentity?.registeredHubIds ?? [],
    manifestStatus: ship.publicIdentity?.manifestStatus ?? "routine-cargo",
  };
}
