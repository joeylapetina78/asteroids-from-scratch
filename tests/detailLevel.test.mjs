// How closely the world is simulated, place by place. Step 4, Phase A.
//
// Cadence only: a distant actor runs exactly the same code, just less often.
// Two properties carry this module — it must be a NO-OP until deliberately
// enabled, and the work it defers must be SPREAD rather than bunched onto one
// unlucky tick.

import assert from "node:assert/strict";
import test from "node:test";
import {
  DETAIL,
  DETAIL_DEFAULTS,
  clearSimulationFocus,
  detailCadence,
  getActorPosition,
  getSimulationFocus,
  resolveDetailLevel,
  setSimulationFocus,
  shouldActThisTick,
  summarizeDetail,
} from "../src/systems/detailLevel.js";
import { createGameState } from "../src/state/gameState.js";
import { createInitialLogisticsState } from "../src/systems/logistics.js";

const SITES = [
  { id: "home", position: { x: 0, y: 0 } },
  { id: "next-door", position: { x: 1_000, y: 0 } },
  { id: "over-the-horizon", position: { x: 12_000, y: 0 } },
  { id: "far-off", position: { x: 90_000, y: 0 } },
];

function createWorld() {
  const state = createGameState();
  state.logistics = createInitialLogisticsState(1_000);
  ["home", "next-door", "over-the-horizon", "far-off"].forEach((siteId) => {
    state.logistics.institutions[`hub:${siteId}`] = { id: `hub:${siteId}`, name: siteId, siteId };
  });
  return state;
}

const at = (state, actorId) => resolveDetailLevel(state, actorId, { sites: SITES });

// ── Nothing changes until somebody opts in ──────────────────────────────────

// The property that makes this safe to introduce at all: a world that has not
// set a focus behaves exactly as it did before this module existed.
test("with no focus, every actor is near and every gate is open", () => {
  const state = createWorld();
  assert.deepEqual(getSimulationFocus(state), []);

  ["hub:home", "hub:far-off"].forEach((actorId) => {
    assert.equal(at(state, actorId), DETAIL.NEAR);
    for (let tick = 0; tick < 20; tick += 1) {
      assert.ok(shouldActThisTick(state, actorId, { tick, sites: SITES }), `${actorId} acts on tick ${tick}`);
    }
  });
});

test("clearing the focus puts the whole world back to near", () => {
  const state = createWorld();
  setSimulationFocus(state, [{ x: 0, y: 0 }]);
  assert.equal(at(state, "hub:far-off"), DETAIL.FAR);

  clearSimulationFocus(state);
  assert.equal(at(state, "hub:far-off"), DETAIL.NEAR, "reversible, with nothing else to undo");
});

test("a focus of nonsense points is ignored rather than believed", () => {
  const state = createWorld();
  setSimulationFocus(state, [{ x: NaN, y: 0 }, { x: 1 }, null]);
  assert.deepEqual(getSimulationFocus(state), []);
  assert.equal(at(state, "hub:far-off"), DETAIL.NEAR);
});

// ── Distance decides ────────────────────────────────────────────────────────

test("detail falls away with distance from what is being watched", () => {
  const state = createWorld();
  setSimulationFocus(state, [{ x: 0, y: 0 }]);

  assert.equal(at(state, "hub:home"), DETAIL.NEAR);
  assert.equal(at(state, "hub:next-door"), DETAIL.NEAR);
  assert.equal(at(state, "hub:over-the-horizon"), DETAIL.MID);
  assert.equal(at(state, "hub:far-off"), DETAIL.FAR);
});

test("the nearest focus point is the one that counts", () => {
  const state = createWorld();
  // A ship parked out at the far site makes that place matter again, even with
  // the player at the origin.
  setSimulationFocus(state, [{ x: 0, y: 0 }, { x: 90_000, y: 0 }]);
  assert.equal(at(state, "hub:far-off"), DETAIL.NEAR);
  assert.equal(at(state, "hub:home"), DETAIL.NEAR);
});

// An actor whose position cannot be worked out must not be quietly downgraded —
// "I could not place it" is not evidence that nobody is looking at it.
test("an actor with no place is treated as near, not as far", () => {
  const state = createWorld();
  setSimulationFocus(state, [{ x: 0, y: 0 }]);
  state.logistics.institutions["carrier:nowhere"] = { id: "carrier:nowhere", name: "Nowhere Freight" };

  assert.equal(getActorPosition(state, "carrier:nowhere", SITES), null);
  assert.equal(at(state, "carrier:nowhere"), DETAIL.NEAR);
  assert.equal(at(state, "not-an-actor-at-all"), DETAIL.NEAR);
});

test("an actor carrying its own position uses it", () => {
  const state = createWorld();
  setSimulationFocus(state, [{ x: 0, y: 0 }]);
  state.logistics.institutions["ship:wanderer"] = { id: "ship:wanderer", position: { x: 50_000, y: 0 } };
  assert.equal(at(state, "ship:wanderer"), DETAIL.FAR);
});

// ── Cadence ─────────────────────────────────────────────────────────────────

test("near is not negotiable", () => {
  const state = createWorld();
  setSimulationFocus(state, [{ x: 0, y: 0 }]);
  assert.equal(detailCadence(DETAIL.NEAR), 1);
  for (let tick = 0; tick < 30; tick += 1) {
    assert.ok(shouldActThisTick(state, "hub:home", { tick, sites: SITES }), "anything the player can see runs every tick");
  }
});

test("a distant actor acts at exactly its declared cadence", () => {
  const state = createWorld();
  setSimulationFocus(state, [{ x: 0, y: 0 }]);
  const cycles = 10;
  const ticks = DETAIL_DEFAULTS.farEveryTicks * cycles;

  let acted = 0;
  for (let tick = 0; tick < ticks; tick += 1) {
    if (shouldActThisTick(state, "hub:far-off", { tick, sites: SITES })) acted += 1;
  }
  assert.equal(acted, cycles, `once per ${DETAIL_DEFAULTS.farEveryTicks} ticks, no more and no less`);
});

// THE DESIGN PROPERTY. `tick % everyTicks === 0` would put every distant actor
// on the SAME tick: one second in eight carrying the entire far field, and the
// other seven carrying none. The tick meant to get cheaper would occasionally
// get far more expensive.
test("deferred work is spread across the cycle, not bunched onto one tick", () => {
  const state = createWorld();
  setSimulationFocus(state, [{ x: 0, y: 0 }]);

  const distant = [];
  for (let index = 0; index < 400; index += 1) {
    const id = `hub:distant-${index}`;
    state.logistics.institutions[id] = { id, position: { x: 90_000 + index, y: 0 } };
    distant.push(id);
  }

  const perTick = new Array(DETAIL_DEFAULTS.farEveryTicks).fill(0);
  for (let tick = 0; tick < DETAIL_DEFAULTS.farEveryTicks; tick += 1) {
    distant.forEach((id) => { if (shouldActThisTick(state, id, { tick, sites: SITES })) perTick[tick] += 1; });
  }

  const total = perTick.reduce((sum, count) => sum + count, 0);
  assert.equal(total, distant.length, "every actor acts exactly once per cycle");

  const average = distant.length / DETAIL_DEFAULTS.farEveryTicks;
  const busiest = Math.max(...perTick);
  assert.ok(busiest < average * 1.5,
    `no tick carries the whole far field — busiest ${busiest} against an average of ${average} (bunched would be ${distant.length})`);
  assert.ok(Math.min(...perTick) > 0, "and no tick is idle either");
});

test("an actor keeps its own slot in the cycle rather than drifting", () => {
  const state = createWorld();
  setSimulationFocus(state, [{ x: 0, y: 0 }]);
  const ticksActed = [];
  for (let tick = 0; tick < DETAIL_DEFAULTS.farEveryTicks * 3; tick += 1) {
    if (shouldActThisTick(state, "hub:far-off", { tick, sites: SITES })) ticksActed.push(tick % DETAIL_DEFAULTS.farEveryTicks);
  }
  assert.equal(new Set(ticksActed).size, 1, "the same slot every cycle, so its cadence is predictable");
});

// ── What it actually buys ───────────────────────────────────────────────────

test("a world that is mostly far away costs a fraction of full detail", () => {
  const state = createWorld();
  setSimulationFocus(state, [{ x: 0, y: 0 }]);

  const ids = ["hub:home"];
  for (let index = 0; index < 99; index += 1) {
    const id = `hub:remote-${index}`;
    state.logistics.institutions[id] = { id, position: { x: 90_000, y: index } };
    ids.push(id);
  }

  const summary = summarizeDetail(state, ids, { sites: SITES });
  assert.equal(summary.counts[DETAIL.NEAR], 1);
  assert.equal(summary.counts[DETAIL.FAR], 99);
  assert.equal(summary.total, 100);
  // 1 full-rate actor plus 99 at one-eighth.
  assert.ok(summary.workShare < 0.2,
    `a hundred places cost under a fifth of simulating them all every tick (got ${summary.workShare.toFixed(3)})`);
});

// Counted rather than timed: work done is deterministic, wall-clock is not.
test("the same big world does a fraction of the work per tick", () => {
  const state = createWorld();
  const ids = [];
  for (let index = 0; index < 500; index += 1) {
    const id = `hub:remote-${index}`;
    state.logistics.institutions[id] = { id, position: { x: 90_000, y: index } };
    ids.push(id);
  }

  const countOverCycle = () => {
    let acted = 0;
    for (let tick = 0; tick < DETAIL_DEFAULTS.farEveryTicks; tick += 1) {
      ids.forEach((id) => { if (shouldActThisTick(state, id, { tick, sites: SITES })) acted += 1; });
    }
    return acted;
  };

  const full = countOverCycle();               // no focus: everything near
  setSimulationFocus(state, [{ x: 0, y: 0 }]);
  const gated = countOverCycle();

  assert.equal(full, ids.length * DETAIL_DEFAULTS.farEveryTicks, "ungated, every actor runs every tick");
  assert.equal(gated, ids.length, "gated, every actor runs once per cycle");
  assert.equal(full / gated, DETAIL_DEFAULTS.farEveryTicks, "exactly the declared saving, no approximation involved");
});
