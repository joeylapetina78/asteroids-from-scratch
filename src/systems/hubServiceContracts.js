const IN_PROGRESS_CONTRACT_STATUSES = ["offered", "active", "fulfilled"];
const MISSION_FIRST_RESOLVED_STATUSES = ["active", "fulfilled", "paid"];
const MINIMUM_FINANCE_LOAN_ID = "mako-emergency-fuel-loan";

export function getNextHubServiceContractId(service, { state, random = Math.random }) {
  const contractIds = service.contractIds ?? [];
  const missionFirstContractId = service.missionFirstContractId;
  const missionFirstResolved = isMissionFirstContractResolved(service, state);

  if (!missionFirstResolved) {
    return missionFirstContractId;
  }

  if (shouldOfferMinimumFinanceLoan(service, state)) {
    return MINIMUM_FINANCE_LOAN_ID;
  }

  if (service.singleActiveContract && getInProgressServiceContractId(service, state)) {
    return null;
  }

  const eligibleContractIds = getEligibleServiceContractIds(service, { state, missionFirstResolved });
  const firstRunContractIds = eligibleContractIds.filter((contractId) => state.contracts.records[contractId]?.status !== "paid");

  if (firstRunContractIds.length > 0) {
    return firstRunContractIds[0];
  }

  if (eligibleContractIds.length === 0) {
    return null;
  }

  return eligibleContractIds[Math.floor(random() * eligibleContractIds.length)];
}

export function getInProgressServiceContractId(service, state) {
  return (service.contractIds ?? []).find((contractId) => {
    const contract = state.contracts.records[contractId];
    return contract && IN_PROGRESS_CONTRACT_STATUSES.includes(contract.status);
  });
}

function isMissionFirstContractResolved(service, state) {
  const missionFirstContractId = service.missionFirstContractId;

  if (!missionFirstContractId) {
    return true;
  }

  const missionFirstContract = state.contracts.records[missionFirstContractId];
  return Boolean(missionFirstContract && MISSION_FIRST_RESOLVED_STATUSES.includes(missionFirstContract.status));
}

function shouldOfferMinimumFinanceLoan(service, state) {
  if (service.serviceType !== "finance") {
    return false;
  }

  const existingMinimumLoan = state.contracts.records[MINIMUM_FINANCE_LOAN_ID];
  return !existingMinimumLoan || existingMinimumLoan.status === "paid";
}

function getEligibleServiceContractIds(service, { state, missionFirstResolved }) {
  const prereqs = service.contractPrerequisites ?? {};
  const missionFirstContractId = service.missionFirstContractId;

  return (service.contractIds ?? []).filter((contractId) => {
    if (contractId !== missionFirstContractId && !missionFirstResolved) {
      return false;
    }

    const existingContract = state.contracts.records[contractId];

    if (existingContract && !(existingContract.repeatable && existingContract.status === "paid")) {
      return false;
    }

    return (prereqs[contractId] ?? []).every((reqId) => state.contracts.records[reqId]?.status === "paid");
  });
}
