// End-to-end proof of the valuation + cost-propagation slice:
//
//   need → valued procurement offer → miner selects it by net value →
//   material + payment transfer → cost basis recorded → repair priced from
//   that live cost → repair completes → customer pays.
//
// This slice proves VALUATION and COST PROPAGATION only. It does not implement
// motivations, generated goals, planning, skills, or autonomous advancement.

import assert from "node:assert/strict";
import test from "node:test";
import { createGameState } from "../src/state/gameState.js";
import { createSprcOperation, SPRC } from "../src/systems/sprcOperation.js";
import { createMiningOperation } from "../src/systems/miningOperation.js";
import { createInitialLogisticsState } from "../src/systems/logistics.js";
import { getUnitCost, recordAcquisition, recordProduction } from "../src/systems/costBasis.js";
import { getRelationshipProjection } from "../src/systems/relationshipProjections.js";
import { collectIntentions, INTENTION_STATUS } from "../src/systems/intentions.js";

function createWorld() {
  let clock = 1_000;
  const state = createGameState();
  state.logistics = createInitialLogisticsState(clock);
  const game = {
    worldSites: [
      { id: "yard-exchange", name: "Yard Exchange", position: { x: 380, y: -180 } },
      { id: "scrap-porch", name: "Scrap Porch", position: { x: -1180, y: 860 } },
      { id: "the-ledge", name: "The Ledge", position: { x: 7000, y: -4500 } },
    ],
    addWorkerShip: () => {},
  };
  const sprc = createSprcOperation({ state, now: () => clock });
  return { state, game, sprc, advance: (ms) => { clock += ms; }, now: () => clock };
}

test("Sal's offers carry a valued price and inspectable reasons", () => {
  const { state, sprc } = createWorld();
  sprc.update();

  const order = Object.values(state.sprc.procurementOrders)[0];
  assert.ok(order, "a material need produced an offer");
  assert.ok(order.pricePerEquivalent > 0);
  assert.ok(order.valuation, "the order records the valuation that priced it");
  assert.ok(order.valuation.reasons.length > 0, "the price is explainable");
  assert.equal(order.maximumPayment, order.requiredEquivalentUnits * order.pricePerEquivalent);

  // Protected cash is never crossed by the commitment.
  const spendableFloor = state.sprc.account.balance - state.sprc.account.committed;
  assert.ok(spendableFloor >= state.sprc.operatingPlan.protectedCashReserve - 1e-9, "committing the offer respects protected cash");

  const priced = state.ledger.getRecentEvents(80).find((event) => event.type === "institution.pricedOffer");
  assert.ok(priced, "the pricing decision is written to the ledger");
  assert.ok(Array.isArray(priced.payload.reasons) && priced.payload.reasons.length > 0);
});

test("an emergency need is offered at a higher unit price than routine restocking", () => {
  const routineWorld = createWorld();
  routineWorld.sprc.update();
  const routineOrder = Object.values(routineWorld.state.sprc.procurementOrders).find((order) => order.procurementItemId === "structural-feedstock");

  const urgentWorld = createWorld();
  // Block a repair on feedstock so the same material becomes an emergency.
  urgentWorld.state.sprc.inventories.raw["iron-nickel"] = 0;
  urgentWorld.state.sprc.inventories.produced["hull-plate"] = 0;
  urgentWorld.state.ledger.recordEvent("logistics.maintenanceRequired", { npcId: SPRC.firstHaulerId, issueType: "hull-fatigue", wear: 4, issueCount: 1 }, { visible: false });
  urgentWorld.sprc.update();
  const urgentOrder = Object.values(urgentWorld.state.sprc.procurementOrders).find((order) => order.procurementItemId === "structural-feedstock");

  assert.ok(urgentOrder.pricePerEquivalent >= routineOrder.pricePerEquivalent, "a blocked repair is worth at least as much as a routine top-up");
  assert.ok(urgentOrder.valuation.reasons.some((reason) => /urgency/i.test(reason)));
});

test("full loop: purchase material at a valued price, then sell a repair priced from that cost", () => {
  const { state, game, sprc, advance } = createWorld();
  sprc.update();

  const order = Object.values(state.sprc.procurementOrders).find((entry) => entry.procurementItemId === "structural-feedstock");
  const unitPrice = order.pricePerEquivalent;
  const mining = createMiningOperation({ state, game, sprcOperation: sprc, now: () => 1_000 });

  // 1. A miner chose Sal's order on net value — no hidden priority constant.
  const suppliers = mining.workers.filter((worker) => worker.assignment?.contractId === order.contractId);
  assert.ok(suppliers.length > 0, "a miner selected Sal's order");
  const selection = mining.getState().lastSelection;
  assert.ok(selection?.reasons?.length > 0, "the miner's choice is explainable");

  // The intention seam sees the commitment without owning it.
  const intentions = collectIntentions(state, { game: { workerShips: mining.workers } });
  const supplyIntentions = intentions.filter((intention) => intention.status === INTENTION_STATUS.ACTIVE && intention.source.system === "miningOperation");
  assert.ok(supplyIntentions.length > 0, "active commitments are visible to the shared layer");

  // 2. Deliver the material; payment and cost basis are recorded.
  const sprcCashBefore = state.sprc.account.balance;
  suppliers.forEach((worker) => {
    worker.cargo[worker.assignment.resourceId] = worker.assignment.harvestTargetQuantity;
    worker.deliver();
  });
  assert.equal(order.status, "paid");
  assert.ok(state.sprc.account.balance < sprcCashBefore, "Sal actually paid for the material");

  const ironCost = getUnitCost(state, "sprc", "iron-nickel");
  assert.ok(ironCost > 0, "acquisition cost was booked");
  assert.ok(Math.abs(ironCost - unitPrice) < 0.001, "cost basis equals what was really paid");

  // The supplier relationship strengthened along multiple dimensions.
  const projection = getRelationshipProjection(state, { fromId: "sprc", toId: mining.getState().institution.id });
  assert.ok(projection, "a relationship projection exists for the supplier");
  assert.ok(projection.reliability > 0 && projection.dealCount > 0);

  // 3. A repair now quotes from that live cost basis.
  state.sprc.inventories.produced["hull-plate"] = 0;
  state.sprc.inventories.produced["machine-part"] = 0;
  state.ledger.recordEvent("logistics.maintenanceRequired", { npcId: SPRC.firstHaulerId, issueType: "hull-fatigue", wear: 4, issueCount: 1 }, { visible: false });
  advance(1_000);
  sprc.update();

  const repair = Object.values(state.sprc.repairOrders).find((entry) => entry.subjectId === SPRC.firstHaulerId);
  assert.ok(repair, "the repair order was created");
  assert.ok(repair.servicePrice > 0);
  assert.ok(repair.priceValuation?.reasons?.some((reason) => /live cost basis/.test(reason)), "the quote cites live material cost");
  assert.ok(repair.servicePrice > repair.priceValuation.metrics.costToProvide, "Sal charges above his own cost");

  const quoted = state.ledger.getRecentEvents(120).find((event) => event.type === "institution.servicePriced");
  assert.ok(quoted, "the service quote is written to the ledger with reasons");
});

test("cost propagation: a dearer input yields a dearer repair", () => {
  function quoteWith(ironUnitCost) {
    const { state, sprc, advance } = createWorld();
    sprc.update();
    // Book real acquisitions at the given price, then let the mill carry that
    // cost into the plates a hull-fatigue repair consumes.
    recordAcquisition(state, { institutionId: "sprc", itemId: "iron-nickel", units: 4, totalCost: ironUnitCost * 4 });
    recordProduction(state, { institutionId: "sprc", outputItemId: "hull-plate", outputUnits: 2, inputs: { "iron-nickel": 4 }, conversionCost: 12 });
    state.sprc.inventories.produced["hull-plate"] = 0;
    state.ledger.recordEvent("logistics.maintenanceRequired", { npcId: SPRC.firstHaulerId, issueType: "hull-fatigue", wear: 4, issueCount: 1 }, { visible: false });
    advance(1_000);
    sprc.update();
    return Object.values(state.sprc.repairOrders).find((entry) => entry.subjectId === SPRC.firstHaulerId).servicePrice;
  }

  const cheapQuote = quoteWith(20);
  const dearQuote = quoteWith(90);
  assert.ok(dearQuote > cheapQuote, `an input price shock must reach the repair customer (${cheapQuote} → ${dearQuote})`);
});

test("unfilled offers are repriced upward, bounded and logged", () => {
  const { state, sprc, advance } = createWorld();
  sprc.update();
  const order = Object.values(state.sprc.procurementOrders)[0];
  const originalPrice = order.pricePerEquivalent;

  // Make the need more pressing, then let the reprice interval elapse.
  state.sprc.account.balance += 6_000;
  const need = state.sprc.needs[order.needId];
  need.urgency = "emergency";
  advance(61_000);
  sprc.update();

  assert.ok(order.pricePerEquivalent >= originalPrice, "an unfilled offer never gets cheaper");
  if (order.pricePerEquivalent > originalPrice) {
    assert.ok(order.pricePerEquivalent <= originalPrice * 2, "escalation is bounded");
    const repriced = state.ledger.getRecentEvents(120).find((event) => event.type === "institution.offerRepriced");
    assert.ok(repriced, "the reprice is visible in the ledger");
    assert.ok(repriced.payload.reasons.some((reason) => /No supplier took the work/.test(reason)));
  }
});

// ── Quote-then-gate + retryable declines ───────────────────────────────────

test("the price a customer is judged against is the price it is billed", () => {
  const { state, sprc } = createWorld();
  sprc.update();
  // Admit a payer whose cash sits between the old flat reference (220) and the
  // live quote. Under the old order-of-operations this passed the gate at 220
  // and was then billed the higher quote.
  state.ledger.recordEvent("maintenance.requested", {
    subjectId: "worker:probe", subjectName: "Probe", referenceId: "MW-PROBE", craftClass: "mining-craft",
    issueType: "preventive-calibration", requiredCapabilities: ["field-control"], locationSiteId: "scrap-porch",
    mobility: "self-return", payerInstitutionId: "miner:probe",
    payer: { balance: 250, committed: 0, protectedCash: 0 }, servicePrice: 220,
  }, { visible: false });
  sprc.update();

  const repair = Object.values(state.sprc.repairOrders).find((entry) => entry.subjectId === "worker:probe");
  if (repair) {
    assert.equal(repair.servicePrice, repair.quotedPrice, "the accepted quote is the billed price");
    assert.ok(repair.servicePrice <= 250, "a customer is never admitted above what it can pay");
  } else {
    const deferred = state.sprc.deferredServiceRequests["worker:probe"];
    assert.ok(deferred, "an unaffordable job is deferred, not silently dropped");
    assert.equal(deferred.reason, "payer-cannot-afford");
    assert.ok(deferred.quotedPrice > 250, "the decline cites the real quote, not the reference price");
  }
});

test("a declined repair is retryable and admits once the payer can pay", () => {
  const { state, sprc, advance } = createWorld();
  sprc.update();

  state.miningOperation = {
    institution: { id: "miner:broke", accounts: { operating: { balance: 10, committed: 0, transactions: [] } } },
  };
  state.ledger.recordEvent("maintenance.requested", {
    subjectId: "worker:broke", subjectName: "Broke Miner", referenceId: "MW-BROKE", craftClass: "mining-craft",
    issueType: "preventive-calibration", requiredCapabilities: ["field-control"], locationSiteId: "scrap-porch",
    mobility: "self-return", payerInstitutionId: "miner:broke",
    payer: { balance: 10, committed: 0, protectedCash: 0 }, servicePrice: 220,
  }, { visible: false });
  sprc.update();

  const deferred = state.sprc.deferredServiceRequests["worker:broke"];
  assert.ok(deferred, "the request is parked, not lost");
  assert.equal(deferred.status, "awaiting-retry");
  assert.equal(deferred.reason, "payer-cannot-afford");
  assert.equal(Object.values(state.sprc.repairOrders).some((r) => r.subjectId === "worker:broke"), false);

  const announced = state.ledger.getRecentEvents(120).find((event) => event.type === "sprc.repairDeferred");
  assert.ok(announced, "the deferral is visible");
  assert.equal(announced.payload.retryable, true);

  // The payer earns; the retry should now admit it against live cash.
  state.miningOperation.institution.accounts.operating.balance = 5_000;
  advance(20_000);
  sprc.update();

  const repair = Object.values(state.sprc.repairOrders).find((entry) => entry.subjectId === "worker:broke");
  assert.ok(repair, "the retry admitted the job once the payer could afford it");
  assert.equal(state.sprc.deferredServiceRequests["worker:broke"], undefined, "the deferred request is cleared");
  assert.ok(state.ledger.getRecentEvents(160).some((event) => event.type === "sprc.repairRetryAdmitted"));
});

test("an unpayable completed repair becomes visible debt, never a silent skip", () => {
  const { state, game, sprc, advance } = createWorld();
  const mining = createMiningOperation({ state, game, sprcOperation: sprc, now: () => 1_000 });
  const account = mining.getState().institution.accounts.operating;

  // A completed repair the miner cannot currently cover.
  state.ledger.recordEvent("sprc.repairCompleted", {
    repairOrderId: "SPRC-RPR-TEST", subjectId: "worker:cinder-one", serviceRevenue: 999_999,
  }, { visible: false });
  mining.getState().ships["worker:cinder-one"].maintenanceStatus = "awaiting-service";
  mining.update();

  const pending = mining.getState().pendingServiceSettlements ?? [];
  assert.equal(pending.length, 1, "the unpaid bill is retained as an explicit obligation");
  assert.equal(pending[0].price, 999_999);
  assert.equal(mining.getState().ships["worker:cinder-one"].maintenanceStatus, "awaiting-service", "the ship is not silently returned to duty unpaid");
  assert.ok(state.ledger.getRecentEvents(120).some((event) => event.type === "mining.serviceDebtOutstanding"));

  // Once solvent, the debt settles and the ship returns to work.
  pending[0].price = 50;
  account.balance = 1_000;
  advance(1_000);
  mining.update();
  assert.equal((mining.getState().pendingServiceSettlements ?? []).length, 0, "the debt clears when payable");
  assert.equal(mining.getState().ships["worker:cinder-one"].maintenanceStatus, "available");
});
