import assert from "node:assert/strict";
import test from "node:test";
import { FIRST_REACH_CARRIERS } from "../src/content/transportation/firstReachCarriers.js";
import { MINING_INSTITUTION_SEEDS } from "../src/content/economy/miningInstitutions.js";
import { inspectPublicIdentity } from "../src/systems/authorityInspections.js";
import { createCommercialCraftPublicIdentity } from "../src/systems/publicIdentity.js";
import { createGameState } from "../src/state/gameState.js";

function identityFor(seed, ship, activities) {
  return createCommercialCraftPublicIdentity({
    ship, owner: seed.institution, operator: seed.controller,
    registeredHubIds: [ship.homeSiteId ?? ship.currentSiteId], authorizedActivities: activities,
  });
}

test("every seeded hauler can present title, registration, ownership, and operating authority", () => {
  FIRST_REACH_CARRIERS.forEach((seed) => {
    const identity = identityFor(seed, seed.ship, ["transport-freight"]);
    assert.equal(identity.ownerInstitutionId, seed.institution.id);
    assert.equal(identity.pilotLicenseId, seed.controller.license.id);
    assert.equal(identity.operatingLicenseStatus, "active");
    assert.ok(identity.titleId);
    assert.ok(identity.registrationId);
  });
});

test("every seeded mining craft presents the same paperwork shape", () => {
  MINING_INSTITUTION_SEEDS.forEach((seed) => seed.workers.forEach((ship) => {
    const identity = identityFor(seed, ship, ["mining"]);
    assert.equal(identity.ownerInstitutionId, seed.institution.id);
    assert.equal(identity.pilotLicenseId, seed.controller.license.id);
    assert.deepEqual(identity.authorizedActivities, ["mining"]);
    assert.ok(identity.titleId && identity.registrationId);
  }));
});

test("patrol inspection rejects a craft with ownership but no active title", () => {
  const seed = FIRST_REACH_CARRIERS[0];
  const identity = identityFor(seed, seed.ship, ["transport-freight"]);
  identity.titleStatus = "revoked";
  const result = inspectPublicIdentity(createGameState(), { identity, site: { id: seed.ship.homeSiteId } });
  assert.equal(result.status, "flagged");
  assert.ok(result.reasons.includes("missing-or-inactive-title"));
});

