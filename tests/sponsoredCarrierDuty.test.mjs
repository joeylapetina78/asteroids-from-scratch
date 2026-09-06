import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSponsoredHomeDispatch,
  calculateSponsoredCapitalRepayment,
  freightServesSponsoredHome,
  recordSponsoredHomeArrival,
  sponsoredHomeDutyDue,
  sponsorFreightRequiresService,
  sponsoredServicePriority,
  usedHaulerTransferPrice,
} from "../src/systems/logistics.js";

test("sponsor capital is repaid only from cash beyond commitments, maintenance, and operating runway", () => {
  const repayment = calculateSponsoredCapitalRepayment({
    balance: 20_000, committed: 2_000, minimumOperatingCash: 1_800,
    maintenanceEscrowTarget: 3_000, recentOperatingExpense: 4_200,
    lienOutstanding: 11_000,
  });
  assert.equal(repayment.protectedCash, 8_000);
  assert.equal(repayment.distributableSurplus, 12_000);
  assert.equal(repayment.payment, 4_000);
});

test("a carrier with no genuine surplus keeps every credit for service", () => {
  assert.equal(calculateSponsoredCapitalRepayment({
    balance: 4_700, minimumOperatingCash: 1_800,
    maintenanceEscrowTarget: 3_000, lienOutstanding: 11_000,
  }).payment, 0);
});

test("capital repayment stops exactly at the remaining lien", () => {
  assert.equal(calculateSponsoredCapitalRepayment({
    balance: 50_000, minimumOperatingCash: 1_800,
    maintenanceEscrowTarget: 3_000, lienOutstanding: 725,
  }).payment, 725);
});

test("an unrelated auction winner cannot mask sponsor freight blocked only by maintenance", () => {
  const candidates = [
    { template: { originSiteId: "morrow-shoal", destinationSiteId: "blue-lantern" }, plan: { eligible: false, reason: "maintenance-policy" } },
    { template: { originSiteId: "yard-exchange", destinationSiteId: "scrap-porch" }, plan: { eligible: true, reason: null } },
  ];
  assert.equal(sponsorFreightRequiresService(carrier, candidates), true);
  assert.equal(sponsorFreightRequiresService(carrier, candidates.slice(1)), false,
    "ordinary regional work does not manufacture a sponsor maintenance obligation");
});

const carrier = {
  sponsoredByInstitutionId: "blue-lantern",
  homeSiteId: "blue-lantern",
  serviceCharter: { homeCallAfterMarketStops: 4, homeCallAfterCompletedJobs: 2 },
};

function hauler() {
  return { homeDuty: { lastHomeDockedAt: 0, marketStopsAway: 0, completedJobsAway: 0, required: false } };
}

test("a sponsored carrier owes a home call after four outside market stops", () => {
  const ship = hauler();
  for (let index = 0; index < 3; index += 1) {
    assert.equal(recordSponsoredHomeArrival(ship, carrier, "yard-exchange", index, { marketStop: true }).due, false);
  }
  assert.equal(recordSponsoredHomeArrival(ship, carrier, "the-ledge", 4, { marketStop: true }).due, true);
  assert.equal(sponsoredHomeDutyDue(ship, carrier), true);
});

test("sponsored service becomes more compelling as a home need ages without becoming compulsory", () => {
  const recent = sponsoredServicePriority(carrier, {
    payment: 1000, createdAt: 0, originSiteId: "yard-exchange", destinationSiteId: "blue-lantern",
  }, 5 * 60_000, { urgencyBias: 0.5 });
  const old = sponsoredServicePriority(carrier, {
    payment: 1000, createdAt: 0, originSiteId: "yard-exchange", destinationSiteId: "blue-lantern",
  }, 30 * 60_000, { urgencyBias: 0.5, dutyDue: true });
  assert.ok(old.score > recent.score);
  assert.equal(old.direction, "inbound");
  assert.ok(Number.isFinite(old.score), "the preference bends ranking rather than forcing eligibility");
});

test("a used concession is materially cheaper than replacement and condition still matters", () => {
  const healthy = usedHaulerTransferPrice({ replacementCost: 21_000, wear: 0.5 });
  const tired = usedHaulerTransferPrice({ replacementCost: 21_000, wear: 5 });
  assert.ok(healthy < 21_000, "buying used is a real alternative to commissioning");
  assert.ok(healthy > tired, "the buyer prices the inherited service burden");
  assert.ok(tired > 0, "a worn but functioning concession still has value");
});

test("two outside freight jobs create duty and a physical home docking clears it", () => {
  const ship = hauler();
  recordSponsoredHomeArrival(ship, carrier, "scrap-porch", 1, { completedJob: true });
  recordSponsoredHomeArrival(ship, carrier, "the-ledge", 2, { completedJob: true });
  assert.equal(sponsoredHomeDutyDue(ship, carrier), true);

  const result = recordSponsoredHomeArrival(ship, carrier, "blue-lantern", 3);
  assert.equal(result.returnedHome, true);
  assert.equal(sponsoredHomeDutyDue(ship, carrier), false);
  assert.deepEqual(ship.homeDuty, { lastHomeDockedAt: 3, marketStopsAway: 0, completedJobsAway: 0, required: false });
});

test("the concession recognizes both imports and exports as home service", () => {
  assert.equal(freightServesSponsoredHome(carrier, { originSiteId: "yard-exchange", destinationSiteId: "blue-lantern" }), true);
  assert.equal(freightServesSponsoredHome(carrier, { originSiteId: "blue-lantern", destinationSiteId: "scrap-porch" }), true);
  assert.equal(freightServesSponsoredHome(carrier, { originSiteId: "yard-exchange", destinationSiteId: "scrap-porch" }), false);
});

test("a sponsored carrier receives its hub's live needs and ready freight without a market stop", () => {
  const orders = [
    { id: "inbound", status: "accepted", buyerInstitutionId: "blue-lantern", supplierInstitutionId: "yard", family: "metal", units: 4 },
    { id: "outbound", status: "ready", buyerInstitutionId: "yard", supplierInstitutionId: "blue-lantern", family: "ice", units: 2 },
    { id: "unrelated", status: "ready", buyerInstitutionId: "yard", supplierInstitutionId: "ledge", units: 9 },
    { id: "finished", status: "delivered", buyerInstitutionId: "blue-lantern", supplierInstitutionId: "yard", units: 3 },
  ];
  const offers = [
    { id: "offer-in", originSiteId: "yard-exchange", destinationSiteId: "blue-lantern" },
    { id: "offer-out", originSiteId: "blue-lantern", destinationSiteId: "yard-exchange" },
    { id: "offer-other", originSiteId: "yard-exchange", destinationSiteId: "the-ledge" },
  ];

  const dispatch = buildSponsoredHomeDispatch(carrier, orders, offers, 1234);
  assert.equal(dispatch.updatedAt, 1234);
  assert.deepEqual(dispatch.needs.map((need) => need.orderId), ["inbound", "outbound"]);
  assert.deepEqual(dispatch.offerIds, ["offer-in", "offer-out"]);
  assert.deepEqual(dispatch.inboundOfferIds, ["offer-in"]);
  assert.deepEqual(dispatch.outboundOfferIds, ["offer-out"]);
});
