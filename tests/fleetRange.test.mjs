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

// ── Subspace ───────────────────────────────────────────────────────────────
import { SHIP_DRIVES, getEffectiveTransportPolicy, hasSubspaceDrive } from "../src/systems/shipDrives.js";

test("a subspace hull can reach the frontier a standard one cannot", () => {
  const subspaceHull = { driveId: "subspace" };
  const policy = getEffectiveTransportPolicy(FIRST_REACH_CARRIER_POLICY, subspaceHull);

  OUTER_HUBS.forEach((destinationId) => {
    const standard = evaluateTransportPlan({
      network, originId: "yard-exchange", destinationId, payment: 5_000, currentWear: 0,
      policy: FIRST_REACH_CARRIER_POLICY, repairOptions: FIRST_REACH_REPAIR_OPTIONS,
    });
    const subspace = evaluateTransportPlan({
      network, originId: "yard-exchange", destinationId, payment: 5_000, currentWear: 0,
      policy, repairOptions: FIRST_REACH_REPAIR_OPTIONS,
    });
    assert.equal(standard.eligible, false, `${destinationId} is closed to a standard hull`);
    assert.equal(subspace.eligible, true, `${destinationId} is open to a subspace hull`);
  });
});

test("subspace extends range without abolishing distance", () => {
  const range = maximumServiceableDistance(getEffectiveTransportPolicy(FIRST_REACH_CARRIER_POLICY, { driveId: "subspace" }));
  // Enough for the whole authored frontier, with margin — and finite, so a far
  // enough destination is still out of reach. Range is bought, not removed.
  assert.ok(range > 170_000, `the longest round trip (~173,000) fits: ${Math.round(range)}`);
  assert.ok(Number.isFinite(range) && range < 1_000_000, `range stays finite: ${Math.round(range)}`);

  // And it is still a journey: the drive is a multiplier, not a teleport.
  assert.ok(SHIP_DRIVES.subspace.speedMultiplier >= 2 && SHIP_DRIVES.subspace.speedMultiplier <= 3,
    "a frontier run is faster, not instant");
});

test("a hull's drive travels with the hull, not the company", () => {
  assert.equal(hasSubspaceDrive({ driveId: "subspace" }), true);
  assert.equal(hasSubspaceDrive({ driveId: "normal-space" }), false);
  assert.equal(hasSubspaceDrive({}), false, "an unmarked hull is ordinary");
  assert.equal(hasSubspaceDrive(null), false);
  // A standard hull is unaffected by the helper, so nothing changes for the
  // authored fleet.
  assert.equal(getEffectiveTransportPolicy(FIRST_REACH_CARRIER_POLICY, {}), FIRST_REACH_CARRIER_POLICY);
});

test("a subspace craft flies straight and fast; a standard one still weaves", async () => {
  const { NpcShip } = await import("../src/entities/NpcShip.js");
  const route = [
    { id: "a", type: "hub", position: { x: 0, y: 0 } },
    { id: "b", type: "hub", position: { x: 6_000, y: 0 } },
  ];
  // A rock sitting directly on the lane.
  const world = { asteroids: [{ position: { x: 1_200, y: 0 }, radius: 220 }], sites: route, npcShips: [] };

  const fly = (drive) => {
    const ship = new NpcShip({ id: `t-${drive.id}`, name: "T", route, x: 0, y: 0, seed: 3, laneOffset: 0 });
    ship.routeIndex = 1;
    ship.operationalStatus = "available";
    ship.dockedSiteId = null;
    ship.driveSpeedMultiplier = drive.speedMultiplier;
    ship.phasesThroughObstacles = drive.phasesThroughObstacles;
    let maxOffLane = 0;
    for (let tick = 0; tick < 900; tick += 1) {
      ship.update(1 / 30, world);
      maxOffLane = Math.max(maxOffLane, Math.abs(ship.position.y));
    }
    return { travelled: ship.position.x, maxOffLane };
  };

  const standard = fly(SHIP_DRIVES["normal-space"]);
  const subspace = fly(SHIP_DRIVES.subspace);

  assert.ok(subspace.travelled > standard.travelled * 1.5,
    `subspace covers more ground in the same time (${Math.round(standard.travelled)} vs ${Math.round(subspace.travelled)})`);
  assert.ok(subspace.maxOffLane < 5,
    `a phasing craft holds the lane through the rock (drifted ${subspace.maxOffLane.toFixed(1)})`);
  assert.ok(standard.maxOffLane > subspace.maxOffLane,
    `a normal-space craft goes around it (drifted ${standard.maxOffLane.toFixed(1)})`);
});
