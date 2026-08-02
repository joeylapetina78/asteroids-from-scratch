import assert from "node:assert/strict";
import test from "node:test";
import { rankCarrierBids, selectCarrierBid } from "../src/systems/carrierSelection.js";

const bid = (overrides = {}) => ({ offerId: "freight-1", carrierId: "carrier:a", shipId: "ship:a", eligible: true, committed: false, offeredPrice: 200, askingPrice: 120, ...overrides });

test("carrier winner is independent of registration order", () => {
  const a = bid();
  const b = bid({ carrierId: "carrier:b", shipId: "ship:b" });
  assert.equal(selectCarrierBid([a, b]).shipId, "ship:a");
  assert.equal(selectCarrierBid([b, a]).shipId, "ship:a");
});

test("price, repositioning, and wear costs change the winning carrier", () => {
  const localHealthy = bid({ carrierId: "local", shipId: "local", askingPrice: 105, repositionDistance: 0, currentWear: 0.2 });
  const remoteWorn = bid({ carrierId: "remote", shipId: "remote", askingPrice: 155, repositionDistance: 20, currentWear: 0.8 });
  assert.equal(selectCarrierBid([remoteWorn, localHealthy]).shipId, "local");
  const repricedRemote = { ...remoteWorn, askingPrice: 90 };
  assert.equal(selectCarrierBid([localHealthy, repricedRemote]).shipId, "remote");
});

test("existing commitments remove a carrier from contention", () => {
  const busy = bid({ carrierId: "busy", shipId: "busy", askingPrice: 50, committed: true });
  const free = bid({ carrierId: "free", shipId: "free", askingPrice: 150 });
  assert.equal(selectCarrierBid([busy, free]).shipId, "free");
});

test("relationships can break a close economic contest but not a catastrophic price gap", () => {
  const preferred = bid({ carrierId: "preferred", shipId: "preferred", askingPrice: 124, relationship: { trust: 1, reliability: 1, gratitude: 1 } });
  const stranger = bid({ carrierId: "stranger", shipId: "stranger", askingPrice: 120 });
  assert.equal(selectCarrierBid([stranger, preferred]).shipId, "preferred");
  assert.equal(selectCarrierBid([{ ...stranger, askingPrice: 80 }, preferred]).shipId, "stranger");
});

test("ranked diagnostics retain losing bids and their scores", () => {
  const ranked = rankCarrierBids([bid({ carrierId: "b", shipId: "b", askingPrice: 140 }), bid({ carrierId: "a", shipId: "a", askingPrice: 110 })]);
  assert.deepEqual(ranked.map((entry) => entry.shipId), ["a", "b"]);
  assert.ok(ranked.every((entry) => Number.isFinite(entry.selectionScore)));
});
