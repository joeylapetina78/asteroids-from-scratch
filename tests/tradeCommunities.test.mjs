import assert from "node:assert/strict";
import test from "node:test";

import {
  FIRST_REACH_TRADE_COMMUNITIES,
  sitesShareTradeCommunity,
  tradeCommunityForSite,
} from "../src/content/transportation/firstReachNetwork.js";
import { createInitialLogisticsState } from "../src/systems/logistics.js";

test("the core and frontier are connected places but distinct trade communities", () => {
  assert.ok(FIRST_REACH_TRADE_COMMUNITIES["first-reach-core"].includes("kiln-crossing"));
  assert.ok(FIRST_REACH_TRADE_COMMUNITIES["first-reach-frontier"].includes("ore-station-one"));
  assert.equal(sitesShareTradeCommunity("yard-exchange", "morrow-shoal"), true);
  assert.equal(sitesShareTradeCommunity("yard-exchange", "ore-station-one"), false);
  assert.equal(sitesShareTradeCommunity("ore-station-one", "deep-research"), true);
  assert.equal(tradeCommunityForSite("unknown-port"), null);
});

test("authored carrier companies own the hulls they control", () => {
  const state = createInitialLogisticsState(1_000);
  Object.values(state.logistics?.haulers ?? state.haulers).forEach((hauler) => {
    const hull = state.institutions[hauler.shipInstitutionId];
    assert.equal(hull.ownerInstitutionId, hauler.carrierInstitutionId);
    assert.equal(hull.controllerInstitutionId, hauler.carrierInstitutionId);
  });
});
