import assert from "node:assert/strict";
import test from "node:test";
import {
  CAMPAIGN_FITTED_COMPONENT_IDS, CAMPAIGN_MINER_AMMO, CAMPAIGN_MINER_PRIOR_SERVICES,
  CAMPAIGN_MINER_WEAR_FRACTION, CAMPAIGN_PANEL_IDS, CAMPAIGN_SHIP_OFFER_ID,
  CAMPAIGN_BROKEN_COMPONENT_IDS, CAMPAIGN_UNFITTED_COMPONENT_IDS,
} from "../src/content/ships/campaignLoadout.js";
import { shipOffers } from "../src/content/ships/shipOffers.js";
import { createGameState } from "../src/state/gameState.js";
import { MINER_CONDITION_CONFIG } from "../src/systems/minerCondition.js";
import { accumulatePanelWear, repairPanelCondition } from "../src/systems/panelMaintenance.js";

// Campaign puts the player in a ship the catalogue already sells. These pin the
// two together in BOTH directions, so editing either one without the other
// fails here rather than silently handing a Rook hand equipment the offer says
// the hull does not have.
test("the campaign loadout is exactly the ship Rook actually issues", () => {
  const offer = shipOffers.find((entry) => entry.id === CAMPAIGN_SHIP_OFFER_ID);
  assert.ok(offer, `${CAMPAIGN_SHIP_OFFER_ID} must exist in the catalogue`);

  const componentIdByLabel = {
    Engine: "engine", Hull: "hull", Docking: "docking",
    "Beacon Locator": "beaconLocator", Miner: "miner", "Cargo Hold": "cargoHold",
  };
  const fromOffer = offer.includedComponents.map((label) => {
    const id = componentIdByLabel[label];
    assert.ok(id, `unmapped component label on the offer: ${label}`);
    return id;
  });

  assert.deepEqual([...fromOffer].sort(), [...CAMPAIGN_FITTED_COMPONENT_IDS].sort(),
    "the fitted list and the offer's included components must agree");
  // The three lists must not overlap. A broken unit is aboard but is not a
  // working fitting, and is deliberately not advertised on the offer.
  CAMPAIGN_UNFITTED_COMPONENT_IDS.forEach((id) => {
    assert.ok(!CAMPAIGN_FITTED_COMPONENT_IDS.includes(id), `${id} cannot be both fitted and not fitted`);
    assert.ok(!CAMPAIGN_BROKEN_COMPONENT_IDS.includes(id), `${id} cannot be both absent and broken`);
  });
  CAMPAIGN_BROKEN_COMPONENT_IDS.forEach((id) => {
    assert.ok(!CAMPAIGN_FITTED_COMPONENT_IDS.includes(id), `${id} is broken, so it is not a working fitting`);
    assert.ok(!fromOffer.includes(id), `${id} is dead and must not be advertised on the offer`);
  });
});

test("every declared component and panel actually exists", () => {
  const state = createGameState();
  [...CAMPAIGN_FITTED_COMPONENT_IDS, ...CAMPAIGN_BROKEN_COMPONENT_IDS, ...CAMPAIGN_UNFITTED_COMPONENT_IDS].forEach((id) => {
    assert.ok(state.components[id], `state.components.${id} must exist`);
  });
  // Panels are the ship's promise to the player: a panel with no component
  // behind it is a window onto nothing.
  const panelToComponent = {
    viewport: null, contract: null,
    engine: "engine", hull: "hull", docking: "docking",
    "beacon-locator": "beaconLocator", miner: "miner", cargo: "cargoHold", processor: "processor",
  };
  CAMPAIGN_PANEL_IDS.forEach((panelId) => {
    assert.ok(panelId in panelToComponent, `unmapped campaign panel: ${panelId}`);
    const componentId = panelToComponent[panelId];
    if (componentId) {
      assert.ok(CAMPAIGN_FITTED_COMPONENT_IDS.includes(componentId)
        || CAMPAIGN_BROKEN_COMPONENT_IDS.includes(componentId),
        `panel ${panelId} is shown but ${componentId} is neither fitted nor aboard-and-broken`);
    }
  });
});

test("the company skiff is slow, and that is the game's default engine", () => {
  // Rook's standard drive is what a new state already carries. Campaign does not
  // slow anything down; the explorer start is what speeds it up.
  const state = createGameState();
  assert.equal(state.components.engine.engineModelId, "rook-standard-drive");
  assert.ok(state.components.engine.maxSpeed < 185, "the company drive is slower than the explorer Vektor");
});

test("the issued laser is a used unit on the shared ladder, not a special wear rate", () => {
  // The failure the design must avoid is an invisible "campaign lasers wear
  // faster" rule. Instead the emitter is walked forward through the SAME machine
  // every panel uses, so it starts close to Degraded and Sal can service it.
  const state = createGameState();
  const emitter = state.components.miner.condition;
  for (let service = 0; service < CAMPAIGN_MINER_PRIOR_SERVICES; service += 1) {
    accumulatePanelWear(emitter, MINER_CONDITION_CONFIG.thresholds.degraded + 8, MINER_CONDITION_CONFIG.thresholds);
    repairPanelCondition(emitter);
  }
  accumulatePanelWear(emitter, MINER_CONDITION_CONFIG.thresholds.degraded * CAMPAIGN_MINER_WEAR_FRACTION, MINER_CONDITION_CONFIG.thresholds);

  assert.equal(emitter.stage, "healthy", "it still works when handed over");
  assert.equal(emitter.serviceCount, CAMPAIGN_MINER_PRIOR_SERVICES, "it has a service history");
  assert.ok(emitter.wear > 0, "and it is not a new unit");

  const shotsToDegraded = (MINER_CONDITION_CONFIG.thresholds.degraded - emitter.wear)
    / MINER_CONDITION_CONFIG.wear.perShot;
  const shotsFromNew = MINER_CONDITION_CONFIG.thresholds.degraded / MINER_CONDITION_CONFIG.wear.perShot;
  assert.ok(shotsToDegraded > 0, "it has not already failed on handover");
  assert.ok(shotsToDegraded < shotsFromNew / 3,
    `a used emitter should reach symptoms far sooner than a new one (${shotsToDegraded} vs ${shotsFromNew})`);

  // Ammo is a real limit, not a fail state: the charge runs out and Rook is how
  // you get more.
  assert.ok(CAMPAIGN_MINER_AMMO > 0 && CAMPAIGN_MINER_AMMO < state.components.miner.maxAmmo);
});
