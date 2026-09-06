import assert from "node:assert/strict";
import test from "node:test";

import { CORRIDOR_LANE_LIMIT, MAX_BERTH_LANE_OFFSET, NpcShip, WAYPOINT_RADIUS, arrivalRadiusFor, laneOffsetFor } from "../src/entities/NpcShip.js";
import { createInitialLogisticsState, createLogisticsManager } from "../src/systems/logistics.js";
import { createGameState } from "../src/state/gameState.js";
import { BLOCKER_KIND, createBlocker, getDiagnostic, listBlocked, recordBlocker } from "../src/systems/diagnostics.js";

// The regression these guard is a hauler that stopped for good.
//
// `Blue Lantern Cartage 1` drew a 225-unit berth lane against a 150-unit
// arrival radius. On a corridor bend it settled 163 units from its target:
// close enough to keep steering at it, never close enough to arrive. Its route
// index froze, it hovered outside Yard Exchange for the rest of the session,
// and the shipment it carried could never be delivered — while every record in
// the game still described it as `transporting`.

const HUB = { id: "yard-exchange", type: "hub", position: { x: 0, y: 0 } };
const GATE = { id: "corridor-waypoint:corridor-yard-ledge:1", type: "corridor-waypoint", position: { x: 1000, y: 0 } };

test("no lane offset may exceed what the craft can then capture", () => {
  // The invariant that was violated. 150 is WAYPOINT_RADIUS in NpcShip.
  assert.ok(MAX_BERTH_LANE_OFFSET < WAYPOINT_RADIUS, "a berth wider than the arrival radius can never be captured reliably");
  assert.ok(CORRIDOR_LANE_LIMIT < MAX_BERTH_LANE_OFFSET, "a corridor gate is narrower than a berth");

  [225, -225, 165, -165].forEach((requested) => {
    assert.ok(Math.abs(laneOffsetFor(HUB, requested)) <= MAX_BERTH_LANE_OFFSET,
      `a ${requested} berth request is clamped at a hub`);
    assert.ok(Math.abs(laneOffsetFor(GATE, requested)) <= CORRIDOR_LANE_LIMIT,
      `a ${requested} berth request is clamped harder in a corridor`);
  });
});

test("a lane offset keeps its side, and a modest one is left alone", () => {
  assert.equal(Math.sign(laneOffsetFor(HUB, 225)), 1, "clamping must not flip a craft to the other side of the lane");
  assert.equal(Math.sign(laneOffsetFor(HUB, -225)), -1);
  assert.equal(laneOffsetFor(HUB, 105), 105, "an offset already inside the limit is untouched");
  assert.equal(laneOffsetFor(HUB, 0), 0);
});

test("every commissioned berth band stays inside the capture radius", () => {
  // Mirrors the bands in game.js commissionHauler. The original set reached
  // ±225 and index 1 — always the first hub-sponsored hauler — always drew it.
  const berthBands = [-140, 140, -105, 105, -70, 70];
  berthBands.forEach((band) => {
    assert.ok(Math.abs(band) <= MAX_BERTH_LANE_OFFSET, `berth band ${band} must be capturable`);
  });
  const seeds = [101, 102, 103, 104, 105, 106];
  seeds.forEach((seed) => {
    const band = berthBands[Math.abs(seed) % berthBands.length];
    assert.ok(Math.abs(band) <= MAX_BERTH_LANE_OFFSET, `seed ${seed} draws a capturable berth`);
  });
});

test("reaching the true waypoint always registers as arrival", () => {
  // The exact property the old ±225 bands broke, and the reason the deadlock
  // was possible at all: the craft steers at an aim point displaced sideways
  // from the waypoint, but arrival is measured against that same aim point. If
  // the displacement exceeds the arrival radius, a craft sitting precisely on
  // the waypoint is still "not there" — so there is a road it can drive down
  // perfectly and never be recorded as having travelled.
  const route = [HUB, GATE, { id: "the-ledge", type: "hub", position: { x: 2000, y: -600 } }];
  [225, -225, 165, -165, 140, -140, 105, 70, 0].forEach((requested) => {
    [1].forEach((index) => {
      const ship = new NpcShip({ id: "aim", name: "Aim", route, x: 0, y: 0, seed: 1, laneOffset: requested });
      ship.routeIndex = index;
      // Stand the craft exactly on the waypoint it is trying to reach.
      ship.position.x = route[index].position.x;
      ship.position.y = route[index].position.y;
      const aim = ship.getWaypoint();
      const missBy = Math.hypot(aim.x - ship.position.x, aim.y - ship.position.y);
      assert.ok(missBy <= WAYPOINT_RADIUS,
        `a craft standing on ${route[index].id} with a ${requested} berth is ${Math.round(missBy)} from its aim point (max ${WAYPOINT_RADIUS})`);
    });
  });
});

test("a wide-berth craft still moves through a corridor gate", () => {
  const route = [HUB, GATE, { id: "the-ledge", type: "hub", position: { x: 2000, y: -600 } }];
  const ship = new NpcShip({ id: "wide-berth", name: "Wide Berth", route, x: 0, y: 0, seed: 101, laneOffset: 225 });
  ship.routeIndex = 1;
  ship.operationalStatus = "available";
  ship.dockedSiteId = null;

  const world = { asteroids: [], sites: route, npcShips: [] };
  let cleared = false;
  for (let tick = 0; tick < 900 && !cleared; tick += 1) {
    ship.update(1 / 30, world);
    if (ship.routeIndex > 1) cleared = true;
  }
  assert.ok(cleared, "the craft cleared the corridor waypoint rather than settling just outside it");
});

test("a loaded craft inside Yard Exchange's real envelope cannot orbit the berth forever", () => {
  const yard = { ...HUB, interactionRadius: 330 };
  const route = [
    { id: "blue-lantern", type: "hub", interactionRadius: 180, position: { x: 1000, y: 0 } },
    yard,
    { id: "morrow-shoal", type: "hub", interactionRadius: 180, position: { x: -1000, y: 0 } },
  ];
  const ship = new NpcShip({ id: "porch-runner", name: "Porch Runner Two", route, x: 230, y: 0, seed: 2, laneOffset: 140 });
  ship.operationalStatus = "available";
  ship.dockedSiteId = null;
  ship.commitmentPortfolio.entries = [{
    id: "water-to-morrow", shipmentId: "water-to-morrow", originSiteId: "blue-lantern",
    destinationSiteId: "morrow-shoal", reservedCapacity: 5,
  }];
  assert.ok(Math.hypot(ship.getWaypoint().x - ship.position.x, ship.getWaypoint().y - ship.position.y) > WAYPOINT_RADIUS,
    "the berth-offset aim remains outside the old capture circle");
  assert.equal(arrivalRadiusFor(yard), 260);

  ship.update(1 / 30, { asteroids: [], navigationObstacles: [], npcShips: [ship], sites: route });

  assert.equal(ship.routeIndex, 2, "reaching the capital advances the itinerary instead of creating a permanent stall");
  assert.equal(ship.activeShipmentId, "water-to-morrow", "the onward cargo remains aboard");
});

test("watchdog recovery recenters a stalled loaded craft without changing its cargo or destination", () => {
  const route = [HUB, GATE, { id: "the-ledge", type: "hub", position: { x: 2000, y: -600 } }];
  const ship = new NpcShip({ id: "loaded-stall", name: "Loaded Stall", route, x: 600, y: 180, seed: 2, laneOffset: 140 });
  ship.operationalStatus = "available";
  ship.dockedSiteId = null;
  ship.routeIndex = 1;
  ship.commitmentPortfolio.entries = [{
    id: "SHIP-LOADED", shipmentId: "SHIP-LOADED", originSiteId: "yard-exchange",
    destinationSiteId: "the-ledge", reservedCapacity: 6,
  }];
  const routeBefore = ship.route;

  assert.equal(ship.recoverNavigation(), true);
  assert.equal(ship.laneOffset, 0, "recovery aims through the center of the gate");
  assert.equal(ship.route, routeBefore, "the physical itinerary is not replaced");
  assert.equal(ship.routeIndex, 1, "recovery neither skips nor repeats a stop");
  assert.equal(ship.activeShipmentId, "SHIP-LOADED", "cargo custody survives recovery");
  assert.equal(ship.shipmentCommitments[0].destinationSiteId, "the-ledge");
  assert.ok(Math.hypot(ship.velocity.x, ship.velocity.y) >= 60, "the craft receives a clean heading toward the same waypoint");
  assert.equal(ship.consumeEvents()[0].type, "npc.navigationReplanned");
});

// ── The watchdog ───────────────────────────────────────────────────────────
// The deadlock's worst property was not that it happened; it was that nothing
// noticed. The hauler's record said `transporting`, its ship said `available`,
// its carrier was solvent and its cargo was loaded. Every field was healthy and
// the craft had not moved in minutes. The one fact that cannot be faked is
// whether the route index advanced, so that is what this watches.

test("a craft that stops clearing waypoints is reported as blocked", () => {
  let clock = 1_000;
  const state = createGameState();
  state.logistics = createInitialLogisticsState(clock);
  const [shipId] = Object.keys(state.logistics.haulers);

  // A craft under way, holding station on one waypoint and never clearing it.
  const stalled = {
    id: shipId,
    operationalStatus: "available",
    dockedSiteId: null,
    routeIndex: 4,
    laneOffset: 225,
    // Circling: it holds station 163 units out and never closes, exactly as the
    // real craft did.
    lastWaypointDistance: 163,
    route: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }, { id: "corridor-gate", name: "Corridor Gate", type: "corridor-waypoint" }],
    shipmentCommitments: [],
    position: { x: 0, y: 0 },
    clearShipment() {},
  };

  const manager = createLogisticsManager({ state, ships: [stalled], now: () => clock });

  manager.observe();
  assert.equal(listBlocked(state).some((row) => row.actorId === shipId), false, "a craft under way is not blocked immediately");

  clock += 61_000; // past STALLED_NAVIGATION_SECONDS
  manager.observe();
  const blocked = listBlocked(state).find((row) => row.actorId === shipId);
  assert.ok(blocked, "a craft that has not cleared a waypoint in over a minute is reported");
  assert.equal(blocked.blocker.kind, "navigation-stalled");
  assert.equal(blocked.blocker.detail.routeIndex, 4);
  assert.equal(blocked.blocker.detail.laneOffset, 225);

  assert.ok(blocked.blocker.detail.closestApproach >= 100, "the blocker records how close it ever got");

  // Clearing a waypoint resets the watch rather than leaving a stale complaint.
  stalled.routeIndex = 5;
  manager.observe();
  clock += 1_000;
  manager.observe();
  const after = listBlocked(state).find((row) => row.actorId === shipId);
  assert.ok(!after || after.blocker?.kind !== "navigation-stalled", "progress clears the stall");
});

test("the watchdog attempts physical recovery before declaring carried freight permanently stalled", () => {
  let clock = 1_000;
  const state = createGameState();
  state.logistics = createInitialLogisticsState(clock);
  const [shipId] = Object.keys(state.logistics.haulers);
  const shipmentId = "SHIP-IN-TRANSIT";
  state.logistics.haulers[shipId].activeShipmentIds = [shipmentId];
  state.logistics.haulers[shipId].activeShipmentId = shipmentId;
  let recoveries = 0;
  const stalled = {
    id: shipId, operationalStatus: "available", dockedSiteId: null,
    routeIndex: 1, laneOffset: 140, lastWaypointDistance: 180,
    route: [HUB, GATE, { id: "the-ledge", type: "hub", position: { x: 2000, y: -600 } }],
    shipmentCommitments: [{ shipmentId }], position: { x: 0, y: 0 },
    clearShipment() {},
    recoverNavigation() { recoveries += 1; this.laneOffset = 0; this.lastWaypointDistance = 170; return true; },
  };
  const manager = createLogisticsManager({ state, ships: [stalled], now: () => clock });
  manager.observe();
  clock += 61_000;
  manager.observe();

  assert.equal(recoveries, 1, "the physical craft is actively replanned");
  assert.equal(stalled.shipmentCommitments[0].shipmentId, shipmentId, "the loaded shipment remains aboard");
  assert.equal(listBlocked(state).some((row) => row.actorId === shipId), false,
    "a first recoverable stall is not misreported as a permanent wait");
});

test("booking a repair does not stop a craft that is still flying to the berth", () => {
  let clock = 1_000;
  const state = createGameState();
  state.logistics = createInitialLogisticsState(clock);
  const [shipId] = Object.keys(state.logistics.haulers);
  const hauler = state.logistics.haulers[shipId];
  hauler.activeMovementId = "MOVE-SERVICE";
  hauler.status = "returning-maintenance";
  state.logistics.movements["MOVE-SERVICE"] = {
    id: "MOVE-SERVICE", type: "service-return", shipId,
    destinationSiteId: "scrap-porch", status: "active",
  };
  state.sprc = { repairOrders: {
    "SPRC-RPR-INBOUND": { id: "SPRC-RPR-INBOUND", subjectHaulerId: shipId, status: "waiting-stock", createdAt: clock },
  } };
  const ship = {
    id: shipId, operationalStatus: "available", dockedSiteId: null,
    routeIndex: 1, laneOffset: 0, lastWaypointDistance: 600,
    route: [HUB, { id: "scrap-porch", name: "Scrap Porch", type: "hub", position: { x: 2000, y: 0 } }],
    shipmentCommitments: [], position: { x: 400, y: 0 }, clearShipment() {},
  };

  createLogisticsManager({ state, ships: [ship], now: () => clock }).observe();

  assert.equal(ship.operationalStatus, "available", "repair paperwork does not turn the engines off in flight");
  assert.equal(hauler.status, "returning-maintenance", "the operational record continues to describe the real journey");
});

test("a navigation blocker clears when a craft is legitimately stopped for service", () => {
  let clock = 1_000;
  const state = createGameState();
  state.logistics = createInitialLogisticsState(clock);
  const [shipId] = Object.keys(state.logistics.haulers);
  recordBlocker(state, shipId, createBlocker({
    kind: BLOCKER_KIND.NAVIGATION_STALLED, summary: "stale navigation complaint", subjectId: shipId, at: clock,
  }));
  const ship = {
    id: shipId, operationalStatus: "maintenance", dockedSiteId: "scrap-porch",
    routeIndex: 1, laneOffset: 0, lastWaypointDistance: 0,
    route: [HUB, { id: "scrap-porch", name: "Scrap Porch", type: "hub", position: { x: 2000, y: 0 } }],
    shipmentCommitments: [], position: { x: 2000, y: 0 }, clearShipment() {},
  };

  createLogisticsManager({ state, ships: [ship], now: () => clock }).observe();

  assert.equal(getDiagnostic(state, shipId)?.blocker, null, "the old route failure is no longer reported as current");
});

test("a long haul at full speed is not mistaken for a stall", () => {
  // The false positive the first version of this watchdog produced. A market
  // circuit to an outer hub is one leg tens of thousands of units long; the
  // craft can run for many minutes without clearing a waypoint and is perfectly
  // healthy. What makes it healthy is that it keeps getting closer.
  let clock = 1_000;
  const state = createGameState();
  state.logistics = createInitialLogisticsState(clock);
  const [shipId] = Object.keys(state.logistics.haulers);

  const crossing = {
    id: shipId,
    operationalStatus: "available",
    dockedSiteId: null,
    routeIndex: 1,
    laneOffset: 105,
    lastWaypointDistance: 40_000,
    route: [{ id: "yard-exchange" }, { id: "coldwater-depot", name: "Coldwater Depot", type: "hub" }],
    shipmentCommitments: [],
    position: { x: 0, y: 0 },
    clearShipment() {},
  };

  const manager = createLogisticsManager({ state, ships: [crossing], now: () => clock });
  manager.observe();

  // Five minutes of steady closing on one enormous leg.
  for (let step = 0; step < 10; step += 1) {
    clock += 30_000;
    crossing.lastWaypointDistance -= 2_800;
    manager.observe();
  }

  const blocked = listBlocked(state).find((row) => row.actorId === shipId);
  assert.ok(!blocked || blocked.blocker?.kind !== "navigation-stalled",
    "a craft that keeps closing on its waypoint is never reported as stalled");
});
