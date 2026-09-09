import test from "node:test";
import assert from "node:assert/strict";

import {
  exchangeMomentum,
  getUnitBounce,
  getUnitDriftDamping,
  getUnitMass,
} from "../src/systems/processor.js";
import {
  MAX_RESOURCE_DENSITY,
  MIN_RESOURCE_DENSITY,
  getResourceDensity,
} from "../src/systems/resourceDefinitions.js";

const unit = (density, size = 22) => ({ density, size, massReference: 22, vx: 0, vy: 0 });

test("density comes from the family, and a member may argue with it", () => {
  assert.equal(getResourceDensity("water-ice"), 0.55);
  assert.equal(getResourceDensity("iron-nickel"), 1.75);
  // Overrides on the member itself.
  assert.equal(getResourceDensity("titanium"), 2.1);
  assert.equal(getResourceDensity("hydrogen"), 0.3);
});

test("every density in the table stays inside the usable range", () => {
  ["water-ice", "hydrogen", "iron-nickel", "titanium", "silicate", "rift-trophy"].forEach((id) => {
    const density = getResourceDensity(id);
    assert.ok(density >= MIN_RESOURCE_DENSITY && density <= MAX_RESOURCE_DENSITY, `${id} = ${density}`);
  });
});

test("mass grows with area, so a ten-stack shoves like one", () => {
  const single = getUnitMass(unit(1, 22));
  const stack = getUnitMass(unit(1, 44));

  assert.equal(single, 1);
  assert.equal(stack, 4);
});

// The whole point of the change: identical pieces in near-inelastic contact all
// converge on one velocity, which IS a clump. Different masses diverge instead.
test("a heavy unit hands its speed to a light one and barely slows", () => {
  const heavy = { ...unit(2.1), vx: 200 };
  const light = { ...unit(0.3), vx: 0 };

  exchangeMomentum(heavy, light, "vx", -1);

  assert.ok(heavy.vx > 140, `heavy kept ${heavy.vx}`);
  assert.ok(light.vx > 200, `light took ${light.vx}`);
  assert.ok(light.vx > heavy.vx, "the light one should end up ahead");
});

test("equal masses still behave exactly as they did before density existed", () => {
  const first = { ...unit(1), vx: 100 };
  const second = { ...unit(1), vx: 0 };
  const bounce = getUnitBounce(first);

  exchangeMomentum(first, second, "vx", -1);

  assert.equal(first.vx, 100 - ((1 + bounce) / 2) * 100);
  assert.equal(second.vx, ((1 + bounce) / 2) * 100);
});

test("units already separating are left alone, so resting contacts do not buzz", () => {
  const first = { ...unit(1), vx: -50 };
  const second = { ...unit(1), vx: 50 };

  exchangeMomentum(first, second, "vx", -1);

  assert.equal(first.vx, -50);
  assert.equal(second.vx, 50);
});

test("denser material is livelier off a contact and coasts further", () => {
  assert.ok(getUnitBounce(unit(2.1)) > getUnitBounce(unit(0.3)));
  assert.ok(getUnitDriftDamping(unit(2.1)) > getUnitDriftDamping(unit(0.3)));
});

// DRIFT_DAMPING is per-frame, so the heavy end has to stay short of the value
// where material stops giving up speed and packs against the far wall.
test("no material drifts forever or stalls on the spot", () => {
  [0.3, 0.55, 1, 1.75, 2.1].forEach((density) => {
    const damping = getUnitDriftDamping(unit(density));
    assert.ok(damping > 0.98 && damping < 0.997, `density ${density} damps at ${damping}`);
  });
});
