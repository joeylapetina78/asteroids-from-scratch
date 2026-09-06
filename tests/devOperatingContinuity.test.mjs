import assert from "node:assert/strict";
import test from "node:test";

import { createGameState } from "../src/state/gameState.js";
import { seedDevOperatingContinuity } from "../src/systems/devOperatingContinuity.js";

test("explorer observation starts with established business already in motion", () => {
  const state = createGameState();
  const now = 100_000;

  assert.equal(seedDevOperatingContinuity(state, now), true);
  Object.values(state.logistics.institutions)
    .filter((institution) => institution?.archetypeId === "settlement")
    .forEach((institution) => {
      assert.ok(institution.inventories["iron-nickel"] >= 0);
      assert.ok(institution.inventories.silicate >= 0);
      assert.ok(institution.inventories["water-ice"] >= 0);
      assert.equal(institution.finishedGoods["settlement-supply-unit"], 1);
      assert.equal(institution.finishedGoods["life-support-pack"], 1);
      assert.equal(institution.finishedGoods["household-goods-unit"], 1);
    });

  Object.values(state.industrial.factories).forEach((factory) => {
    assert.equal(factory.status, "working");
    assert.ok(factory.completedRuns >= 3);
    assert.ok(factory.activeRun.startedAt < now);
    assert.ok(factory.activeRun.completesAt > now);
    assert.ok(factory.operatingHistory.unitsProduced >= factory.completedRuns);
    assert.ok(factory.operatingHistory.rawUnitsConsumed > 0);
  });
  assert.equal(state.logistics.institutions["yard-shipyard"].build.hullClass, "freight-craft");
  assert.equal(seedDevOperatingContinuity(state, now), false, "a repeated setup cannot duplicate stock or work");
});
