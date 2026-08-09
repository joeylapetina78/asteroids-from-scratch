import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluatePlotAccess,
  evaluatePlotMiningAccess,
  getContractGrantedClaimIds,
  getPlotRestriction,
  humanizeAuthorityId,
  isPlotRestrictedForPlayer,
  miningRequiresRight,
} from "../src/systems/operatingRights.js";

// A pilot at the tutorial start: mines only under Rook's sponsoring permit, and
// the provisional license authorizes flight only in the starter zones.
function rookPilotState(contracts = {}) {
  return {
    legal: {
      operatingRights: { mining: { authorityIds: ["rook-industries"] } },
      pilotLicense: { authorizedZones: ["starter-drift", "open-space", "red-teeth"] },
    },
    contracts: { records: contracts },
  };
}

function plot(id, miningRight, sourceClaimId = null) {
  return { id, sourceClaimId, rights: { mining: miningRight } };
}

test("open or unassigned ground needs no right and is never restricted", () => {
  const state = rookPilotState();
  const openPlot = plot("plot-hex-1-1", { status: "unassigned", authorityId: "frontier-claims-office" });
  assert.equal(miningRequiresRight(openPlot.rights.mining), false);
  const access = evaluatePlotMiningAccess(state, openPlot);
  assert.deepEqual(access, { controlled: false, allowed: true });
  assert.equal(isPlotRestrictedForPlayer(state, openPlot), false);
});

test("controlled ground under an authority the pilot holds is allowed", () => {
  const state = rookPilotState();
  const homePlot = plot("plot-hex-2-2", { status: "charter-required", authorityId: "rook-industries" });
  assert.equal(miningRequiresRight(homePlot.rights.mining), true);
  const access = evaluatePlotMiningAccess(state, homePlot);
  assert.equal(access.controlled, true);
  assert.equal(access.allowed, true);
  assert.equal(access.via, "held-right");
  assert.equal(isPlotRestrictedForPlayer(state, homePlot), false);
});

test("controlled ground under a foreign authority is restricted", () => {
  const state = rookPilotState();
  const foreignPlot = plot("plot-hex-9-9", { status: "lease-required", authorityId: "copperline-prospectors" });
  const access = evaluatePlotMiningAccess(state, foreignPlot);
  assert.equal(access.controlled, true);
  assert.equal(access.allowed, false);
  assert.equal(access.authorityId, "copperline-prospectors");
  assert.equal(isPlotRestrictedForPlayer(state, foreignPlot), true);
});

test("an active source-limited contract grants its specific claims", () => {
  const foreignPlot = plot("plot-hex-9-9", { status: "claim-required", authorityId: "copperline-prospectors" }, "claim-9-9");
  const withJob = rookPilotState({
    "ore-run": { status: "active", terms: { sourceClaimIds: ["claim-9-9"] } },
  });
  assert.equal(getContractGrantedClaimIds(withJob).has("claim-9-9"), true);
  const access = evaluatePlotMiningAccess(withJob, foreignPlot);
  assert.equal(access.allowed, true);
  assert.equal(access.via, "contract");
  assert.equal(isPlotRestrictedForPlayer(withJob, foreignPlot), false);

  // Same plot, but the contract is no longer active: back to off-limits.
  const doneJob = rookPilotState({
    "ore-run": { status: "paid", terms: { sourceClaimIds: ["claim-9-9"] } },
  });
  assert.equal(isPlotRestrictedForPlayer(doneJob, foreignPlot), true);
});

// A plot sitting inside a named zone at a given influence, for flight checks.
function zonePlot(id, { zoneId, zoneName = zoneId, influence = 0.9, mining = null }) {
  return {
    id, sourceClaimId: null,
    strongestZoneId: zoneId, strongestZoneName: zoneName, zoneInfluence: influence,
    rights: mining ? { mining } : {},
  };
}

test("flying into a zone the license does not authorize is a no-fly restriction", () => {
  const state = rookPilotState();
  const oreRidge = zonePlot("plot-hex-5-5", { zoneId: "ore-ridge", zoneName: "Ore Ridge" });
  const fly = evaluatePlotAccess(state, oreRidge, "fly");
  assert.equal(fly.controlled, true);
  assert.equal(fly.allowed, false);
  const restriction = getPlotRestriction(state, oreRidge);
  assert.equal(restriction.noFly, true);
  assert.equal(restriction.label, "NO FLIGHT CLEARANCE");
  assert.equal(restriction.sublabel, "Ore Ridge");
  assert.equal(isPlotRestrictedForPlayer(state, oreRidge), true);
});

test("authorized zones, open space, and weak zone fringes are all clear to fly", () => {
  const state = rookPilotState();
  assert.equal(getPlotRestriction(state, zonePlot("a", { zoneId: "red-teeth" })), null, "authorized zone");
  assert.equal(getPlotRestriction(state, zonePlot("b", { zoneId: "open-space" })), null, "open space");
  // An unauthorized zone below the entry threshold is not 'entering' it — no
  // violation would be logged, so no red.
  assert.equal(getPlotRestriction(state, zonePlot("c", { zoneId: "ore-ridge", influence: 0.3 })), null, "weak fringe");
});

test("a mining contract does not confer flight clearance", () => {
  // Ore Ridge charter ground: the job legalizes the WORK, but entering the zone
  // still violates the license.
  const oreRidge = zonePlot("plot-hex-5-5", {
    zoneId: "ore-ridge", zoneName: "Ore Ridge",
    mining: { status: "claim-required", authorityId: "copperline-prospectors" },
  });
  oreRidge.sourceClaimId = "claim-5-5";
  const withJob = rookPilotState({ "ore-run": { status: "active", terms: { sourceClaimIds: ["claim-5-5"] } } });
  assert.equal(evaluatePlotAccess(withJob, oreRidge, "mine").via, "contract");
  assert.equal(evaluatePlotAccess(withJob, oreRidge, "fly").allowed, false);
  assert.equal(getPlotRestriction(withJob, oreRidge).label, "NO FLIGHT CLEARANCE");
});

test("a mining-only restriction, in an authorized zone, reads as fly-through-but-do-not-dig", () => {
  const state = rookPilotState();
  const leaseGround = zonePlot("plot-hex-9-9", {
    zoneId: "red-teeth", // authorized to fly...
    mining: { status: "lease-required", authorityId: "copperline-prospectors" }, // ...but not to dig
  });
  const restriction = getPlotRestriction(state, leaseGround);
  assert.equal(restriction.noMine, true);
  assert.equal(restriction.noFly, false);
  assert.equal(restriction.label, "NO MINING RIGHTS");
  assert.equal(restriction.sublabel, "Copperline Prospectors");
});

test("humanizeAuthorityId turns a slug into a label", () => {
  assert.equal(humanizeAuthorityId("copperline-prospectors"), "Copperline Prospectors");
  assert.equal(humanizeAuthorityId("rook-industries"), "Rook Industries");
  assert.equal(humanizeAuthorityId(null), "an authority");
});
