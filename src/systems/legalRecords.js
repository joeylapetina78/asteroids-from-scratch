export function getPilotLicense(state) {
  return state.legal.pilotLicense;
}

export function getPilotName(state, fallback = "Pilot") {
  const license = getPilotLicense(state);
  return license.firstName ? `${license.firstName} ${license.lastName}` : fallback;
}

export function issuePilotLicense(state, { firstName, lastName, licenseId, status = "provisional", authorizedZones = null }) {
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
    authorizedZones: [...license.authorizedZones],
    issuedAt: license.issuedAt,
  };

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
