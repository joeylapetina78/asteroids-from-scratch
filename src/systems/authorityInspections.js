import { createShipPaperworkInspectionReport } from "./paperworkInspections.js?v=paperwork-inspections-v1";
import { PUBLIC_IDENTITY_KIND } from "./publicIdentity.js?v=patrol-registry-v1";

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

    return createInspectionResult({
      identity,
      inspector,
      site,
      status: reasons.length === 0 ? "cleared" : "flagged",
      reasons,
      paperworkReport,
    });
  }

  if (identity.kind === PUBLIC_IDENTITY_KIND.ROUTE_HAULER) {
    const isKnownToHub = !site?.id || identity.registeredHubIds.includes(site.id);

    return createInspectionResult({
      identity,
      inspector,
      site,
      status: isKnownToHub ? "cleared" : "flagged",
      reasons: isKnownToHub ? [] : ["hauler-not-registered-at-hub"],
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
    paperworkReport,
  };
}
