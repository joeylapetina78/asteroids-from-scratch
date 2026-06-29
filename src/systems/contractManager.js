import { chapterOneContracts } from "../content/contracts/chapterOneContracts.js?v=red-work-v1";

const CONTRACT_DEFINITIONS = new Map(chapterOneContracts.map((contract) => [contract.id, contract]));

export function createContractManager({ state, onChange = () => {} }) {
  let lastEventId = 0;

  function offerContract(contractId) {
    const definition = getContractDefinition(contractId);
    const existingContract = state.contracts.records[contractId];

    if (existingContract?.status === "active" || existingContract?.status === "fulfilled" || existingContract?.status === "paid") {
      if (existingContract.status === "paid" && definition.repeatable) {
        state.contracts.records[contractId] = createContractRecord(definition, existingContract.runCount ?? 1);
        state.contracts.currentContractId = contractId;
        recordContractOffered(contractId, definition);
        onChange(getCurrentContract());
        return;
      }

      state.contracts.currentContractId = contractId;
      onChange(getCurrentContract());
      return;
    }

    state.contracts.records[contractId] = createContractRecord(definition);
    state.contracts.currentContractId = contractId;
    recordContractOffered(contractId, definition);
    onChange(getCurrentContract());
  }

  function createContractRecord(definition, completedRunCount = 0) {
    return {
      ...definition,
      status: "offered",
      runCount: completedRunCount + 1,
      deliveredAmount: 0,
      offeredAt: Date.now(),
      acceptedAt: null,
      fulfilledAt: null,
      paidAt: null,
    };
  }

  function recordContractOffered(contractId, definition) {
    state.ledger.recordEvent(
      "contract.offered",
      {
        contractId,
        contractTitle: definition.title,
        issuer: definition.issuer,
      },
      { visible: false },
    );
  }

  function acceptContract(contractId = state.contracts.currentContractId) {
    const contract = state.contracts.records[contractId];

    if (!contract || contract.status !== "offered") {
      return false;
    }

    contract.status = "active";
    contract.acceptedAt = Date.now();
    if (contract.type === "loan" && !contract.disbursedAt) {
      disburseLoan(contract);
    }
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
      .filter((contract) => contract.type === "delivery" && contract.status === "active")
      .forEach((contract) => {
        const matchesSite = contract.terms.destinationSiteId === event.payload.siteId;
        const matchesVin = contract.terms.deliverShipVin === getAttachedShipVin();

        if (!matchesSite || !matchesVin) {
          return;
        }

      fulfillContract(contract);
      payContract(contract);
      });
  }

  function depositResourceUnit({ contractId = state.contracts.currentContractId, resourceType, siteId }) {
    const contract = state.contracts.records[contractId];

    if (
      !contract ||
      contract.type !== "resource-delivery" ||
      contract.status !== "active" ||
      contract.terms.resourceType !== resourceType ||
      contract.terms.destinationSiteId !== siteId
    ) {
      return false;
    }

    const requiredAmount = contract.terms.amount ?? 0;

    if ((contract.deliveredAmount ?? 0) >= requiredAmount) {
      return false;
    }

    contract.deliveredAmount = (contract.deliveredAmount ?? 0) + 1;
    state.ledger.recordEvent("contract.resourceDeposited", {
      contractId: contract.id,
      contractTitle: contract.title,
      resourceType,
      resourceName: contract.terms.resourceName,
      unitsDeposited: 1,
      deliveredAmount: contract.deliveredAmount,
      requiredAmount,
      destinationSiteId: contract.terms.destinationSiteId,
    });

    if (contract.deliveredAmount >= requiredAmount) {
      fulfillContract(contract, {
        destinationSiteId: contract.terms.destinationSiteId,
        resourceType,
        resourceName: contract.terms.resourceName,
        unitsDelivered: requiredAmount,
      });
    } else {
      onChange(contract);
    }

    return true;
  }

  function collectPayment(contractId = state.contracts.currentContractId) {
    const contract = state.contracts.records[contractId];

    if (!contract || contract.status !== "fulfilled") {
      return false;
    }

    payContract(contract);
    return true;
  }

  function disburseLoan(contract) {
    const principal = contract.terms.principal ?? contract.reward.credits ?? 0;
    const maxInterest = contract.terms.maxInterest ?? 0;

    contract.disbursedAt = Date.now();
    contract.balance = principal;
    contract.maxBalance = principal + maxInterest;
    state.components.account.credits += principal;
    state.debt.totalBorrowed += principal;
    state.debt.activePrincipal += principal;
    state.debt.activeBalance += principal;
    state.debt.highestDebt = Math.max(state.debt.highestDebt, state.debt.activeBalance);
    state.ledger.recordEvent("loan.disbursed", {
      contractId: contract.id,
      contractTitle: contract.title,
      principal,
      maxInterest,
      accountCredits: state.components.account.credits,
    });
  }

  function fulfillContract(contract, fulfillment = {}) {
    contract.status = "fulfilled";
    contract.fulfilledAt = Date.now();
    state.ledger.recordEvent("contract.fulfilled", {
      contractId: contract.id,
      contractTitle: contract.title,
      destinationSiteId: fulfillment.destinationSiteId ?? contract.terms.destinationSiteId,
      shipVin: fulfillment.shipVin ?? contract.terms.deliverShipVin,
      resourceType: fulfillment.resourceType,
      resourceName: fulfillment.resourceName,
      unitsDelivered: fulfillment.unitsDelivered,
    });
    onChange(contract);
  }

  function payContract(contract) {
    const credits = contract.reward.credits ?? 0;

    contract.status = "paid";
    contract.paidAt = Date.now();
    state.components.account.credits += credits;
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

  function getOpenContractIds() {
    return Object.values(state.contracts.records)
      .filter((contract) => contract.status !== "paid" || contract.repeatable || contract.type === "loan")
      .map((contract) => contract.id);
  }

  function showNextContract() {
    const contractIds = getOpenContractIds();

    if (contractIds.length === 0) {
      state.contracts.currentContractId = null;
      onChange(null);
      return null;
    }

    const currentIndex = contractIds.indexOf(state.contracts.currentContractId);
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % contractIds.length : 0;

    state.contracts.currentContractId = contractIds[nextIndex];
    onChange(getCurrentContract());
    return getCurrentContract();
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
    collectPayment,
    depositResourceUnit,
    getCurrentContract,
    getOpenContractIds,
    offerContract,
    showNextContract,
    update,
  };
}
