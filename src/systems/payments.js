import { canSpendCredits, getCredits, spendCredits } from "./accounts.js?v=fresh-20260820-0654-6716a5f";
import { creditPayee } from "./contractTreasury.js?v=fresh-20260820-0654-6716a5f";

export function createPaymentRequest({
  payableType,
  payableId,
  payeeEntityId = null,
  label = "Payment",
  balance = 0,
  currency = "credits",
  metadata = {},
}) {
  return {
    payableType,
    payableId,
    payeeEntityId,
    label,
    balance: Math.max(0, balance),
    currency,
    metadata,
  };
}

export function processPayment(state, request, requestedAmount = Infinity) {
  const amount = Math.floor(Math.min(request.balance, Math.max(0, requestedAmount), Math.max(0, getCredits(state))));

  if (amount <= 0 || !canSpendCredits(state, amount)) {
    return { ok: false, reason: "insufficient-credits", amount: 0 };
  }

  spendCredits(state, amount);
  // Somebody receives this. Without it the payment left the world entirely,
  // which is the same class of bug as a payout with no payer — just pointing
  // the other way.
  creditPayee(state, {
    payeeEntityId: request.payeeEntityId,
    amount,
    referenceId: request.payableId,
    kind: `${request.payableType}-payment`,
  });

  const receipt = {
    id: `payment:${Date.now()}:${Math.random().toString(16).slice(2)}`,
    payableType: request.payableType,
    payableId: request.payableId,
    payeeEntityId: request.payeeEntityId,
    label: request.label,
    amount,
    currency: request.currency,
    accountCredits: getCredits(state),
    paidAt: Date.now(),
    metadata: request.metadata,
  };

  state.ledger.recordEvent(
    "payment.made",
    {
      paymentId: receipt.id,
      payableType: receipt.payableType,
      payableId: receipt.payableId,
      payeeEntityId: receipt.payeeEntityId,
      amountPaid: receipt.amount,
      currency: receipt.currency,
      accountCredits: receipt.accountCredits,
    },
    { visible: false },
  );

  return { ok: true, receipt };
}
