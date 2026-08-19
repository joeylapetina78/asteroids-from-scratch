import assert from "node:assert/strict";
import test from "node:test";
import { createGameState } from "../src/state/gameState.js";
import { getHubActor } from "../src/systems/hubActors.js";

test("Scrap Porch owns SPRC's treasury, facilities and projects while Sal is delegated", () => {
  const state = createGameState();
  const porch = state.logistics.institutions["scrap-forge"];
  const hub = getHubActor(state, "scrap-forge", { at: 1_000 });

  assert.equal(state.sprc.account, porch.accounts.operating);
  assert.equal(porch.accounts.operating.balance, 48000);
  assert.equal(state.sprc.institution.ownerInstitutionId, "scrap-forge");
  assert.equal(state.sprc.institution.departmentHeadPersonId, "sal");
  assert.deepEqual(state.sprc.controller.controls, []);
  assert.equal(state.sprc.facilities.maw.ownerInstitutionId, "scrap-forge");
  assert.equal(state.sprc.projects["sprc-second-cradle"].ownerInstitutionId, "scrap-forge");
  assert.ok(hub.departments.some((department) => department.id === "sprc"));
  assert.ok(hub.facilities.some((facility) => facility.id === state.sprc.facilities.maw.id));
});
