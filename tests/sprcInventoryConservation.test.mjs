import test from "node:test";
import assert from "node:assert/strict";

import { createGameState } from "../src/state/gameState.js";
import { createSprcOperation, SPRC } from "../src/systems/sprcOperation.js";

function createHarness() {
  let clock = 1_000;
  const state = createGameState();
  const operation = createSprcOperation({
    state,
    now: () => clock,
    registerContractDefinition: () => {},
  });
  return { state, operation, advance: (ms) => { clock += ms; } };
}

function requestHullRepair(harness) {
  harness.state.ledger.recordEvent("logistics.maintenanceRequired", {
    npcId: SPRC.firstHaulerId, issueType: "hull-fatigue", wear: 1.5,
    issueCount: 1, causedByCarefulMode: false,
  }, { visible: false });
  harness.operation.update();
}

// Nothing may ever be reserved that is not actually held. This is the invariant
// `removeInventory` throws to defend, and the throw lands in the middle of the
// world tick, so a breach is a frame-killer rather than a quiet drift.
function assertReservationsAreBacked(state, note) {
  ["raw", "produced"].forEach((bucket) => {
    Object.entries(state.sprc.inventories.reserved[bucket] ?? {}).forEach(([itemId, reserved]) => {
      const held = state.sprc.inventories[bucket][itemId] ?? 0;
      assert.ok(
        held >= reserved,
        `${note}: ${bucket}.${itemId} reserved ${reserved} against ${held} held`,
      );
    });
  });
}

// The reported failure, reproduced: a hull plate is structural feedstock AND
// water ice, but only the feedstock half was checked before the order was
// queued. With feedstock on the shelf and no ice, the ice was reserved anyway
// and the shortfall surfaced later as `SPRC inventory underflow: raw.water-ice`
// thrown out of the middle of the tick.
test("a plate order is not queued against water ice the yard does not have", () => {
  const harness = createHarness();
  const { state, operation } = harness;

  state.sprc.inventories.raw["iron-nickel"] = 40;
  state.sprc.inventories.raw.aluminum = 40;
  state.sprc.inventories.raw["water-ice"] = 0;

  requestHullRepair(harness);

  for (let tick = 0; tick < 30; tick += 1) {
    harness.advance(5_000);
    assert.doesNotThrow(() => operation.update(), `tick ${tick} threw`);
    assertReservationsAreBacked(state, `tick ${tick}`);
  }

  const iceReserved = state.sprc.inventories.reserved.raw["water-ice"] ?? 0;
  assert.equal(iceReserved, 0, `reserved ${iceReserved} ice against an empty shelf`);
});

test("with ice on the shelf the plate line runs and stays balanced", () => {
  const harness = createHarness();
  const { state, operation } = harness;

  state.sprc.inventories.raw["iron-nickel"] = 40;
  state.sprc.inventories.raw.aluminum = 40;
  state.sprc.inventories.raw["water-ice"] = 40;

  requestHullRepair(harness);

  for (let tick = 0; tick < 30; tick += 1) {
    harness.advance(5_000);
    assert.doesNotThrow(() => operation.update(), `tick ${tick} threw`);
    assertReservationsAreBacked(state, `tick ${tick}`);
  }
});

// Even if a reservation drifts for some reason this fix does not cover, the
// yard must refuse the order rather than throw. The repair berth has always
// worked this way; production did not.
test("a production order whose stock vanished is dropped, not thrown over", () => {
  const harness = createHarness();
  const { state, operation } = harness;

  state.sprc.inventories.raw["iron-nickel"] = 40;
  state.sprc.inventories.raw.aluminum = 40;
  state.sprc.inventories.raw["water-ice"] = 40;

  requestHullRepair(harness);
  for (let tick = 0; tick < 6; tick += 1) {
    harness.advance(5_000);
    operation.update();
  }

  const queued = Object.values(state.sprc.productionOrders)
    .filter((order) => order.status === "queued");

  if (queued.length === 0) {
    // Nothing was waiting to start, so there is nothing to corrupt. The other
    // two tests still cover the real path.
    return;
  }

  // Take the shelf away behind the order's back.
  Object.keys(state.sprc.inventories.raw).forEach((itemId) => {
    state.sprc.inventories.raw[itemId] = 0;
  });

  assert.doesNotThrow(() => operation.update(), "a drifted order must not kill the tick");

  queued.forEach((order) => {
    assert.notEqual(order.status, "running", "it must not start against stock that is gone");
  });
});
