import { getCurrentShipLegal, getPilotLicense, getPilotName, getUnauthorizedVisitedZones } from "./legalRecords.js?v=fresh-20260813-1804-7f86b39";
import { findDocumentsForEntity, findDocumentsHeldBy, getShipAssetId } from "./worldRecords.js?v=fresh-20260813-1804-7f86b39";

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
  const cargoInspection = inspectCargoCustody(state, { shipDocuments, pilotDocuments });

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
    cargoInspection,
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

function inspectCargoCustody(state, { shipDocuments = [], pilotDocuments = [] } = {}) {
  const cargo = state.cargoCustody?.units ?? [];
  const documents = [...shipDocuments, ...pilotDocuments];
  const manifests = documents.filter((document) => document.type === "cargo-manifest" && document.status === "active");
  const extractionDocuments = documents.filter((document) => ["extraction-permit", "salvage-claim", "mining-permit", "purchase-receipt"].includes(document.type) && document.status !== "revoked");
  const findings = cargo.map((unit) => {
    const manifest = manifests.find((document) => {
      const order = state.sprc?.procurementOrders?.[document.procurementOrderId];
      return Boolean(order?.acceptedMaterials?.[unit.type]);
    }) ?? null;
    const sourceEvidence = unit.sourceClaimId
      ? extractionDocuments.find((document) => document.id === unit.sourceClaimId || document.claimId === unit.sourceClaimId) ?? null
      : null;

    return {
      resourceType: unit.type,
      quantity: unit.quantity,
      sourceClaimId: unit.sourceClaimId ?? null,
      manifestDocumentId: manifest?.id ?? null,
      procurementOrderId: manifest?.procurementOrderId ?? null,
      declaredForProcurement: Boolean(manifest),
      lawfulSourceEvidenceDocumentId: sourceEvidence?.id ?? null,
      sourceAuthorityStatus: sourceEvidence?.type === "purchase-receipt" ? "purchased" : sourceEvidence ? "documented" : "not-established",
      scopeNote: manifest
        ? "The manifest documents custody and destination; it does not grant extraction or salvage authority."
        : "No active manifest declares this cargo for the current procurement order.",
    };
  });

  return {
    holderEntityId: state.cargoCustody?.holderEntityId ?? null,
    shipVin: state.cargoCustody?.shipVin ?? null,
    manifests: manifests.map((document) => document.id),
    extractionDocuments: extractionDocuments.map((document) => document.id),
    findings,
    hasUndeclaredCargo: findings.some((finding) => !finding.declaredForProcurement),
    hasUnestablishedSource: findings.some((finding) => finding.sourceAuthorityStatus === "not-established"),
  };
}
