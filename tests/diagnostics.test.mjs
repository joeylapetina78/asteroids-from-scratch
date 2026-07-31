// Diagnostics: the layer that answers "what are you doing, and why?" for a
// given actor. These tests cover the shape, the blocker cause-chain, and the
// six state transitions the layer must capture during a live simulation.

import assert from "node:assert/strict";
import test from "node:test";
import {
  BLOCKER_KIND,
  DIAGNOSTIC_STATE,
  clearBlocker,
  createBlocker,
  formatBlockerChain,
  getDiagnostic,
  listBlocked,
  listDiagnostics,
  recordBlocker,
  recordDecision,
  recordDiagnostic,
  resolveBlockerChain,
} from "../src/systems/diagnostics.js";
import { RETENTION_CLASS, classifyEvent, getRetentionClass, isDurable, isEphemeral } from "../src/systems/eventRetention.js";
import { createGameState } from "../src/state/gameState.js";
import { createSprcOperation, SPRC } from "../src/systems/sprcOperation.js";
import { createMiningOperation } from "../src/systems/miningOperation.js";
import { createInitialLogisticsState, createLogisticsManager } from "../src/systems/logistics.js";
import { createHubProcurementOperation } from "../src/systems/hubProcurement.js";
import { MiningWorkerShip } from "../src/entities/MiningWorkerShip.js";

// ── Shape and querying ─────────────────────────────────────────────────────

test("a diagnostic record answers the standard questions", () => {
  const state = {};
  recordDiagnostic(state, "worker:x", {
    actorName: "Worker X",
    actorKind: "ship",
    controllerId: "miner:test",
    state: DIAGNOSTIC_STATE.COMMITTED,
    summary: "Mining 6 silicate for Scrap Porch",
    intention: { id: "alloc-1", kind: "extraction", goal: "deliver 6 silicate", objectId: "PO-1" },
    wakeOn: ["delivery.completed"],
  });
  const record = getDiagnostic(state, "worker:x");

  for (const key of ["actorId", "state", "summary", "intention", "lastDecision", "blocker", "waitingFor", "wakeOn", "nextReconsiderAt", "refs", "eventIds", "updatedAt"]) {
    assert.ok(key in record, `record is missing ${key}`);
  }
  assert.equal(record.state, DIAGNOSTIC_STATE.COMMITTED);
  assert.equal(record.intention.objectId, "PO-1");
});

test("patches merge without erasing untouched fields", () => {
  const state = {};
  recordDiagnostic(state, "a", { actorName: "A", summary: "first" });
  recordDiagnostic(state, "a", { state: DIAGNOSTIC_STATE.WAITING });
  const record = getDiagnostic(state, "a");
  assert.equal(record.actorName, "A", "an unrelated update keeps the name");
  assert.equal(record.summary, "first");
  assert.equal(record.state, DIAGNOSTIC_STATE.WAITING);
});

test("event references are kept but bounded — never a ledger scan", () => {
  const state = {};
  for (let index = 0; index < 25; index += 1) recordDiagnostic(state, "a", { eventId: index });
  assert.ok(getDiagnostic(state, "a").eventIds.length <= 10, "references stay compact");
});

test("diagnostics can be filtered and blocked actors listed", () => {
  const state = {};
  recordDiagnostic(state, "ship:1", { actorKind: "ship", actorName: "Cinder One", state: DIAGNOSTIC_STATE.COMMITTED });
  // Identity is recorded alongside the blocker, the way the real systems do it.
  recordDiagnostic(state, "ship:2", { actorKind: "ship", actorName: "Cinder Two" });
  recordBlocker(state, "ship:2", createBlocker({ kind: BLOCKER_KIND.NO_ELIGIBLE_WORK, summary: "idle" }));
  recordDiagnostic(state, "sprc", { actorKind: "institution", state: DIAGNOSTIC_STATE.WORKING });

  assert.equal(listDiagnostics(state, { kind: "ship" }).length, 2);
  assert.equal(listDiagnostics(state, { search: "cinder" }).length, 2, "search matches both Cinder ships");
  assert.equal(listDiagnostics(state, { search: "cinder one" }).length, 1, "and narrows to one");
  assert.equal(listDiagnostics(state, { states: [DIAGNOSTIC_STATE.WORKING] }).length, 1);
  const blocked = listBlocked(state);
  assert.equal(blocked.length, 1);
  assert.equal(blocked[0].actorId, "ship:2");
});

// ── Causal blocker chains ──────────────────────────────────────────────────

test("a blocker chain follows causes across actors into a readable why-list", () => {
  const state = {};
  // Bottom of the chain: miners are all busy on better-paying work.
  recordBlocker(state, "miner:cinder", createBlocker({
    kind: BLOCKER_KIND.ALL_SUPPLIERS_COMMITTED,
    summary: "every miner is committed elsewhere",
    causedBy: [{ actorId: "worker:one" }],
  }));
  recordDiagnostic(state, "worker:one", {
    state: DIAGNOSTIC_STATE.COMMITTED,
    summary: "those jobs currently have higher net value",
  });
  // Middle: SPRC's purchase order is unfilled because of the above.
  recordBlocker(state, "sprc", createBlocker({
    kind: BLOCKER_KIND.UNFILLED_ORDER,
    summary: "its purchase order is unfilled",
    causedBy: [{ actorId: "miner:cinder" }],
  }));
  // Top: the hauler is idle because the source hub is empty.
  const hauler = createBlocker({
    kind: BLOCKER_KIND.NO_ELIGIBLE_CARGO,
    summary: "hauler is idle: no eligible cargo",
    causedBy: [createBlocker({
      kind: BLOCKER_KIND.SOURCE_OUT_OF_STOCK,
      summary: "the source hub lacks water ice",
      causedBy: [{ actorId: "sprc" }],
    })],
  });

  const lines = formatBlockerChain(resolveBlockerChain(state, hauler)).map((line) => `${"  ".repeat(line.indent)}${line.summary}`);
  assert.deepEqual(lines, [
    "hauler is idle: no eligible cargo",
    "  the source hub lacks water ice",
    "    its purchase order is unfilled",
    "      every miner is committed elsewhere",
    "        those jobs currently have higher net value",
  ]);
});

test("a blocker chain terminates on cycles instead of recursing forever", () => {
  const state = {};
  recordBlocker(state, "a", createBlocker({ kind: "x", summary: "A waits on B", causedBy: [{ actorId: "b" }] }));
  recordBlocker(state, "b", createBlocker({ kind: "x", summary: "B waits on A", causedBy: [{ actorId: "a" }] }));
  const lines = formatBlockerChain(resolveBlockerChain(state, getDiagnostic(state, "a").blocker));
  assert.ok(lines.length < 8, "the walk is bounded");
  assert.ok(lines.some((line) => line.kind === "cycle"), "the cycle is reported rather than followed");
});

test("an unresolvable cause reference is reported, not silently dropped", () => {
  const state = {};
  const blocker = createBlocker({ kind: "x", summary: "blocked", causedBy: [{ actorId: "ghost", note: "nobody is tracking ghost" }] });
  const lines = formatBlockerChain(resolveBlockerChain(state, blocker));
  assert.equal(lines[1].kind, "unknown-actor");
  assert.match(lines[1].summary, /ghost/);
});

// ── Retention classes ──────────────────────────────────────────────────────

test("event types classify into ephemeral, operational, and durable", () => {
  assert.equal(getRetentionClass("player.thrust"), RETENTION_CLASS.EPHEMERAL);
  assert.ok(isEphemeral("resource.collected"));
  assert.equal(getRetentionClass("institution.jobValued"), RETENTION_CLASS.OPERATIONAL);
  assert.equal(getRetentionClass("sprc.repairCompleted"), RETENTION_CLASS.DURABLE);
  assert.ok(isDurable("contract.paid"), "money changing hands is history");
  assert.equal(getRetentionClass("totally.unknown.event"), RETENTION_CLASS.OPERATIONAL, "unknown events default to the diagnosable middle");
});

test("classification carries a visibility field for later investigation systems", () => {
  const classified = classifyEvent("sprc.repairCompleted");
  assert.equal(classified.retentionClass, RETENTION_CLASS.DURABLE);
  assert.equal(classified.visibility, "public", "everything is public until concealment exists");
  assert.equal(classified.policy.keepIndefinitely, true);
  assert.equal(classifyEvent("player.thrust").policy.keepIndefinitely, false);
});

// ── Live transitions through the real systems ──────────────────────────────

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

test("assignment selection records the choice, the alternatives, and the reasons", () => {
  const { state, game, sprc } = createWorld();
  sprc.update();
  const mining = createMiningOperation({ state, game, sprcOperation: sprc, now: () => 1_000 });
  const worker = mining.workers.find((entry) => entry.assignment);
  assert.ok(worker, "a worker took an assignment");

  const record = getDiagnostic(state, worker.id);
  assert.equal(record.state, DIAGNOSTIC_STATE.COMMITTED);
  assert.ok(record.intention, "the commitment is visible");
  assert.ok(record.summary.length > 0);
  assert.ok(record.lastDecision, "the decision was captured");
  assert.ok(record.lastDecision.chosen.id, "the winner is named");
  assert.ok(record.lastDecision.reasons.length > 0, "with reasons");
  assert.ok(record.lastDecision.alternatives.every((entry) => entry.rejectedBecause), "each loser says why it lost");
  assert.equal(record.blocker, null);
});

test("an institution waiting for inventory publishes a blocker naming the shortage", () => {
  const { state, sprc, advance } = createWorld();
  sprc.update();
  // Block a repair on materials SPRC does not hold.
  state.sprc.inventories.produced["machine-part"] = 0;
  state.sprc.inventories.raw.silicate = 0;
  state.sprc.inventories.raw.copper = 0;
  state.ledger.recordEvent("logistics.maintenanceRequired", { npcId: SPRC.firstHaulerId, issueType: "preventive-service", wear: 4, issueCount: 1 }, { visible: false });
  advance(1_000);
  sprc.update();

  const record = getDiagnostic(state, "sprc");
  assert.ok(record, "the institution has a diagnostic");
  assert.equal(record.actorKind, "institution");
  assert.equal(record.state, DIAGNOSTIC_STATE.WAITING);
  assert.equal(record.blocker.kind, BLOCKER_KIND.AWAITING_MATERIAL);
  assert.ok(record.blocker.waitingFor, "it says what it is waiting for");
  assert.ok(record.blocker.wakeOn.includes("material-delivered"), "and what will wake it");
  assert.ok(record.detail.availableCash !== undefined, "cash and protected cash are exposed");
  // The chain continues into the unfilled order that would relieve it.
  const lines = formatBlockerChain(resolveBlockerChain(state, record.blocker));
  assert.ok(lines.length > 1, "the blocker names its cause");
  assert.ok(lines.some((line) => line.kind === BLOCKER_KIND.UNFILLED_ORDER));
});

test("a carrier that finds only below-cost freight records why it refused", () => {
  const { state, game } = createWorld();
  const ships = Object.keys(state.logistics.haulers).map((id) => ({
    id, dockedSiteId: state.logistics.haulers[id].currentSiteId, wear: 0.4,
    operationalStatus: "seeking-work", activeShipmentId: null,
    canAcceptRoute: () => true, assignShipment: () => {}, assignment: null,
  }));
  // Freight now exists only because a hub bought something, so set up a real
  // purchase order and then empty the shelves: the carrier has work on the
  // books that nobody can supply yet.
  ["yard-exchange", "scrap-forge", "the-ledge"].forEach((id) => {
    state.logistics.institutions[id].accounts.operating.balance = 20_000;
  });
  const procurement = createHubProcurementOperation({ state, now: () => 1_000 });
  procurement.update();
  Object.values(state.logistics.institutions).forEach((institution) => {
    if (institution.inventories) Object.keys(institution.inventories).forEach((itemId) => { institution.inventories[itemId] = 0; });
  });
  procurement.update();
  const manager = createLogisticsManager({ state, ships, now: () => 1_000 });
  manager.update();

  const idle = Object.keys(state.logistics.haulers)
    .map((id) => getDiagnostic(state, id))
    .filter(Boolean);
  assert.ok(idle.length > 0, "idle carriers publish diagnostics");
  const record = idle[0];
  assert.equal(record.state, DIAGNOSTIC_STATE.WAITING);
  assert.equal(record.blocker.kind, BLOCKER_KIND.NO_ELIGIBLE_CARGO);
  assert.ok(record.blocker.waitingFor);
  // Out-of-stock sources appear as causes, forming the why-chain.
  const lines = formatBlockerChain(resolveBlockerChain(state, record.blocker));
  assert.ok(lines.some((line) => line.kind === BLOCKER_KIND.SOURCE_OUT_OF_STOCK), "the empty source is named as the cause");
});

test("a deferred repair records the deferral, the quote, and the retry time", () => {
  const { state, sprc } = createWorld();
  sprc.update();
  state.miningOperation = { institution: { id: "miner:broke", accounts: { operating: { balance: 10, committed: 0, transactions: [] } } } };
  state.ledger.recordEvent("maintenance.requested", {
    subjectId: "worker:broke", subjectName: "Broke Miner", referenceId: "MW-BROKE", craftClass: "mining-craft",
    issueType: "preventive-calibration", requiredCapabilities: ["field-control"], locationSiteId: "scrap-porch",
    mobility: "self-return", payerInstitutionId: "miner:broke",
    payer: { balance: 10, committed: 0, protectedCash: 0 }, servicePrice: 220,
  }, { visible: false });
  sprc.update();

  const record = getDiagnostic(state, "worker:broke");
  assert.ok(record, "the deferred subject has a diagnostic");
  assert.equal(record.state, DIAGNOSTIC_STATE.DEFERRED);
  assert.equal(record.blocker.kind, BLOCKER_KIND.PAYER_CANNOT_AFFORD);
  assert.ok(record.blocker.detail.quotedPrice > 0, "the real quote is recorded, not a reference price");
  assert.ok(record.nextReconsiderAt > 0, "a retry time is published");
  assert.ok(record.blocker.wakeOn.includes("payer-balance-changed"));
});

test("a disabled worker points its blocker at the service provider", () => {
  const { state, game, sprc } = createWorld();
  sprc.update();
  const mining = createMiningOperation({ state, game, sprcOperation: sprc, now: () => 1_000 });
  const worker = mining.workers[0];
  const shipRecord = mining.getState().ships[worker.id];
  shipRecord.issueCount = 1;
  // Start just under the threshold so two routine deliveries cross it.
  shipRecord.wear = 0.95;

  // Two completed deliveries push it over the wear threshold into service.
  for (let completed = 0; completed < 2; completed += 1) {
    worker.cargo[worker.assignment.resourceId] = worker.assignment.harvestTargetQuantity ?? worker.assignment.quantity;
    worker.deliver();
    mining.update();
  }

  const record = getDiagnostic(state, worker.id);
  assert.equal(record.state, DIAGNOSTIC_STATE.DISABLED);
  assert.equal(record.blocker.kind, BLOCKER_KIND.AWAITING_SERVICE);
  assert.ok(record.blocker.detail.issueType, "the fault is named");
  assert.deepEqual(record.blocker.causedBy, [{ actorId: "sprc", note: "Scrap Porch Recovery Cooperative holds the repair" }]);
});

test("completing service clears the blocker and returns the actor to available", () => {
  const { state, game, sprc } = createWorld();
  const mining = createMiningOperation({ state, game, sprcOperation: sprc, now: () => 1_000 });
  const worker = mining.workers[0];
  const shipRecord = mining.getState().ships[worker.id];

  // Put it in a disabled, blocked state.
  recordBlocker(state, worker.id, createBlocker({ kind: BLOCKER_KIND.AWAITING_SERVICE, summary: "waiting" }), { state: DIAGNOSTIC_STATE.DISABLED });
  shipRecord.maintenanceStatus = "awaiting-service";
  assert.equal(getDiagnostic(state, worker.id).state, DIAGNOSTIC_STATE.DISABLED);

  // Service completes and is paid.
  mining.getState().institution.accounts.operating.balance = 5_000;
  state.ledger.recordEvent("sprc.repairCompleted", { repairOrderId: "RPR-1", subjectId: worker.id, serviceRevenue: 200 }, { visible: false });
  mining.update();

  const record = getDiagnostic(state, worker.id);
  assert.equal(record.blocker, null, "the blocker is cleared");
  assert.ok([DIAGNOSTIC_STATE.FREE, DIAGNOSTIC_STATE.COMMITTED].includes(record.state), `returned to service (got ${record.state})`);
  assert.equal(listBlocked(state).some((entry) => entry.actorId === worker.id), false, "and it leaves the blocked list");
});

// ── Refused delivery: no frame spam, no stranded worker ────────────────────
// Regression cover for a livelock that filled 5972 of 6000 ledger slots with a
// single event type, destroying all other history, while the worker sat holding
// cargo for an order that would never accept it.

function createWorkerHarness({ onDelivery }) {
  const events = [];
  const worker = new MiningWorkerShip({
    id: "worker:test", name: "Test Worker", institutionId: "miner:test", controllerInstitutionId: "person:test",
    x: 0, y: 0,
    onEvent: (type, payload) => events.push({ type, payload }),
    onDelivery,
  });
  worker.assign({
    allocationId: "alloc-1", contractId: "contract:TEST-1", resourceId: "iron-nickel",
    quantity: 6, harvestTargetQuantity: 6, destination: { x: 0, y: 0 }, depositCandidates: [],
  });
  worker.cargo["iron-nickel"] = 6;
  return { worker, events };
}

// Drive the ship's own update loop at the destination, which is what invoked
// deliver() every frame.
function runFrames(worker, frames, deltaSeconds = 1 / 60) {
  const world = { pickups: [], asteroids: [], collectPickup: () => null };
  for (let frame = 0; frame < frames; frame += 1) worker.update(deltaSeconds, world);
}

test("a transient refusal is reported once, not once per frame", () => {
  const { worker, events } = createWorkerHarness({
    onDelivery: () => ({ acceptedUnits: 0, paid: 0, refusal: { reason: "buyer-cannot-fund", permanent: false } }),
  });

  runFrames(worker, 120); // two seconds at 60fps
  const rejected = events.filter((entry) => entry.type === "delivery.rejected");
  assert.equal(rejected.length, 1, `expected a single report, got ${rejected.length}`);
  assert.equal(worker.state, "delivery-blocked");
  assert.ok(worker.assignment, "a transient refusal keeps the commitment");
  assert.equal(rejected[0].payload.reason, "buyer-cannot-fund");
  assert.ok(rejected[0].payload.retryInSeconds > 0, "the retry delay is stated");
});

test("a transient refusal retries after the backoff, not before", () => {
  let attempts = 0;
  const { worker } = createWorkerHarness({
    onDelivery: () => {
      attempts += 1;
      return { acceptedUnits: 0, paid: 0, refusal: { reason: "buyer-cannot-fund", permanent: false } };
    },
  });

  runFrames(worker, 60); // 1 second — inside the backoff
  assert.equal(attempts, 1, "no retry while backing off");
  runFrames(worker, 60 * 6); // past the 5s window
  assert.ok(attempts >= 2, "it does try again once the window passes");
  assert.ok(attempts < 10, `retries stay throttled (saw ${attempts})`);
});

test("a permanent refusal releases the assignment and keeps the cargo", () => {
  const { worker, events } = createWorkerHarness({
    onDelivery: () => ({ acceptedUnits: 0, paid: 0, refusal: { reason: "order-paid", permanent: true } }),
  });

  runFrames(worker, 120);

  assert.equal(worker.assignment, null, "the dead commitment is dropped");
  assert.equal(worker.cargo["iron-nickel"], 6, "the mined material is retained, not destroyed");
  assert.equal(worker.state, "idle", "the worker is free to take other work");
  const abandoned = events.filter((entry) => entry.type === "delivery.abandoned");
  assert.equal(abandoned.length, 1, "reported exactly once");
  assert.equal(abandoned[0].payload.reason, "order-paid");
  assert.equal(abandoned[0].payload.cargoRetained, 6);
  assert.equal(events.filter((entry) => entry.type === "delivery.rejected").length, 0,
    "a permanent refusal is an abandonment, not a rejection to retry");
});

test("a successful delivery still completes and clears any prior block", () => {
  let accept = false;
  const { worker, events } = createWorkerHarness({
    onDelivery: () => (accept
      ? { acceptedUnits: 6, paid: 120 }
      : { acceptedUnits: 0, paid: 0, refusal: { reason: "buyer-cannot-fund", permanent: false } }),
  });

  runFrames(worker, 30);
  assert.equal(worker.state, "delivery-blocked");
  accept = true;
  runFrames(worker, 60 * 6);

  assert.equal(worker.assignment, null);
  assert.equal(worker.deliveryBlock, null, "the block is cleared on success");
  assert.equal(worker.cargo["iron-nickel"], 0, "the load was handed over");
  assert.equal(events.filter((entry) => entry.type === "delivery.completed").length, 1);
});

test("the operation releases the allocation when an order can never accept the load", () => {
  const { state, game, sprc } = createWorld();
  sprc.update();
  const mining = createMiningOperation({ state, game, sprcOperation: sprc, now: () => 1_000 });
  const worker = mining.workers.find((entry) => entry.assignment?.contractId?.startsWith("contract:SPRC"));
  if (!worker) return; // no SPRC allocation this run; the unit tests above cover the path

  const allocationId = worker.assignment.allocationId;
  const order = Object.values(state.sprc.procurementOrders).find((entry) => entry.contractId === worker.assignment.contractId);
  // Someone else filled and closed the order while this worker was inbound.
  order.deliveredEquivalentUnits = order.requiredEquivalentUnits;
  order.status = "paid";

  worker.cargo[worker.assignment.resourceId] = worker.assignment.harvestTargetQuantity;
  worker.deliver();

  assert.equal(worker.assignment, null, "the worker is released");
  assert.ok(worker.cargo[Object.keys(worker.cargo)[0]] > 0, "and keeps what it mined");
  assert.equal(mining.getState().allocations[allocationId].status, "released",
    "the allocation returns its reserved units to the order");
  const diagnostic = getDiagnostic(state, worker.id);
  assert.ok(diagnostic?.blocker, "the stranded worker is visible in diagnostics, not just the event feed");
});

// ── Aiming while station-keeping ───────────────────────────────────────────
// A worker that brakes without turning freezes its heading on arrival. Because
// firing needs the target inside a narrow arc, a worker that coasted in
// sideways could never fire, never break the rock, and so never re-target.

function miningWorkerOnAsteroid({ angle }) {
  const worker = new MiningWorkerShip({ id: "worker:aim", name: "Aim Test", x: 0, y: 0, angle });
  worker.assign({
    allocationId: "a1", contractId: "c1", resourceId: "silicate", quantity: 3,
    destination: { x: 5000, y: 5000 }, depositCandidates: [],
  });
  const asteroid = { position: { x: 130, y: 0 }, velocity: { x: 0, y: 0 }, radius: 50, resources: { silicate: 4 } };
  const world = { asteroids: [asteroid], pickups: [], pullPickup: () => {}, collectPickup: () => null };
  return { worker, world, asteroid };
}

test("a worker parked on a rock keeps turning onto its firing arc", () => {
  // Arrives pointing 90 degrees off — the normal result of braking from a
  // course that carried it past the rock.
  const { worker, world } = miningWorkerOnAsteroid({ angle: Math.PI / 2 });
  const distanceToRock = 130;
  assert.ok(distanceToRock <= 250 * 0.72, "the worker is inside station-keeping range");

  for (let step = 0; step < 200; step += 1) worker.update(1 / 60, world);

  const bearing = Math.abs(worker.angle % (Math.PI * 2));
  assert.ok(bearing < 0.16 || bearing > Math.PI * 2 - 0.16,
    `worker should rotate onto the target bearing, ended at ${bearing.toFixed(3)} rad`);
  assert.ok(worker.pendingShots.length > 0, "and actually fire, instead of sitting on a full rock");
});

test("station-keeping does not push the worker off the rock", () => {
  const { worker, world } = miningWorkerOnAsteroid({ angle: Math.PI / 2 });
  for (let step = 0; step < 200; step += 1) worker.update(1 / 60, world);
  const drift = Math.hypot(worker.position.x, worker.position.y);
  assert.ok(drift < 60, `holding station should not fly the worker away, drifted ${drift.toFixed(1)}`);
  assert.equal(worker.state, "mining");
});
