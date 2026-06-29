import { chapterOneContracts } from "../content/contracts/chapterOneContracts.js?v=red-work-v1";

const CONTRACT_DEFINITIONS = new Map(chapterOneContracts.map((contract) => [contract.id, contract]));

export function createContractManager({ state, onChange = () => {}, getCargoCounts = () => ({}), removeCargoUnits = () => [] }) {
  let lastEventId = 0;

  function offerContract(contractId) {
    const definition = getContractDefinition(contractId);
    const existingContract = state.contracts.records[contractId];

    if (existingContract?.status === "active" || existingContract?.status === "paid") {
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
        fulfillMatchingResourceContracts(event);
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

        payContract(contract);
      });
  }

  function fulfillMatchingResourceContracts(event) {
    Object.values(state.contracts.records)
      .filter((contract) => contract.type === "resource-delivery" && contract.status === "active")
      .forEach((contract) => {
        const matchesSite = contract.terms.destinationSiteId === event.payload.siteId;
        const resourceType = contract.terms.resourceType;
        const requiredAmount = contract.terms.amount ?? 0;
        const cargoCounts = getCargoCounts();

        if (!matchesSite || (cargoCounts[resourceType] ?? 0) < requiredAmount) {
          return;
        }

        const removedUnits = removeCargoUnits(resourceType, requiredAmount);

        if (removedUnits.length !== requiredAmount) {
          return;
        }

        payContract(contract, {
          destinationSiteId: contract.terms.destinationSiteId,
          resourceType,
          resourceName: contract.terms.resourceName,
          unitsDelivered: requiredAmount,
        });
      });
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

  function payContract(contract, fulfillment = {}) {
    const credits = contract.reward.credits ?? 0;

    contract.status = "paid";
    contract.fulfilledAt = Date.now();
    contract.paidAt = contract.fulfilledAt;
    state.components.account.credits += credits;
    state.ledger.recordEvent("contract.fulfilled", {
      contractId: contract.id,
      contractTitle: contract.title,
      destinationSiteId: fulfillment.destinationSiteId ?? contract.terms.destinationSiteId,
      shipVin: fulfillment.shipVin ?? contract.terms.deliverShipVin,
      resourceType: fulfillment.resourceType,
      resourceName: fulfillment.resourceName,
      unitsDelivered: fulfillment.unitsDelivered,
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
