import assert from "node:assert/strict";
import test from "node:test";

import { appendBoundedHistory } from "../src/systems/boundedHistory.js";
import { createEventLedger } from "../src/systems/eventLedger.js";

test("bounded operational history keeps the newest records", () => {
  const history = [];
  for (let id = 1; id <= 12; id += 1) appendBoundedHistory(history, { id }, 5);
  assert.deepEqual(history.map((entry) => entry.id), [8, 9, 10, 11, 12]);
});

test("ledger cursor reads preserve visibility and retention semantics", () => {
  const ledger = createEventLedger({ historyLimit: 5 });
  for (let id = 1; id <= 8; id += 1) {
    ledger.recordEvent(`event.${id}`, { id }, { visible: id % 2 === 0 });
  }
  assert.equal(ledger.eventCount, 5);
  assert.deepEqual(
    ledger.getEventsAfterId(5, { includeHidden: true }).map((event) => event.id),
    [6, 7, 8],
  );
  assert.deepEqual(
    ledger.getEventsAfterId(4).map((event) => event.id),
    [6, 8],
  );
  assert.deepEqual(ledger.getEventsAfterId(8, { includeHidden: true }), []);
});

test("retention expires telemetry first, operations later, and never durable history", () => {
  let clock = 0;
  const ledger = createEventLedger({ now: () => clock, classLimits: { ephemeral: 20, operational: 20, durable: Infinity } });
  ledger.recordEvent("player.thrust");
  ledger.recordEvent("institution.jobValued");
  ledger.recordEvent("contract.paid");

  clock = 31_000;
  ledger.pruneRetainedEvents();
  assert.deepEqual(ledger.getEventsAfterId(0, { includeHidden: true }).map((event) => event.type), ["institution.jobValued", "contract.paid"]);

  clock = 21 * 60 * 1000;
  ledger.pruneRetainedEvents();
  assert.deepEqual(ledger.getEventsAfterId(0, { includeHidden: true }).map((event) => event.type), ["contract.paid"]);
  assert.deepEqual(ledger.getRetentionStats().prunedByClass, { ephemeral: 1, operational: 1, durable: 0 });
});

test("save snapshots omit telemetry, preserve live operations and durable IDs", () => {
  let clock = 10_000;
  const source = createEventLedger({ now: () => clock });
  source.recordEvent("player.thrust");
  source.recordEvent("institution.jobValued");
  source.recordEvent("contract.paid");
  const snapshot = source.getSaveSnapshot();
  assert.deepEqual(snapshot.events.map((event) => event.type), ["institution.jobValued", "contract.paid"]);

  const restored = createEventLedger({ now: () => clock });
  assert.equal(restored.loadSaveSnapshot(snapshot), true);
  assert.deepEqual(restored.getEventsAfterId(0, { includeHidden: true }).map((event) => event.id), [2, 3]);
  assert.equal(restored.recordEvent("contract.expired").id, 4);
});
