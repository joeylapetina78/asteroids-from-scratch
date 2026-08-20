import assert from "node:assert/strict";
import test from "node:test";

import { CORRIDOR_LANE_LIMIT, MAX_BERTH_LANE_OFFSET, NpcShip, WAYPOINT_RADIUS, laneOffsetFor } from "../src/entities/NpcShip.js";
import { createInitialLogisticsState, createLogisticsManager } from "../src/systems/logistics.js";
import { createGameState } from "../src/state/gameState.js";
import { listBlocked } from "../src/systems/diagnostics.js";

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
