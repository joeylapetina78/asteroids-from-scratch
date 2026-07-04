import { chapterOneContracts } from "../content/contracts/chapterOneContracts.js?v=fresh-20260704-0136-fb347f5";
import { depositCredits, getCredits } from "./accounts.js?v=fresh-20260704-0136-fb347f5";
import { getContractFulfillmentFromEvent } from "./contractRules.js?v=fresh-20260704-0136-fb347f5";
import { createLoanObligation, payObligation } from "./obligations.js?v=fresh-20260704-0136-fb347f5";
import { normalizeResourceType, resourceTypesMatch } from "./resourceDefinitions.js?v=fresh-20260704-0136-fb347f5";

const CONTRACT_DEFINITIONS = new Map(chapterOneContracts.map((contract) => [contract.id, contract]));

export function createContractManager({ state, onChange = () => {} }) {
  let lastEventId = 0;

  function offerContract(contractId, offerSource = null) {
    const definition = getContractDefinition(contractId);
    const existingContract = state.contracts.records[contractId];

    if (existingContract?.status === "offered") {
      state.contracts.currentContractId = contractId;
      onChange(getCurrentContract());
      return;
    }

    if (existingContract?.status === "active" || existingContract?.status === "fulfilled" || existingContract?.status === "paid") {
      if (existingContract.status === "paid" && definition.repeatable) {
        state.contracts.records[contractId] = createContractRecord(definition, existingContract.runCount ?? 1, offerSource);
        state.contracts.currentContractId = contractId;
        recordContractOffered(contractId, definition, offerSource);
        onChange(getCurrentContract());
        return;
      }

      state.contracts.currentContractId = contractId;
      onChange(getCurrentContract());
      return;
    }

    state.contracts.records[contractId] = createContractRecord(definition, 0, offerSource);
    state.contracts.currentContractId = contractId;
    recordContractOffered(contractId, definition, offerSource);
    onChange(getCurrentContract());
  }

  function createContractRecord(definition, completedRunCount = 0, offerSource = null) {
    return {
      ...definition,
      status: "offered",
      runCount: completedRunCount + 1,
      deliveredAmount: 0,
      offerSource,
      offeredAt: Date.now(),
      acceptedAt: null,
      fulfilledAt: null,
      paidAt: null,
    };
  }

  function recordContractOffered(contractId, definition, offerSource = null) {
    state.ledger.recordEvent(
      "contract.offered",
      {
        contractId,
        contractTitle: definition.title,
        issuer: definition.issuer,
        offerSource,
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
        contractType: contract.type,
        contractGroup: contract.group,
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
        fulfillContractsFromEvent(event);
      } else if (event.type === "engine.poweredDown" && event.payload.dockedSiteId) {
        fulfillContractsFromEvent(event);
      } else if (event.type === "site.undocked") {
        closeUnacceptedHubServiceOffers(event.payload.siteId);
      }
    });
  }

  function closeUnacceptedHubServiceOffers(siteId) {
    const closingContractIds = Object.values(state.contracts.records)
      .filter((contract) => contract.status === "offered" && contract.offerSource?.type === "hub-service" && contract.offerSource.siteId === siteId)
      .map((contract) => contract.id);

    if (closingContractIds.length === 0) {
      return;
    }

    closingContractIds.forEach((contractId) => {
      const contract = state.contracts.records[contractId];

      delete state.contracts.records[contractId];
      state.ledger.recordEvent(
        "contract.offerClosed",
        {
          contractId,
          contractTitle: contract.title,
          siteId,
          serviceId: contract.offerSource.serviceId,
        },
        { visible: false },
      );
    });

    if (closingContractIds.includes(state.contracts.currentContractId)) {
      state.contracts.currentContractId = getOpenContractIds()[0] ?? null;
    }

    onChange(getCurrentContract());
  }

  function fulfillContractsFromEvent(event) {
    Object.values(state.contracts.records)
      .filter((contract) => contract.status === "active")
      .forEach((contract) => {
        const fulfillment = getContractFulfillmentFromEvent(contract, event, {
          state,
          getAttachedShipVin,
        });

        if (!fulfillment) {
          return;
        }

        fulfillContract(contract, fulfillment);
      });
  }

  function depositResourceUnit({ contractId = state.contracts.currentContractId, resourceType, siteId }) {
    const contract = state.contracts.records[contractId];

    if (
      !contract ||
      contract.type !== "resource-delivery" ||
      contract.status !== "active" ||
      !resourceTypesMatch(contract.terms.resourceType, resourceType) ||
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
      contractGroup: contract.group,
      resourceType: normalizeResourceType(resourceType),
      requestedResourceType: contract.terms.resourceType,
      resourceName: contract.terms.resourceName,
      unitsDeposited: 1,
      deliveredAmount: contract.deliveredAmount,
      requiredAmount,
      destinationSiteId: contract.terms.destinationSiteId,
    });

    if (contract.deliveredAmount >= requiredAmount) {
      fulfillContract(contract, {
        destinationSiteId: contract.terms.destinationSiteId,
        resourceType: normalizeResourceType(resourceType),
        requestedResourceType: contract.terms.resourceType,
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

  function payLoan(contractId = state.contracts.currentContractId, requestedAmount = Infinity) {
    const contract = state.contracts.records[contractId];

    if (!contract || contract.type !== "loan" || !contract.obligationId) {
      return false;
    }

    const result = payObligation(state, contract.obligationId, requestedAmount);

    if (!result.ok) {
      return false;
    }

    contract.balance = result.balance;
    contract.maxBalance = result.obligation.maxBalance;
    if (result.balance <= 0) {
      contract.status = "paid";
      contract.paidAt = Date.now();
    }

    onChange(contract);
    return true;
  }

  function disburseLoan(contract) {
    const principal = contract.terms.principal ?? contract.reward.credits ?? 0;
    const maxInterest = contract.terms.maxInterest ?? 0;

    contract.disbursedAt = Date.now();
    const obligation = createLoanObligation(state, contract);
    contract.obligationId = obligation.id;
    contract.balance = obligation.balance;
    contract.maxBalance = obligation.maxBalance;
    depositCredits(state, principal);
    state.ledger.recordEvent("loan.disbursed", {
      contractId: contract.id,
      contractTitle: contract.title,
      obligationId: obligation.id,
      principal,
      maxInterest,
      accountCredits: getCredits(state),
    });
  }

  function fulfillContract(contract, fulfillment = {}) {
    contract.status = "fulfilled";
    contract.fulfilledAt = Date.now();
    state.contracts.currentContractId = contract.id;
    state.ledger.recordEvent("contract.fulfilled", {
      contractId: contract.id,
      contractTitle: contract.title,
      contractGroup: contract.group,
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
    depositCredits(state, credits);
    state.ledger.recordEvent("contract.paid", {
      contractId: contract.id,
      contractTitle: contract.title,
      contractGroup: contract.group,
      creditsPaid: credits,
      accountCredits: getCredits(state),
    });

    if (!getOpenContractIds().includes(contract.id)) {
      state.contracts.currentContractId = getOpenContractIds()[0] ?? null;
      onChange(getCurrentContract());
      return;
    }

    onChange(contract);
  }

  function getAttachedShipVin() {
    const hull = state.components.hull;
    return hull.vinPlateAttached ? hull.vin : null;
  }

  function getCurrentContract() {
    const contract = state.contracts.records[state.contracts.currentContractId] ?? null;

    if (!contract || contract.status !== "paid" || (contract.type === "loan" && (contract.balance ?? 0) > 0)) {
      return contract;
    }

    state.contracts.currentContractId = getOpenContractIds()[0] ?? null;
    return state.contracts.records[state.contracts.currentContractId] ?? null;
  }

  function getOpenContractIds() {
    return Object.values(state.contracts.records)
      .filter((contract) => contract.status !== "paid" || (contract.type === "loan" && (contract.balance ?? 0) > 0))
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

  function focusContract(contractId) {
    if (!state.contracts.records[contractId]) {
      return;
    }

    state.contracts.currentContractId = contractId;
    onChange(getCurrentContract());
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
    closeUnacceptedHubServiceOffers,
    collectPayment,
    depositResourceUnit,
    focusContract,
    getCurrentContract,
    getOpenContractIds,
    offerContract,
    payLoan,
    showNextContract,
    update,
  };
}
