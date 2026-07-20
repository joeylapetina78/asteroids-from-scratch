import { getCurrentShipLegal, getPilotLicense, getPilotName, getUnauthorizedVisitedZones } from "./legalRecords.js?v=fresh-20260719-2003-2d72582";
import { findDocumentsForEntity, findDocumentsHeldBy, getShipAssetId } from "./worldRecords.js?v=fresh-20260719-2003-2d72582";

export function createShipPaperworkInspectionReport(state, { inspector = null, site = null } = {}) {
  const hull = state.components.hull;
  const vin = hull.vinPlateAttached ? hull.vin : null;
  const pilotLicense = getPilotLicense(state);
  const pilotEntityId = pilotLicense.licenseId ? `person:${pilotLicense.licenseId}` : null;
  const shipEntityId = vin ? getShipAssetId(vin) : null;
  const legal = getCurrentShipLegal(state);
  const registrations = legal.registrations ?? {};
  const shipDocuments = shipEntityId ? findDocumentsForEntity(state, shipEntityId) : [];
  const pilotDocuments = pilotEntityId ? findDocumentsHeldBy(state, pilotEntityId) : [];
  const shipDocumentSummary = summarizeDocuments(shipDocuments);
  const pilotDocumentSummary = summarizeDocuments(pilotDocuments);
  const flightRegistration = findDocumentByType(shipDocuments, "ship-registration") ?? registrations.flight ?? null;
  const shipTitle = findDocumentByType(shipDocuments, "ship-title");
  const activeLien = findDocumentByType(shipDocuments, "lien", "active");

  return {
    inspector,
    siteId: site?.id ?? null,
    siteName: site?.name ?? null,
    shipName: state.ship.name,
    pilotLicenseId: pilotLicense.licenseId ?? null,
    pilotName: getPilotName(state, null),
    pilotEntityId,
    vin,
    shipEntityId,
    vinPlateAttached: hull.vinPlateAttached,
    titleHolder: shipTitle?.holderEntityId ?? legal.titleHolder ?? null,
    titleStatus: shipTitle?.status ?? legal.titleStatus ?? "unknown",
    lienDocumentId: activeLien?.id ?? null,
    lienStatus: activeLien?.status ?? "none",
    flightLicenseId: legal.flightLicenseId ?? null,
    flightRegistrationStatus: flightRegistration?.status ?? "none",
    miningRegistrationStatus: registrations.mining?.status ?? "none",
    patrolRegistrationStatus: registrations.patrol?.status ?? "none",
    unauthorizedZones: getUnauthorizedVisitedZones(state),
    checkedDocuments: {
      ship: shipDocumentSummary,
      pilot: pilotDocumentSummary,
    },
    clearance: {
      hasVin: Boolean(vin),
      hasPilotLicense: pilotDocumentSummary.some((document) => document.type === "pilot-license" && document.status !== "revoked"),
      hasFlightRegistration: Boolean(flightRegistration && flightRegistration.status !== "revoked"),
    },
  };
}

function findDocumentByType(documents, type, status = null) {
  return documents.find((document) => document.type === type && (!status || document.status === status)) ?? null;
}

function summarizeDocuments(documents) {
  return documents.map((document) => ({
    id: document.id,
    type: document.type,
    title: document.title,
    status: document.status,
    holderEntityId: document.holderEntityId ?? null,
    issuerEntityId: document.issuerEntityId ?? null,
  }));
}
