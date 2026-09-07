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

test("a partially processed ten-stack explodes its remainder into individual units", () => {
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

  assert.equal(processor.units.length, 8);
  assert.ok(processor.units.every((unit) => unit.quantity === 1));
  assert.ok(processor.units.every((unit) => unit.vx !== 0 || unit.vy !== 0));
  assert.ok(new Set(processor.units.map((unit) => Math.sign(unit.vx))).size > 1);
  assert.equal(processor.sparks.length, 18);
});

test("ten matching singles compact even when their provenance differs", () => {
  const canvas = {
    width: 300,
    height: 180,
    getContext: () => ({}),
    addEventListener: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 300, height: 180 }),
  };
  const processor = new Processor(canvas, () => true, { enableCompaction: true });
  for (let index = 0; index < 10; index += 1) {
    processor.units.push({
      type: "iron-nickel",
      sourceClaimId: `claim-${index}`,
      color: "#d93b24",
      shape: "square",
      quantity: 1,
      size: processor.getUnitSize(1),
      x: 20 + index * 20,
      y: 80,
      vx: 0,
      vy: 0,
      angle: 0,
      angularVelocity: 0,
    });
  }

  processor.startCompaction();
  processor.advanceCompaction(0.5);

  assert.equal(processor.units.length, 1);
  assert.equal(processor.units[0].quantity, 10);
});

test("same-shape resources with different colors stay in separate stacks", () => {
  const canvas = {
    width: 300,
    height: 180,
    getContext: () => ({}),
    addEventListener: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 300, height: 180 }),
  };
  const processor = new Processor(canvas, () => true, { enableCompaction: true });
  const makeUnit = (type, color, index) => ({
    type,
    color,
    shape: "circle",
    quantity: 1,
    size: processor.getUnitSize(1),
    x: 20 + index * 20,
    y: 80,
    vx: 0,
    vy: 0,
    angle: 0,
    angularVelocity: 0,
  });
  processor.units.push(
    ...Array.from({ length: 5 }, (_, index) => makeUnit("water-ice", "#2bd9f7", index)),
    ...Array.from({ length: 5 }, (_, index) => makeUnit("hydrogen", "#4967e8", index + 5)),
  );

  processor.startCompaction();

  assert.equal(processor.compaction, null);
  assert.equal(processor.units.length, 10);
});

test("an old partial bundle plus loose units reforms as one ten-stack with singles left over", () => {
  const canvas = {
    width: 300,
    height: 180,
    getContext: () => ({}),
    addEventListener: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 300, height: 180 }),
  };
  const processor = new Processor(canvas, () => true, { enableCompaction: true });
  const makeUnit = (quantity, index) => ({
    type: "iron-nickel",
    color: "#d93b24",
    shape: "square",
    quantity,
    size: processor.getUnitSize(quantity),
    x: 30 + index * 24,
    y: 70,
    vx: 0,
    vy: 0,
    angle: 0,
    angularVelocity: 0,
  });
  processor.units.push(makeUnit(7, 0), ...Array.from({ length: 5 }, (_, index) => makeUnit(1, index + 1)));

  processor.expandPartialBundles();
  processor.startCompaction();
  processor.advanceCompaction(0.5);

  assert.equal(processor.units.reduce((sum, unit) => sum + unit.quantity, 0), 12);
  assert.equal(processor.units.filter((unit) => unit.quantity === 10).length, 1);
  assert.equal(processor.units.filter((unit) => unit.quantity === 1).length, 2);
});
