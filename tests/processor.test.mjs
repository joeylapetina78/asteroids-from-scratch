import test from "node:test";
import assert from "node:assert/strict";

import { Processor, getProcessorConsumptionQuantity } from "../src/systems/processor.js";

test("processor consumption uses only enough compacted units to fill headroom", () => {
  assert.equal(getProcessorConsumptionQuantity(10, 250, 1), 1);
  assert.equal(getProcessorConsumptionQuantity(10, 250, 500), 2);
  assert.equal(getProcessorConsumptionQuantity(10, 250, 501), 3);
  assert.equal(getProcessorConsumptionQuantity(10, 250, Infinity), 10);
  assert.equal(getProcessorConsumptionQuantity(10, 250, 0), 0);
});

test("a partially processed stack ejects its visible remainder from the burst", () => {
  const canvas = {
    width: 200,
    height: 120,
    getContext: () => ({}),
    addEventListener: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 120 }),
  };
  const processor = new Processor(canvas, () => ({ processedQuantity: 2 }));
  processor.units.push({
    type: "copper",
    color: "#68b7ff",
    shape: "hexagon",
    quantity: 10,
    size: processor.getUnitSize(10),
    x: 40,
    y: 40,
    vx: 0,
    vy: 0,
    angularVelocity: 0,
  });

  processor.handleClick({ clientX: 60, clientY: 60 });

  assert.equal(processor.units.length, 1);
  assert.equal(processor.units[0].quantity, 8);
  assert.ok(processor.units[0].vy <= -180);
  assert.notEqual(processor.units[0].vx, 0);
  assert.equal(processor.sparks.length, 18);
});
