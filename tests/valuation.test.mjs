import assert from "node:assert/strict";
import test from "node:test";
import { URGENCY, VALUATION_DECISION, evaluateMiningJob, evaluateProcurement, evaluateServicePrice, evaluateSupplierAsk, isKnownUrgency, relationshipFactor, scarcityFactor, urgencyFactor, urgencyFromCoverage } from "../src/systems/valuation.js";
import { getBundleCost, getServiceCost, getUnitCost, recordAcquisition, recordProduction, recordServiceCost } from "../src/systems/costBasis.js";
import { INTENTION_STATUS, adaptMiningAllocation, adaptProcurementAllocation, getIntentionOutcome, getReservedResources, isActorCommitted, mayReconsider } from "../src/systems/intentions.js";
import { RELATIONSHIP_DIMENSIONS, getRelationshipProjection, recordDeliveryOutcome, updateRelationshipProjection } from "../src/systems/relationshipProjections.js";

const SAL_TRAITS = { caution: 0.7, growthBias: 0.4, urgencyBias: 0.8 };

// ── Shared framework: standard result shape + influences ───────────────────

test("every evaluator returns the standard ValuationResult shape", () => {
  const results = [
    evaluateProcurement({ itemId: "copper", baseUnitPrice: 60, account: { balance: 1000 }, traits: SAL_TRAITS }),
    evaluateMiningJob({ jobId: "job", payout: 200, travelDistance: 1000 }),
    evaluateServicePrice({ serviceId: "repair", materialCost: 100, laborCost: 70, facilityCost: 35, traits: SAL_TRAITS }),
  ];
  for (const result of results) {
    for (const key of ["acceptable", "affordable", "recommendedPrice", "minAcceptablePrice", "maxAcceptablePrice", "decision", "reasons"]) {
      assert.ok(key in result, `result is missing ${key}`);
    }
    assert.ok(Array.isArray(result.reasons) && result.reasons.length > 0, "decisions must carry inspectable reasons");
  }
});

test("urgency and scarcity raise willingness to pay; traits set how steeply", () => {
  assert.equal(urgencyFactor("routine", 0.8), 1, "routine work carries no urgency premium");
  assert.ok(urgencyFactor("emergency", 0.8) > urgencyFactor("urgent", 0.8));
  assert.ok(urgencyFactor("emergency", 0.8) > urgencyFactor("emergency", 0.2), "a high urgencyBias pays more when desperate");
  assert.equal(scarcityFactor({ onHand: 8, target: 8 }, 0.7), 1, "a full shelf carries no scarcity premium");
  assert.ok(scarcityFactor({ onHand: 0, target: 8 }, 0.7) > scarcityFactor({ onHand: 4, target: 8 }, 0.7));
  assert.ok(scarcityFactor({ onHand: 0, target: 8 }, 0.9) > scarcityFactor({ onHand: 0, target: 8 }, 0.1), "cautious actors feel scarcity harder");
});

test("incoming supply is netted before scarcity is judged", () => {
  const empty = scarcityFactor({ onHand: 0, incoming: 0, target: 8 }, 0.7);
  const covered = scarcityFactor({ onHand: 0, incoming: 8, target: 8 }, 0.7);
  assert.ok(covered < empty, "material already on the way reduces urgency to buy more");
  assert.equal(covered, 1);
});

test("an emergency need is priced above the same routine need", () => {
  const inputs = {
    itemId: "silicate", baseUnitPrice: 20, marketUnitValue: 15,
    inventory: { onHand: 0, incoming: 0, target: 6 }, requestedUnits: 6, batchSize: 6,
    account: { balance: 5000, committed: 0 }, policy: { protectedCash: 900 }, traits: SAL_TRAITS,
  };
  const routine = evaluateProcurement({ ...inputs, urgency: "routine" });
  const emergency = evaluateProcurement({ ...inputs, urgency: "emergency" });
  assert.ok(emergency.recommendedPrice > routine.recommendedPrice, "Sal pays more when a repair is blocked");
  assert.equal(emergency.decision, VALUATION_DECISION.PROCEED);
  assert.ok(emergency.recommendedPrice <= emergency.maxAcceptablePrice, "never bids above its own ceiling");
});

test("protected cash is preserved: batches trim, then the order defers", () => {
  const base = {
    itemId: "copper", baseUnitPrice: 60, marketUnitValue: 50, urgency: "emergency",
    inventory: { onHand: 0, incoming: 0, target: 3 }, requestedUnits: 1, batchSize: 3,
    traits: SAL_TRAITS, policy: { protectedCash: 900 },
  };
  const tight = evaluateProcurement({ ...base, account: { balance: 1100, committed: 0 } });
  assert.ok(tight.metrics.units < 3, "the batch trims rather than crossing protected cash");
  assert.ok(tight.metrics.units >= 1, "it still buys at least what the need requires");

  const broke = evaluateProcurement({ ...base, account: { balance: 900, committed: 0 } });
  assert.equal(broke.affordable, false);
  assert.equal(broke.decision, VALUATION_DECISION.DEFER, "stops bidding when the need is unaffordable");
  assert.ok(broke.reasons.some((reason) => reason.includes("protected reserve")));
});

test("batching avoids repeated tiny requests when cash allows", () => {
  const result = evaluateProcurement({
    itemId: "silicate", baseUnitPrice: 20, urgency: "routine", requestedUnits: 1, batchSize: 6,
    inventory: { onHand: 0, target: 6 }, account: { balance: 5000, committed: 0 }, policy: { protectedCash: 900 }, traits: SAL_TRAITS,
  });
  assert.equal(result.metrics.units, 6, "one meaningful order instead of six tiny ones");
});

// ── Miner net-value selection ──────────────────────────────────────────────

test("a miner compares jobs by net value, not headline payout", () => {
  const near = evaluateMiningJob({ jobId: "near", payout: 300, travelDistance: 4000 });
  const farBigger = evaluateMiningJob({ jobId: "far-bigger", payout: 320, travelDistance: 26000 });
  assert.ok(near.metrics.netValue > farBigger.metrics.netValue, "a distant job with a bigger headline can be worth less");
  assert.ok(farBigger.reasons.some((reason) => reason.includes("travel")), "the cost of distance is stated");
});

test("an urgent buyer wins a miner by paying more, with no priority constant", () => {
  // Same distance; the only difference is the price the buyer offers.
  const routineElsewhere = evaluateMiningJob({ jobId: "routine", payout: 210, travelDistance: 5000 });
  const urgentLocal = evaluateMiningJob({ jobId: "urgent", payout: 324, travelDistance: 5000, opportunityCost: routineElsewhere.metrics.netValue });
  assert.equal(urgentLocal.decision, VALUATION_DECISION.PROCEED);
  assert.ok(urgentLocal.metrics.netValue > routineElsewhere.metrics.netValue);
});

test("a job that cannot cover its own costs is declined", () => {
  const result = evaluateMiningJob({ jobId: "hopeless", payout: 10, travelDistance: 60000 });
  assert.equal(result.acceptable, false);
  assert.equal(result.decision, VALUATION_DECISION.DECLINE);
});

test("recurring mining expenses lower net value and the minimum viable bid", () => {
  const withoutOverhead = evaluateMiningJob({ jobId: "lean", payout: 300, travelDistance: 1_000 });
  const withOverhead = evaluateMiningJob({ jobId: "staffed", payout: 300, travelDistance: 1_000, fixedOperatingCost: 90 });
  assert.equal(withoutOverhead.metrics.netValue - withOverhead.metrics.netValue, 90);
  assert.equal(withOverhead.metrics.fixedOperatingCost, 90);
  assert.ok(withOverhead.minAcceptablePrice >= withoutOverhead.minAcceptablePrice + 90);
  assert.ok(withOverhead.reasons.some((reason) => /crew and consumables/i.test(reason)));
});

test("the mining-rights royalty raises the floor and can turn a viable run down", () => {
  // A run that clears its own costs with a slim margin...
  const withoutRoyalty = evaluateMiningJob({ jobId: "marginal", payout: 120, travelDistance: 1_000, fixedOperatingCost: 90 });
  assert.equal(withoutRoyalty.acceptable, true);
  // ...no longer clears them once the royalty owed to the population is counted.
  const withRoyalty = evaluateMiningJob({ jobId: "marginal", payout: 120, travelDistance: 1_000, fixedOperatingCost: 90, royaltyCost: 40 });
  assert.equal(withoutRoyalty.metrics.netValue - withRoyalty.metrics.netValue, 40);
  assert.equal(withRoyalty.metrics.royaltyCost, 40);
  assert.equal(withRoyalty.acceptable, false, "the royalty pushed the run below cost, so the miner declines it");
  assert.ok(withRoyalty.minAcceptablePrice >= withoutRoyalty.minAcceptablePrice + 40,
    "the royalty is part of the minimum the miner must be paid — the price a hub must post to be served");
  assert.ok(withRoyalty.reasons.some((reason) => /royalty/i.test(reason)));
});

// ── Cost basis + service pricing (cost propagation) ────────────────────────

test("cost basis tracks weighted average and last paid", () => {
  const state = {};
  recordAcquisition(state, { institutionId: "sprc", itemId: "silicate", units: 2, totalCost: 40 });
  recordAcquisition(state, { institutionId: "sprc", itemId: "silicate", units: 2, totalCost: 120 });
  const basis = state.costBasis.institutions.sprc.items.silicate;
  assert.equal(basis.unitsAcquired, 4);
  assert.equal(basis.totalSpent, 160);
  assert.equal(basis.averageUnitCost, 40, "weighted average across both purchases");
  assert.equal(basis.lastUnitCost, 60, "most recent price is the replacement signal");
});

test("production carries input costs into the finished good", () => {
  const state = {};
  recordAcquisition(state, { institutionId: "sprc", itemId: "silicate", units: 4, totalCost: 200 }); // 50/unit
  recordAcquisition(state, { institutionId: "sprc", itemId: "copper", units: 2, totalCost: 240 });   // 120/unit
  recordProduction(state, { institutionId: "sprc", outputItemId: "machine-part", outputUnits: 2, inputs: { silicate: 2, copper: 1 }, conversionCost: 12 });
  // (2×50 + 1×120 + 12) / 2 outputs = 116
  assert.equal(getUnitCost(state, "sprc", "machine-part"), 116);
});

test("expensive inputs raise the service price — cost pass-through", () => {
  const cheap = {};
  recordAcquisition(cheap, { institutionId: "sprc", itemId: "machine-part", units: 2, totalCost: 100 });
  const dear = {};
  recordAcquisition(dear, { institutionId: "sprc", itemId: "machine-part", units: 2, totalCost: 400 });

  const requirements = { "machine-part": 2 };
  const cheapQuote = evaluateServicePrice({
    serviceId: "repair", materialCost: getBundleCost(cheap, "sprc", requirements),
    laborCost: 70, facilityCost: 35, traits: SAL_TRAITS,
  });
  const dearQuote = evaluateServicePrice({
    serviceId: "repair", materialCost: getBundleCost(dear, "sprc", requirements),
    laborCost: 70, facilityCost: 35, traits: SAL_TRAITS,
  });
  assert.ok(dearQuote.recommendedPrice > cheapQuote.recommendedPrice, "a materials shock reaches the customer");
  assert.ok(dearQuote.recommendedPrice > dearQuote.minAcceptablePrice, "Sal keeps a margin over cost");
  assert.ok(dearQuote.reasons.some((reason) => reason.includes("live cost basis")));
});

test("a service quote never exceeds outright replacement", () => {
  const quote = evaluateServicePrice({ serviceId: "repair", materialCost: 900, laborCost: 70, facilityCost: 35, replacementCost: 400, traits: SAL_TRAITS });
  assert.equal(quote.recommendedPrice, 400);
  assert.ok(quote.reasons.some((reason) => reason.includes("replacement cost")));
});

// ── Relationships: multi-dimensional, with an access extension point ───────

test("relationship projections are multi-dimensional, not one score", () => {
  const state = {};
  const projection = updateRelationshipProjection(state, {
    fromId: "sprc", toId: "player", deltas: { trust: 0.3, reliability: 0.5, resentment: 0.2 }, outcome: "completed",
  });
  RELATIONSHIP_DIMENSIONS.forEach((dimension) => assert.ok(dimension in projection, `missing ${dimension}`));
  assert.equal(projection.trust, 0.3);
  assert.equal(projection.reliability, 0.5);
  assert.equal(projection.resentment, 0.2, "a counterparty can be reliable AND resented");
  assert.equal(projection.completedDeals, 1);
});

test("relationship projection reserves an access extension point", () => {
  const state = {};
  updateRelationshipProjection(state, { fromId: "sprc", toId: "player", deltas: { trust: 0.1 } });
  const projection = getRelationshipProjection(state, { fromId: "sprc", toId: "player" });
  assert.ok(projection.access, "access gating is declared for future planners");
  for (const key of ["tier", "creditLimit", "privateOpportunities", "introductions", "deniedServices"]) {
    assert.ok(key in projection.access, `access is missing ${key}`);
  }
});

test("deliveries build reliability and keep bounded event back-references", () => {
  const state = {};
  for (let index = 0; index < 20; index += 1) {
    recordDeliveryOutcome(state, { fromId: "sprc", toId: "player", complete: index % 5 !== 0, eventId: index });
  }
  const projection = getRelationshipProjection(state, { fromId: "sprc", toId: "player" });
  assert.ok(projection.reliability > 0);
  assert.equal(projection.dealCount, 20);
  assert.ok(projection.significantEventIds.length <= 12, "back-references stay bounded, never a ledger rescan");
});

test("relationship goodwill nudges price but does not dominate it", () => {
  const trusted = relationshipFactor({ trust: 1, reliability: 1, gratitude: 1, resentment: 0 });
  const resented = relationshipFactor({ trust: 0, reliability: 0, gratitude: 0, resentment: 1 });
  assert.ok(trusted > 1 && trusted < 1.2, "goodwill is a nudge, not a rewrite");
  assert.ok(resented < 1);
});

// ── Intention adapter seam (existing systems stay authoritative) ───────────

test("a mining allocation reads as an intention without being migrated", () => {
  const allocation = { id: "allocation:x:1", orderId: "SPRC-PO-0001", workerShipId: "worker:cinder-one", amount: 6, equivalentAmount: 6, status: "active", acceptedAt: 1000 };
  const worker = { id: "worker:cinder-one", assignment: { resourceId: "silicate", contractId: "contract:SPRC-PO-0001" }, cargo: { silicate: 2 } };
  const intention = adaptMiningAllocation(allocation, { worker });

  assert.equal(intention.actorId, "worker:cinder-one");
  assert.equal(intention.status, INTENTION_STATUS.ACTIVE);
  assert.equal(intention.objectId, "SPRC-PO-0001");
  assert.equal(getReservedResources(intention).equivalentUnits, 6, "what is tied up is visible");
  assert.equal(intention.source.system, "miningOperation", "the domain system remains authoritative");
});

test("in-flight mining commitments are non-preemptive", () => {
  const allocation = { id: "a", orderId: "o", workerShipId: "w", amount: 6, status: "active" };
  const intention = adaptMiningAllocation(allocation, { worker: { id: "w", assignment: {}, cargo: {} } });
  assert.equal(mayReconsider(intention), false, "an idle-check must not redirect a working ship");
  assert.equal(mayReconsider(intention, { trigger: "ship-disabled" }), true, "but a genuine interruption can");
});

test("intention outcomes distinguish completed, failed, and interrupted", () => {
  const completed = adaptMiningAllocation({ id: "a", orderId: "o", workerShipId: "w", status: "completed", completedAt: 5 }, {});
  assert.equal(getIntentionOutcome(completed).completed, true);

  const interrupted = adaptProcurementAllocation(
    { id: "SPRC-PO-1", status: "expired", contractId: "c", procurementItemId: "copper", destinationSiteId: "scrap-porch", committedPayment: 0 },
    { supplierInstitutionId: "miner:cinder", reservedEquivalentUnits: 3, deliveredEquivalentUnits: 1, status: "active" },
  );
  assert.equal(getIntentionOutcome(interrupted).interrupted, true);
  assert.equal(getReservedResources(interrupted).equivalentUnits, 2, "undelivered units remain accounted for");
});

test("the shared layer can tell whether an actor is committed", () => {
  const state = {
    miningOperation: { allocations: { a: { id: "a", orderId: "o", workerShipId: "worker:cinder-one", amount: 6, status: "active" } }, ships: {} },
  };
  assert.equal(isActorCommitted(state, "worker:cinder-one"), true);
  assert.equal(isActorCommitted(state, "worker:cinder-two"), false);
});

// ── Urgency: the level has to exist to do anything ─────────────────────────

test("every urgency level actually moves the price", () => {
  // The defect this guards: "critical" was passed for months, is not a level,
  // fell back to routine, and made the whole empty-shelf path inert.
  const eager = { urgencyBias: 0.9 };
  const routine = urgencyFactor(URGENCY.ROUTINE, eager.urgencyBias);
  const urgent = urgencyFactor(URGENCY.URGENT, eager.urgencyBias);
  const emergency = urgencyFactor(URGENCY.EMERGENCY, eager.urgencyBias);
  assert.equal(routine, 1, "routine is the baseline by definition");
  assert.ok(urgent > routine && emergency > urgent, `the levels are ordered, got ${routine}/${urgent}/${emergency}`);
});

test("urgencyBias only bites above routine — which is why an inert level hid it", () => {
  assert.equal(urgencyFactor(URGENCY.ROUTINE, 0.1), urgencyFactor(URGENCY.ROUTINE, 0.9),
    "at routine, temperament cannot show; a level that silently becomes routine erases it");
  assert.ok(urgencyFactor(URGENCY.EMERGENCY, 0.9) > urgencyFactor(URGENCY.EMERGENCY, 0.1),
    "above routine, an anxious buyer pays more than a calm one");
});

test("an unrecognised level is priced as routine but says so", () => {
  assert.equal(isKnownUrgency("critical"), false, "the level that caused this");
  assert.equal(isKnownUrgency(URGENCY.EMERGENCY), true);
  assert.equal(urgencyFactor("critical", 0.9), urgencyFactor(URGENCY.ROUTINE, 0.9), "still safe, still routine");

  const result = evaluateProcurement({
    itemId: "water-ice", baseUnitPrice: 300, urgency: "critical",
    account: { balance: 10_000 }, traits: SAL_TRAITS,
  });
  assert.ok(result.reasons.some((reason) => /unrecognised urgency 'critical'/i.test(reason)),
    "the mistake is visible in the reasons instead of vanishing");
});

test("urgency is graded from the shortage, not guessed at each call site", () => {
  assert.equal(urgencyFromCoverage({ onHand: 0, incoming: 0, target: 12 }), URGENCY.EMERGENCY,
    "an empty shelf cannot serve what is asked next");
  assert.equal(urgencyFromCoverage({ onHand: 3, incoming: 0, target: 12 }), URGENCY.URGENT,
    "under half covered is thin");
  assert.equal(urgencyFromCoverage({ onHand: 9, incoming: 0, target: 12 }), URGENCY.ROUTINE,
    "comfortable is routine");
  assert.equal(urgencyFromCoverage({ onHand: 1, incoming: 0, target: 12 }), URGENCY.URGENT);
  assert.equal(urgencyFromCoverage({ onHand: 1, incoming: 8, target: 12 }), URGENCY.ROUTINE,
    "the same shelf is not urgent when the shortfall is already on its way");
  assert.equal(urgencyFromCoverage({ onHand: 0, incoming: 0, target: 0 }), URGENCY.ROUTINE,
    "wanting nothing is never urgent");
});

test("an empty shelf now costs more than a full one, which is the whole point", () => {
  const bid = (inventory) => evaluateProcurement({
    itemId: "water-ice", baseUnitPrice: 300, marketUnitValue: 300,
    urgency: urgencyFromCoverage(inventory), inventory,
    requestedUnits: 6, account: { balance: 100_000 }, traits: { urgencyBias: 0.8, caution: 0.5 },
  }).recommendedPrice;

  const empty = bid({ onHand: 0, incoming: 0, target: 12 });
  const thin = bid({ onHand: 3, incoming: 0, target: 12 });
  const stocked = bid({ onHand: 9, incoming: 0, target: 12 });
  assert.ok(empty > thin && thin > stocked, `${empty} > ${thin} > ${stocked}`);
});

// ── Supplier-side pricing (third link of cost pass-through) ────────────────

test("a supplier's ask is cost plus a trait-shaped margin, with cost as the hard floor", () => {
  const result = evaluateSupplierAsk({
    workId: "run-a", costComponents: { travel: 40, maintenance: 60 }, traits: SAL_TRAITS,
  });
  assert.equal(result.minAcceptablePrice, 100, "the floor is bare cost — never work at a loss");
  assert.ok(result.recommendedPrice > 100, "the ask adds a margin");
  assert.ok(result.reasons.some((reason) => /costs 100 to serve/.test(reason)));
});

test("a supplier declines work below its cost and accepts work above it", () => {
  const inputs = { workId: "run-b", costComponents: { travel: 50, maintenance: 50 }, traits: SAL_TRAITS };
  const underpriced = evaluateSupplierAsk({ ...inputs, offeredPrice: 80 });
  assert.equal(underpriced.acceptable, false);
  assert.equal(underpriced.decision, VALUATION_DECISION.DECLINE);
  assert.ok(underpriced.reasons.some((reason) => /below the 100 cost/.test(reason)));

  const thin = evaluateSupplierAsk({ ...inputs, offeredPrice: 105 });
  assert.equal(thin.acceptable, true, "above cost is workable even if under the ask");
  assert.ok(thin.reasons.some((reason) => /clears cost but is under/.test(reason)));
  assert.equal(thin.metrics.surplus, 5);
});

test("an idle supplier gives up margin to win work, but never its floor", () => {
  const inputs = { workId: "run-c", costComponents: { travel: 40, maintenance: 60 }, traits: SAL_TRAITS };
  const list = evaluateSupplierAsk(inputs);
  const conceded = evaluateSupplierAsk({ ...inputs, concession: 1 });
  assert.ok(conceded.recommendedPrice < list.recommendedPrice, "the ask comes down");
  assert.equal(conceded.minAcceptablePrice, list.minAcceptablePrice, "the floor does not move");
  assert.equal(conceded.recommendedPrice, conceded.minAcceptablePrice, "a fully conceded ask is bare cost");
  assert.ok(conceded.reasons.some((reason) => /giving up 100%/i.test(reason)), "and it says what it gave up");

  const half = evaluateSupplierAsk({ ...inputs, concession: 0.5 });
  assert.ok(half.recommendedPrice > conceded.recommendedPrice && half.recommendedPrice < list.recommendedPrice,
    "half the discount is half the margin");
});

test("a conceded supplier still declines work below cost", () => {
  const result = evaluateSupplierAsk({
    workId: "run-d", costComponents: { travel: 50, maintenance: 50 }, traits: SAL_TRAITS,
    offeredPrice: 90, concession: 1,
  });
  assert.equal(result.acceptable, false, "wanting the work does not make a loss worth taking");
  assert.equal(result.decision, VALUATION_DECISION.DECLINE);
});

test("dearer upkeep raises the supplier's ask — the pass-through link", () => {
  const cheapUpkeep = evaluateSupplierAsk({ workId: "run", costComponents: { travel: 20, maintenance: 30 }, traits: SAL_TRAITS });
  const dearUpkeep = evaluateSupplierAsk({ workId: "run", costComponents: { travel: 20, maintenance: 150 }, traits: SAL_TRAITS });
  assert.ok(dearUpkeep.recommendedPrice > cheapUpkeep.recommendedPrice, "a repair-price rise reaches the customer's quote");
  assert.ok(dearUpkeep.minAcceptablePrice > cheapUpkeep.minAcceptablePrice, "and raises the price below which it will not work");
});

test("service cost projection weights the most recent bill", () => {
  const state = {};
  recordServiceCost(state, { institutionId: "miner:cinder", serviceType: "maintenance", price: 200 });
  assert.equal(getServiceCost(state, "miner:cinder", "maintenance", 0), 200);
  recordServiceCost(state, { institutionId: "miner:cinder", serviceType: "maintenance", price: 400 });
  const blended = getServiceCost(state, "miner:cinder", "maintenance", 0);
  assert.ok(blended > 300 && blended < 400, `recent bill dominates but does not erase history (${blended})`);
  assert.equal(getServiceCost(state, "miner:unknown", "maintenance", 180), 180, "falls back before any bill is paid");
});
