import assert from "node:assert/strict";
import test from "node:test";
import { createGameState } from "../src/state/gameState.js";
import { RIGHT_TYPES } from "../src/systems/authorityModel.js";
import { getHubTerritory, grantPlayerTerritoryRights } from "../src/systems/hubTerritories.js";
import {
  evaluateFlightAccess,
  evaluatePlotMiningAccess,
  getPlotRestriction,
  humanizeAuthorityId,
  isPlotRestrictedForPlayer,
  miningRequiresRight,
} from "../src/systems/operatingRights.js";

function plotAt(position, id = "plot-test", sourceClaimId = null) {
  return {
    id,
    sourceClaimId,
    center: { ...position },
    rights: { mining: { status: "lease-required", authorityId: "retired-regional-office" } },
    strongestZoneId: "retired-flight-zone",
    strongestZoneName: "Retired Flight Zone",
    zoneInfluence: 1,
  };
}

test("legacy claim metadata remains readable but no longer controls the overlay", () => {
  assert.equal(miningRequiresRight({ status: "lease-required" }), true);
  const state = createGameState();
  const frontier = plotAt({ x: 25000, y: 25000 });
  assert.deepEqual(evaluatePlotMiningAccess(state, frontier), { controlled: false, allowed: true, via: "unclaimed-frontier" });
  assert.equal(getPlotRestriction(state, frontier), null);
});

test("claimed hub ground names the hub, missing right, and clearance office", () => {
  const state = createGameState();
  const porch = getHubTerritory("scrap-porch");
  const controlled = plotAt(porch.center);
  const access = evaluatePlotMiningAccess(state, controlled);
  assert.equal(access.controlled, true);
  assert.equal(access.allowed, false);
  const restriction = getPlotRestriction(state, controlled);
  assert.equal(restriction.territoryId, "territory:scrap-porch");
  assert.equal(restriction.label, "Scrap Porch JURISDICTION");
  assert.deepEqual(restriction.detailLines, [
    "MINING RIGHTS REQUIRED",
    "CLEAR AT YARD EXCHANGE TRAVEL AUTHORITY",
  ]);
  assert.deepEqual(restriction.color, porch.color);
  assert.equal(isPlotRestrictedForPlayer(state, controlled), true);
});

test("a hub pass clears only the named colored jurisdiction", () => {
  const state = createGameState();
  grantPlayerTerritoryRights(state, {
    territoryId: "territory:scrap-porch",
    rights: [RIGHT_TYPES.TRANSIT, RIGHT_TYPES.DOCKING, RIGHT_TYPES.MINING, RIGHT_TYPES.TRADE],
    issuerId: "scrap-porch-authority",
    basisDocumentId: "territory-scrap-porch-work-pass",
  });
  assert.equal(getPlotRestriction(state, plotAt(getHubTerritory("scrap-porch").center)), null);
  assert.equal(getPlotRestriction(state, plotAt(getHubTerritory("blue-lantern").center)).territoryId, "territory:blue-lantern");
});

test("a source-limited active contract can clear its specific claimed plot", () => {
  const state = createGameState();
  state.contracts.records.run = { status: "active", terms: { sourceClaimIds: ["claim-special"] } };
  const controlled = plotAt(getHubTerritory("the-ledge").center, "plot-special", "claim-special");
  assert.equal(evaluatePlotMiningAccess(state, controlled).via, "contract");
  assert.equal(getPlotRestriction(state, controlled), null);
});

test("flight is open for now even inside an uncleared hub jurisdiction or retired zone", () => {
  const state = createGameState();
  const controlled = plotAt(getHubTerritory("coldwater-depot").center);
  const flight = evaluateFlightAccess(state, controlled);
  assert.equal(flight.allowed, true);
  assert.ok(["visitor-approach", "open-transit"].includes(flight.via));
  const restriction = getPlotRestriction(state, controlled);
  assert.equal(restriction.noFly, false);
  assert.equal(restriction.noMine, true);
});

test("each hub restriction uses that hub's stable distinct color", () => {
  const state = createGameState();
  const ids = ["yard-exchange", "scrap-porch", "the-ledge", "blue-lantern", "morrow-shoal", "kiln-crossing", "ore-station-one", "coldwater-depot", "deep-research"];
  const colors = ids.map((id) => getPlotRestriction(state, plotAt(getHubTerritory(id).center)).color.join(","));
  assert.equal(new Set(colors).size, ids.length);
});

test("humanizeAuthorityId remains available for historical paperwork", () => {
  assert.equal(humanizeAuthorityId("rook-industries"), "Rook Industries");
});
