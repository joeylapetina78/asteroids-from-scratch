import test from "node:test";
import assert from "node:assert/strict";

import { getProcessorOutputs, normalizeProcessorOutput } from "../src/components/componentRules.js";

function components({ scanner = false, collector = false, output = "scanergy" } = {}) {
  return {
    engine: { installed: false },
    miner: { installed: false },
    scanner: { installed: scanner },
    collector: { installed: collector },
    hull: { installed: false },
    cargoHold: { installed: false },
    processor: { output },
  };
}

test("scanergy processing is available for either scanner or tractor field", () => {
  assert.equal(getProcessorOutputs(components({ scanner: true })).some(({ id }) => id === "scanergy"), true);
  assert.equal(getProcessorOutputs(components({ collector: true })).some(({ id }) => id === "scanergy"), true);
  assert.equal(getProcessorOutputs(components()).some(({ id }) => id === "scanergy"), false);
});

test("tractor field alone preserves a selected scanergy processor output", () => {
  const state = components({ collector: true });
  normalizeProcessorOutput(state);
  assert.equal(state.processor.output, "scanergy");
});

// A failed processor routes nowhere but the hold.
//
// The campaign skiff is issued with a dead processor, which is the in-world
// reason a Rook hand's ore arrives unrefined. There is no wear ladder driving a
// processor to `failed` yet — it is authored — so this pins the behaviour of
// that final stage for when one exists.
test("a failed processor's mag link reaches only cargo", () => {
  const components = {
    engine: { installed: true },
    miner: { installed: true },
    scanner: { installed: true },
    collector: { installed: true },
    hull: { installed: true },
    cargoHold: { installed: true },
    processor: { installed: true, output: "fuel", condition: { stage: "healthy" } },
  };

  const healthy = getProcessorOutputs(components).map((output) => output.id);
  assert.ok(healthy.length > 1, "a working processor offers real destinations");
  assert.ok(healthy.includes("fuel") && healthy.includes("cargo"));

  components.processor.condition.stage = "failed";
  const failed = getProcessorOutputs(components);
  assert.deepEqual(failed.map((output) => output.id), ["cargo"],
    "nothing but the hold, even though every other component is fitted and working");
  // The hold still takes everything, so material is stored rather than refused.
  assert.equal(failed[0].acceptedShapes.length, 7);

  // And the selection is corrected rather than left pointing at a dead link.
  normalizeProcessorOutput(components);
  assert.equal(components.processor.output, "cargo");
});

test("a failed processor with no hold has nowhere to put anything", () => {
  const components = {
    engine: { installed: true }, miner: { installed: true },
    scanner: { installed: false }, collector: { installed: false },
    hull: { installed: true }, cargoHold: { installed: false },
    processor: { installed: true, output: "fuel", condition: { stage: "failed" } },
  };
  assert.deepEqual(getProcessorOutputs(components), []);
});
