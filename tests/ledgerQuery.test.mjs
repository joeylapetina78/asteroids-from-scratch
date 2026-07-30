// The Ledger as a searchable historical record: reference extraction, combinable
// filters, retention/visibility surfacing, and event sequences built ONLY from
// explicit references or safe same-record structural links.

import assert from "node:assert/strict";
import test from "node:test";
import {
  collectFilterOptions,
  describeEvent,
  describeEventRetention,
  extractEventAmounts,
  extractEventCauses,
  extractEventReferences,
  filterEvents,
  getEventVisibility,
  hasCausalLinks,
  sortEvents,
  summarizeEvent,
} from "../src/systems/ledgerQuery.js";
import { RETENTION_CLASS } from "../src/systems/eventRetention.js";

// A realistic slice mirroring payload shapes observed live: a repair sequence,
// a mining decision, a freight reprice, and a payment.
function buildEvents() {
  let id = 0;
  const at = 1_000_000;
  const make = (type, payload, message, offsetSeconds = 0, visible = true) => ({
    id: ++id, type, time: at + offsetSeconds * 1000, message, visible, payload,
  });

  return [
    make("mining.maintenanceRequired", {
      institutionId: "miner:cinder-contracting", institutionName: "Cinder Contracting",
      shipInstitutionId: "worker:cinder-one", shipName: "Cinder One", issueType: "tractor-field-instability", wear: 1,
    }, "Cinder One developed tractor field instability", 0),

    make("sprc.repairCreated", {
      repairOrderId: "SPRC-RPR-0002", subjectId: "worker:cinder-one", shipName: "Cinder One",
      craftClass: "mining-craft", condition: "tractor-field-instability",
    }, "SPRC opened repair SPRC-RPR-0002", 5),

    make("institution.servicePriced", {
      institutionId: "sprc", actorName: "Sal", repairOrderId: "SPRC-RPR-0002",
      subjectId: "worker:cinder-one", servicePrice: 300, referencePrice: 220, reasons: ["materials 70 (live cost basis)"],
    }, "Sal quotes 300 cr", 6),

    make("institution.action", {
      institutionId: "sprc", institutionName: "SPRC", actorName: "Sal", actionType: "need.identified",
      needId: "SPRC-NEED-0003", repairOrderId: "SPRC-RPR-0002", itemId: "copper", missingAmount: 1,
    }, "Sal identified a copper shortage", 7, false),

    make("contract.offered", {
      contractId: "contract:SPRC-PO-0002", contractTitle: "SPRC Control Conductor", sourceNeedId: "SPRC-NEED-0003",
    }, "SPRC offers a copper purchase order", 8),

    make("contract.paid", {
      contractId: "contract:SPRC-PO-0002", creditsPaid: 411, payerAccountId: "account:sprc-operating",
      sourceNeedId: "SPRC-NEED-0003",
    }, "SPRC paid 411 cr for copper", 40),

    make("sprc.repairCompleted", {
      repairOrderId: "SPRC-RPR-0002", subjectId: "worker:cinder-one", shipName: "Cinder One",
      payerInstitutionId: "miner:cinder-contracting", serviceRevenue: 300,
    }, "Repair SPRC-RPR-0002 completed", 70),

    make("institution.jobValued", {
      institutionId: "miner:cinder-contracting", shipInstitutionId: "worker:cinder-two", shipName: "Cinder Two",
      chosenOrderId: "SPRC-PO-0001", netValue: 269, reasons: ["pays 300 for 6 units"],
    }, "Cinder Two valued available jobs", 75, false),

    make("institution.freightRepriced", {
      institutionId: "yard-exchange", templateId: "standing-water-scrap-yard",
      previousPayment: 90, payment: 140, carrierCost: 26, siteId: "scrap-porch", siteName: "Scrap Porch",
    }, "Yard Exchange raises water ice freight to 140 cr", 90),

    make("player.thrust", { x: 10, y: 20 }, "thrust", 95),
  ];
}

// ── Reference extraction ───────────────────────────────────────────────────

test("references are extracted by kind with human names", () => {
  const [maintenance] = buildEvents();
  const references = extractEventReferences(maintenance);
  assert.deepEqual(references.actor, [{ id: "worker:cinder-one", name: "Cinder One", field: "shipInstitutionId" }]);
  assert.deepEqual(references.institution, [{ id: "miner:cinder-contracting", name: "Cinder Contracting", field: "institutionId" }]);
});

test("contracts, services, locations, and assets are separated", () => {
  const events = buildEvents();
  const repair = events.find((event) => event.type === "sprc.repairCreated");
  assert.equal(extractEventReferences(repair).service[0].id, "SPRC-RPR-0002");

  const offered = events.find((event) => event.type === "contract.offered");
  assert.equal(extractEventReferences(offered).contract[0].id, "contract:SPRC-PO-0002");
  assert.equal(extractEventReferences(offered).contract[0].name, "SPRC Control Conductor");

  const reprice = events.find((event) => event.type === "institution.freightRepriced");
  assert.equal(extractEventReferences(reprice).location[0].name, "Scrap Porch");
});

test("amounts are surfaced for money and quantity fields", () => {
  const events = buildEvents();
  const priced = events.find((event) => event.type === "institution.servicePriced");
  assert.deepEqual(extractEventAmounts(priced), { servicePrice: 300, referencePrice: 220 });
  const reprice = events.find((event) => event.type === "institution.freightRepriced");
  const amounts = extractEventAmounts(reprice);
  assert.equal(amounts.payment, 140);
  assert.equal(amounts.previousPayment, 90);
  assert.equal(amounts.carrierCost, 26);
});

test("summaries prefer the ledger's own message", () => {
  const [maintenance] = buildEvents();
  assert.equal(summarizeEvent(maintenance), "Cinder One developed tractor field instability");
  assert.match(summarizeEvent({ type: "some.event", payload: { shipInstitutionId: "x", shipName: "Ship X" } }), /some\.event/);
});

// ── Retention + visibility ─────────────────────────────────────────────────

test("retention class and visibility are reported per event", () => {
  const events = buildEvents();
  assert.equal(describeEventRetention(events.find((event) => event.type === "player.thrust")), RETENTION_CLASS.EPHEMERAL);
  assert.equal(describeEventRetention(events.find((event) => event.type === "institution.jobValued")), RETENTION_CLASS.OPERATIONAL);
  assert.equal(describeEventRetention(events.find((event) => event.type === "contract.paid")), RETENTION_CLASS.DURABLE);
  assert.equal(getEventVisibility(events[0]), "public", "defaults to public until concealment exists");
});

test("an event may declare its own visibility state", () => {
  assert.equal(getEventVisibility({ type: "contract.paid", payload: { visibility: "falsified" } }), "falsified",
    "the shape does not assume every event is unquestionably true");
});

// ── Filters ────────────────────────────────────────────────────────────────

test("filters narrow by actor, institution, location, type, contract, and service", () => {
  const events = buildEvents();
  // Four events name the ship directly. Sal's need record references the repair
  // order but no actor field, so it is correctly not an actor match.
  assert.equal(filterEvents(events, { actorId: "worker:cinder-one" }).length, 4);
  assert.equal(filterEvents(events, { institutionId: "sprc" }).length, 2);
  assert.equal(filterEvents(events, { locationId: "scrap-porch" }).length, 1);
  assert.equal(filterEvents(events, { type: "contract.paid" }).length, 1);
  assert.equal(filterEvents(events, { contractId: "contract:SPRC-PO-0002" }).length, 2);
  assert.equal(filterEvents(events, { serviceId: "SPRC-RPR-0002" }).length, 4);
});

test("filters combine", () => {
  const events = buildEvents();
  const combined = filterEvents(events, { actorId: "worker:cinder-one", serviceId: "SPRC-RPR-0002", type: "institution.servicePriced" });
  assert.equal(combined.length, 1);
  assert.equal(combined[0].type, "institution.servicePriced");

  const impossible = filterEvents(events, { actorId: "worker:cinder-one", locationId: "scrap-porch" });
  assert.equal(impossible.length, 0, "combining unrelated filters correctly yields nothing");
});

test("retention, durable-only, and causal-only filters work", () => {
  const events = buildEvents();
  assert.equal(filterEvents(events, { retentionClass: RETENTION_CLASS.EPHEMERAL }).length, 1);
  const durable = filterEvents(events, { onlyDurable: true });
  assert.ok(durable.length >= 2);
  assert.ok(durable.every((event) => describeEventRetention(event) === RETENTION_CLASS.DURABLE));

  const causal = filterEvents(events, { onlyCausal: true });
  assert.ok(causal.length >= 2);
  assert.ok(causal.every(hasCausalLinks), "only events with explicit cause fields");
});

test("search matches type, summary, and payload; time range bounds results", () => {
  const events = buildEvents();
  assert.equal(filterEvents(events, { search: "tractor" }).length, 2, "the fault name appears in two payloads");
  assert.equal(filterEvents(events, { search: "SPRC-NEED-0003" }).length, 3, "payload contents are searchable");
  const late = filterEvents(events, { sinceMs: 1_000_000 + 60 * 1000 });
  assert.ok(late.every((event) => event.time >= 1_000_000 + 60 * 1000));
  assert.ok(late.length < events.length);
});

test("sorting flips between newest and oldest first", () => {
  const events = buildEvents();
  assert.equal(sortEvents(events, "newest")[0].id, events.length);
  assert.equal(sortEvents(events, "oldest")[0].id, 1);
});

test("filter options come from real records, not typed text", () => {
  const options = collectFilterOptions(buildEvents());
  assert.ok(options.actors.some((entry) => entry.id === "worker:cinder-one" && entry.name === "Cinder One"));
  assert.ok(options.institutions.some((entry) => entry.id === "sprc"));
  assert.ok(options.locations.some((entry) => entry.name === "Scrap Porch"));
  assert.ok(options.services.some((entry) => entry.id === "SPRC-RPR-0002"));
  assert.ok(options.types.some((entry) => entry.id === "contract.paid" && /\(1\)/.test(entry.name)));
});

// ── Sequences: explicit references and safe structural links only ──────────

test("explicit cause fields are read, and nothing else counts as causal", () => {
  const events = buildEvents();
  const offered = events.find((event) => event.type === "contract.offered");
  assert.deepEqual(extractEventCauses(offered), [{ field: "sourceNeedId", id: "SPRC-NEED-0003" }]);

  const maintenance = events[0];
  assert.equal(hasCausalLinks(maintenance), false, "adjacent in time is NOT a causal link");
});

test("caused-by resolves through the explicit reference to the earlier record", () => {
  const events = buildEvents();
  const offered = events.find((event) => event.type === "contract.offered");
  const described = describeEvent(events, offered);
  // The need was introduced by Sal's institution.action, which is the only
  // earlier event mentioning SPRC-NEED-0003.
  assert.ok(described.related.causedBy.some((entry) => entry.event.type === "institution.action"));
  assert.ok(described.related.causedBy.every((entry) => entry.event.id < offered.id), "causes precede the event");
  assert.equal(described.related.causedBy[0].via, "sourceNeedId", "the linking field is named");
});

test("a repair sequence is reconstructed from the shared order id", () => {
  const events = buildEvents();
  const priced = events.find((event) => event.type === "institution.servicePriced");
  const described = describeEvent(events, priced);
  const followedTypes = described.related.followed.map((entry) => entry.event.type);
  assert.ok(followedTypes.includes("sprc.repairCompleted"), "later steps on the same repair order are found");
  const precededTypes = described.related.preceded.map((entry) => entry.event.type);
  assert.ok(precededTypes.includes("sprc.repairCreated"), "and earlier steps too");
  assert.ok(described.related.followed.every((entry) => entry.via === "same-record"),
    "labelled as a same-record sequence, not proven causation");
});

test("same-actor grouping links a ship's history without claiming causation", () => {
  const events = buildEvents();
  const completed = events.find((event) => event.type === "sprc.repairCompleted");
  const described = describeEvent(events, completed);
  assert.ok(described.related.sameActor.length > 0);
  assert.ok(described.related.sameActor.every((entry) => entry.via === "co-reference"));
});

test("an unrelated event reports no sequence links", () => {
  const events = buildEvents();
  const thrust = events.find((event) => event.type === "player.thrust");
  const described = describeEvent(events, thrust);
  const total = Object.values(described.related).reduce((sum, list) => sum + list.length, 0);
  assert.equal(total, 0, "no references means no invented relationships");
});

test("describeEvent assembles everything the detail view needs", () => {
  const events = buildEvents();
  const completed = events.find((event) => event.type === "sprc.repairCompleted");
  const described = describeEvent(events, completed);
  for (const key of ["id", "type", "time", "summary", "retentionClass", "visibility", "references", "amounts", "causes", "related", "payload"]) {
    assert.ok(key in described, `missing ${key}`);
  }
  assert.equal(described.retentionClass, RETENTION_CLASS.DURABLE);
  assert.equal(described.amounts.serviceRevenue, 300);
  assert.equal(described.payload.repairOrderId, "SPRC-RPR-0002", "raw payload is preserved for the developer section");
});
