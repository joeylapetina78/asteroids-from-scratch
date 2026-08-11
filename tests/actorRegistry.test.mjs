// The one actor table.
//
// Two properties matter here, and they pull against each other. The index must
// be FAST (every trait, balance and policy read goes through it) and it must
// never be STALE (an index that answers confidently and wrongly is worse than
// no index — that is the exact failure mode `actorConfig` documents as the most
// expensive one in this system). Most of what follows is the staleness half.

import assert from "node:assert/strict";
import test from "node:test";
import {
  ACTOR_ROLE,
  countActors,
  getActorEntry,
  getActorRecord,
  listActorIds,
  listActorSources,
  listActors,
  registerActorSource,
  unregisterActorSource,
} from "../src/systems/actorRegistry.js";
import { findActorRecord, getActorTraits } from "../src/systems/actorConfig.js";
import { createGameState } from "../src/state/gameState.js";
import { createInitialLogisticsState } from "../src/systems/logistics.js";
import { createInitialMiningState } from "../src/systems/miningOperation.js";
import { createTowServiceManager } from "../src/systems/towService.js";
import { createFarmOperation } from "../src/systems/farmOperation.js";

function createFullWorld() {
  const state = createGameState();
  state.logistics = createInitialLogisticsState(1_000);
  state.miningOperation = createInitialMiningState(1_000);
  createTowServiceManager({ state, ships: [], destinations: [], now: () => 1_000 });
  createFarmOperation({ state, now: 1_000 });
  return state;
}

// ── The question the lookup chain could not answer ──────────────────────────

test("the world's cast is enumerable, not just addressable", () => {
  const state = createFullWorld();
  const everyone = listActors(state);

  assert.ok(everyone.length > 0, "a stood-up world has actors in it");
  // The point: this needs no prior knowledge of any id. A generator that spawns
  // a new company has to be able to ask this without being told what to expect.
  everyone.forEach((actor) => {
    assert.ok(actor.id, "every entry is addressable");
    assert.ok(actor.record, "every entry carries its live record");
    assert.ok(Object.values(ACTOR_ROLE).includes(actor.role), `'${actor.id}' has a known role, got '${actor.role}'`);
    assert.ok(actor.domain, `'${actor.id}' says which domain keeps it`);
  });
});

test("actors can be filtered by role and by domain", () => {
  const state = createFullWorld();

  const institutions = listActors(state, { role: ACTOR_ROLE.INSTITUTION });
  assert.ok(institutions.length > 0);
  institutions.forEach((actor) => assert.equal(actor.role, ACTOR_ROLE.INSTITUTION));

  const mining = listActors(state, { domain: "mining" });
  assert.ok(mining.length > 0);
  mining.forEach((actor) => assert.equal(actor.domain, "mining"));

  assert.equal(countActors(state), listActors(state).length);
  assert.deepEqual(listActorIds(state, { domain: "mining" }).sort(), mining.map((actor) => actor.id).sort());
});

// `logistics.institutions` holds people as well as organisations. A consumer
// that asked for every institution and got a quartermaster back would try to
// bill an account the person does not have.
test("a person filed under institutions is still a person", () => {
  const state = createFullWorld();
  const people = Object.values(state.logistics.institutions).filter((record) => record.archetypeId === "person");
  assert.ok(people.length > 0, "the fixture world files people in the institutions table");

  people.forEach((person) => {
    assert.equal(getActorEntry(state, person.id).role, ACTOR_ROLE.CONTROLLER, `'${person.id}' is a person, not an institution`);
  });

  const institutions = listActors(state, { role: ACTOR_ROLE.INSTITUTION });
  institutions.forEach((actor) => {
    assert.notEqual(actor.record.archetypeId, "person", `'${actor.id}' should not be listed as an institution`);
  });
});

test("every seeded actor is reachable through the index", () => {
  const state = createFullWorld();
  const ids = new Set(listActorIds(state));

  // Each of the seven homes the old walk knew about must still be represented.
  const domains = new Set(listActors(state).map((actor) => actor.domain));
  ["logistics", "mining", "towing", "farm"].forEach((domain) => {
    assert.ok(domains.has(domain), `'${domain}' actors are in the index`);
  });

  ids.forEach((id) => {
    assert.ok(getActorRecord(state, id), `'${id}' resolves to a record`);
    assert.equal(findActorRecord(state, id), getActorRecord(state, id), `'${id}' resolves identically through actorConfig`);
  });
});

// ── It is an index, not a second copy ───────────────────────────────────────

test("entries hold the live record, so the index is never a second truth", () => {
  const state = createFullWorld();
  const actor = listActors(state, { role: ACTOR_ROLE.INSTITUTION })[0];

  assert.equal(getActorRecord(state, actor.id), actor.record, "same object identity, not a clone");

  // Mutating through the domain is visible through the index, because they are
  // the same object. A copy would drift the moment either side was written to.
  actor.record.__probe = "written-through-the-domain";
  assert.equal(getActorRecord(state, actor.id).__probe, "written-through-the-domain");
  delete actor.record.__probe;
});

// ── Staleness: the half that would answer confidently and wrongly ───────────

test("an actor added after the first read is found without an explicit rebuild", () => {
  const state = createFullWorld();
  listActors(state); // prime the index

  state.logistics.institutions["late-arrival"] = {
    id: "late-arrival",
    name: "Late Arrival Freight",
    traits: { caution: 0.9, growthBias: 0.1, urgencyBias: 0.2 },
  };

  assert.ok(getActorRecord(state, "late-arrival"), "a newly seeded actor is visible immediately");
  assert.equal(getActorTraits(state, "late-arrival").caution, 0.9, "and its configuration is what decides for it");
});

test("an actor removed after the first read stops resolving", () => {
  const state = createFullWorld();
  state.logistics.institutions["temporary"] = { id: "temporary", name: "Temporary" };
  assert.ok(getActorRecord(state, "temporary"), "present while it exists");

  delete state.logistics.institutions["temporary"];
  assert.equal(getActorRecord(state, "temporary"), null, "gone once the domain drops it");
});

test("a new mining company appears without touching this module", () => {
  const state = createFullWorld();
  const before = countActors(state, { domain: "mining" });

  state.miningOperations = {
    ...(state.miningOperations ?? { legacy: state.miningOperation }),
    upstart: {
      // An institution decides through whoever runs it, so the link to the
      // controller is what carries temperament — not a field on the company.
      institution: { id: "upstart-extraction", name: "Upstart Extraction", controllerInstitutionId: "upstart-boss" },
      controller: { id: "upstart-boss", name: "Upstart Boss", traits: { caution: 0.1, growthBias: 0.9, urgencyBias: 0.8 } },
      ships: { "upstart-one": { id: "upstart-one", name: "Upstart One" } },
    },
  };

  assert.ok(countActors(state, { domain: "mining" }) > before);
  assert.equal(getActorEntry(state, "upstart-one").role, ACTOR_ROLE.SHIP);
  assert.equal(getActorEntry(state, "upstart-extraction").role, ACTOR_ROLE.INSTITUTION);
  // The whole point of step one: the new company decides by its own controller's
  // temperament, with no code written for it anywhere.
  assert.equal(getActorTraits(state, "upstart-extraction").growthBias, 0.9);
});

// ── Sources are data ────────────────────────────────────────────────────────

test("a new kind of actor registers a source and needs no edit here", () => {
  const state = createFullWorld();
  const before = countActors(state);

  registerActorSource(state, "salvage-crews", (world) =>
    Object.values(world.__salvageCrews ?? {}).map((record) => ({
      id: record.id,
      record,
      role: ACTOR_ROLE.INSTITUTION,
      domain: "salvage",
    })));

  state.__salvageCrews = { "crew-a": { id: "crew-a", name: "Crew A", traits: { caution: 0.2, growthBias: 0.7, urgencyBias: 0.6 } } };

  assert.equal(countActors(state), before + 1);
  assert.equal(getActorEntry(state, "crew-a").domain, "salvage");
  assert.equal(getActorTraits(state, "crew-a").growthBias, 0.7, "and it resolves through the same configuration path");
  assert.ok(listActorSources(state).includes("salvage-crews"));

  unregisterActorSource(state, "salvage-crews");
  assert.equal(getActorRecord(state, "crew-a"), null, "unregistering removes its actors");
});

test("a registered source cannot shadow an existing actor", () => {
  const state = createFullWorld();
  const existing = listActors(state, { role: ACTOR_ROLE.INSTITUTION })[0];

  registerActorSource(state, "impostor", () => [
    { id: existing.id, record: { id: existing.id, name: "Impostor" }, role: ACTOR_ROLE.INSTITUTION, domain: "impostor" },
  ]);

  assert.equal(getActorRecord(state, existing.id), existing.record, "built-in homes win the id");
  unregisterActorSource(state, "impostor");
});

test("a source that throws is isolated rather than blanking the world", () => {
  const state = createFullWorld();
  const before = countActors(state);

  registerActorSource(state, "broken", () => { throw new Error("bad source"); });

  assert.equal(countActors(state), before, "every other actor still resolves");
  unregisterActorSource(state, "broken");
});

// ── Absent domains ──────────────────────────────────────────────────────────

// A bare object, not `createGameState()` — a fresh game already seeds the
// starting settlements, so it is not the empty case.
test("a world with no domains standing is empty rather than broken", () => {
  const state = {};
  assert.deepEqual(listActors(state), []);
  assert.equal(getActorRecord(state, "nobody"), null);
  assert.equal(getActorRecord(state, null), null);
  assert.equal(getActorEntry(state, undefined), null);
});

test("an unknown id resolves to null in a populated world", () => {
  const state = createFullWorld();
  assert.equal(getActorRecord(state, "no-such-actor"), null);
  assert.equal(findActorRecord(state, "no-such-actor"), null);
});
