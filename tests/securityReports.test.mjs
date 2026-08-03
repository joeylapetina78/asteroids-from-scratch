import assert from "node:assert/strict";
import test from "node:test";
import { createGameState } from "../src/state/gameState.js";
import {
  fileAttackReport,
  jamSecurityChannel,
  listActiveAttackReports,
  nearestActiveReport,
  resolveAttackReport,
} from "../src/systems/securityReports.js";

function world() {
  return createGameState();
}

test("a filed attack report becomes a live, readable fact", () => {
  const state = world();
  const report = fileAttackReport(state, { threatId: "gate:1", position: { x: 100, y: 0 }, kind: "gate", at: 1_000 });
  assert.equal(report.kind, "gate");
  assert.equal(report.channel, "open");
  const active = listActiveAttackReports(state, 1_100);
  assert.equal(active.length, 1);
  assert.equal(active[0].threatId, "gate:1");
});

test("repeated hits from one threat coalesce and strengthen instead of flooding", () => {
  const state = world();
  fileAttackReport(state, { threatId: "gate:1", position: { x: 100, y: 0 }, kind: "raid", severity: 0.4, at: 1_000 });
  fileAttackReport(state, { threatId: "gate:1", position: { x: 120, y: 0 }, kind: "gate", severity: 0.8, at: 2_000 });
  const active = listActiveAttackReports(state, 2_100);
  assert.equal(active.length, 1, "one threat, one report");
  assert.equal(active[0].hits, 2);
  assert.equal(active[0].severity, 0.8, "the stronger call wins");
  assert.deepEqual(active[0].position, { x: 120, y: 0 }, "and it tracks the latest sighting");
});

test("reports expire when nothing refreshes them", () => {
  const state = world();
  fileAttackReport(state, { threatId: "gate:1", position: { x: 0, y: 0 }, at: 1_000 });
  assert.equal(listActiveAttackReports(state, 1_000 + 20_000).length, 1, "still live inside the TTL");
  assert.equal(listActiveAttackReports(state, 1_000 + 40_000).length, 0, "aged out past it");
});

test("resolving the threat drops every report it raised", () => {
  const state = world();
  fileAttackReport(state, { threatId: "gate:1", position: { x: 0, y: 0 }, at: 1_000 });
  fileAttackReport(state, { threatId: "gate:2", position: { x: 5_000, y: 0 }, at: 1_000 });
  assert.equal(resolveAttackReport(state, "gate:1", { at: 2_000 }), 1);
  const remaining = listActiveAttackReports(state, 2_000);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].threatId, "gate:2");
});

test("nearest report prefers a severe call a little further over a mild one underfoot", () => {
  const state = world();
  fileAttackReport(state, { threatId: "mild", position: { x: 200, y: 0 }, kind: "raid", severity: 0.35, at: 1_000 });
  fileAttackReport(state, { threatId: "severe", position: { x: 1_500, y: 0 }, kind: "gate", severity: 0.9, at: 1_000 });
  const pick = nearestActiveReport(state, { x: 0, y: 0 }, 5_000, 1_000);
  assert.equal(pick.report.threatId, "severe");
});

test("nearest report honours the range limit", () => {
  const state = world();
  fileAttackReport(state, { threatId: "far", position: { x: 9_000, y: 0 }, kind: "gate", severity: 0.9, at: 1_000 });
  assert.equal(nearestActiveReport(state, { x: 0, y: 0 }, 2_000, 1_000), null, "out of range is not answered");
  assert.ok(nearestActiveReport(state, { x: 0, y: 0 }, 10_000, 1_000), "in range is");
});

// ── the jamming hook: inert, but the reporting side already respects it ──────

test("a jammed region swallows the call for help", () => {
  const state = world();
  jamSecurityChannel(state, { position: { x: 0, y: 0 }, radius: 500, expiresAt: 5_000 });
  const jammed = fileAttackReport(state, { threatId: "gate:1", position: { x: 100, y: 0 }, at: 1_000 });
  assert.equal(jammed, null, "the report never propagates");
  assert.equal(listActiveAttackReports(state, 1_000).length, 0);
  assert.ok(state.ledger.getRecentEvents(10, { includeHidden: true }).some((event) => event.type === "security.reportJammed"),
    "but the silence is recorded, not invisible");
});

test("a report just outside the jam still gets through", () => {
  const state = world();
  jamSecurityChannel(state, { position: { x: 0, y: 0 }, radius: 500, expiresAt: 5_000 });
  const clear = fileAttackReport(state, { threatId: "gate:1", position: { x: 900, y: 0 }, at: 1_000 });
  assert.ok(clear, "outside the jammed radius the call carries");
});

test("a jam lifts once it expires", () => {
  const state = world();
  jamSecurityChannel(state, { position: { x: 0, y: 0 }, radius: 500, expiresAt: 2_000 });
  assert.equal(fileAttackReport(state, { threatId: "a", position: { x: 0, y: 0 }, at: 1_000 }), null);
  assert.ok(fileAttackReport(state, { threatId: "b", position: { x: 0, y: 0 }, at: 3_000 }), "after expiry the channel is open again");
});
