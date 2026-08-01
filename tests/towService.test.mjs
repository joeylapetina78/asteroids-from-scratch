// Nell Winch as a proving slice for the actor framework.
//
// The claim under test is not that recovery is priced correctly — it is that
// Nell is a recovery-oriented actor because of what she HAS and VALUES, with no
// tow-specific pricing code anywhere. Each test below changes exactly one piece
// of configuration and expects the quote to move.

import assert from "node:assert/strict";
import test from "node:test";
import { createInitialTowServiceState, createTowServiceManager } from "../src/systems/towService.js";
import { INSTITUTION_ARCHETYPES } from "../src/content/institutions/institutionArchetypes.js";
import { findActorRecord, getActorTraits } from "../src/systems/actorConfig.js";
import { updateRelationshipProjection } from "../src/systems/relationshipProjections.js";
import { recordServiceCost } from "../src/systems/costBasis.js";
import { createGameState } from "../src/state/gameState.js";
import { createInitialLogisticsState } from "../src/systems/logistics.js";

const SITES = [
  { id: "yard-exchange", name: "Yard Exchange" },
  { id: "scrap-porch", name: "Scrap Porch" },
  { id: "the-ledge", name: "The Ledge" },
];

// A disabled hauler far enough from the repair berth for distance to matter.
function createWorld({ carrierBalance = 40_000, atSiteId = "yard-exchange" } = {}) {
  const state = createGameState();
  state.logistics = createInitialLogisticsState(1_000);
  state.towing = createInitialTowServiceState(1_000);
  const hauler = state.logistics.haulers["hauler-yard-scrap"];
  hauler.currentSiteId = atSiteId;
  state.logistics.institutions[hauler.carrierInstitutionId].accounts.operating.balance = carrierBalance;

  const ship = {
    id: "hauler-yard-scrap", name: "Yard Hauler", towed: null, pendingWearIssue: null,
    assignTow(assignment) { this.towed = assignment; },
    clearTow() { this.towed = null; },
  };
  const manager = createTowServiceManager({ state, ships: [ship], destinations: SITES, now: () => 1_000 });
  return { state, manager, ship, hauler };
}

// Drive one recovery by raising the event the service listens for, and return
// the request it created.
function requestRecovery(world) {
  world.state.ledger.recordEvent("npc.assistanceRequired", {
    npcId: "hauler-yard-scrap", npcName: "Yard Hauler", issueType: "hull-fatigue", shipmentId: null,
  }, { visible: false });
  world.manager.update();
  return Object.values(world.state.towing.requests).pop() ?? null;
}

// ── Configuration, not code ────────────────────────────────────────────────

test("Nell is a recovery actor through her archetype, not a tow-shaped module", () => {
  const { state } = createWorld();
  const institution = findActorRecord(state, "first-reach-recovery");
  assert.equal(institution.archetypeId, "recovery-service");

  const archetype = INSTITUTION_ARCHETYPES[institution.archetypeId];
  assert.ok(archetype, "the archetype it names actually exists");
  assert.ok(archetype.capabilities.includes("quote-recovery"), "and says recovery is a thing it does");
  // The cost model belongs to being a recovery service, not to this firm.
  assert.ok(archetype.defaultPolicy.calloutCost > 0);
  assert.ok(archetype.defaultPolicy.operatingCostPerDistance > 0);
  assert.equal(institution.policies.calloutCost, undefined,
    "this firm does not restate what every recovery outfit already knows");
});

test("her quote is her own cost plus her own margin, and it explains itself", () => {
  const world = createWorld();
  const request = requestRecovery(world);
  assert.ok(request, "a recovery was dispatched");
  assert.ok(request.fee > 0);
  assert.ok(request.quote.costToServe > 0, "the quote knows what the job costs her");
  assert.ok(request.fee >= request.quote.floor, "and never goes below it");
  assert.ok(request.quote.reasons.some((reason) => /callout/.test(reason)),
    `the cost breakdown is inspectable, got ${JSON.stringify(request.quote.reasons)}`);
});

test("a greedier operator quotes more for the identical job", () => {
  const cheap = createWorld();
  const dear = createWorld();
  findActorRecord(dear.state, "nell-winch").traits = { ...getActorTraits(dear.state, "first-reach-recovery"), growthBias: 0.9 };

  const cheapFee = requestRecovery(cheap).fee;
  const dearFee = requestRecovery(dear).fee;
  assert.ok(dearFee > cheapFee, `${dearFee} should exceed ${cheapFee} on temperament alone`);
});

test("a customer she has recovered before is quoted less", () => {
  const stranger = createWorld();
  const regular = createWorld();
  updateRelationshipProjection(regular.state, {
    fromId: "first-reach-recovery", toId: "carrier:yard-hauler",
    deltas: { trust: 0.9, reliability: 0.9, gratitude: 0.6 },
  });

  const strangerFee = requestRecovery(stranger).fee;
  const regularFee = requestRecovery(regular).fee;
  assert.ok(regularFee < strangerFee, `a regular pays ${regularFee}, a stranger ${strangerFee}`);
});

test("her price follows what upkeep actually costs her, with no retuning", () => {
  const cheapUpkeep = createWorld();
  const dearUpkeep = createWorld();
  // The Blue Hook has been in for expensive work.
  recordServiceCost(dearUpkeep.state, { institutionId: "first-reach-recovery", serviceType: "maintenance", price: 9_000, at: 1_000 });

  assert.ok(requestRecovery(dearUpkeep).fee > requestRecovery(cheapUpkeep).fee,
    "a rig that costs more to keep running charges more to run");
});

test("a longer recovery costs more than a short one", () => {
  const near = createWorld({ atSiteId: "yard-exchange" });   // 1875 to Scrap Porch
  const far = createWorld({ atSiteId: "the-ledge" });        // 8400 + 1875 via Yard Exchange
  assert.ok(requestRecovery(far).fee > requestRecovery(near).fee,
    "distance is priced, rather than being a rounding error on a flat fee");
});

// ── It still behaves when nobody can pay ───────────────────────────────────

test("a carrier that cannot protect its operating cash is refused, visibly", () => {
  const world = createWorld({ carrierBalance: 100 });
  const request = requestRecovery(world);
  assert.equal(request.status, "blocked");
  assert.equal(request.reason, "carrier-cannot-protect-operating-cash");
  const blocked = world.state.ledger.getEventsAfterId(0).filter((entry) => entry.type === "towService.blocked");
  assert.ok(blocked.length > 0, "and says so on the record rather than silently not dispatching");
});

// ── The relationship loop closes ───────────────────────────────────────────

test("a completed recovery is remembered by both parties", () => {
  const world = createWorld();
  const request = requestRecovery(world);
  assert.equal(request.status, "dispatched");

  world.state.ledger.recordEvent("npc.routeCompleted", {
    npcId: "hauler-yard-scrap", towRequestId: request.id, siteId: request.destinationSiteId,
  }, { visible: false });
  world.manager.update();

  assert.equal(world.state.towing.requests[request.id].status, "completed");
  const nellToCarrier = world.state.relationships.projections["first-reach-recovery=>carrier:yard-hauler"];
  const carrierToNell = world.state.relationships.projections["carrier:yard-hauler=>first-reach-recovery"];
  assert.ok(nellToCarrier?.reliability > 0, "Nell learns this carrier pays");
  assert.ok(carrierToNell?.reliability > 0, "and the carrier learns Nell turns up");
});
