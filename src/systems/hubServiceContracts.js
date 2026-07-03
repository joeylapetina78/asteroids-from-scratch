const IN_PROGRESS_CONTRACT_STATUSES = ["offered", "active", "fulfilled"];
const MISSION_FIRST_RESOLVED_STATUSES = ["active", "fulfilled", "paid"];
const EMERGENCY_FUEL_LOAN_ID = "mako-emergency-fuel-loan";

export function getNextHubServiceContractId(service, { state, random = Math.random }) {
  const contractIds = service.contractIds ?? [];
  const missionFirstContractId = service.missionFirstContractId;
  const missionFirstResolved = isMissionFirstContractResolved(service, state);

  if (!missionFirstResolved) {
    return missionFirstContractId;
  }

  if (shouldOfferEmergencyFuelLoan(service, state)) {
    return EMERGENCY_FUEL_LOAN_ID;
  }

  if (service.singleActiveContract && getInProgressServiceContractId(service, state)) {
    return null;
  }

  const eligibleContractIds = getEligibleServiceContractIds(service, { state, missionFirstResolved });

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

function shouldOfferEmergencyFuelLoan(service, state) {
  if (service.serviceType !== "finance" || state.components.engine.fuel > 0) {
    return false;
  }

  const existingEmergencyLoan = state.contracts.records[EMERGENCY_FUEL_LOAN_ID];
  return !existingEmergencyLoan || existingEmergencyLoan.status === "paid";
}

function getEligibleServiceContractIds(service, { state, missionFirstResolved }) {
  const prereqs = service.contractPrerequisites ?? {};
  const missionFirstContractId = service.missionFirstContractId;

  return (service.contractIds ?? []).filter((contractId) => {
    if (contractId !== missionFirstContractId && !missionFirstResolved) {
      return false;
    }

    if (contractId === EMERGENCY_FUEL_LOAN_ID && state.components.engine.fuel > 0) {
      return false;
    }

    const existingContract = state.contracts.records[contractId];

    if (existingContract && !(existingContract.repeatable && existingContract.status === "paid")) {
      return false;
    }

    return (prereqs[contractId] ?? []).every((reqId) => state.contracts.records[reqId]?.status === "paid");
  });
}
