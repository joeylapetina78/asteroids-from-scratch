import assert from "node:assert/strict";
import test from "node:test";
import { FIRST_REACH_CARRIERS, carrierInstitutionRecords } from "../src/content/transportation/firstReachCarriers.js";
import { createInitialLogisticsState } from "../src/systems/logistics.js";
import { createNpcRouteShips } from "../src/systems/npcRoutes.js";
import { getWorldSites } from "../src/systems/worldSites.js";

test("carrier seeds emit complete institution, controller, ship, and fleet state", () => {
  const state = createInitialLogisticsState(1_000);
  assert.equal(FIRST_REACH_CARRIERS.length, 3);
  assert.equal(carrierInstitutionRecords().length, FIRST_REACH_CARRIERS.length * 3);
  FIRST_REACH_CARRIERS.forEach((seed) => {
    assert.ok(state.institutions[seed.institution.id]);
    assert.ok(state.institutions[seed.controller.id]);
    assert.ok(state.institutions[seed.ship.id]);
    assert.equal(state.haulers[seed.ship.physicalId].carrierInstitutionId, seed.institution.id);
  });
});

test("each carrier receives its own physical ship and company palette", () => {
  const ships = createNpcRouteShips(getWorldSites());
  assert.equal(ships.length, FIRST_REACH_CARRIERS.length);
  assert.equal(new Set(ships.map((ship) => ship.palette.hullStroke)).size, ships.length);
  assert.deepEqual(ships.map((ship) => ship.id).sort(), FIRST_REACH_CARRIERS.map((seed) => seed.ship.physicalId).sort());
});

test("the new carrier differs economically rather than only cosmetically", () => {
  const [quill, mara, lantern] = FIRST_REACH_CARRIERS;
  assert.notEqual(lantern.policy.minimumOperatingCash, quill.policy.minimumOperatingCash);
  assert.notDeepEqual(lantern.controller.traits, mara.controller.traits);
  assert.notEqual(lantern.ship.homeSiteId, quill.ship.homeSiteId);
});
