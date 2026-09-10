import test from "node:test";
import assert from "node:assert/strict";

import {
  BASE_TYPE_STEPS,
  CONTENT_COLUMNS_FULL,
  MAX_SCALE,
  MIN_SCALE,
  MIN_TYPE_SIZE,
  getCockpitScale,
  getCockpitScaleProperties,
  getTypeSteps,
} from "../src/systems/cockpitScale.js";

const SCALES = [1, 1.15, 1.3, 1.5, 1.75, 2];

test("at 100% it is exactly the cockpit the stylesheet already describes", () => {
  const sizes = getCockpitScale(1);

  assert.equal(sizes.unit, 4);
  assert.equal(sizes.minor, 12);
  assert.equal(sizes.major, 24);
  assert.equal(sizes.flange, 4);
  assert.equal(sizes.contentFull, 216);
  assert.equal(sizes.widthFull, 224);
  assert.equal(sizes.contentHalf, 96);
  assert.equal(sizes.widthHalf, 104);
  assert.equal(sizes.control, 36);
  assert.equal(sizes.controlLarge, 60);
  assert.deepEqual(sizes.type, BASE_TYPE_STEPS);
});

// Whole pixels are the entire reason this is computed in JS rather than
// written as calc() in the stylesheet.
test("every measurement is a whole number of pixels at every scale", () => {
  SCALES.forEach((scale) => {
    const sizes = getCockpitScale(scale);
    Object.entries(sizes).forEach(([name, value]) => {
      if (name === "scale" || name === "type") return;
      assert.ok(Number.isInteger(value), `${name} was ${value} at ${scale}x`);
    });
    Object.entries(sizes.type).forEach(([name, value]) => {
      assert.ok(Number.isInteger(value), `type.${name} was ${value} at ${scale}x`);
    });
  });
});

// The load-bearing invariant. A panel may sit on a line or on a midpoint, and
// a midpoint shifts its whole interior by half a column — so the interior
// rhythm has to BE that half, at every scale, or scaling reintroduces exactly
// the misalignment the grid work removed.
test("the minor grid stays exactly half the major one, always", () => {
  SCALES.forEach((scale) => {
    const sizes = getCockpitScale(scale);
    assert.equal(sizes.minor * 2, sizes.major, `broke at ${scale}x`);
  });
});

test("a bay is always a whole number of columns", () => {
  SCALES.forEach((scale) => {
    const sizes = getCockpitScale(scale);
    assert.equal(sizes.contentFull % sizes.major, 0, `full bay off-grid at ${scale}x`);
    assert.equal(sizes.contentHalf % sizes.major, 0, `half bay off-grid at ${scale}x`);
    assert.equal(sizes.contentFull / sizes.major, CONTENT_COLUMNS_FULL);
    // Two halves plus a one-column gutter still occupy one full bay.
    assert.equal(sizes.contentHalf * 2 + sizes.major, sizes.contentFull);
  });
});

test("the control ladder stays on the minor grid", () => {
  SCALES.forEach((scale) => {
    const sizes = getCockpitScale(scale);
    [sizes.controlFlat, sizes.control, sizes.controlLarge, sizes.meterHeight].forEach((height) => {
      assert.equal(height % sizes.minor, 0, `${height} is off the ladder at ${scale}x`);
    });
    assert.ok(sizes.controlFlat < sizes.control && sizes.control < sizes.controlLarge);
  });
});

// Every meter grain has to keep tiling the bay, or a scaled-up cockpit gets
// meters that stop short of their own edge.
test("meter grains still tile the bay exactly at every scale", () => {
  SCALES.forEach((scale) => {
    const sizes = getCockpitScale(scale);
    [sizes.meterPitchFine, sizes.meterPitchCoarse, sizes.meterPitchBlunt].forEach((pitch) => {
      assert.equal(sizes.contentFull % pitch, 0, `pitch ${pitch} does not tile at ${scale}x`);
    });
  });
});

test("nothing shrinks as the player scales up", () => {
  for (let index = 1; index < SCALES.length; index += 1) {
    const smaller = getCockpitScale(SCALES[index - 1]);
    const bigger = getCockpitScale(SCALES[index]);
    assert.ok(bigger.major >= smaller.major);
    assert.ok(bigger.widthFull >= smaller.widthFull);
    assert.ok(bigger.type.m >= smaller.type.m);
  }
});

// The pizazz clause. Rounding collapses the bottom steps onto each other, so
// they are forced apart — which means the small end is compressed rather than
// ratio-correct, deliberately.
test("type steps never collide, however hard rounding pushes them together", () => {
  SCALES.forEach((scale) => {
    const steps = Object.values(getTypeSteps(scale));
    for (let index = 1; index < steps.length; index += 1) {
      assert.ok(steps[index] > steps[index - 1], `steps collided at ${scale}x: ${steps}`);
    }
    assert.ok(steps[0] >= MIN_TYPE_SIZE, `smallest step ${steps[0]} is below legibility`);
  });
});

// And the promise that makes the compression acceptable: scaling up is what
// somebody who cannot read the small text is doing, and it gives them back the
// separation the small end had to give away.
test("the small steps separate again as the player scales up", () => {
  const at100 = getTypeSteps(1);
  const at175 = getTypeSteps(1.75);

  assert.ok(at175.s - at175.xs > at100.s - at100.xs, "the bottom of the scale should open up");
});

test("a nonsense scale is clamped rather than obeyed", () => {
  assert.equal(getCockpitScale(0).scale, MIN_SCALE);
  assert.equal(getCockpitScale(-3).scale, MIN_SCALE);
  assert.equal(getCockpitScale(99).scale, MAX_SCALE);
  assert.equal(getCockpitScale(Number.NaN).scale, 1);
  assert.equal(getCockpitScale(undefined).scale, 1);
});

test("the published properties are all pixel strings the stylesheet can use", () => {
  const properties = getCockpitScaleProperties(1.5);

  Object.entries(properties).forEach(([name, value]) => {
    assert.ok(name.startsWith("--"), `${name} is not a custom property`);
    assert.match(value, /^\d+px$/, `${name} was ${value}`);
  });
  assert.equal(properties["--grid-major"], "36px");
  assert.equal(properties["--minor"], "18px");
});
