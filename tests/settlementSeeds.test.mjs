import assert from "node:assert/strict";
import test from "node:test";

import {
  FIRST_REACH_SETTLEMENTS,
  settlementExtractionDefinitions,
  settlementInstitutionRecords,
  settlementMiningRights,
  settlementPlaces,
  settlementPopulationProfiles,
} from "../src/content/economy/firstReachSettlements.js";
import { createInitialLogisticsState } from "../src/systems/logistics.js";
import { STANDING_MINING_ORDERS } from "../src/systems/miningOperation.js";
import { POPULATION_PROFILES } from "../src/systems/populationDemand.js";
import { INSTITUTION_MINING_RIGHTS } from "../src/systems/authoritySeeds.js";

test("one settlement seed emits every cross-system record needed by the economy", () => {
  const logistics = createInitialLogisticsState(1_000);
  const populations = new Set(settlementPopulationProfiles().map((entry) => entry.hubInstitutionId));
  const extraction = new Set(settlementExtractionDefinitions().map((entry) => entry.buyerInstitutionId));
  const rights = new Set(settlementMiningRights().map((entry) => entry.institutionId));
  const places = new Set(settlementPlaces().map((entry) => entry.sourceId));

  FIRST_REACH_SETTLEMENTS.forEach((seed) => {
    assert.deepEqual(logistics.institutions[seed.institution.id], seed.institution);
    assert.deepEqual(logistics.institutions[seed.controller.id], seed.controller);
    assert.ok(populations.has(seed.institution.id), `${seed.institution.id} has a population`);
    assert.ok(extraction.has(seed.institution.id), `${seed.institution.id} publishes extraction`);
    assert.ok(rights.has(seed.institution.id), `${seed.institution.id} has mining rights`);
    assert.ok(places.has(seed.institution.siteId), `${seed.institution.id} has an authority place`);
  });
});

test("live population, extraction, and rights exports are projections of the same catalog", () => {
  assert.deepEqual(POPULATION_PROFILES, settlementPopulationProfiles());
  assert.deepEqual(STANDING_MINING_ORDERS, settlementExtractionDefinitions());
  assert.deepEqual(
    INSTITUTION_MINING_RIGHTS.filter((right) => right.institutionId !== "sprc"),
    settlementMiningRights(),
  );
});

test("settlement identities are unique before runtime state is created", () => {
  const records = settlementInstitutionRecords();
  assert.equal(new Set(records.map((record) => record.id)).size, records.length);
  assert.equal(new Set(FIRST_REACH_SETTLEMENTS.map((seed) => seed.institution.siteId)).size, FIRST_REACH_SETTLEMENTS.length);
  FIRST_REACH_SETTLEMENTS.forEach((seed) => {
    assert.equal(seed.institution.controllerInstitutionId, seed.controller.id);
    assert.deepEqual(seed.controller.controls, [seed.institution.id]);
    assert.deepEqual(seed.institution.renewableResources, [seed.extraction.resourceId]);
  });
});

test("hub five is an asymmetric structural competitor rather than a copied settlement", () => {
  const morrow = FIRST_REACH_SETTLEMENTS.find((seed) => seed.institution.id === "morrow-shoal");
  const yard = FIRST_REACH_SETTLEMENTS.find((seed) => seed.institution.id === "yard-exchange");
  assert.ok(morrow, "Morrow Shoal is seeded as hub five");
  assert.deepEqual(morrow.extraction.miningFamilies, ["structural"]);
  assert.equal(morrow.extraction.resourceId, yard.extraction.resourceId, "it competes in the same real resource market");
  assert.ok(morrow.institution.accounts.operating.balance < yard.institution.accounts.operating.balance, "its treasury is deliberately thin");
  assert.ok(morrow.population.incomeAmount < yard.population.incomeAmount, "its household economy is deliberately weaker");
  assert.notDeepEqual(morrow.controller.traits, yard.controller.traits, "its pricing policy comes from a different operator");
});
