import assert from "node:assert/strict";
import test from "node:test";
import { chapterOneContracts } from "../src/content/contracts/chapterOneContracts.js";
import { chapterOneInterviewMission } from "../src/content/missions/chapterOneInterview.js";
import { chapterOneNewShipMission } from "../src/content/missions/chapterOneNewShip.js";
import { chapterOneRedWorkMission } from "../src/content/missions/chapterOneRedWork.js";
import { hubServiceDefinitions } from "../src/content/hubs/yardExchangeServices.js";

const beat = (mission, id) => mission.beats.find((candidate) => candidate.id === id);
const contract = (id) => chapterOneContracts.find((candidate) => candidate.id === id);

test("the last line before the viewport waits for a click", () => {
  const placed = beat(chapterOneInterviewMission, "hull-display-placed");
  assert.equal(placed.onEnter[0].acknowledgement.label, "Continue");
  assert.equal(placed.onAcknowledge.at(-1).stepId, "reveal-viewport");
});

test("the Authority, loan, and sale are paced as separate beats", () => {
  // The miner is armed and safed before the pitch, so the player has found the
  // switch and the charge readout before they own the thing.
  assert.equal(beat(chapterOneNewShipMission, "the-pitch").transitions[0].nextStepId, "arm-the-miner");
  assert.deepEqual(beat(chapterOneNewShipMission, "arm-the-miner").transitions[0].payloadEquals, { armed: true });
  assert.equal(beat(chapterOneNewShipMission, "arm-the-miner").transitions[0].nextStepId, "rack-the-miner");
  // "Put it away" is racking the display; safing the switch counts too.
  const rack = beat(chapterOneNewShipMission, "rack-the-miner").transitions;
  assert.ok(rack.some((t) => t.eventType === "cockpit.moduleToggled" && t.payloadEquals.componentId === "miner" && t.payloadEquals.expanded === false));
  assert.ok(rack.some((t) => t.eventType === "miner.armedChanged" && t.payloadEquals.armed === false));
  assert.ok(rack.every((t) => t.nextStepId === "pitch-the-deal"));
  // The drive is tuned on the pitch, through the service seam, not replaced.
  assert.ok(beat(chapterOneNewShipMission, "the-pitch").onEnter.some((action) => action.type === "serviceComponent" && action.componentId === "engine"));
  // Vey's window greets first; Rook speaks once the player has closed her line.
  const toAuthority = beat(chapterOneNewShipMission, "to-the-authority").transitions;
  assert.equal(toAuthority[0].eventType, "hub.serviceOpened");
  assert.equal(toAuthority[0].nextStepId, undefined);
  assert.equal(toAuthority[1].eventType, "comms.lineClosed");
  assert.deepEqual(toAuthority[1].payloadEquals, { speaker: "Commissioner Vey" });
  assert.equal(toAuthority[1].nextStepId, "introduce-vey");
  assert.equal(beat(chapterOneNewShipMission, "introduce-vey").onAcknowledge.at(-1).stepId, "the-deal");
  assert.equal(beat(chapterOneNewShipMission, "the-deal").onAcknowledge.at(-1).stepId, "name-the-fee");
  assert.equal(beat(chapterOneNewShipMission, "name-the-fee").onAcknowledge.at(-1).stepId, "vey-names-the-fee");
  assert.equal(beat(chapterOneNewShipMission, "vey-names-the-fee").onAcknowledge.at(-1).stepId, "mako-aside");
  assert.equal(beat(chapterOneNewShipMission, "mako-aside").onAcknowledge.at(-1).stepId, "introduce-mako");
  assert.equal(beat(chapterOneNewShipMission, "introduce-mako").onAcknowledge.at(-1).stepId, "borrow-from-mako");
  assert.equal(beat(chapterOneNewShipMission, "borrow-from-mako").transitions[0].payloadEquals.contractId, "mako-starter-ship-loan");
  assert.equal(beat(chapterOneNewShipMission, "borrow-from-mako").transitions[0].nextStepId, "return-to-vey");
  assert.equal(beat(chapterOneNewShipMission, "return-to-vey").onAcknowledge.at(-1).stepId, "buy-from-authority");
  assert.equal(beat(chapterOneNewShipMission, "buy-from-authority").transitions[0].payloadEquals.contractId, "authority-impound-hull-sale");
  for (const stepId of ["borrow-from-mako", "buy-from-authority"]) {
    const actions = beat(chapterOneNewShipMission, stepId).transitions[0].actions;
    assert.ok(actions.some((action) => action.type === "clearMessage"), `${stepId} dismisses its speaker on signing`);
    assert.ok(actions.some((action) => action.type === "filePaperwork" && action.componentId === "contract"), `${stepId} files the signed paper`);
  }
});

test("Rook introduces each party before that party speaks", () => {
  assert.match(beat(chapterOneNewShipMission, "introduce-vey").onEnter[0].text, /Commissioner Vey/);
  assert.equal(beat(chapterOneNewShipMission, "introduce-vey").onEnter[0].speaker, "Rook");
  assert.equal(beat(chapterOneNewShipMission, "the-deal").onEnter[0].speaker, "Commissioner Vey");
  assert.match(beat(chapterOneNewShipMission, "introduce-mako").onEnter[0].text, /Sable Ledger/);
  assert.equal(beat(chapterOneNewShipMission, "introduce-mako").onEnter[0].speaker, "Rook");
  assert.equal(beat(chapterOneNewShipMission, "borrow-from-mako").onEnter[1].speaker, "Mr. Mako");
  assert.match(beat(chapterOneNewShipMission, "introduce-mako").onEnter[0].text, /\{pilotFirstName\}/);
});

test("Modworks opens with the ship, and Rook counts the delivery pay the player still has", () => {
  // 250 on signing + 750 on delivery survive the sale (the loan covered the
  // hull exactly), which is two of Nara's three 400-credit parts. Rook does
  // not tell a player with a thousand credits that they are broke.
  const firstJob = beat(chapterOneNewShipMission, "first-job");
  assert.ok(firstJob.onEnter.some((action) => action.type === "unlockHubService" && action.serviceId === "yard-modworks"));
  const line = firstJob.onEnter.find((action) => action.type === "say").text;
  assert.doesNotMatch(line, /can't afford/i);
  assert.match(line, /covers two/);
});

test("Mako lends for Sable Ledger and the Authority sells on separate paper", () => {
  assert.equal(contract("mako-starter-ship-loan").issuer, "Sable Ledger");
  assert.equal(contract("authority-impound-hull-sale").issuer, "Yard Exchange Authority");
  assert.equal(contract("authority-impound-hull-sale").terms.expeditedDispositionFee, 1500);
});

test("Rook's sponsored pass grants the complete Yard Exchange work bundle", () => {
  const pass = contract("rook-sponsored-yard-exchange-work-pass");
  assert.equal(pass.terms.cost, 0);
  assert.deepEqual(pass.terms.grantTerritoryRights[0], {
    territoryId: "territory:yard-exchange",
    rights: ["transit", "docking", "mining", "trade"],
  });
  assert.equal(beat(chapterOneNewShipMission, "rook-work-pass").onAcknowledge.at(-1).stepId, "yard-open");
  assert.match(beat(chapterOneNewShipMission, "yard-open").onEnter[0].text, /blue wash drop away/i);
  assert.match(beat(chapterOneNewShipMission, "yard-open").onEnter[0].text, /mine it/i);
  assert.equal(beat(chapterOneNewShipMission, "yard-open").onAcknowledge.at(-1).stepId, "first-job");
});

test("Rook's first Modworks shelf is the affordable three-module starter set", () => {
  const service = hubServiceDefinitions["yard-exchange"].find((candidate) => candidate.id === "yard-modworks");
  const starter = service.componentOffers.filter((offer) => offer.stockGroup === "starter");
  assert.deepEqual(starter.map((offer) => offer.componentId), ["collector", "scanner", "processor"]);
  assert.equal(starter.reduce((total, offer) => total + offer.price, 0), 1200);
});

test("Rook welcomes the player after they enter Rook Industries", () => {
  const line = beat(chapterOneRedWorkMission, "offer-red-contract").onEnter[0].text;
  assert.match(line, /^Welcome to Rook Industries\./);
  assert.doesNotMatch(line, /come see me/i);
});
