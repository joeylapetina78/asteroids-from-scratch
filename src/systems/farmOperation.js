import { INSTITUTION_ARCHETYPES } from "../content/institutions/institutionArchetypes.js?v=fresh-20260815-0037-8f1e3cc";
import { createFarmInstitutionInstance, createTaviInstitutionInstance } from "../content/institutions/institutionInstances.js?v=fresh-20260815-0037-8f1e3cc";
import { createResponseRecord, deriveInventoryNeeds, evaluateAffordability, generateCapabilityResponses, reconcileNeeds, resolveInstitutionPolicy } from "./institutionDecision.js?v=fresh-20260815-0037-8f1e3cc";

const INPUT_PRICES = Object.freeze({ water: 20, seed: 35 });
export const FARM_INSPECTION_SERVICE_ID = "sunward-acre-inspection";

export function createFarmOperation(options = Date.now()) {
  const now = typeof options === "number" ? options : options.now ?? Date.now();
  const state = typeof options === "object" ? options.state ?? null : null;
  const ledger = typeof options === "object" ? options.state?.ledger ?? options.ledger ?? null : null;
  const institution = createFarmInstitutionInstance(now);
  const archetype = INSTITUTION_ARCHETYPES[institution.archetypeId];
  const controller = createTaviInstitutionInstance();
  // Published on `state` so the farm is reachable by the shared actor lookup.
  // Until now it existed only inside this closure, so Tavi's traits could not
  // be found and Sunward Acre silently decided with the framework default —
  // the same failure that hid Nell, and equally invisible.
  if (state) state.farm = { institution, controller };
  const policy = resolveInstitutionPolicy({ archetypePolicy: archetype.defaultPolicy, institutionPolicy: institution.policies });
  let counter = 0;
  institution.history = [{ id: "sunward-history-1", type: "institution.instantiated", at: now, detail: "Tavi opened the current operating plan." }];

  function record(type, detail, payload = {}) {
    institution.history.push({ id: `sunward-history-${institution.history.length + 1}`, type, at: now, detail, ...payload });
    ledger?.recordEvent("institution.action", {
      institutionId: institution.id,
      institutionName: institution.name ?? "Sunward Acre",
      actorInstitutionId: controller.id,
      actorName: controller.name ?? "Tavi",
      actionType: type,
      ...payload,
    }, { visible: true, message: detail.startsWith("Tavi ") ? detail : `Tavi: ${detail}` });
  }

  const procurementCapability = {
    id: "procure-input",
    canAddress: ({ need }) => need?.kind === "inventory-reserve" && INPUT_PRICES[need.subject.resourceId] != null,
    propose: ({ need }) => [{
      capabilityId: "procure-input",
      action: "post-purchase-order",
      purpose: need.purpose,
      estimatedCost: need.shortage * INPUT_PRICES[need.subject.resourceId],
      quantity: need.shortage,
      resourceId: need.subject.resourceId,
      rationale: `Restore ${need.subject.resourceId} to its operating target.`,
    }],
  };

  function assess() {
    const derived = deriveInventoryNeeds({
      targets: institution.policies.inventoryTargets,
      quantities: institution.inventories.inputs,
      makeId: (resourceId) => `sunward-need-${resourceId}`,
      now,
    });
    const knownNeedIds = new Set(Object.keys(institution.needs));
    reconcileNeeds({ records: institution.needs, derivedNeeds: derived, now });
    for (const need of derived) {
      if (!knownNeedIds.has(need.id)) record("need.identified", `${need.shortage} ${need.subject.resourceId} needed to restore reserve.`, { needId: need.id });
    }
    for (const response of Object.values(institution.responses)) {
      if (!["active", "blocked"].includes(response.status)) continue;
      const need = institution.needs[response.needIds[0]];
      if (need?.status === "open") continue;
      response.status = "canceled";
      response.canceledAt = now;
      record("response.canceled", `The ${response.resourceId} response stopped because its need was satisfied.`, { responseId: response.id });
      const order = Object.values(institution.procurementOrders).find((entry) => entry.responseId === response.id && entry.status === "offered");
      if (order) {
        order.status = "canceled";
        institution.accounts.operating.committed = Math.max(0, institution.accounts.operating.committed - order.committedPayment);
        order.committedPayment = 0;
        record("procurement.canceled", `Released the cash committed to the ${order.resourceId} order.`, { orderId: order.id });
      }
    }
    const proposals = generateCapabilityResponses({ institution, controller, needs: Object.values(institution.needs), capabilities: [procurementCapability], policy });
    for (const proposal of proposals) {
      const existing = Object.values(institution.responses).find((entry) => entry.needIds?.includes(proposal.needId) && ["active", "blocked"].includes(entry.status));
      if (existing?.status === "active") continue;
      const affordability = evaluateAffordability({ account: institution.accounts.operating, policy, cost: proposal.estimatedCost });
      if (existing?.status === "blocked" && !affordability.affordable) continue;
      if (existing?.status === "blocked") {
        existing.status = "superseded";
        existing.reconsideredAt = now;
        record("response.reconsidered", `Funding changed, so Tavi reconsidered the blocked ${proposal.resourceId} purchase.`, { responseId: existing.id });
      }
      const id = `sunward-response-${++counter}`;
      institution.responses[id] = {
        ...createResponseRecord({ id, needIds: [proposal.needId], capabilityId: proposal.capabilityId, action: proposal.action, rationale: proposal.rationale, estimatedCost: proposal.estimatedCost, priorityScore: proposal.priorityScore, reconsiderWhen: ["account-balance-changed", "commitment-released", "policy-changed"], selectedAt: now }),
        status: affordability.affordable ? "active" : "blocked",
        quantity: proposal.quantity,
        resourceId: proposal.resourceId,
        affordability,
      };
      record(affordability.affordable ? "response.selected" : "response.blocked", affordability.affordable
        ? `Tavi selected procurement for ${proposal.quantity} ${proposal.resourceId}.`
        : `Tavi protected the cash reserve instead of funding ${proposal.resourceId}.`, { responseId: id });
      if (affordability.affordable) {
        institution.accounts.operating.committed += proposal.estimatedCost;
        institution.procurementOrders[`sunward-order-${counter}`] = {
          id: `sunward-order-${counter}`,
          responseId: id,
          needId: proposal.needId,
          resourceId: proposal.resourceId,
          quantity: proposal.quantity,
          maximumPayment: proposal.estimatedCost,
          committedPayment: proposal.estimatedCost,
          status: "offered",
          createdAt: now,
        };
        record("procurement.created", `Committed ${proposal.estimatedCost} credits for ${proposal.quantity} ${proposal.resourceId}.`, { orderId: `sunward-order-${counter}` });
      }
    }
    return { institution, controller, policy, proposals };
  }

  return { institution, assess };
}
