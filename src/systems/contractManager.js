import { chapterOneContracts } from "../content/contracts/chapterOneContracts.js?v=contract-v1";

const CONTRACT_DEFINITIONS = new Map(chapterOneContracts.map((contract) => [contract.id, contract]));

export function createContractManager({ state, onChange = () => {} }) {
  let lastEventId = 0;

  function offerContract(contractId) {
    const definition = getContractDefinition(contractId);
    const existingContract = state.contracts.records[contractId];

    if (existingContract?.status === "active" || existingContract?.status === "paid") {
      state.contracts.currentContractId = contractId;
      onChange(getCurrentContract());
      return;
    }

    state.contracts.records[contractId] = {
      ...definition,
      status: "offered",
      offeredAt: Date.now(),
      acceptedAt: null,
      fulfilledAt: null,
      paidAt: null,
    };
    state.contracts.currentContractId = contractId;
    state.ledger.recordEvent(
      "contract.offered",
      {
        contractId,
        contractTitle: definition.title,
        issuer: definition.issuer,
      },
      { visible: false },
    );
    onChange(getCurrentContract());
  }

  function acceptContract(contractId = state.contracts.currentContractId) {
    const contract = state.contracts.records[contractId];

    if (!contract || contract.status !== "offered") {
      return false;
    }

    contract.status = "active";
    contract.acceptedAt = Date.now();
    state.ledger.recordEvent(
      "contract.accepted",
      {
        contractId: contract.id,
        contractTitle: contract.title,
        issuer: contract.issuer,
      },
      { visible: true },
    );
    onChange(contract);
    return true;
  }

  function update() {
    const events = state.ledger.getEventsAfterId(lastEventId, { includeHidden: true });

    events.forEach((event) => {
      lastEventId = Math.max(lastEventId, event.id);

      if (event.type === "site.docked") {
        fulfillMatchingDeliveryContracts(event);
      }
    });
  }

  function fulfillMatchingDeliveryContracts(event) {
    Object.values(state.contracts.records)
      .filter((contract) => contract.status === "active")
      .forEach((contract) => {
        const matchesSite = contract.terms.destinationSiteId === event.payload.siteId;
        const matchesVin = contract.terms.deliverShipVin === getAttachedShipVin();

        if (!matchesSite || !matchesVin) {
          return;
        }

        payContract(contract);
      });
  }

  function payContract(contract) {
    const credits = contract.reward.credits ?? 0;

    contract.status = "paid";
    contract.fulfilledAt = Date.now();
    contract.paidAt = contract.fulfilledAt;
    state.components.account.credits += credits;
    state.ledger.recordEvent("contract.fulfilled", {
      contractId: contract.id,
      contractTitle: contract.title,
      destinationSiteId: contract.terms.destinationSiteId,
      shipVin: contract.terms.deliverShipVin,
      creditsPaid: credits,
    });
    state.ledger.recordEvent("contract.paid", {
      contractId: contract.id,
      contractTitle: contract.title,
      creditsPaid: credits,
      accountCredits: state.components.account.credits,
    });
    onChange(contract);
  }

  function getAttachedShipVin() {
    const hull = state.components.hull;
    return hull.vinPlateAttached ? hull.vin : null;
  }

  function getCurrentContract() {
    return state.contracts.records[state.contracts.currentContractId] ?? null;
  }

  function getContractDefinition(contractId) {
    const definition = CONTRACT_DEFINITIONS.get(contractId);

    if (!definition) {
      throw new Error(`Unknown contract: ${contractId}`);
    }

    return definition;
  }

  return {
    acceptContract,
    getCurrentContract,
    offerContract,
    update,
  };
}
