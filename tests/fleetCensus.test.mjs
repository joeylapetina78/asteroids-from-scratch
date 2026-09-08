import assert from "node:assert/strict";
import test from "node:test";
import { createGameState } from "../src/state/gameState.js";
import {
  HULL_EVENT, auditFleetIntegrity, ensureFleetCensus, getFleetSamples,
  readFleetCensus, recordFleetSample, recordHullEvent,
} from "../src/systems/fleetCensus.js";

function worldWithFleet(ships) {
  const state = createGameState();
  state.miningOperations = {
    "rook-industries": {
      institution: { id: "miner:rook-industries", name: "Rook Industries" },
      ships: Object.fromEntries(ships.map((ship) => [ship.id, ship])),
    },
  };
  return state;
}

test("the census counts hulls per operator and totals them", () => {
  const state = worldWithFleet([
    { id: "worker:rook-one", name: "Rook One", operatorId: "person:a" },
    { id: "worker:rook-two", name: "Rook Two", operatorId: "person:b" },
  ]);

  const census = readFleetCensus(state);
  assert.equal(census.total, 2);
  assert.equal(census.byOperator["rook-industries"].count, 2);
  assert.equal(census.byOperator["rook-industries"].name, "Rook Industries");
});

test("samples are taken on an interval and the series is readable", () => {
  const state = worldWithFleet([{ id: "worker:rook-one", name: "Rook One" }]);

  assert.ok(recordFleetSample(state, { now: 1_000, force: true }));
  // Inside the interval, so no second sample: a series that oversamples on
  // every render would make a flat fleet look like a busy one.
  assert.equal(recordFleetSample(state, { now: 2_000 }), null);
  assert.ok(recordFleetSample(state, { now: 1_000 + 10_000 }));

  const samples = getFleetSamples(state);
  assert.equal(samples.length, 2);
  assert.equal(samples[0].total, 1);
  assert.equal(samples[0].byOperator["rook-industries"], 1);
});

test("a crew left on a deleted hull is reported as unaccounted for", () => {
  // The exact defect this was built for: a 26-minute story run ended with four
  // operators still employed on ships that had been deleted, and nothing in the
  // game could see it.
  const state = worldWithFleet([{ id: "worker:rook-one", name: "Rook One", operatorId: "person:a" }]);
  state.population.laborAssignments = {
    "employment:worker:rook-one": { id: "employment:worker:rook-one", assetId: "worker:rook-one", status: "active", operatorId: "person:a", employerInstitutionId: "miner:rook-industries", workers: 1 },
    "employment:worker:rook-two": { id: "employment:worker:rook-two", assetId: "worker:rook-two", status: "active", operatorId: "person:b", employerInstitutionId: "miner:rook-industries", workers: 1 },
  };

  const audit = auditFleetIntegrity(state);
  assert.equal(audit.orphanedEmployments.length, 1);
  assert.equal(audit.orphanedEmployments[0].assetId, "worker:rook-two");
  assert.equal(audit.clean, false);

  // A released assignment is not an orphan — it is a finished job.
  state.population.laborAssignments["employment:worker:rook-two"].status = "released";
  assert.equal(auditFleetIntegrity(state).orphanedEmployments.length, 0);
  assert.equal(auditFleetIntegrity(state).clean, true);
});

test("the audit reports both directions of physical disagreement", () => {
  const state = worldWithFleet([
    { id: "worker:rook-one", name: "Rook One", operatorId: "person:a" },
    { id: "worker:rook-two", name: "Rook Two", operatorId: "person:b" },
  ]);

  const audit = auditFleetIntegrity(state, { physicalShipIds: ["worker:rook-one", "worker:stray"] });
  assert.deepEqual(audit.phantomHulls.map((entry) => entry.shipId), ["worker:rook-two"]);
  assert.deepEqual(audit.unlistedHulls, ["worker:stray"]);
  assert.equal(audit.clean, false);
});

test("stood-down hull value is totalled without pretending a founding hull had a price", () => {
  const state = worldWithFleet([]);
  recordHullEvent(state, HULL_EVENT.STOOD_DOWN, { shipId: "a", shipName: "Bought One", bookValue: 3500, now: 1 });
  recordHullEvent(state, HULL_EVENT.STOOD_DOWN, { shipId: "b", shipName: "Founding One", bookValue: null, now: 2 });
  recordHullEvent(state, HULL_EVENT.COMMISSIONED, { shipId: "c", shipName: "New One", bookValue: 4000, now: 3 });

  const audit = auditFleetIntegrity(state);
  assert.equal(audit.standDowns, 2);
  assert.equal(audit.commissionings, 1);
  // Only the hull that was actually bought contributes a number. The seeded one
  // is counted separately rather than being valued at zero, which would read as
  // "worth nothing" instead of "never had a price".
  assert.equal(audit.capitalStoodDown, 3500);
  assert.equal(audit.capitalStoodDownUnpriced, 1);
});

test("the census survives a world that has no mining operations at all", () => {
  const state = createGameState();
  delete state.miningOperations;
  assert.equal(readFleetCensus(state).total, 0);
  assert.equal(auditFleetIntegrity(state).hullsInService, 0);
  assert.ok(ensureFleetCensus(state).samples);
});

test("a hub-owned recovery collector is a real craft, not an unaccounted-for ghost", () => {
  // Found by this instrument ten minutes after it was built, against itself:
  // Yard Recovery 1 is a physical MiningWorkerShip owned by Yard Exchange Field
  // Recovery out of `state.ecologicalRecovery`, not by a mining operation. The
  // first version scanned only `miningOperations` and reported it as a craft
  // nobody claims. A conservation check that invents ghosts is worse than none.
  const state = worldWithFleet([{ id: "worker:rook-one", name: "Rook One", operatorId: "person:a" }]);
  state.ecologicalRecovery = {
    institution: { id: "yard-exchange-ecological-recovery", name: "Yard Exchange Field Recovery" },
    ships: { "eco-collector-1": { id: "eco-collector-1", name: "Yard Recovery 1" } },
  };

  const census = readFleetCensus(state);
  assert.equal(census.total, 2, "the collector is a hull the world has");
  assert.equal(census.byOperator["ecological-recovery"].count, 1);
  assert.equal(census.byOperator["ecological-recovery"].name, "Yard Exchange Field Recovery");

  const audit = auditFleetIntegrity(state, { physicalShipIds: ["worker:rook-one", "eco-collector-1"] });
  assert.deepEqual(audit.unlistedHulls, [], "a claimed craft is not unclaimed");
  assert.deepEqual(audit.phantomHulls, []);
  // Collectors are equipment, not a berth someone is employed into, so they must
  // not read as permanently short of crew.
  assert.deepEqual(audit.uncrewedHulls, []);
  assert.equal(audit.clean, true);
});
