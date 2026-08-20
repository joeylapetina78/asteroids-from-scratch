import { getPilotLicense, getPilotName } from "./legalRecords.js?v=fresh-20260820-0654-6716a5f";
import { getShipAssetId } from "./worldRecords.js?v=fresh-20260820-0654-6716a5f";

export const PUBLIC_IDENTITY_KIND = Object.freeze({
  CONTROLLED_SHIP: "controlled-ship",
  ROUTE_HAULER: "route-hauler",
  COMMERCIAL_CRAFT: "commercial-craft",
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
    kind: ship.publicIdentity?.kind ?? PUBLIC_IDENTITY_KIND.ROUTE_HAULER,
    entityId: getShipAssetId(shipVin),
    pilotEntityId: ship.publicIdentity?.pilotEntityId ?? `person:${ship.id}-operator`,
    pilotName: ship.publicIdentity?.pilotName ?? `${ship.name} Operator`,
    pilotLicenseId: ship.publicIdentity?.pilotLicenseId ?? `HAUL-${ship.id.toUpperCase()}`,
    shipVin,
    vinPlateAttached: true,
    transponderStatus: ship.publicIdentity?.transponderStatus ?? "public",
    registeredHubIds: ship.publicIdentity?.registeredHubIds ?? [],
    manifestStatus: ship.publicIdentity?.manifestStatus ?? "routine-cargo",
    ownerInstitutionId: ship.publicIdentity?.ownerInstitutionId ?? null,
    titleId: ship.publicIdentity?.titleId ?? null,
    titleStatus: ship.publicIdentity?.titleStatus ?? "unknown",
    registrationId: ship.publicIdentity?.registrationId ?? null,
    registrationStatus: ship.publicIdentity?.registrationStatus ?? "unknown",
    operatingLicenseClass: ship.publicIdentity?.operatingLicenseClass ?? null,
    operatingLicenseStatus: ship.publicIdentity?.operatingLicenseStatus ?? "unknown",
    authorizedActivities: ship.publicIdentity?.authorizedActivities ?? [],
  };
}

export function createCommercialCraftPublicIdentity({ ship, owner, operator, registeredHubIds = [], authorizedActivities = [] }) {
  return {
    kind: PUBLIC_IDENTITY_KIND.COMMERCIAL_CRAFT,
    entityId: getShipAssetId(ship.referenceId),
    pilotEntityId: operator.id,
    pilotName: operator.name,
    pilotLicenseId: operator.license?.id ?? null,
    shipVin: ship.referenceId,
    vinPlateAttached: Boolean(ship.referenceId),
    transponderStatus: "public",
    registeredHubIds: [...registeredHubIds],
    manifestStatus: "routine-cargo",
    ownerInstitutionId: owner.id,
    titleId: `TITLE-${ship.referenceId}`,
    titleStatus: "active",
    registrationId: `REG-${ship.referenceId}`,
    registrationStatus: "active",
    operatingLicenseClass: operator.license?.class ?? null,
    operatingLicenseStatus: operator.license?.status ?? "missing",
    authorizedActivities: [...authorizedActivities],
  };
}
