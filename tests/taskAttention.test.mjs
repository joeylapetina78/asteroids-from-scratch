import assert from "node:assert/strict";
import test from "node:test";

import { getTaskAttentionTargets } from "../src/systems/taskAttention.js";

test("a patrol wait has no arrow, then requested documents point to their controls", () => {
  const patrol = { phase: "hold", hasScanned: false, site: { id: "yard" } };
  assert.deepEqual(getTaskAttentionTargets({ patrol }).map((target) => target.targetId), []);
  patrol.hasScanned = true;
  assert.deepEqual(getTaskAttentionTargets({ patrol }).map((target) => target.targetId), ["element:hull-vin", "element:license-id"]);
  assert.deepEqual(
    getTaskAttentionTargets({ patrol, presentedDocumentKinds: new Set(["ship-vin"]) }).map((target) => target.targetId),
    ["element:license-id"],
  );
});

test("flagged patrol tasks point to the panels that can resolve missing papers", () => {
  const targets = getTaskAttentionTargets({ patrol: {
    phase: "standoff", hasScanned: true, flaggedDismissTimer: 2,
    flaggedReasons: ["missing-vin", "missing-pilot-license"],
  } });
  assert.deepEqual(targets.map((target) => target.targetId), ["panel:hull", "panel:license"]);
});

test("contracts point only to an actionable collection control", () => {
  const targets = getTaskAttentionTargets({ contracts: [
    { id: "outbound", status: "active", title: "Carry freight" },
    { id: "done", status: "fulfilled", issuer: "Rook" },
  ] });
  assert.deepEqual(targets.map((target) => target.targetId), ["element:contract-accept"]);
});
