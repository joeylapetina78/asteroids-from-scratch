import { createPaymentRequest, processPayment } from "./payments.js?v=payments-v1";
import { ensureInstitution } from "./worldRecords.js?v=world-records-v1";

const YARD_EXCHANGE_FINANCE_ID = "institution:yard-exchange-finance";

export function createInitialObligations() {
  return {
    records: {},
  };
}

export function ensureObligations(state) {
  if (!state.obligations) {
    state.obligations = createInitialObligations();
  }

  state.obligations.records ??= {};
  state.debt ??= createEmptyDebtSummary();
  syncDebtSummary(state);
  return state.obligations;
}

export function createLoanObligation(state, contract) {
  const obligations = ensureObligations(state);
  const principal = contract.terms.principal ?? contract.reward.credits ?? 0;
  const maxInterest = contract.terms.maxInterest ?? 0;
  const obligationId = `obligation:${contract.id}:${contract.runCount ?? 1}`;
  const creditorEntityId = getCreditorEntityId(contract);

  if (creditorEntityId === YARD_EXCHANGE_FINANCE_ID) {
    ensureInstitution(state, {
      id: YARD_EXCHANGE_FINANCE_ID,
      name: "Yard Exchange Finance Office",
      authorityScope: ["loan", "lien", "ship-title-collateral"],
    });
  }

  obligations.records[obligationId] = {
    id: obligationId,
    type: "loan",
    status: "active",
    sourceContractId: contract.id,
    title: contract.title,
    creditorEntityId,
    debtorEntityId: state.character?.controlledPersonEntityId ?? null,
    principal,
    balance: principal,
    maxBalance: principal + maxInterest,
    interestRate: contract.terms.interestRate ?? 0,
    interestHours: contract.terms.interestHours ?? null,
    maxInterest,
    purpose: contract.terms.fundingPurpose ?? contract.terms.purpose ?? null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  syncDebtSummary(state);
  return obligations.records[obligationId];
}

export function payObligation(state, obligationId, requestedAmount = Infinity) {
  const obligations = ensureObligations(state);
  const obligation = obligations.records[obligationId];

  if (!obligation || obligation.status !== "active") {
    return { ok: false, reason: "not-active" };
  }

  const balance = Math.max(0, obligation.balance ?? 0);
  const payment = processPayment(
    state,
    createPaymentRequest({
      payableType: "obligation",
      payableId: obligation.id,
      payeeEntityId: obligation.creditorEntityId,
      label: obligation.title,
      balance,
      metadata: {
        sourceContractId: obligation.sourceContractId,
        obligationType: obligation.type,
      },
    }),
    requestedAmount,
  );

  if (!payment.ok) {
    return payment;
  }

  obligation.balance = Math.max(0, balance - payment.receipt.amount);
  obligation.updatedAt = Date.now();
  state.debt ??= createEmptyDebtSummary();
  state.debt.totalPaid = (state.debt.totalPaid ?? 0) + payment.receipt.amount;

  state.ledger.recordEvent("loan.paymentMade", {
    obligationId: obligation.id,
    sourceContractId: obligation.sourceContractId,
    creditorEntityId: obligation.creditorEntityId,
    paymentId: payment.receipt.id,
    amountPaid: payment.receipt.amount,
    balance: obligation.balance,
    accountCredits: payment.receipt.accountCredits,
  });

  if (obligation.balance <= 0) {
    obligation.status = "paid";
    obligation.paidAt = Date.now();
    releaseObligationCollateral(state, obligation);
    state.ledger.recordEvent("loan.paidOff", {
      obligationId: obligation.id,
      sourceContractId: obligation.sourceContractId,
      creditorEntityId: obligation.creditorEntityId,
      accountCredits: payment.receipt.accountCredits,
    });
  }

  syncDebtSummary(state);
  return { ok: true, amountPaid: payment.receipt.amount, balance: obligation.balance, obligation, receipt: payment.receipt };
}

export function syncDebtSummary(state) {
  const obligations = Object.values(state.obligations?.records ?? {});
  const debt = state.debt ?? createEmptyDebtSummary();
  const loanObligations = obligations.filter((obligation) => obligation.type === "loan");
  const activeLoans = loanObligations.filter((obligation) => obligation.status === "active");

  debt.totalBorrowed = loanObligations.reduce((total, obligation) => total + (obligation.principal ?? 0), 0);
  debt.activePrincipal = activeLoans.reduce((total, obligation) => total + (obligation.principal ?? 0), 0);
  debt.activeBalance = activeLoans.reduce((total, obligation) => total + (obligation.balance ?? 0), 0);
  debt.highestDebt = Math.max(debt.highestDebt ?? 0, debt.activeBalance);
  debt.totalPaid ??= 0;
  state.debt = debt;

  return debt;
}

function releaseObligationCollateral(state, obligation) {
  const contractId = obligation.sourceContractId;

  Object.values(state.legal?.liens ?? {}).forEach((lien) => {
    if (lien.contractId !== contractId || lien.status !== "active") {
      return;
    }

    lien.status = "released";
    lien.releasedAt = Date.now();
  });

  Object.values(state.legal?.shipTitles ?? {}).forEach((title) => {
    if (title.sourceContractId !== contractId || title.status !== "lien-held") {
      return;
    }

    title.status = "owned";
    title.lienHolder = null;
    title.releasedAt = Date.now();
  });

  Object.values(state.legal?.paperwork ?? {}).forEach((paperwork) => {
    if (paperwork.linkedContractId !== contractId) {
      return;
    }

    paperwork.status = "released";
    paperwork.heldBy = null;
    paperwork.canRemove = true;
  });

  const currentShip = state.legal?.currentShip;
  if (currentShip?.lienHolder === getCreditorName(obligation)) {
    currentShip.titleStatus = "owned";
    currentShip.lienHolder = null;
  }

  Object.values(state.worldRecords?.documents ?? {}).forEach((document) => {
    if (document.contractId === contractId && document.type === "lien") {
      document.status = "released";
      document.releasedAt = Date.now();
    }

    if (document.sourceContractId === contractId && document.type === "ship-title" && document.status === "lien-held") {
      document.status = "owned";
      document.releasedAt = Date.now();
    }
  });
}

function getCreditorName(obligation) {
  if (obligation.creditorEntityId === YARD_EXCHANGE_FINANCE_ID) {
    return "Yard Exchange Finance Office";
  }

  return obligation.creditorEntityId;
}

function createEmptyDebtSummary() {
  return {
    totalBorrowed: 0,
    totalPaid: 0,
    activePrincipal: 0,
    activeBalance: 0,
    highestDebt: 0,
  };
}

function getCreditorEntityId(contract) {
  if (contract.issuer === "Yard Exchange Finance Office") {
    return YARD_EXCHANGE_FINANCE_ID;
  }

  return contract.issuer ? `institution:${contract.issuer.toLowerCase().replaceAll(" ", "-")}` : null;
}
