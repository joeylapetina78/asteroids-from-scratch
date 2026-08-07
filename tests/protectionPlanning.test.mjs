import test from "node:test";
import assert from "node:assert/strict";
import { createGameState } from "../src/state/gameState.js";
import { createInitialLogisticsState } from "../src/systems/logistics.js";
import { evaluateProtectionThreat, closeProtectionRequestsForThreat, getPlayerProtectionJobsForSite, reviewProtectionRequests, PROTECTION_REQUEST_STATUS } from "../src/systems/protectionPlanning.js";
import { CONTRACT_KIND, CONTRACT_STATE, listContracts } from "../src/systems/contractBoard.js";
import { acceptPlayerProtectionRequest, completePlayerProtectionRequest, completeProtectionContract, failProtectionContract, finishProtectionReturn, serviceProtectionProviders, startProtectionContract } from "../src/systems/protectionProviders.js";
import { createContractManager, registerContractDefinition } from "../src/systems/contractManager.js";
import { completeInternalProtectionResponse, createInitialPatrolOperations, ensurePatrolOperations, failInternalProtectionResponse, finishInternalProtectionReturn, servicePatrolCraft, startInternalProtectionResponse } from "../src/systems/patrolOperations.js";
import { listInspectableActors } from "../src/systems/actorInspector.js";

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
  const sable = listInspectableActors(value).find((actor) => actor.actorId === "patrol-craft:sable-one");
  assert.equal(sable?.name, "Sable One");
  assert.equal(sable?.locationSiteId, "blue-lantern");
});

test("contract-only settlements do not secretly own local watch craft", () => {
  const patrols = createInitialPatrolOperations(10);
  assert.equal(patrols["the-ledge"], undefined);
  assert.equal(patrols["morrow-shoal"], undefined);
  assert.ok(patrols["yard-exchange"]?.craft);
  assert.ok(patrols["blue-lantern"]?.craft);
});

test("old synthetic watches are removed from outsourcing hubs during migration", () => {
  const value = state();
  value.patrolOperations = {
    "the-ledge": {
      institution: { id: "patrol:the-ledge" },
      controller: {},
      craft: { id: "patrol-craft:the-ledge", hull: 150, maxHull: 150, status: "available" },
    },
  };
  const patrols = ensurePatrolOperations(value, 20);
  assert.equal(patrols["the-ledge"], undefined);
  assert.ok(patrols["yard-exchange"]?.craft);
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

test("the player locally accepts and settles the same protection request record", () => {
  const value = state();
  value.protectionPlanning = { nextRequestId: 2, requests: {
    "protection:1": {
      id: "protection:1", kind: "threat-response", status: PROTECTION_REQUEST_STATUS.OFFERED,
      issuerInstitutionId: "the-ledge", siteId: "the-ledge", threatId: "rift:player",
      threatType: "incursion", requiredCapabilities: ["interdict-threat", "defend-shipping"],
      maximumPayment: 900, createdAt: 10,
    },
  } };
  const buyer = value.logistics.institutions["the-ledge"].accounts.operating;
  const balanceBefore = buyer.balance;
  const committedBefore = buyer.committed ?? 0;
  const [job] = getPlayerProtectionJobsForSite(value, "the-ledge", "The Ledge");
  assert.equal(job.terms.protectionRequestId, "protection:1");
  assert.equal(job.acceptanceSiteId, "the-ledge");

  const accepted = acceptPlayerProtectionRequest(value, "protection:1", {
    siteId: "the-ledge", playerInstitutionId: "person:test-pilot", craftId: "ship:test", now: 20,
  });
  assert.equal(accepted.status, PROTECTION_REQUEST_STATUS.ACTIVE);
  assert.equal(buyer.committed, committedBefore + 900);

  const completed = completePlayerProtectionRequest(value, "rift:player", { now: 30 });
  assert.equal(completed.status, PROTECTION_REQUEST_STATUS.FULFILLED);
  assert.equal(buyer.committed, committedBefore);
  assert.equal(buyer.balance, balanceBefore - 900);
});

test("player protection completion fulfills the portable contract and pays only on collection", () => {
  const value = state();
  value.protectionPlanning = { nextRequestId: 2, requests: {
    "protection:pay": {
      id: "protection:pay", status: PROTECTION_REQUEST_STATUS.OFFERED,
      issuerInstitutionId: "the-ledge", siteId: "the-ledge", threatId: "rift:pay",
      threatType: "incursion", requiredCapabilities: ["interdict-threat"], maximumPayment: 700,
    },
  } };
  const definition = getPlayerProtectionJobsForSite(value, "the-ledge", "The Ledge")[0];
  registerContractDefinition(definition);
  const manager = createContractManager({ state: value });
  manager.offerContract(definition.id, { type: "hub-service", siteId: "the-ledge" });
  assert.equal(manager.acceptContract(definition.id), true);
  acceptPlayerProtectionRequest(value, "protection:pay", { siteId: "the-ledge", now: 20 });
  completePlayerProtectionRequest(value, "rift:pay", { now: 30 });
  manager.update();
  assert.equal(value.contracts.records[definition.id].status, "fulfilled");
  const creditsBefore = value.credits;
  assert.equal(manager.collectPayment(definition.id), true);
  assert.equal(value.credits, creditsBefore + 700);
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

test("a dispatched contractor is paid only after successful physical work", () => {
  const value = state();
  const request = evaluateProtectionThreat(value, sites, { id: "rift:12", position: { x: 20100, y: 0 }, enemyCount: 8, waveCount: 2 }, 120)
    .find((entry) => entry.siteId === "the-ledge");
  const buyer = value.logistics.institutions["the-ledge"].accounts.operating;
  const provider = value.protectionProviders["sable-meridian-security"];
  const buyerBefore = buyer.balance;
  const providerBefore = provider.institution.accounts.operating.balance;
  startProtectionContract(value, request.id, 121);
  assert.equal(request.status, PROTECTION_REQUEST_STATUS.ACTIVE);
  assert.equal(provider.craft.status, "deployed");
  assert.equal(buyer.balance, buyerBefore, "dispatch alone earns nothing");
  completeProtectionContract(value, request.id, { hull: 117, now: 130 });
  assert.equal(request.status, PROTECTION_REQUEST_STATUS.FULFILLED);
  assert.equal(buyer.balance, buyerBefore - request.agreedPayment);
  assert.equal(provider.institution.accounts.operating.balance, providerBefore + request.agreedPayment);
  assert.equal(provider.craft.status, "returning");
  finishProtectionReturn(value, request.id, 117, 140);
  assert.equal(provider.craft.status, "available");
  assert.equal(provider.craft.hull, 117);
});

test("another actor resolving the threat recalls a dispatched contractor and releases payment", () => {
  const value = state();
  const request = evaluateProtectionThreat(value, sites, { id: "rift:12b", position: { x: 20100, y: 0 }, enemyCount: 8, waveCount: 2 }, 145)
    .find((entry) => entry.siteId === "the-ledge");
  const buyer = value.logistics.institutions["the-ledge"].accounts.operating;
  const provider = value.protectionProviders["sable-meridian-security"];
  const providerBefore = provider.institution.accounts.operating.balance;
  startProtectionContract(value, request.id, 146);
  closeProtectionRequestsForThreat(value, "rift:12b", 147);
  assert.equal(buyer.committed, 0);
  assert.equal(provider.institution.accounts.operating.balance, providerBefore);
  assert.equal(provider.craft.status, "returning");
  assert.equal(provider.craft.activeRequestId, request.id, "craft retains its assignment until it reaches home");
  assert.equal(request.paymentReleased, true);
});

test("destroying the contracted craft releases the buyer without paying the provider", () => {
  const value = state();
  const request = evaluateProtectionThreat(value, sites, { id: "rift:13", position: { x: 20100, y: 0 }, enemyCount: 8, waveCount: 2 }, 150)
    .find((entry) => entry.siteId === "the-ledge");
  const buyer = value.logistics.institutions["the-ledge"].accounts.operating;
  const provider = value.protectionProviders["sable-meridian-security"];
  const providerBefore = provider.institution.accounts.operating.balance;
  startProtectionContract(value, request.id, 151);
  failProtectionContract(value, request.id, { hull: 0, now: 160 });
  assert.equal(request.status, PROTECTION_REQUEST_STATUS.FAILED);
  assert.equal(buyer.committed, 0);
  assert.equal(provider.institution.accounts.operating.balance, providerBefore);
  assert.equal(provider.craft.status, "destroyed");
});

// ── a settlement covering a threat with its OWN craft ──────────────────────
//
// `covered-internally` used to be a promise with no follow-through: the request
// named the hub's craft, nothing dispatched it, the craft never left the dock,
// and the claim blocked the site from covering anything else for the rest of
// the run. These lock the whole lifecycle down.

test("a hub covering a threat itself actually launches, clears it, and comes home", () => {
  const value = state();
  const [request] = evaluateProtectionThreat(value, sites, { id: "rift:14", position: { x: 100, y: 0 }, enemyCount: 8, waveCount: 2 }, 200);
  const craft = value.patrolOperations["yard-exchange"].craft;
  const treasuryBefore = value.logistics.institutions["yard-exchange"].accounts.operating.balance;
  assert.equal(request.status, PROTECTION_REQUEST_STATUS.INTERNAL);
  assert.equal(craft.status, "available");

  assert.ok(startInternalProtectionResponse(value, request, 210), "the claim can be acted on");
  assert.equal(request.status, PROTECTION_REQUEST_STATUS.ACTIVE);
  assert.equal(request.dispatchedAt, 210);
  assert.equal(craft.status, "deployed", "the craft is no longer sitting at the dock");

  completeInternalProtectionResponse(value, request, { hull: 128, now: 220 });
  assert.equal(request.status, PROTECTION_REQUEST_STATUS.FULFILLED);
  assert.equal(craft.status, "returning");

  finishInternalProtectionReturn(value, request, 128, 230);
  assert.equal(craft.status, "available");
  assert.equal(craft.hull, 128, "it comes home carrying what the fight cost it");
  assert.equal(value.logistics.institutions["yard-exchange"].accounts.operating.balance, treasuryBefore,
    "using its own craft moves no money");
});

test("a hub cannot dispatch a craft it does not have available", () => {
  const value = state();
  const [request] = evaluateProtectionThreat(value, sites, { id: "rift:15", position: { x: 100, y: 0 }, enemyCount: 8, waveCount: 2 }, 240);
  value.patrolOperations["yard-exchange"].craft.status = "deployed";
  assert.equal(startInternalProtectionResponse(value, request, 250), null);
  assert.equal(request.status, PROTECTION_REQUEST_STATUS.INTERNAL, "and the claim is not silently marked as flying");
});

test("losing the watch craft fails the response instead of leaving the hub 'covered' by a wreck", () => {
  const value = state();
  const [request] = evaluateProtectionThreat(value, sites, { id: "rift:16", position: { x: 100, y: 0 }, enemyCount: 8, waveCount: 2 }, 260);
  startInternalProtectionResponse(value, request, 261);
  failInternalProtectionResponse(value, request, { hull: 0, reason: "craft-destroyed", now: 270 });
  assert.equal(request.status, PROTECTION_REQUEST_STATUS.FAILED);
  assert.equal(value.patrolOperations["yard-exchange"].craft.status, "destroyed");

  // The site's own-capacity lock is gone, so the next threat can go to market.
  const next = evaluateProtectionThreat(value, sites, { id: "rift:17", position: { x: 120, y: 0 }, enemyCount: 8, waveCount: 2 }, 280)
    .find((entry) => entry.siteId === "yard-exchange");
  assert.notEqual(next.status, PROTECTION_REQUEST_STATUS.INTERNAL);
});

// ── open requests stay alive ───────────────────────────────────────────────

test("an offer nobody could take goes back to the market instead of expiring on one try", () => {
  const value = state();
  // The only security firm is already committed, so the second Ledge threat
  // finds no bidder at all.
  evaluateProtectionThreat(value, sites, { id: "rift:18", position: { x: 20100, y: 0 }, enemyCount: 8, waveCount: 2 }, 300);
  const stranded = evaluateProtectionThreat(value, sites, { id: "rift:19", position: { x: 20200, y: 0 }, enemyCount: 8, waveCount: 2 }, 301)
    .find((entry) => entry.siteId === "the-ledge");
  assert.equal(stranded.status, PROTECTION_REQUEST_STATUS.OFFERED);
  assert.equal(stranded.providerInstitutionId, null);

  // The first threat resolves and frees the craft.
  closeProtectionRequestsForThreat(value, "rift:18", 310);
  assert.equal(value.protectionProviders["sable-meridian-security"].craft.status, "available");

  // Too soon to re-offer; then the interval elapses and it is taken.
  reviewProtectionRequests(value, sites, ["rift:19"], 315);
  assert.equal(stranded.status, PROTECTION_REQUEST_STATUS.OFFERED, "it is not re-auctioned every frame");
  reviewProtectionRequests(value, sites, ["rift:19"], 301 + 21_000);
  assert.equal(stranded.status, PROTECTION_REQUEST_STATUS.CONTRACTED);
  assert.equal(stranded.providerInstitutionId, "sable-meridian-security");
  assert.ok(stranded.offerAttempts >= 2);
});

test("coverage a hub claimed but never launched lapses to the market", () => {
  const value = state();
  const [request] = evaluateProtectionThreat(value, sites, { id: "rift:20", position: { x: 100, y: 0 }, enemyCount: 8, waveCount: 2 }, 400);
  assert.equal(request.status, PROTECTION_REQUEST_STATUS.INTERNAL);

  reviewProtectionRequests(value, sites, ["rift:20"], 400 + 10_000);
  assert.equal(request.status, PROTECTION_REQUEST_STATUS.INTERNAL, "a hub gets a fair chance to launch first");

  reviewProtectionRequests(value, sites, ["rift:20"], 400 + 46_000);
  assert.notEqual(request.status, PROTECTION_REQUEST_STATUS.INTERNAL);
  assert.equal(request.reason, "own-craft-could-not-launch");
});

test("a hub takes its lapsed coverage back once its own craft is free again", () => {
  const value = state();
  const [request] = evaluateProtectionThreat(value, sites, { id: "rift:20b", position: { x: 100, y: 0 }, enemyCount: 8, waveCount: 2 }, 420);
  // The hub's craft is busy elsewhere and the only security firm is out on a
  // job, so the claim lapses to a market with nobody in it.
  value.patrolOperations["yard-exchange"].craft.status = "deployed";
  value.protectionProviders["sable-meridian-security"].craft.status = "deployed";
  reviewProtectionRequests(value, sites, ["rift:20b"], 420 + 46_000);
  assert.equal(request.status, PROTECTION_REQUEST_STATUS.OFFERED);
  assert.equal(request.reason, "own-craft-could-not-launch");

  // It comes home. The lapse must not be a one-way door — otherwise the request
  // waits on a market that may be empty while the hub's craft sits on station.
  value.patrolOperations["yard-exchange"].craft.status = "available";
  reviewProtectionRequests(value, sites, ["rift:20b"], 420 + 92_000);
  assert.equal(request.status, PROTECTION_REQUEST_STATUS.INTERNAL);
  assert.equal(request.reason, "own-craft-free-again");
  assert.equal(request.craftId, "patrol-craft:yard-exchange");
});

test("a lapsed request is not reclaimed while the site is covering something else", () => {
  const value = state();
  const [lapsing] = evaluateProtectionThreat(value, sites, { id: "rift:20c", position: { x: 100, y: 0 }, enemyCount: 8, waveCount: 2 }, 440);
  value.patrolOperations["yard-exchange"].craft.status = "deployed";
  value.protectionProviders["sable-meridian-security"].craft.status = "deployed";
  reviewProtectionRequests(value, sites, ["rift:20c"], 440 + 46_000);
  assert.equal(lapsing.status, PROTECTION_REQUEST_STATUS.OFFERED);

  // A newer threat is now the one the hub's own craft is covering.
  value.patrolOperations["yard-exchange"].craft.status = "available";
  const newer = evaluateProtectionThreat(value, sites, { id: "rift:20d", position: { x: 130, y: 0 }, enemyCount: 8, waveCount: 2 }, 440 + 47_000)
    .find((entry) => entry.siteId === "yard-exchange");
  assert.equal(newer.status, PROTECTION_REQUEST_STATUS.INTERNAL);

  reviewProtectionRequests(value, sites, ["rift:20c", "rift:20d"], 440 + 92_000);
  assert.equal(lapsing.status, PROTECTION_REQUEST_STATUS.OFFERED,
    "one craft cannot be promised to two threats at once");
});

test("a request whose threat is already gone does not stay open forever", () => {
  const value = state();
  const [request] = evaluateProtectionThreat(value, sites, { id: "rift:21", position: { x: 100, y: 0 }, enemyCount: 8, waveCount: 2 }, 500);
  reviewProtectionRequests(value, sites, [], 510);
  assert.equal(request.status, PROTECTION_REQUEST_STATUS.CLOSED);
  assert.equal(request.closeReason, "threat-no-longer-present");
});

// ── a loss is not the end of the company ───────────────────────────────────

test("a destroyed security craft is replaced from the firm's own money", () => {
  const value = state();
  const request = evaluateProtectionThreat(value, sites, { id: "rift:22", position: { x: 20100, y: 0 }, enemyCount: 8, waveCount: 2 }, 600)
    .find((entry) => entry.siteId === "the-ledge");
  const provider = value.protectionProviders["sable-meridian-security"];
  startProtectionContract(value, request.id, 601);
  failProtectionContract(value, request.id, { hull: 0, now: 610 });
  const cashBefore = provider.institution.accounts.operating.balance;

  serviceProtectionProviders(value, 620);
  assert.equal(provider.craft.status, "destroyed", "the yard does not turn one around instantly");

  serviceProtectionProviders(value, 610 + 181_000);
  assert.equal(provider.craft.status, "available");
  assert.equal(provider.craft.hull, provider.craft.maxHull);
  assert.equal(provider.craft.activeRequestId, null);
  assert.ok(provider.institution.accounts.operating.balance < cashBefore, "and it paid for the hull");
});

test("a wreck stops holding the contract that killed it", () => {
  const value = state();
  const request = evaluateProtectionThreat(value, sites, { id: "rift:23", position: { x: 20100, y: 0 }, enemyCount: 8, waveCount: 2 }, 700)
    .find((entry) => entry.siteId === "the-ledge");
  const provider = value.protectionProviders["sable-meridian-security"];
  startProtectionContract(value, request.id, 701);
  provider.craft.hull = 0;
  closeProtectionRequestsForThreat(value, "rift:23", 710);
  assert.equal(provider.craft.status, "destroyed");
  assert.equal(provider.craft.activeRequestId, null,
    "otherwise finishProtectionReturn can never clear it and the firm is welded to a closed contract");
});

test("a destroyed hub watch craft is replaced from the settlement treasury", () => {
  const value = state();
  const [request] = evaluateProtectionThreat(value, sites, { id: "rift:24", position: { x: 100, y: 0 }, enemyCount: 8, waveCount: 2 }, 800);
  startInternalProtectionResponse(value, request, 801);
  failInternalProtectionResponse(value, request, { hull: 0, now: 810 });
  const treasury = value.logistics.institutions["yard-exchange"].accounts.operating;
  const before = treasury.balance;

  servicePatrolCraft(value, 820);
  assert.equal(value.patrolOperations["yard-exchange"].craft.status, "destroyed");

  servicePatrolCraft(value, 810 + 241_000);
  assert.equal(value.patrolOperations["yard-exchange"].craft.status, "available");
  assert.equal(value.patrolOperations["yard-exchange"].craft.hull, 150);
  assert.ok(treasury.balance < before, "the settlement paid for its own watch");
});
