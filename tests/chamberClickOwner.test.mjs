import test from "node:test";
import assert from "node:assert/strict";

import { chamberYieldsClick } from "../src/systems/chamberClickOwner.js";

// A stand-in for the element the browser hit-tested. `matched` is the list of
// selectors an ancestor of it would satisfy.
function element(matched = []) {
  const hits = (selector) => selector
    .split(",")
    .map((part) => part.trim())
    .some((part) => matched.includes(part));
  return { closest: (selector) => (hits(selector) ? {} : null), matches: hits };
}

const BARE_WORLD = element([]);
const TAB = element([".cockpit-module-tray", "button"]);
const PLUG = element([".processor-claw"]);
const BUTTON = element(["button"]);
const PANEL = element([".is-cockpit-module"]);

const restingHold = element([]);
const openHold = element([".is-sell-target"]);
const depositHold = element([".is-deposit-target"]);

// The behaviour the chamber exists for: material lying over the world is
// pickable, because nothing is drawn on top of it.
test("a click on nothing in particular belongs to the ore", () => {
  assert.equal(chamberYieldsClick(BARE_WORLD, restingHold), false);
  assert.equal(chamberYieldsClick(BARE_WORLD, openHold), false);
});

// The reported bug. The bay tab is a control the player reaches for
// constantly, and it was losing to whichever rock had drifted behind it.
test("the module bay tab always wins, whatever the chamber is doing", () => {
  [restingHold, openHold, depositHold, null].forEach((panel) => {
    assert.equal(chamberYieldsClick(TAB, panel), true, "the tab lost a click");
  });
});

test("the routing plug always wins too", () => {
  [restingHold, openHold, depositHold, null].forEach((panel) => {
    assert.equal(chamberYieldsClick(PLUG, panel), true, "the plug lost a click");
  });
});

// A resting chamber is painted below the desk, so what is on top of it gets
// the click — which is also what it looks like.
test("with the hold shut, an instrument on top of it keeps its own clicks", () => {
  assert.equal(chamberYieldsClick(BUTTON, restingHold), true);
  assert.equal(chamberYieldsClick(PANEL, restingHold), true);
});

// And the other half of the same rule: an open hold is raised over the desk,
// so the ore the player can see over the panels is what they are aiming at.
test("with the hold open, the ore takes the click back from the panels", () => {
  [openHold, depositHold].forEach((panel) => {
    assert.equal(chamberYieldsClick(BUTTON, panel), false);
    assert.equal(chamberYieldsClick(PANEL, panel), false);
  });
});

// The processor is never raised, so it passes no panel at all.
test("a chamber with no panel simply always yields to controls", () => {
  assert.equal(chamberYieldsClick(BUTTON, null), true);
  assert.equal(chamberYieldsClick(BARE_WORLD, null), false);
});

test("a target that is not an element is not something to yield to", () => {
  assert.equal(chamberYieldsClick(null, openHold), false);
  assert.equal(chamberYieldsClick(undefined, restingHold), false);
  assert.equal(chamberYieldsClick({}, restingHold), false);
});
