// A spore should look like the thing it grows into.
//
// Six strains used to ship the same green crawler, so a hold full of spores was
// six different lifeforms wearing one costume — you could not tell what you were
// carrying, or what you were about to seed a rock with.

import assert from "node:assert/strict";
import test from "node:test";
import {
  ROCKMOSS_CRAWLER_TYPE,
  ROCKMOSS_STRAINS,
  getStrainAppearance,
  pickRockmossStrain,
} from "../src/systems/rockmossStrains.js";

test("every strain has an appearance, and no two look alike", () => {
  const strains = Object.keys(ROCKMOSS_STRAINS);
  assert.ok(strains.length >= 6, "the strain table is populated");

  const shapes = new Set();
  const colors = new Set();
  strains.forEach((id) => {
    const look = getStrainAppearance(id);
    assert.match(look.shape, /^spore-/, `${id} draws as a spore, not as an ore family`);
    assert.match(look.color, /^#[0-9a-f]{6}$/, `${id} has a usable css colour`);
    shapes.add(look.shape);
    colors.add(look.color);
  });

  assert.equal(shapes.size, strains.length, "each strain is a distinct silhouette in the hold");
  assert.equal(colors.size, strains.length, "and a distinct colour");
});

// A spore silhouette must never collide with a resource family's shape, or a
// cargo hold would draw a strain as though it were ore.
test("spore shapes are namespaced away from the ore shapes", () => {
  const oreShapes = new Set(["circle", "square", "triangle", "hexagon", "octagon", "diamond", "shard"]);
  Object.keys(ROCKMOSS_STRAINS).forEach((id) => {
    assert.equal(oreShapes.has(getStrainAppearance(id).shape), false);
  });
});

test("an unknown or missing strain still looks like something", () => {
  assert.equal(getStrainAppearance(undefined).id, "moss", "nothing is ever strainless");
  assert.equal(getStrainAppearance("not-a-strain").id, "moss");
});

test("the crawler type is owned by the strain table", () => {
  assert.equal(ROCKMOSS_CRAWLER_TYPE, "rockmoss-crawler",
    "game.js and main.js both alias this rather than re-declaring the literal");
});

test("a zone still picks a strain deterministically", () => {
  const zone = { tags: ["volatile", "fuel-rich"], danger: 0.4 };
  const first = pickRockmossStrain(zone, () => 0.5);
  const second = pickRockmossStrain(zone, () => 0.5);
  assert.equal(first, second);
  assert.ok(ROCKMOSS_STRAINS[first], "and it picks a real one");
});
