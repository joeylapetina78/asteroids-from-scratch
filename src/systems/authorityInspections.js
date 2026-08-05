import { createShipPaperworkInspectionReport } from "./paperworkInspections.js?v=fresh-20260804-1903-50a9a01";
import { getRegistryEntityIdForSite, hasRegistryStatus } from "./entityRegistry.js?v=fresh-20260804-1903-50a9a01";
import { PUBLIC_IDENTITY_KIND } from "./publicIdentity.js?v=fresh-20260804-1903-50a9a01";

export function inspectPublicIdentity(state, { identity, inspector = null, site = null } = {}) {
  if (!identity) {
    return createInspectionResult({
      identity,
      inspector,
      site,
      status: "failed",
      reasons: ["no-public-identity"],
    });
  }

  if (identity.kind === PUBLIC_IDENTITY_KIND.CONTROLLED_SHIP) {
    const paperworkReport = createShipPaperworkInspectionReport(state, { inspector, site });
    const reasons = [];

    if (!paperworkReport.clearance.hasVin) reasons.push("missing-vin");
    if (!paperworkReport.clearance.hasPilotLicense) reasons.push("missing-pilot-license");
    if (!paperworkReport.clearance.hasFlightRegistration) reasons.push("missing-flight-registration");
    if (paperworkReport.unauthorizedZones.length > 0) reasons.push("unauthorized-zone-history");
    if (paperworkReport.cargoInspection.manifests.length > 0 && paperworkReport.cargoInspection.hasUndeclaredCargo) reasons.push("undeclared-cargo");
    if (paperworkReport.cargoInspection.manifests.length > 0 && paperworkReport.cargoInspection.hasUnestablishedSource) reasons.push("cargo-source-not-established");

    const identityResult = createInspectionResult({
      identity,
      inspector,
      site,
      status: reasons.length === 0 ? getControlledShipKnownStatus(state, { identity, site }) : "flagged",
      reasons,
      paperworkReport,
    });

    return identityResult;
  }

  if ([PUBLIC_IDENTITY_KIND.ROUTE_HAULER, PUBLIC_IDENTITY_KIND.COMMERCIAL_CRAFT].includes(identity.kind)) {
    const isKnownToHub = !site?.id || identity.registeredHubIds.includes(site.id);
    const reasons = [];
    if (!identity.shipVin) reasons.push("missing-vin");
    if (!identity.pilotLicenseId || identity.operatingLicenseStatus !== "active") reasons.push("missing-or-inactive-operating-license");
    if (!identity.titleId || !identity.ownerInstitutionId || identity.titleStatus !== "active") reasons.push("missing-or-inactive-title");
    if (!identity.registrationId || identity.registrationStatus !== "active") reasons.push("missing-or-inactive-registration");
    if (!isKnownToHub) reasons.push("craft-not-registered-at-hub");

    return createInspectionResult({
      identity,
      inspector,
      site,
      status: reasons.length === 0 ? "cleared" : "flagged",
      reasons,
      paperworkReport: null,
    });
  }

  return createInspectionResult({
    identity,
    inspector,
    site,
    status: "flagged",
    reasons: ["unknown-public-identity-kind"],
  });
}

function getControlledShipKnownStatus(state, { identity, site }) {
  if (!site || !identity?.entityId) {
    return "cleared";
  }

  return hasRegistryStatus(state, {
    registryEntityId: getRegistryEntityIdForSite(site),
    subjectEntityId: identity.entityId,
    status: "cleared",
  })
    ? "cleared"
    : "needs-presentation";
}

function createInspectionResult({ identity, inspector, site, status, reasons, paperworkReport = null }) {
  return {
    status,
    reasons,
    inspector,
    siteId: site?.id ?? null,
    siteName: site?.name ?? null,
    entityId: identity?.entityId ?? null,
    identityKind: identity?.kind ?? "none",
    pilotEntityId: identity?.pilotEntityId ?? null,
    pilotLicenseId: identity?.pilotLicenseId ?? null,
    pilotName: identity?.pilotName ?? null,
    shipVin: identity?.shipVin ?? null,
    transponderStatus: identity?.transponderStatus ?? "none",
    ownerInstitutionId: identity?.ownerInstitutionId ?? null,
    titleId: identity?.titleId ?? null,
    registrationId: identity?.registrationId ?? null,
    authorizedActivities: identity?.authorizedActivities ?? [],
    paperworkReport,
  };
}
