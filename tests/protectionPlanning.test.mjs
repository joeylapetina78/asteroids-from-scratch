import test from "node:test";
import assert from "node:assert/strict";
import { createGameState } from "../src/state/gameState.js";
import { createInitialLogisticsState } from "../src/systems/logistics.js";
import { evaluateProtectionThreat, closeProtectionRequestsForThreat, PROTECTION_REQUEST_STATUS } from "../src/systems/protectionPlanning.js";
import { CONTRACT_KIND, CONTRACT_STATE, listContracts } from "../src/systems/contractBoard.js";

const sites = [
  { id: "yard-exchange", position: { x: 0, y: 0 } },
  { id: "scrap-porch", position: { x: 10000, y: 0 } },
  { id: "the-ledge", position: { x: 20000, y: 0 } },
  { id: "blue-lantern", position: { x: 30000, y: 0 } },
  { id: "morrow-shoal", position: { x: 40000, y: 0 } },
  { id: "kiln-crossing", position: { x: 50000, y: 0 } },
];

function state() {
  const value = createGameState();
  value.logistics = createInitialLogisticsState();
  return value;
}

test("a direct-governance hub assigns its own available patrol", () => {
  const value = state();
  const [request] = evaluateProtectionThreat(value, sites, { id: "rift:1", position: { x: 100, y: 0 }, enemyCount: 8, waveCount: 2 }, 10);
  assert.equal(request.status, PROTECTION_REQUEST_STATUS.INTERNAL);
  assert.equal(request.providerInstitutionId, "patrol:yard-exchange");
  assert.equal(request.craftId, "patrol-craft:yard-exchange");
});

test("an outsourcing hub accepts an affordable independent patrol bid", () => {
  const value = state();
  const requests = evaluateProtectionThreat(value, sites, { id: "rift:2", position: { x: 20100, y: 0 }, enemyCount: 8, waveCount: 2 }, 20);
  const request = requests.find((entry) => entry.siteId === "the-ledge");
  assert.equal(request.status, PROTECTION_REQUEST_STATUS.CONTRACTED);
  assert.equal(request.providerInstitutionId, "sable-meridian-security");
  assert.equal(request.craftId, "patrol-craft:sable-one");
  assert.ok(request.agreedPayment > 0 && request.agreedPayment <= request.maximumPayment);
  assert.ok(request.bids[0].reasons.length > 0);
});

test("protected cash can visibly withhold an otherwise necessary response", () => {
  const value = state();
  value.logistics.institutions["morrow-shoal"].accounts.operating.balance = 3500;
  const requests = evaluateProtectionThreat(value, sites, { id: "rift:3", position: { x: 40100, y: 0 }, enemyCount: 10, waveCount: 3 }, 30);
  const request = requests.find((entry) => entry.siteId === "morrow-shoal");
  assert.equal(request.status, PROTECTION_REQUEST_STATUS.WITHHELD);
  assert.equal(request.reason, "protected-cash");
});

test("destroying the threat closes every request caused by it", () => {
  const value = state();
  evaluateProtectionThreat(value, sites, { id: "rift:4", position: { x: 100, y: 0 }, enemyCount: 8, waveCount: 2 }, 40);
  const closed = closeProtectionRequestsForThreat(value, "rift:4", 50);
  assert.ok(closed.length > 0);
  assert.ok(closed.every((request) => request.status === PROTECTION_REQUEST_STATUS.CLOSED && request.closedAt === 50));
});

test("the same threat is not posted twice for the same institution", () => {
  const value = state();
  evaluateProtectionThreat(value, sites, { id: "rift:5", position: { x: 100, y: 0 }, enemyCount: 8, waveCount: 2 }, 60);
  const again = evaluateProtectionThreat(value, sites, { id: "rift:5", position: { x: 100, y: 0 }, enemyCount: 8, waveCount: 2 }, 61);
  assert.equal(again.length, 0);
});

test("contracted protection work appears as taken on the common contract board", () => {
  const value = state();
  evaluateProtectionThreat(value, sites, { id: "rift:6", position: { x: 20100, y: 0 }, enemyCount: 8, waveCount: 2 }, 70);
  const contract = listContracts(value).find((entry) => entry.kind === CONTRACT_KIND.PROTECTION && entry.siteId === "the-ledge");
  assert.equal(contract.state, CONTRACT_STATE.TAKEN);
  assert.equal(contract.issuerId, "the-ledge");
  assert.equal(contract.supplierId, "sable-meridian-security");
  assert.ok(contract.value > 0);
});

test("one owned craft cannot cover two simultaneous threats, so the second goes to market", () => {
  const value = state();
  evaluateProtectionThreat(value, sites, { id: "rift:7", position: { x: 100, y: 0 }, enemyCount: 8, waveCount: 2 }, 80);
  const second = evaluateProtectionThreat(value, sites, { id: "rift:8", position: { x: 120, y: 0 }, enemyCount: 8, waveCount: 2 }, 81)
    .find((entry) => entry.siteId === "yard-exchange");
  assert.equal(second.status, PROTECTION_REQUEST_STATUS.CONTRACTED);
  assert.equal(second.reason, "no-owned-capacity");
});

test("one mercenary craft cannot accept two simultaneous contracts", () => {
  const value = state();
  evaluateProtectionThreat(value, sites, { id: "rift:9", position: { x: 20100, y: 0 }, enemyCount: 8, waveCount: 2 }, 90);
  const second = evaluateProtectionThreat(value, sites, { id: "rift:10", position: { x: 20200, y: 0 }, enemyCount: 8, waveCount: 2 }, 91)
    .find((entry) => entry.siteId === "the-ledge");
  assert.equal(second.status, PROTECTION_REQUEST_STATUS.OFFERED);
  assert.equal(second.providerInstitutionId, null);
  assert.equal(second.bids[0].eligible, false);
  assert.match(second.bids[0].reasons.at(-1), /committed/);
});

test("acceptance reserves hub funds and threat closure releases both cash and craft", () => {
  const value = state();
  const before = value.logistics.institutions["the-ledge"].accounts.operating.committed;
  const request = evaluateProtectionThreat(value, sites, { id: "rift:11", position: { x: 20100, y: 0 }, enemyCount: 8, waveCount: 2 }, 100)
    .find((entry) => entry.siteId === "the-ledge");
  assert.equal(value.logistics.institutions["the-ledge"].accounts.operating.committed, before + request.agreedPayment);
  assert.equal(value.protectionProviders["sable-meridian-security"].craft.status, "committed");
  closeProtectionRequestsForThreat(value, "rift:11", 110);
  assert.equal(value.logistics.institutions["the-ledge"].accounts.operating.committed, before);
  assert.equal(value.protectionProviders["sable-meridian-security"].craft.status, "available");
  assert.equal(request.paymentReleased, true);
});
