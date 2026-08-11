// One clock for the whole simulation.
//
// The economy ran on eight independent `setInterval`s staggered by hand. The
// order they ran in was load-bearing and written down nowhere but those
// offsets — and was not even guaranteed, since eight timers are eight things a
// throttled background tab can delay independently.
//
// Two properties carry this module. The order must be the SAME every tick, and
// one broken system must not stop the world — because with eight timers a
// throw killed only its own system, so collapsing them into one loop without
// isolation would be strictly worse than what it replaced.

import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_TICK_MS, TICK_PHASE, createWorldClock } from "../src/systems/worldClock.js";

function createSilentClock() {
  return createWorldClock({ onSystemError: () => {} });
}

// ── Order is declared, not emergent ─────────────────────────────────────────

test("systems run in registration order, every tick, in full", () => {
  const clock = createSilentClock();
  const ran = [];
  ["first", "second", "third"].forEach((id) => clock.register(id, () => ran.push(id)));

  clock.tick();
  clock.tick();

  assert.deepEqual(ran, ["first", "second", "third", "first", "second", "third"]);
});

test("phases order ahead of registration", () => {
  const clock = createSilentClock();
  const ran = [];
  clock.register("settles", () => ran.push("settles"), { phase: TICK_PHASE.SETTLE });
  clock.register("decides", () => ran.push("decides"), { phase: TICK_PHASE.DECIDE });
  clock.register("observes", () => ran.push("observes"), { phase: TICK_PHASE.OBSERVE });

  clock.tick();
  assert.deepEqual(ran, ["observes", "decides", "settles"]);
});

test("the schedule is readable rather than inferred", () => {
  const clock = createSilentClock();
  clock.register("b", () => {}, { phase: TICK_PHASE.SETTLE });
  clock.register("a", () => {}, { phase: TICK_PHASE.OBSERVE, everyTicks: 4 });

  assert.deepEqual(clock.getSchedule(), [
    { id: "a", phase: TICK_PHASE.OBSERVE, everyTicks: 4 },
    { id: "b", phase: TICK_PHASE.SETTLE, everyTicks: 1 },
  ]);
});

test("a system registered twice is refused rather than silently doubled", () => {
  const clock = createSilentClock();
  clock.register("only-once", () => {});
  assert.throws(() => clock.register("only-once", () => {}), /already registered/);
});

test("an unknown phase is refused rather than quietly sorted last", () => {
  const clock = createSilentClock();
  assert.throws(() => clock.register("bad", () => {}, { phase: "whenever" }), /unknown phase/);
});

// ── One broken system must not stop the world ───────────────────────────────

// The property that makes collapsing eight timers into one safe at all.
test("a system that throws does not stop the systems after it", () => {
  const clock = createSilentClock();
  const ran = [];
  clock.register("before", () => ran.push("before"));
  clock.register("broken", () => { throw new Error("bad system"); });
  clock.register("after", () => ran.push("after"));

  clock.tick();
  assert.deepEqual(ran, ["before", "after"], "the world carried on either side of it");
});

test("a throw is recorded against the system that threw", () => {
  const clock = createSilentClock();
  clock.register("broken", () => { throw new Error("bad system"); });
  clock.register("fine", () => {});

  clock.tick();
  clock.tick();

  const metrics = clock.getMetrics();
  assert.equal(metrics.broken.errors, 2);
  assert.equal(metrics.broken.lastError.message, "bad system");
  assert.equal(metrics.broken.lastError.at, 2, "and which tick it last failed on");
  assert.equal(metrics.fine.errors, 0);
});

test("a failure is reported to the caller rather than only logged", () => {
  const seen = [];
  const clock = createWorldClock({ onSystemError: (id, error) => seen.push([id, error.message]) });
  clock.register("broken", () => { throw new Error("bad system"); });

  clock.tick();
  assert.deepEqual(seen, [["broken", "bad system"]]);
});

test("a throwing system keeps being run rather than being dropped", () => {
  const clock = createSilentClock();
  let attempts = 0;
  clock.register("flaky", () => { attempts += 1; if (attempts < 3) throw new Error("not yet"); });

  clock.tick();
  clock.tick();
  clock.tick();
  assert.equal(attempts, 3, "a transient failure recovers on its own");
  assert.equal(clock.getMetrics().flaky.errors, 2);
});

// ── Overrun ─────────────────────────────────────────────────────────────────

// Eight timers could overlap each other silently. One loop says so instead.
test("a tick that overruns is not re-entered", () => {
  const clock = createSilentClock();
  let reentered = false;
  let inner = null;
  clock.register("slow", () => {
    inner = clock.tick();          // the timer firing again mid-tick
    if (inner.skipped === false) reentered = true;
  });

  const outer = clock.tick();
  assert.equal(reentered, false);
  assert.equal(inner.skipped, true);
  assert.equal(outer.skipped, false);
  assert.equal(clock.getStats().skippedTicks, 1);
});

test("the guard clears after a system throws", () => {
  const clock = createSilentClock();
  clock.register("broken", () => { throw new Error("bad system"); });

  clock.tick();
  const second = clock.tick();
  assert.equal(second.skipped, false, "a throw must not wedge the clock shut");
});

// ── Cadence ─────────────────────────────────────────────────────────────────

// Counted in ticks rather than milliseconds, so "less often" stays
// deterministic and stays in step with everything else.
test("a system can run less often without a timer of its own", () => {
  const clock = createSilentClock();
  let every = 0;
  let occasional = 0;
  clock.register("every", () => { every += 1; });
  clock.register("occasional", () => { occasional += 1; }, { everyTicks: 3 });

  for (let index = 0; index < 9; index += 1) clock.tick();
  assert.equal(every, 9);
  assert.equal(occasional, 3);
});

test("systems are told which tick they are on", () => {
  const clock = createSilentClock();
  const ticks = [];
  clock.register("counter", ({ tick }) => ticks.push(tick));

  clock.tick();
  clock.tick();
  assert.deepEqual(ticks, [1, 2]);
});

// ── Metrics keep the shape their readers expect ─────────────────────────────

test("metrics stay in the shape the old scheduler published", () => {
  const clock = createSilentClock();
  clock.register("measured", () => {});
  clock.tick();

  const metric = clock.getMetrics().measured;
  ["runs", "totalMs", "lastMs", "maxMs", "averageMs"].forEach((key) => {
    assert.equal(typeof metric[key], "number", `${key} is still published`);
  });
  assert.equal(metric.runs, 1);
});

test("metrics are a live object rather than a copy taken once", () => {
  const clock = createSilentClock();
  clock.register("measured", () => {});
  const metrics = clock.getMetrics();   // main.js hands this straight to __asteroids.performance

  clock.tick();
  assert.equal(metrics.measured.runs, 1, "the reference keeps updating");
});

// ── Starting and stopping ───────────────────────────────────────────────────

test("start schedules the tick once and stop clears it", () => {
  const clock = createSilentClock();
  const scheduled = [];
  const cleared = [];
  const setInterval = (fn, ms) => { scheduled.push(ms); return "handle-1"; };
  const clearInterval = (handle) => cleared.push(handle);

  assert.equal(clock.start({ setInterval }), "handle-1");
  assert.equal(clock.start({ setInterval }), "handle-1", "starting twice does not schedule a second loop");
  assert.deepEqual(scheduled, [DEFAULT_TICK_MS]);

  clock.stop({ clearInterval });
  assert.deepEqual(cleared, ["handle-1"]);
  clock.stop({ clearInterval });
  assert.deepEqual(cleared, ["handle-1"], "stopping twice is harmless");
});

test("an unregistered system stops running", () => {
  const clock = createSilentClock();
  let runs = 0;
  clock.register("temporary", () => { runs += 1; });
  clock.tick();
  clock.unregister("temporary");
  clock.tick();

  assert.equal(runs, 1);
});

test("a clock with nothing registered ticks harmlessly", () => {
  const clock = createSilentClock();
  const result = clock.tick();
  assert.deepEqual(result.ran, []);
  assert.equal(result.skipped, false);
  assert.equal(clock.getStats().ticks, 1);
});
