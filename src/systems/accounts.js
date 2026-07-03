const DEFAULT_CASH_ACCOUNT_ID = "account:pilot-cash";

export function createInitialAccounts() {
  return {
    currentAccountId: DEFAULT_CASH_ACCOUNT_ID,
    records: {
      [DEFAULT_CASH_ACCOUNT_ID]: {
        id: DEFAULT_CASH_ACCOUNT_ID,
        type: "cash",
        label: "Pilot Cash Account",
        ownerEntityId: null,
        balance: 0,
        currency: "credits",
        restrictions: [],
      },
    },
  };
}

export function ensureAccounts(state) {
  if (!state.accounts) {
    state.accounts = createInitialAccounts();
  }

  if (!state.accounts.records) {
    state.accounts.records = {};
  }

  if (!state.accounts.currentAccountId) {
    state.accounts.currentAccountId = DEFAULT_CASH_ACCOUNT_ID;
  }

  if (!state.accounts.records[state.accounts.currentAccountId]) {
    state.accounts.records[state.accounts.currentAccountId] = {
      id: state.accounts.currentAccountId,
      type: "cash",
      label: "Pilot Cash Account",
      ownerEntityId: null,
      balance: state.credits ?? 0,
      currency: "credits",
      restrictions: [],
    };
  }

  syncLegacyCredits(state);
  return state.accounts;
}

export function getCurrentAccount(state) {
  const accounts = ensureAccounts(state);
  return accounts.records[accounts.currentAccountId];
}

export function setCurrentAccountOwner(state, ownerEntityId) {
  const account = getCurrentAccount(state);
  account.ownerEntityId = ownerEntityId;
  return account;
}

export function getCredits(state) {
  return getCurrentAccount(state).balance;
}

export function canSpendCredits(state, amount) {
  return getCredits(state) >= amount;
}

export function depositCredits(state, amount) {
  const account = getCurrentAccount(state);
  account.balance += Math.max(0, amount);
  syncLegacyCredits(state);
  return account.balance;
}

export function spendCredits(state, amount) {
  if (!canSpendCredits(state, amount)) {
    return false;
  }

  debitCredits(state, amount);
  return true;
}

export function debitCredits(state, amount) {
  const account = getCurrentAccount(state);
  account.balance -= Math.max(0, amount);
  syncLegacyCredits(state);
  return account.balance;
}

export function syncLegacyCredits(state) {
  const account = state.accounts?.records?.[state.accounts.currentAccountId];

  if (account) {
    state.credits = account.balance;
  }
}
