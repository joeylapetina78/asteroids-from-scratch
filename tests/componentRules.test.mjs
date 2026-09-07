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
