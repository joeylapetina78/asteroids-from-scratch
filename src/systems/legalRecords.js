import { setCurrentAccountOwner } from "./accounts.js?v=fresh-20260703-2323-09eeb14";
import { ensureInstitution, ensurePerson, ensureShipAsset, issueWorldDocument, upsertWorldRelationship, WORLD_RECORD_RELATIONSHIPS } from "./worldRecords.js?v=fresh-20260703-2323-09eeb14";

const REACH_TRANSIT_COMMISSION_ID = "institution:reach-transit-commission";
const ROOK_INDUSTRIES_ID = "institution:rook-industries";
const YARD_EXCHANGE_AUTHORITY_ID = "institution:yard-exchange-authority";

export function getPilotLicense(state) {
  return state.legal.pilotLicense;
}

export function getPilotName(state, fallback = "Pilot") {
  const license = getPilotLicense(state);
  return license.firstName ? `${license.firstName} ${license.lastName}` : fallback;
}

export function issuePilotLicense(state, { firstName, lastName, licenseId, status = "provisional", authorizedZones = null, canonical = false }) {
  const license = getPilotLicense(state);

  license.firstName = firstName;
  license.lastName = lastName;
  license.licenseId = licenseId;
  license.status = status;
  license.issuedAt = Date.now();

  if (authorizedZones) {
    license.authorizedZones = [...authorizedZones];
  }

  state.legal.pilotLicenses[licenseId] = {
    id: licenseId,
    firstName,
    lastName,
    status,
    canonical,
    authorizedZones: [...license.authorizedZones],
    issuedAt: license.issuedAt,
  };
  state.character.controlledPersonEntityId = `person:${licenseId}`;
  state.character.currentLicenseId = licenseId;
  setCurrentAccountOwner(state, state.character.controlledPersonEntityId);
  registerPilotLicenseWorldRecords(state, { firstName, lastName, licenseId, status, authorizedZones, issuedAt: license.issuedAt, canonical });

  return license;
}

export function recordVisitedZone(state, zoneId) {
  const license = getPilotLicense(state);

  if (!license.visitedZoneIds.includes(zoneId)) {
    license.visitedZoneIds.push(zoneId);
  }
}

export function getUnauthorizedVisitedZones(state) {
  const license = getPilotLicense(state);
  return license.visitedZoneIds.filter((zoneId) => !license.authorizedZones.includes(zoneId));
}

export function getCurrentShipLegal(state) {
  return state.legal.currentShip;
}

export function updateCurrentShipLegal(state, updates) {
  Object.assign(state.legal.currentShip, updates);
  return state.legal.currentShip;
}

export function registerStarterDeliveryShipRecords(state) {
  const vin = state.components?.hull?.vin;

  if (!vin || state.ship?.purchasedOfferId) {
    return null;
  }

  const titleId = `title-${vin.toLowerCase()}`;
  const registrationId = state.legal.currentShip.registrations.flight.id;
  const shipEntity = ensureShipAsset(state, {
    vin,
    name: state.ship.name,
    frameId: state.ship.frameId,
  });

  ensureInstitution(state, {
    id: ROOK_INDUSTRIES_ID,
    name: "Rook Industries",
    authorityScope: ["starter-contracts", "ship-operator"],
  });
  ensureInstitution(state, {
    id: YARD_EXCHANGE_AUTHORITY_ID,
    name: "Yard Exchange Authority",
    authorityScope: ["ship-registration", "yard-exchange", "first-reach"],
  });

  issueWorldDocument(state, {
    document: {
      id: titleId,
      type: "ship-title",
      title: `${state.ship.name} Company Title`,
      status: "company-owned",
      holderEntityId: ROOK_INDUSTRIES_ID,
      issuerEntityId: YARD_EXCHANGE_AUTHORITY_ID,
      assetEntityId: shipEntity.id,
      issuedAt: Date.now(),
    },
    issuerEntityId: YARD_EXCHANGE_AUTHORITY_ID,
    holderEntityId: ROOK_INDUSTRIES_ID,
    assetEntityId: shipEntity.id,
  });
  issueWorldDocument(state, {
    document: {
      id: registrationId,
      type: "ship-registration",
      title: `${state.ship.name} Temporary Flight Registration`,
      status: "temporary",
      holderEntityId: ROOK_INDUSTRIES_ID,
      issuerEntityId: YARD_EXCHANGE_AUTHORITY_ID,
      assetEntityId: shipEntity.id,
      grants: [
        {
          permission: "operate-ship",
          regionIds: ["first-reach"],
          underAuthorityEntityId: ROOK_INDUSTRIES_ID,
        },
      ],
      issuedAt: Date.now(),
    },
    issuerEntityId: YARD_EXCHANGE_AUTHORITY_ID,
    holderEntityId: ROOK_INDUSTRIES_ID,
    assetEntityId: shipEntity.id,
  });
  upsertWorldRelationship(state, {
    fromId: ROOK_INDUSTRIES_ID,
    toId: shipEntity.id,
    type: WORLD_RECORD_RELATIONSHIPS.CONTROLS,
    basisDocumentId: registrationId,
    status: "active",
  });

  return { shipEntityId: shipEntity.id, titleId, registrationId };
}

function registerPilotLicenseWorldRecords(state, { firstName, lastName, licenseId, status, authorizedZones, issuedAt, canonical = false }) {
  const holderName = `${firstName} ${lastName}`;
  const holderEntityId = `person:${licenseId}`;

  ensureInstitution(state, {
    id: REACH_TRANSIT_COMMISSION_ID,
    name: "Reach Transit Commission",
    authorityScope: ["flight-license", "first-reach"],
  });
  ensurePerson(state, {
    id: holderEntityId,
    name: holderName,
    licenseId,
  });
  issueWorldDocument(state, {
    document: {
      id: licenseId,
      type: "pilot-license",
      title: "Provisional Flight Authorization",
      status,
      canonical,
      holderEntityId,
      issuerEntityId: REACH_TRANSIT_COMMISSION_ID,
      grants: [
        {
          permission: "operate-ship",
          zoneIds: authorizedZones ?? getPilotLicense(state).authorizedZones,
        },
      ],
      issuedAt,
    },
    issuerEntityId: REACH_TRANSIT_COMMISSION_ID,
    holderEntityId,
  });
}
