import { INSTITUTION_ARCHETYPES } from "../content/institutions/institutionArchetypes.js";
import { createFarmInstitutionInstance, createTaviInstitutionInstance } from "../content/institutions/institutionInstances.js";
import { createResponseRecord, deriveInventoryNeeds, evaluateAffordability, generateCapabilityResponses, reconcileNeeds, resolveInstitutionPolicy } from "./institutionDecision.js";

const INPUT_PRICES = Object.freeze({ water: 20, seed: 35 });

export function createFarmOperation(now = Date.now()) {
  const institution = createFarmInstitutionInstance(now);
  const archetype = INSTITUTION_ARCHETYPES[institution.archetypeId];
  const controller = createTaviInstitutionInstance();
  const policy = resolveInstitutionPolicy({ archetypePolicy: archetype.defaultPolicy, institutionPolicy: institution.policies });
  let counter = 0;

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
    reconcileNeeds({ records: institution.needs, derivedNeeds: derived, now });
    for (const response of Object.values(institution.responses)) {
      if (!["active", "blocked"].includes(response.status)) continue;
      const need = institution.needs[response.needIds[0]];
      if (need?.status === "open") continue;
      response.status = "canceled";
      response.canceledAt = now;
      const order = Object.values(institution.procurementOrders).find((entry) => entry.responseId === response.id && entry.status === "offered");
      if (order) {
        order.status = "canceled";
        institution.accounts.operating.committed = Math.max(0, institution.accounts.operating.committed - order.committedPayment);
        order.committedPayment = 0;
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
      }
      const id = `sunward-response-${++counter}`;
      institution.responses[id] = {
        ...createResponseRecord({ id, needIds: [proposal.needId], capabilityId: proposal.capabilityId, action: proposal.action, rationale: proposal.rationale, estimatedCost: proposal.estimatedCost, priorityScore: proposal.priorityScore, reconsiderWhen: ["account-balance-changed", "commitment-released", "policy-changed"], selectedAt: now }),
        status: affordability.affordable ? "active" : "blocked",
        quantity: proposal.quantity,
        resourceId: proposal.resourceId,
        affordability,
      };
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
      }
    }
    return { institution, controller, policy, proposals };
  }

  return { institution, assess };
}
