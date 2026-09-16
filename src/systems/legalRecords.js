import { setCurrentAccountOwner } from "./accounts.js?v=fresh-20260916-1801-027b2ea4";
import { ensureInstitution, ensurePerson, ensureShipAsset, issueWorldDocument, upsertWorldRelationship, WORLD_RECORD_RELATIONSHIPS } from "./worldRecords.js?v=fresh-20260916-1801-027b2ea4";

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
  license.class ??= "provisional";
  license.displayClass ??= "Provisional · 90-Day";
  license.issuedAt = Date.now();

  if (authorizedZones) {
    license.authorizedZones = [...authorizedZones];
  }

  state.legal.pilotLicenses[licenseId] = {
    id: licenseId,
    firstName,
    lastName,
    status,
    class: license.class,
    displayClass: license.displayClass,
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
  if (state.legal?.operatingRights?.enforceLegacyZones !== true) return [];
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

  // The paperwork carries the story so the dialogue does not have to. This
  // hull is a wreck: a working miner lost to an incursion, scrapped at the
  // Porch, sitting in the Authority's impound. The Authority will sell it —
  // but only to a licensed pilot under a sponsoring operator, and only once it
  // has proven it can fly by reaching Yard Exchange under its own power. Rook
  // holds the delivery rights for that one flight. Nothing more.
  issueWorldDocument(state, {
    document: {
      id: titleId,
      type: "ship-title",
      title: `${state.ship.name} Salvage Title`,
      status: "impounded",
      summary: "Title to a recovered hull, held in impound by the issuing authority pending sale.",
      notes: [
        "Recovered hull. Loss recorded: incursion, Starter Drift. Scrapped at Scrap Porch.",
        "Released to Rook Industries for one delivery flight to Yard Exchange, for assessment.",
        "Sale conditional: licensed pilot, sponsoring operator, hull to arrive under its own power.",
      ],
      holderEntityId: YARD_EXCHANGE_AUTHORITY_ID,
      beneficialOwnerEntityId: ROOK_INDUSTRIES_ID,
      issuerEntityId: YARD_EXCHANGE_AUTHORITY_ID,
      assetEntityId: shipEntity.id,
      issuedAt: Date.now(),
    },
    issuerEntityId: YARD_EXCHANGE_AUTHORITY_ID,
    holderEntityId: YARD_EXCHANGE_AUTHORITY_ID,
    assetEntityId: shipEntity.id,
  });
  issueWorldDocument(state, {
    document: {
      id: registrationId,
      type: "ship-registration",
      title: `${state.ship.name} Delivery Flight Permit`,
      status: "temporary",
      summary: "A one-trip permit to move an impounded hull between hubs under a sponsoring operator.",
      notes: [
        "Valid for one flight: Scrap Porch to Yard Exchange, cleared route only.",
        "Operator of record: Rook Industries. Expires on arrival.",
      ],
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
      class: "provisional",
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
