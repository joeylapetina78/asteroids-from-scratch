import test from "node:test";
import assert from "node:assert/strict";
import { listPendingPatrolResponses } from "../src/systems/patrolDispatch.js";
import { createPatrolRuntimeActor } from "../src/systems/patrolRuntime.js";

test("patrol dispatch returns every valid response without a universe-wide craft cap", () => {
  const requests = Object.fromEntries(Array.from({ length: 6 }, (_, index) => {
    const id = `response:${index}`;
    return [id, { id, status: index % 2 ? "contracted" : "covered-internally", severity: index / 10, createdAt: index }];
  }));
  const pending = listPendingPatrolResponses(requests, []);
  assert.equal(pending.length, 6);
  assert.deepEqual(pending.map((request) => request.id), ["response:5", "response:4", "response:3", "response:2", "response:1", "response:0"]);
});

test("patrol dispatch excludes requests already represented by a physical craft", () => {
  const requests = {
    one: { id: "one", status: "contracted", severity: 0.9, createdAt: 1 },
    two: { id: "two", status: "covered-internally", severity: 0.5, createdAt: 2 },
  };
  assert.deepEqual(listPendingPatrolResponses(requests, [{ protectionRequestId: "one" }]).map(({ id }) => id), ["two"]);
});

test("all patrol roles share one damage-capable runtime shape", () => {
  const craft = { id: "watch:1", name: "Watch One", ownerInstitutionId: "watch-office", hull: 150, maxHull: 150 };
  const site = { id: "hub", position: { x: 0, y: 0 } };
  const actor = createPatrolRuntimeActor({ craft, site, reason: "ambient", phase: "drift", position: { x: 4, y: 8 } });
  actor.damage(60);
  assert.equal(actor.hull, 90);
  assert.equal(actor.isAlive, true);
  actor.damage(100);
  assert.equal(actor.hull, 0);
  assert.equal(actor.isAlive, false);
});
