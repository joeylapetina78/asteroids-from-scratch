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

// A pilot at the tutorial start: mines only under Rook's sponsoring permit, flies
// only on the Yard Exchange registration.
function rookPilotState(contracts = {}) {
  return {
    legal: { operatingRights: {
      mining: { authorityIds: ["rook-industries"] },
      transit: { authorityIds: ["yard-exchange-authority"] },
    } },
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

function rightsPlot(id, rights, sourceClaimId = null) {
  return { id, sourceClaimId, rights };
}

test("controlled transit under a foreign authority is a no-fly restriction", () => {
  const state = rookPilotState();
  const patrolled = rightsPlot("plot-hex-5-5", {
    mining: { status: "permit-required", authorityId: "coldreach-patrol-office" },
    transit: { status: "permit-required", authorityId: "coldreach-patrol-office" },
  });
  const fly = evaluatePlotAccess(state, patrolled, "fly");
  assert.equal(fly.controlled, true);
  assert.equal(fly.allowed, false);
  // Restricted for both, but flight dominates: you may not even be here.
  const restriction = getPlotRestriction(state, patrolled);
  assert.equal(restriction.noFly, true);
  assert.equal(restriction.noMine, true);
  assert.equal(restriction.label, "NO FLIGHT RIGHTS");
  assert.equal(restriction.authorityId, "coldreach-patrol-office");
});

test("transit the pilot holds clears a controlled region", () => {
  const state = rookPilotState();
  const homeCorridor = rightsPlot("plot-hex-1-1", {
    transit: { status: "permit-required", authorityId: "yard-exchange-authority" },
  });
  assert.equal(evaluatePlotAccess(state, homeCorridor, "fly").allowed, true);
  assert.equal(getPlotRestriction(state, homeCorridor), null);
});

test("a mining contract does not confer flight clearance", () => {
  const noFlyPlot = rightsPlot("plot-hex-5-5", {
    mining: { status: "claim-required", authorityId: "coldreach-patrol-office" },
    transit: { status: "permit-required", authorityId: "coldreach-patrol-office" },
  }, "claim-5-5");
  const withMiningJob = rookPilotState({
    "ore-run": { status: "active", terms: { sourceClaimIds: ["claim-5-5"] } },
  });
  // The job grants the claim for WORK, but transit stays off-limits.
  assert.equal(evaluatePlotAccess(withMiningJob, noFlyPlot, "mine").via, "contract");
  assert.equal(evaluatePlotAccess(withMiningJob, noFlyPlot, "fly").allowed, false);
  assert.equal(getPlotRestriction(withMiningJob, noFlyPlot).label, "NO FLIGHT RIGHTS");
});

test("mining-only restriction reads as fly-through-but-do-not-dig", () => {
  const state = rookPilotState();
  const leaseGround = rightsPlot("plot-hex-9-9", {
    mining: { status: "lease-required", authorityId: "copperline-prospectors" },
    transit: { status: "open", authorityId: "yard-exchange-authority" },
  });
  const restriction = getPlotRestriction(state, leaseGround);
  assert.equal(restriction.noMine, true);
  assert.equal(restriction.noFly, false);
  assert.equal(restriction.label, "NO MINING RIGHTS");
});

test("humanizeAuthorityId turns a slug into a label", () => {
  assert.equal(humanizeAuthorityId("copperline-prospectors"), "Copperline Prospectors");
  assert.equal(humanizeAuthorityId("rook-industries"), "Rook Industries");
  assert.equal(humanizeAuthorityId(null), "an authority");
});
