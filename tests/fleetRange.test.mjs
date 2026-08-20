import assert from "node:assert/strict";
import test from "node:test";

import { FIRST_REACH_CARRIER_POLICY, FIRST_REACH_REPAIR_OPTIONS, FIRST_REACH_TRANSPORT_CONNECTIONS } from "../src/content/transportation/firstReachNetwork.js";
import { createTransportationNetwork, evaluateTransportPlan, maximumServiceableDistance } from "../src/systems/transportationPlanning.js";

// First Reach ships a fleet that cannot reach its own frontier.
//
// The wear budget is (maximumWear - minimumReturnMargin) / expectedWearPerDistance
// = (6 - 0.9) / 0.00016 = 31,875 units of round trip. The shortest lane to an
// outer hub is 37,473 one way. So the outer third of the map is not expensive to
// serve, it is impossible — and it fails on the outbound leg alone, before any
// return to service is considered.
//
// This surfaced as 459 anonymous `maintenance-policy` declines in a live run,
// indistinguishable from a ship that merely needed a service.

const network = createTransportationNetwork({
  destinations: Array.from(new Set(FIRST_REACH_TRANSPORT_CONNECTIONS.flatMap((c) => [c.fromId, c.toId]))).map((id) => ({ id })),
  connections: FIRST_REACH_TRANSPORT_CONNECTIONS,
});

const OUTER_HUBS = ["ore-station-one", "coldwater-depot", "deep-research"];

test("the authored fleet's range is a knowable number", () => {
  const range = maximumServiceableDistance(FIRST_REACH_CARRIER_POLICY);
  assert.equal(Math.round(range), 31_875);
});

test("every outer hub is beyond the fleet's range, from a fresh hull", () => {
  OUTER_HUBS.forEach((destinationId) => {
    const plan = evaluateTransportPlan({
      network,
      originId: "yard-exchange",
      destinationId,
      payment: 1_000_000,          // price is not the obstacle
      currentWear: 0,              // nor is a tired ship
      policy: FIRST_REACH_CARRIER_POLICY,
      repairOptions: FIRST_REACH_REPAIR_OPTIONS,
    });
    assert.equal(plan.eligible, false, `${destinationId} is unreachable`);
    assert.equal(plan.reason, "beyond-fleet-range",
      `${destinationId} must report an impossible ROUTE, not a tired ship`);
    assert.ok(plan.tripWear + plan.returnWear > plan.budget);
  });
});

test("a tired ship on a reachable route is a different refusal", () => {
  // Same hull class, a lane it can certainly fly, but worn out. Servicing it
  // makes this legal again — which is exactly what `beyond-fleet-range` never
  // becomes, and why the two must not share a name.
  const plan = evaluateTransportPlan({
    network,
    originId: "yard-exchange",
    destinationId: "the-ledge",
    payment: 1_000,
    currentWear: 5.0,
    policy: FIRST_REACH_CARRIER_POLICY,
    repairOptions: FIRST_REACH_REPAIR_OPTIONS,
  });
  assert.equal(plan.eligible, false);
  assert.equal(plan.reason, "maintenance-policy");
  assert.ok(plan.tripWear + plan.returnWear <= plan.budget,
    "the route itself is well within range; only this ship's condition is not");
});

test("a fresh hull serves the inner cluster without complaint", () => {
  ["scrap-porch", "the-ledge", "blue-lantern", "morrow-shoal", "kiln-crossing"].forEach((destinationId) => {
    const plan = evaluateTransportPlan({
      network, originId: "yard-exchange", destinationId,
      payment: 5_000, currentWear: 0,
      policy: FIRST_REACH_CARRIER_POLICY, repairOptions: FIRST_REACH_REPAIR_OPTIONS,
    });
    assert.equal(plan.eligible, true, `${destinationId} is within range`);
  });
});
