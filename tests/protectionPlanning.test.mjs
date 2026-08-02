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

test("an outsourcing hub publishes funded work instead of naming its own patrol", () => {
  const value = state();
  const requests = evaluateProtectionThreat(value, sites, { id: "rift:2", position: { x: 20100, y: 0 }, enemyCount: 8, waveCount: 2 }, 20);
  const request = requests.find((entry) => entry.siteId === "the-ledge");
  assert.equal(request.status, PROTECTION_REQUEST_STATUS.OFFERED);
  assert.equal(request.providerInstitutionId, null);
  assert.ok(request.maximumPayment > 0);
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

test("open protection work appears on the common contract board", () => {
  const value = state();
  evaluateProtectionThreat(value, sites, { id: "rift:6", position: { x: 20100, y: 0 }, enemyCount: 8, waveCount: 2 }, 70);
  const contract = listContracts(value).find((entry) => entry.kind === CONTRACT_KIND.PROTECTION && entry.siteId === "the-ledge");
  assert.equal(contract.state, CONTRACT_STATE.AVAILABLE);
  assert.equal(contract.issuerId, "the-ledge");
  assert.equal(contract.supplierId, null);
  assert.ok(contract.value > 0);
});

test("one owned craft cannot cover two simultaneous threats", () => {
  const value = state();
  evaluateProtectionThreat(value, sites, { id: "rift:7", position: { x: 100, y: 0 }, enemyCount: 8, waveCount: 2 }, 80);
  const second = evaluateProtectionThreat(value, sites, { id: "rift:8", position: { x: 120, y: 0 }, enemyCount: 8, waveCount: 2 }, 81)
    .find((entry) => entry.siteId === "yard-exchange");
  assert.equal(second.status, PROTECTION_REQUEST_STATUS.OFFERED);
  assert.equal(second.reason, "no-owned-capacity");
});
