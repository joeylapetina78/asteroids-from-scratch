// How a provider orders the work it has already agreed to do.
//
// Sal is authored with `urgencyBias: 0.8` — the most urgency-driven person in
// the game — and ran a two-tier FIFO queue. Nothing about how long a job had
// sat, what it paid, or who it was for entered into it, so the trait was inert
// in the one place it most obviously belonged.

import assert from "node:assert/strict";
import test from "node:test";
import {
  WORK_QUEUE_DEFAULTS,
  explainWorkQueue,
  orderWorkQueue,
  resolveWorkQueuePolicy,
  scoreWorkItem,
} from "../src/systems/workQueue.js";
import { createGameState } from "../src/state/gameState.js";
import { createInitialLogisticsState } from "../src/systems/logistics.js";
import { createSprcOperation } from "../src/systems/sprcOperation.js";

const NOW = 1_000_000;
const FAILURE = 80;   // the severity SPRC stamps on a breakdown
const ROUTINE = 60;   // and on scheduled work

function createWorld() {
  const state = createGameState();
  state.logistics = createInitialLogisticsState(1_000);
  createSprcOperation({ state, now: () => 1_000 });
  return state;
}

function item(id, { severity = ROUTINE, waitedSeconds = 0, revenue = 0, goodwill = 0 } = {}) {
  return { id, severity, createdAt: NOW - waitedSeconds * 1000, revenue, goodwill };
}

const order = (items, policy) => orderWorkQueue(items, { policy, now: NOW }).map((entry) => entry.id);

// ── The conversion is faithful ──────────────────────────────────────────────

// At neutral every secondary weight is zero, the score collapses to severity,
// and the ordering is exactly the severity-then-FIFO sort this replaced.
test("a trait-neutral provider is severity then first-come-first-served", () => {
  const state = createWorld();
  state.logistics.institutions["neutral-shop"] = {
    id: "neutral-shop",
    name: "Neutral Shop",
    traits: { caution: 0.5, growthBias: 0.5, urgencyBias: 0.5 },
  };
  const policy = resolveWorkQueuePolicy(state, "neutral-shop");

  assert.equal(policy.waitingWeight, 0);
  assert.equal(policy.revenueWeight, 0);
  assert.equal(policy.goodwillWeight, 0);

  const queue = [
    item("routine-old", { severity: ROUTINE, waitedSeconds: 600, revenue: 9_000, goodwill: 1 }),
    item("routine-new", { severity: ROUTINE, waitedSeconds: 1 }),
    item("failure-new", { severity: FAILURE, waitedSeconds: 0 }),
  ];
  assert.deepEqual(order(queue, policy), ["failure-new", "routine-old", "routine-new"],
    "severity first, then oldest — and nothing else matters at all");
});

// ── Sal's temperament shows ─────────────────────────────────────────────────

test("Sal's authored urgency finally reaches the queue", () => {
  const state = createWorld();
  const policy = resolveWorkQueuePolicy(state, "sprc");   // Sal: urgency 0.8, caution 0.7, growth 0.4

  assert.ok(policy.waitingWeight > 0, "a job that has sat moves up");
  assert.ok(policy.goodwillWeight > 0, "and a customer he trusts is worth something");
  assert.equal(policy.revenueWeight, 0, "but chasing the big job is not in his character");
});

test("a job that has waited beats a fresh one of the same severity", () => {
  const state = createWorld();
  const policy = resolveWorkQueuePolicy(state, "sprc");
  const queue = [
    item("fresh", { severity: ROUTINE, waitedSeconds: 0 }),
    item("waited", { severity: ROUTINE, waitedSeconds: policy.waitingReferenceSeconds }),
  ];

  assert.deepEqual(order(queue, policy), ["waited", "fresh"]);
});

test("a trusted customer is seen before a stranger with the same job", () => {
  const state = createWorld();
  const policy = resolveWorkQueuePolicy(state, "sprc");
  const queue = [
    item("stranger", { severity: ROUTINE, goodwill: 0 }),
    item("regular", { severity: ROUTINE, goodwill: 1 }),
  ];

  assert.deepEqual(order(queue, policy), ["regular", "stranger"]);
});

// Goodwill runs negative, so a customer who has been let down is pushed back
// rather than merely failing to be pulled forward.
test("resentment pushes a job back, it does not just fail to help", () => {
  const state = createWorld();
  const policy = resolveWorkQueuePolicy(state, "sprc");
  const neutralParty = item("neutral", { severity: ROUTINE, goodwill: 0 });
  const resented = item("resented", { severity: ROUTINE, goodwill: -1 });

  assert.ok(scoreWorkItem(resented, { policy, now: NOW }) < scoreWorkItem(neutralParty, { policy, now: NOW }));
  assert.deepEqual(order([resented, neutralParty], policy), ["neutral", "resented"]);
});

// ── The safety bound ────────────────────────────────────────────────────────

// A shop that leaves a failed machine stranded to serve a friend is not
// characterful, it is broken. Severity is a hard tier rather than one term in a
// weighted sum, so this holds structurally — no combination of weights, traits
// or later tuning can reach across it.
test("nothing puts a routine job ahead of something that has actually broken", () => {
  const state = createWorld();
  // The most extreme provider the trait space allows.
  state.logistics.institutions["extreme-shop"] = {
    id: "extreme-shop",
    name: "Extreme Shop",
    traits: { caution: 1, growthBias: 1, urgencyBias: 1 },
  };
  const policy = resolveWorkQueuePolicy(state, "extreme-shop");

  // A routine job maxed out on every preference factor there is.
  const bestPossibleRoutine = item("routine", {
    severity: ROUTINE,
    waitedSeconds: policy.waitingReferenceSeconds * 100,
    revenue: policy.revenueReference * 100,
    goodwill: 1,
  });
  // Against the least appealing failure imaginable.
  const worstPossibleFailure = item("failure", { severity: FAILURE, waitedSeconds: 0, revenue: 0, goodwill: -1 });

  assert.deepEqual(order([bestPossibleRoutine, worstPossibleFailure], policy), ["failure", "routine"]);
});

// The guarantee is structural, so it must survive weights cranked far past
// anything the trait space can produce. This is the test that would have caught
// the arithmetic version of this rule being wrong.
test("severity outranks temperament even at absurd weights", () => {
  const state = createWorld();
  const policy = {
    ...resolveWorkQueuePolicy(state, "sprc"),
    waitingWeight: 10_000,
    revenueWeight: 10_000,
    goodwillWeight: 10_000,
  };

  const routine = item("routine", { severity: ROUTINE, waitedSeconds: 10_000, revenue: 1_000_000, goodwill: 1 });
  const failure = item("failure", { severity: FAILURE, goodwill: -1 });
  assert.deepEqual(order([routine, failure], policy), ["failure", "routine"]);
});

// ── Ordering behaves ────────────────────────────────────────────────────────

test("an empty queue orders to nothing rather than failing", () => {
  const state = createWorld();
  const policy = resolveWorkQueuePolicy(state, "sprc");
  assert.deepEqual(orderWorkQueue([], { policy, now: NOW }), []);
});

test("ties break the same way regardless of insertion order", () => {
  const state = createWorld();
  const policy = resolveWorkQueuePolicy(state, "sprc");
  const first = item("a", { severity: ROUTINE, waitedSeconds: 30 });
  const second = item("b", { severity: ROUTINE, waitedSeconds: 30 });

  assert.deepEqual(order([first, second], policy), order([second, first], policy));
});

test("ordering does not disturb the caller's array", () => {
  const state = createWorld();
  const policy = resolveWorkQueuePolicy(state, "sprc");
  const queue = [item("b", { severity: ROUTINE }), item("a", { severity: FAILURE })];
  const before = queue.map((entry) => entry.id);

  orderWorkQueue(queue, { policy, now: NOW });
  assert.deepEqual(queue.map((entry) => entry.id), before);
});

test("waiting and revenue saturate rather than growing without bound", () => {
  const state = createWorld();
  const policy = resolveWorkQueuePolicy(state, "sprc");
  const atReference = item("at", { severity: ROUTINE, waitedSeconds: policy.waitingReferenceSeconds, revenue: policy.revenueReference });
  const wayPast = item("past", { severity: ROUTINE, waitedSeconds: policy.waitingReferenceSeconds * 50, revenue: policy.revenueReference * 50 });

  assert.equal(scoreWorkItem(atReference, { policy, now: NOW }), scoreWorkItem(wayPast, { policy, now: NOW }));
});

// ── The queue explains itself ───────────────────────────────────────────────

test("a queue position is readable rather than inferred", () => {
  const state = createWorld();
  const policy = resolveWorkQueuePolicy(state, "sprc");
  const explained = explainWorkQueue([
    item("second", { severity: ROUTINE, waitedSeconds: 0 }),
    item("first", { severity: FAILURE, waitedSeconds: 45, revenue: 2_200, goodwill: 0.5 }),
  ], { policy, now: NOW });

  assert.deepEqual(explained.map((entry) => entry.id), ["first", "second"]);
  assert.equal(explained[0].position, 1);
  assert.equal(explained[0].severity, FAILURE);
  assert.equal(explained[0].waitedSeconds, 45);
  assert.equal(explained[0].revenue, 2_200);
  assert.equal(explained[0].goodwill, 0.5);
  assert.ok(Number.isFinite(explained[0].score));
});

test("SPRC publishes its berth order", () => {
  const state = createGameState();
  state.logistics = createInitialLogisticsState(1_000);
  const sprc = createSprcOperation({ state, now: () => 1_000 });
  sprc.update();

  const { queue } = sprc.getSnapshot();
  assert.ok(Array.isArray(queue), "the snapshot carries the queue");
  queue.forEach((entry) => {
    assert.ok(entry.id);
    assert.equal(typeof entry.position, "number");
    assert.equal(typeof entry.score, "number");
  });
});

test("defaults are the shape the policy resolver expects", () => {
  assert.ok(WORK_QUEUE_DEFAULTS.waitingReferenceSeconds > 0);
  assert.ok(WORK_QUEUE_DEFAULTS.revenueReference > 0);
});
