// The contract board: one view of every agreement in the world.

import assert from "node:assert/strict";
import test from "node:test";
import {
  CONTRACT_KIND,
  CONTRACT_STATE,
  filterContracts,
  listContractParties,
  listContracts,
  summarizeContracts,
} from "../src/systems/contractBoard.js";
import { PROCUREMENT_STATUS, createHubProcurementOperation, listOrders } from "../src/systems/hubProcurement.js";
import { createMiningOperation } from "../src/systems/miningOperation.js";
import { createSprcOperation } from "../src/systems/sprcOperation.js";
import { createGameState } from "../src/state/gameState.js";
import { createInitialLogisticsState } from "../src/systems/logistics.js";

function createWorld() {
  const state = createGameState();
  state.logistics = createInitialLogisticsState(1_000);
  ["yard-exchange", "scrap-forge", "the-ledge"].forEach((id) => {
    state.logistics.institutions[id].accounts.operating.balance = 20_000;
  });
  const game = {
    worldSites: [
      { id: "yard-exchange", name: "Yard Exchange", position: { x: 380, y: -180 } },
      { id: "scrap-porch", name: "Scrap Porch", position: { x: -1180, y: 860 } },
      { id: "the-ledge", name: "The Ledge", position: { x: 7000, y: -4500 } },
    ],
    addWorkerShip: () => {},
  };
  const sprc = createSprcOperation({ state, now: () => 1_000 });
  sprc.update();
  const procurement = createHubProcurementOperation({ state, now: () => 1_000 });
  procurement.update();
  const mining = createMiningOperation({ state, game, sprcOperation: sprc, now: () => 1_000 });
  return { state, mining, procurement, sprc };
}

test("the board gathers work from every system that offers it", () => {
  const { state } = createWorld();
  const kinds = new Set(listContracts(state).map((contract) => contract.kind));
  assert.ok(kinds.has(CONTRACT_KIND.EXTRACTION), "hubs paying for ore");
  assert.ok(kinds.has(CONTRACT_KIND.PURCHASE), "hubs buying from each other");
  assert.ok(kinds.has(CONTRACT_KIND.FEEDSTOCK), "Sal buying repair material");
});

test("every entry says who wants it, who is doing it, and what state it is in", () => {
  const { state } = createWorld();
  const contracts = listContracts(state);
  assert.ok(contracts.length > 0);
  contracts.forEach((contract) => {
    assert.ok(contract.id, "has an id");
    assert.ok(contract.title, "has something readable");
    assert.ok(Object.values(CONTRACT_STATE).includes(contract.state), `${contract.state} is a known state`);
    // Issuer may be absent on a completed run, but an unclaimed contract must
    // never claim to have somebody working it.
    if (contract.state === CONTRACT_STATE.AVAILABLE) assert.equal(contract.supplierId, null);
  });
});

test("unclaimed work reads as available and claimed work reads as taken", () => {
  const { state } = createWorld();
  const contracts = listContracts(state);
  const taken = contracts.filter((contract) => contract.state === CONTRACT_STATE.TAKEN);
  assert.ok(taken.length > 0, "the fleet has committed to something");
  assert.ok(taken.every((contract) => contract.supplierId), "everything being worked names its worker");
});

test("a supplier is shown by name, not by id", () => {
  const { state } = createWorld();
  const worked = listContracts(state)
    .filter((contract) => contract.kind === CONTRACT_KIND.EXTRACTION && contract.supplierId);
  assert.ok(worked.length > 0);
  assert.ok(worked.some((contract) => /^Cinder /.test(contract.supplierName ?? "")),
    `expected a ship name, got ${worked.map((c) => c.supplierName).join(", ")}`);
});

test("a delivered purchase moves to completed", () => {
  const { state, procurement } = createWorld();
  const order = listOrders(state)[0];
  order.status = PROCUREMENT_STATUS.DELIVERED;
  order.deliveredUnits = order.units;
  const entry = listContracts(state).find((contract) => contract.id === order.id);
  assert.equal(entry.state, CONTRACT_STATE.DONE);
  assert.ok(procurement);
});

test("a declined purchase reads as stuck and keeps its reason", () => {
  const { state } = createWorld();
  const order = listOrders(state)[0];
  order.status = PROCUREMENT_STATUS.DECLINED;
  order.declinedReason = "below-supplier-cost";
  const entry = listContracts(state).find((contract) => contract.id === order.id);
  assert.equal(entry.state, CONTRACT_STATE.BLOCKED);
  assert.match(entry.note, /below-supplier-cost/);
});

test("a withheld extraction order is stuck rather than on offer", () => {
  const { state } = createWorld();
  const posted = state.miningOperation.postedOrders;
  const first = Object.values(posted)[0];
  first.withheld = "buyer-cannot-fund";
  first.amount = 0;
  const entry = listContracts(state).find((contract) => contract.id === first.id);
  assert.equal(entry.state, CONTRACT_STATE.BLOCKED);
  assert.match(entry.note, /buyer-cannot-fund/);
});

test("the summary counts each state once", () => {
  const { state } = createWorld();
  const contracts = listContracts(state);
  const counts = summarizeContracts(contracts);
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  assert.equal(total, contracts.length, "every contract lands in exactly one group");
});

test("parties list both sides, so a hub appears whether buying or selling", () => {
  const { state } = createWorld();
  const parties = listContractParties(listContracts(state)).map((party) => party.id);
  assert.ok(parties.includes("yard-exchange"));
  assert.ok(parties.includes("the-ledge"));
  assert.ok(parties.includes("scrap-forge"));
});

test("filtering by party keeps only what that party is involved in", () => {
  const { state } = createWorld();
  const contracts = listContracts(state);
  const filtered = filterContracts(contracts, { party: "the-ledge" });
  assert.ok(filtered.length > 0);
  assert.ok(filtered.length < contracts.length, "it actually narrows the list");
  assert.ok(filtered.every((contract) => contract.issuerId === "the-ledge" || contract.supplierId === "the-ledge"));
});

test("filtering by kind and by text both narrow the board", () => {
  const { state } = createWorld();
  const contracts = listContracts(state);
  const purchases = filterContracts(contracts, { kind: CONTRACT_KIND.PURCHASE });
  assert.ok(purchases.every((contract) => contract.kind === CONTRACT_KIND.PURCHASE));
  const searched = filterContracts(contracts, { search: "water" });
  assert.ok(searched.length > 0 && searched.length <= contracts.length);
  assert.ok(searched.every((contract) => JSON.stringify(contract).toLowerCase().includes("water")));
});

test("filters combine rather than override each other", () => {
  const { state } = createWorld();
  const contracts = listContracts(state);
  const both = filterContracts(contracts, { party: "yard-exchange", kind: CONTRACT_KIND.PURCHASE });
  assert.ok(both.every((contract) => contract.kind === CONTRACT_KIND.PURCHASE
    && (contract.issuerId === "yard-exchange" || contract.supplierId === "yard-exchange")));
});

test("the board reads state without changing it", () => {
  const { state } = createWorld();
  const before = JSON.stringify({
    orders: state.hubProcurement.orders,
    allocations: state.miningOperation.allocations,
    posted: state.miningOperation.postedOrders,
  });
  listContracts(state);
  listContractParties(listContracts(state));
  assert.equal(JSON.stringify({
    orders: state.hubProcurement.orders,
    allocations: state.miningOperation.allocations,
    posted: state.miningOperation.postedOrders,
  }), before, "a projection must not mutate the records it reads");
});

// ── Every field the records actually carry ─────────────────────────────────

test("a purchase carries both parties, both sites, quantities and both payments", () => {
  const { state } = createWorld();
  const purchase = listContracts(state).find((contract) => contract.kind === CONTRACT_KIND.PURCHASE);
  assert.ok(purchase);
  assert.ok(purchase.buyerId && purchase.sellerId, "buyer and seller are distinct fields");
  assert.notEqual(purchase.buyerId, purchase.sellerId, "and a hub never buys from itself");
  assert.ok(purchase.originSiteId && purchase.siteId, "the lane has both ends");
  assert.notEqual(purchase.originSiteId, purchase.siteId);
  assert.ok(purchase.units > 0);
  assert.equal(typeof purchase.remainingUnits, "number");
  assert.ok(purchase.goodsPayment > 0, "the goods have a price");
  assert.ok(purchase.servicePayment > 0, "and the haulage is budgeted separately");
  assert.ok(purchase.createdAt, "and it is timestamped");
});

test("remaining quantity falls as a purchase is delivered", () => {
  const { state } = createWorld();
  const order = listOrders(state)[0];
  const before = listContracts(state).find((contract) => contract.id === order.id).remainingUnits;
  order.deliveredUnits = 2;
  const after = listContracts(state).find((contract) => contract.id === order.id).remainingUnits;
  assert.equal(after, before - 2);
});

test("a repair names its payer, its provider, and the ship on the bench", () => {
  const { state } = createWorld();
  state.sprc.repairOrders = {
    "REP-1": {
      id: "REP-1", status: "waiting-stock", payerInstitutionId: "carrier:yard-hauler",
      subjectId: "hauler-yard-scrap", condition: "control-fault", servicePrice: 180,
      facilityId: "scrap-porch", createdAt: 900,
    },
  };
  const repair = listContracts(state).find((contract) => contract.id === "REP-1");
  assert.equal(repair.buyerId, "carrier:yard-hauler", "the payer is the buyer");
  assert.equal(repair.sellerId, "sprc", "the co-op provides the service");
  assert.equal(repair.supplierId, "hauler-yard-scrap", "and the subject is the ship being worked on");
  assert.equal(repair.servicePayment, 180);
  assert.equal(repair.createdAt, 900);
});

test("fields the records do not carry are null, never guessed", () => {
  const { state } = createWorld();
  const extraction = listContracts(state).find((contract) => contract.kind === CONTRACT_KIND.EXTRACTION);
  assert.ok(extraction);
  // A miner chooses its own deposit and the order never records which, so there
  // is no origin to show. Standing extraction likewise records no partial fill.
  assert.equal(extraction.originSiteId, null, "no deposit is recorded on an extraction order");
  assert.equal(extraction.remainingUnits, null, "and no partial fill is tracked");
});

test("a freight run reports its lane, its carrier, and both payments separately", () => {
  const { state } = createWorld();
  state.logistics.shipments = {
    "SHIP-9": {
      id: "SHIP-9", status: "loaded", commodity: "water-ice", quantity: 6,
      originSiteId: "scrap-porch", destinationSiteId: "yard-exchange",
      sourceInstitutionId: "scrap-forge", destinationInstitutionId: "yard-exchange",
      issuerInstitutionId: "yard-exchange", assigneeId: "hauler-scrap-yard",
      goodsPayment: 219, payment: 113, createdAt: 950,
    },
  };
  const run = listContracts(state).find((contract) => contract.id === "SHIP-9");
  assert.equal(run.originSiteId, "scrap-porch");
  assert.equal(run.siteId, "yard-exchange");
  assert.equal(run.sellerId, "scrap-forge");
  assert.equal(run.buyerId, "yard-exchange");
  assert.equal(run.supplierId, "hauler-scrap-yard");
  assert.equal(run.goodsPayment, 219);
  assert.equal(run.servicePayment, 113);
  assert.equal(run.remainingUnits, 6, "still in flight");
});

test("a locally accepted wreck job is globally visible without changing where it can be accepted", () => {
  const { state } = createWorld();
  state.logistics.institutions["miner:flint-prospecting"] = {
    id: "miner:flint-prospecting", name: "Flint Prospecting", siteId: "morrow-shoal",
  };
  state.wrecks = { records: {
    "wreck:worker:flint-two:1": {
      id: "wreck:worker:flint-two:1", shipName: "Flint Two", titleId: "TITLE-FLINT-TWO",
      position: { x: 1400, y: -900 }, createdAt: 900,
    },
  } };
  state.contracts.records["salvage-contract:wreck:worker:flint-two:1"] = {
    id: "salvage-contract:wreck:worker:flint-two:1",
    type: "wreck-salvage",
    title: "Recover Flint Two",
    issuer: "miner:flint-prospecting",
    description: "Tow Flint Two to Scrap Porch.",
    terms: { wreckId: "wreck:worker:flint-two:1", destinationSiteId: "scrap-porch", amount: 1 },
    reward: { credits: 480 },
    presentation: { offerSiteId: "scrap-porch" },
    offerSource: { siteId: "scrap-porch", serviceId: "scrap-porch-work-board" },
    status: "offered",
    offeredAt: 1_000,
  };

  const salvage = listContracts(state).find((contract) => contract.kind === CONTRACT_KIND.SALVAGE);
  assert.equal(salvage?.state, CONTRACT_STATE.AVAILABLE);
  assert.equal(salvage?.issuerName, "Flint Prospecting");
  assert.equal(salvage?.supplierId, null);
  assert.equal(salvage?.siteId, "scrap-porch");
  assert.equal(salvage?.servicePayment, 480);
  assert.match(salvage?.note, /Scrap Porch Odd Jobs/);
  assert.equal(state.contracts.records[salvage.id].status, "offered", "the read-only board does not accept it remotely");
});
