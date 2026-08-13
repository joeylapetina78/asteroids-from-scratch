// How an actor moves on price.
//
// Seven module constants in `hubProcurement` used to decide the whole
// negotiation for everybody, so six carefully authored settlement temperaments
// haggled identically. Haggling is the most legible thing a trading post does —
// the player watches prices move — so it is where a flat constant costs the
// most character.

import assert from "node:assert/strict";
import test from "node:test";
import {
  NEGOTIATION_DEFAULTS,
  describeNegotiationStyle,
  resolveNegotiationPolicy,
} from "../src/systems/negotiation.js";
import { createGameState } from "../src/state/gameState.js";
import { createInitialLogisticsState } from "../src/systems/logistics.js";

function createWorld() {
  const state = createGameState();
  state.logistics = createInitialLogisticsState(1_000);
  return state;
}

function withTraits(state, id, traits) {
  state.logistics.institutions[id] = { id, name: id, traits };
  return id;
}

// ── The conversion is faithful ──────────────────────────────────────────────

// A hub at the neutral middle gets exactly the numbers that used to be here, so
// this moved the spread and not the baseline.
test("a trait-neutral hub reproduces every constant this replaced", () => {
  const state = createWorld();
  withTraits(state, "neutral-hub", { caution: 0.5, growthBias: 0.5, urgencyBias: 0.5 });
  const policy = resolveNegotiationPolicy(state, "neutral-hub");

  Object.entries(NEGOTIATION_DEFAULTS).forEach(([key, value]) => {
    assert.equal(policy[key], value, `${key} is unchanged at neutral`);
  });
});

// ── Tempo, reach and margin each come from one trait ────────────────────────

test("an impatient hub comes back sooner than a placid one", () => {
  const state = createWorld();
  withTraits(state, "impatient", { caution: 0.5, growthBias: 0.5, urgencyBias: 0.9 });
  withTraits(state, "placid", { caution: 0.5, growthBias: 0.5, urgencyBias: 0.1 });

  const impatient = resolveNegotiationPolicy(state, "impatient");
  const placid = resolveNegotiationPolicy(state, "placid");

  assert.ok(impatient.repriceIntervalMs < placid.repriceIntervalMs, "raises its offer sooner");
  assert.ok(impatient.retryAfterRefusalMs < placid.retryAfterRefusalMs, "asks again sooner after a refusal");
  assert.ok(impatient.concessionIntervalMs < placid.concessionIntervalMs, "and revisits its own ask sooner");
});

test("a hub set on growing chases further and cuts deeper", () => {
  const state = createWorld();
  withTraits(state, "hungry", { caution: 0.5, growthBias: 0.9, urgencyBias: 0.5 });
  withTraits(state, "content", { caution: 0.5, growthBias: 0.1, urgencyBias: 0.5 });

  const hungry = resolveNegotiationPolicy(state, "hungry");
  const content = resolveNegotiationPolicy(state, "content");

  assert.ok(hungry.repriceMaxMultiple > content.repriceMaxMultiple, "will pay further past its opening judgement");
  assert.ok(hungry.concessionStep > content.concessionStep, "and discounts harder to win the business");
});

test("a careful hub protects its margin harder", () => {
  const state = createWorld();
  withTraits(state, "careful", { caution: 0.9, growthBias: 0.5, urgencyBias: 0.5 });
  withTraits(state, "easy", { caution: 0.1, growthBias: 0.5, urgencyBias: 0.5 });

  const careful = resolveNegotiationPolicy(state, "careful");
  const easy = resolveNegotiationPolicy(state, "easy");

  assert.ok(careful.concessionFirmStep > easy.concessionFirmStep, "firms back up faster once business returns");
  assert.ok(careful.slackCapacityFraction < easy.slackCapacityFraction, "and wants the book clearly quiet before discounting");
});

// Each trait moves its own dial and nothing else. Without this the three could
// drift into overlapping, and "why did this hub behave differently" stops
// having a single answer.
test("each trait moves only its own dial", () => {
  const state = createWorld();
  const base = { caution: 0.5, growthBias: 0.5, urgencyBias: 0.5 };
  const neutral = resolveNegotiationPolicy(state, withTraits(state, "base", { ...base }));

  const onlyUrgency = resolveNegotiationPolicy(state, withTraits(state, "u", { ...base, urgencyBias: 0.9 }));
  assert.equal(onlyUrgency.repriceMaxMultiple, neutral.repriceMaxMultiple, "urgency does not change reach");
  assert.equal(onlyUrgency.concessionFirmStep, neutral.concessionFirmStep, "nor margin");

  const onlyGrowth = resolveNegotiationPolicy(state, withTraits(state, "g", { ...base, growthBias: 0.9 }));
  assert.equal(onlyGrowth.repriceIntervalMs, neutral.repriceIntervalMs, "growth does not change tempo");
  assert.equal(onlyGrowth.concessionFirmStep, neutral.concessionFirmStep, "nor margin");

  const onlyCaution = resolveNegotiationPolicy(state, withTraits(state, "c", { ...base, caution: 0.9 }));
  assert.equal(onlyCaution.repriceIntervalMs, neutral.repriceIntervalMs, "caution does not change tempo");
  assert.equal(onlyCaution.repriceMaxMultiple, neutral.repriceMaxMultiple, "nor reach");
});

// ── Temperament must never stop a hub trading ───────────────────────────────

// The ceiling is the one dial where a half-strength value is not caution, it is
// exclusion: the ceiling collapses onto the opening price, every raise reads as
// exhausted, and the hub quietly starves. Reach is deliberately gentler for
// exactly this reason.
test("even a hub with no appetite for growth can still raise its offer", () => {
  const state = createWorld();
  withTraits(state, "immovable", { caution: 1, growthBias: 0, urgencyBias: 0 });
  const policy = resolveNegotiationPolicy(state, "immovable");

  assert.ok(policy.repriceMaxMultiple > 1,
    `a ceiling at or below 1x its opening price would mean it can never move (got ${policy.repriceMaxMultiple})`);
});

test("no temperament produces a nonsensical policy", () => {
  const state = createWorld();
  const extremes = [0, 0.5, 1];
  extremes.forEach((caution) => extremes.forEach((growthBias) => extremes.forEach((urgencyBias) => {
    const id = withTraits(state, `t-${caution}-${growthBias}-${urgencyBias}`, { caution, growthBias, urgencyBias });
    const policy = resolveNegotiationPolicy(state, id);

    assert.ok(policy.repriceIntervalMs > 0, "always comes back eventually");
    assert.ok(policy.retryAfterRefusalMs > 0);
    assert.ok(policy.concessionIntervalMs > 0);
    assert.ok(policy.repriceMaxMultiple > 1, "always has somewhere to move to");
    assert.ok(policy.concessionStep > 0, "can always come down");
    assert.ok(policy.concessionFirmStep > 0, "and can always come back up");
    assert.ok(policy.slackCapacityFraction > 0 && policy.slackCapacityFraction <= 1);
  })));
});

test("an actor with no traits at all still bargains", () => {
  const state = createWorld();
  state.logistics.institutions["blank"] = { id: "blank", name: "Blank" };
  const policy = resolveNegotiationPolicy(state, "blank");
  assert.ok(policy.repriceMaxMultiple > 1);
  assert.ok(policy.repriceIntervalMs > 0);
});

test("an explicit override beats the temperament", () => {
  const state = createWorld();
  withTraits(state, "override-me", { caution: 0.9, growthBias: 0.9, urgencyBias: 0.9 });
  const policy = resolveNegotiationPolicy(state, "override-me", { repriceMaxMultiple: 7 });
  // The override is the base the trait scales, so the hub's appetite still
  // shows — what matters is that the authored number is what it works from.
  assert.ok(policy.repriceMaxMultiple > NEGOTIATION_DEFAULTS.repriceMaxMultiple * 2);
});

// ── The seeded world actually differs ───────────────────────────────────────

// The point of the whole exercise. If the six authored settlements still came
// out alike, nothing was gained.
test("the six seeded settlements bargain differently from one another", () => {
  const state = createWorld();
  const hubs = ["yard-exchange", "scrap-forge", "the-ledge", "blue-lantern", "morrow-shoal", "kiln-crossing"];
  const policies = hubs.map((id) => ({ id, policy: resolveNegotiationPolicy(state, id) }));

  ["repriceIntervalMs", "repriceMaxMultiple", "concessionStep", "concessionFirmStep"].forEach((dial) => {
    const values = new Set(policies.map(({ policy }) => policy[dial]));
    assert.ok(values.size > 1, `${dial} is not the same number for everybody (got ${[...values].join(", ")})`);
  });
});

test("Morrow Shoal is the proudest seller and The Ledge the most eager", () => {
  const state = createWorld();
  const morrow = resolveNegotiationPolicy(state, "morrow-shoal");   // caution 0.80, growth 0.00
  const ledge = resolveNegotiationPolicy(state, "the-ledge");       // caution 0.75, growth 0.60, urgency 0.80

  assert.ok(morrow.concessionStep < ledge.concessionStep,
    "Morrow Shoal barely discounts; The Ledge cuts to win business");
  assert.ok(ledge.repriceMaxMultiple > morrow.repriceMaxMultiple,
    "and chases a price much further as a buyer");
  assert.ok(ledge.repriceIntervalMs < morrow.repriceIntervalMs,
    "and comes back sooner while doing it");
});

test("a bargaining style reads as a sentence", () => {
  const state = createWorld();
  const described = describeNegotiationStyle(resolveNegotiationPolicy(state, "the-ledge"));
  assert.match(described, /revisits an offer every \d+s/);
  assert.match(described, /will pay up to \d+\.\d+x its opening price/);
  assert.match(described, /cuts \d+% a step when quiet/);
});
