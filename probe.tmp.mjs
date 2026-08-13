import { createGameState } from "./src/state/gameState.js";
import { createInitialLogisticsState } from "./src/systems/logistics.js";
import { createHubProcurementOperation, listOrders, PROCUREMENT_STATUS } from "./src/systems/hubProcurement.js";

const state = createGameState();
state.logistics = createInitialLogisticsState(1_000);
Object.values(state.logistics.institutions)
  .filter((i) => i.archetypeId === "settlement")
  .forEach((i) => { i.accounts.operating.balance = 60_000; });
const procurement = createHubProcurementOperation({ state, now: () => 1_000 });

// What does the-ledge actually sell, and what is its floor?
console.log("industrial orders supplied by the-ledge from the natural world:");
listOrders(state, { supplierInstitutionId: "the-ledge" }).forEach((o) =>
  console.log("  ", o.id, o.family, o.resourceId, "units", o.units, "price/u", Math.round(o.pricePerUnit), "floor", Math.round(o.supplierFloor ?? 0), o.status, o.declinedReason ?? ""));

// Probe the floor directly at several price points.
for (const price of [100, 200, 400, 600, 900, 1200]) {
  state.hubProcurement.orders = {};
  state.hubProcurement.orders["P"] = {
    id: "P", buyerInstitutionId: "yard-exchange", supplierInstitutionId: "the-ledge",
    family: "industrial", resourceId: "aluminum", units: 6, deliveredUnits: 0,
    pricePerUnit: price, committedPayment: 6 * price, originalPricePerUnit: price,
    status: PROCUREMENT_STATUS.OFFERED, createdAt: 1_000, supplierCandidates: [],
  };
  procurement.update();
  const o = state.hubProcurement.orders["P"];
  console.log(`price/u ${String(price).padStart(5)} total ${6 * price} -> ${o.status} ${o.declinedReason ?? ""} floor ${Math.round(o.supplierFloor ?? 0)}`);
}
