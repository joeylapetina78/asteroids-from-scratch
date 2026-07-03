export const CONTRACT_REQUIREMENT_DEFINITIONS = {
  dockAt: {
    label: "Dock At",
    description: "Require the ship to be docked at a specific site.",
    required: ["siteId"],
  },
  shipVinAttached: {
    label: "Ship VIN Attached",
    description: "Require the active hull to have a specific attached VIN plate.",
    required: ["vin"],
  },
  poweredDown: {
    label: "Powered Down",
    description: "Require the engine to be powered down.",
    required: [],
  },
};

export const CONTRACT_REQUIREMENT_TYPES = Object.keys(CONTRACT_REQUIREMENT_DEFINITIONS);

export function getContractRequirementDefinition(requirementType) {
  return CONTRACT_REQUIREMENT_DEFINITIONS[requirementType] ?? null;
}

export function getContractFulfillmentFromEvent(contract, event, context) {
  if (contract.terms?.requires?.length) {
    return getRuleBasedFulfillment(contract, event, context);
  }

  if (contract.type === "delivery") {
    return getDeliveryFulfillment(contract, event, context);
  }

  return null;
}

function getRuleBasedFulfillment(contract, event, context) {
  const eventContext = getEventContext(event, context);
  const allRequirementsMet = contract.terms.requires.every((requirement) =>
    matchesContractRequirement(requirement, eventContext),
  );

  if (!allRequirementsMet) {
    return null;
  }

  return {
    destinationSiteId: eventContext.siteId ?? contract.terms.destinationSiteId,
    shipVin: eventContext.attachedShipVin,
  };
}

function getDeliveryFulfillment(contract, event, { state, getAttachedShipVin }) {
  const siteId = getDockedSiteIdFromEvent(event);

  if (!siteId || contract.terms.destinationSiteId !== siteId) {
    return null;
  }

  const attachedShipVin = getAttachedShipVin();

  if (contract.terms.deliverShipVin && contract.terms.deliverShipVin !== attachedShipVin) {
    return null;
  }

  if (contract.terms.requirePoweredDown && state.components.engine.powered) {
    return null;
  }

  return {
    destinationSiteId: siteId,
    shipVin: attachedShipVin,
  };
}

function getEventContext(event, { state, getAttachedShipVin }) {
  return {
    event,
    state,
    siteId: getDockedSiteIdFromEvent(event),
    attachedShipVin: getAttachedShipVin(),
  };
}

function matchesContractRequirement(requirement, eventContext) {
  if (requirement.type === "dockAt") {
    return eventContext.siteId === requirement.siteId;
  }

  if (requirement.type === "shipVinAttached") {
    return eventContext.attachedShipVin === requirement.vin;
  }

  if (requirement.type === "poweredDown") {
    return !eventContext.state.components.engine.powered;
  }

  if (!getContractRequirementDefinition(requirement.type)) {
    throw new Error(`Unknown contract requirement type: ${requirement.type}`);
  }

  return false;
}

function getDockedSiteIdFromEvent(event) {
  if (event.type === "site.docked") {
    return event.payload.siteId;
  }

  if (event.type === "engine.poweredDown") {
    return event.payload.dockedSiteId;
  }

  return null;
}
