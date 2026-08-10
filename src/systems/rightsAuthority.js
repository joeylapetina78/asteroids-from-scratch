// Rights-issuing authorities the pilot buys work passes and permits from.
//
// A capital authority (Yard Exchange Authority, to be fleshed out later) controls
// a bounded territory and sells the rights to operate within it. Its treasury is
// deliberately kept OUT of the tracked institutional economy for now: permit
// revenue accrues here visibly, but it is not one of the treasuries the money
// reconciliation sums, so buying a pass cannot distort the economy's books before
// the authority is a real participant that spends on patrols, claims, and upkeep.

export const RIGHTS_AUTHORITIES = Object.freeze([
  { id: "yard-exchange-authority", name: "Yard Exchange Authority", siteId: "yard-exchange" },
]);

export function createInitialRightsAuthorities() {
  const authorities = {};
  RIGHTS_AUTHORITIES.forEach((seed) => {
    authorities[seed.id] = {
      id: seed.id,
      name: seed.name,
      siteId: seed.siteId,
      account: { balance: 0, transactions: [] },
    };
  });
  return authorities;
}

export function ensureRightsAuthorities(state) {
  state.authorities ??= createInitialRightsAuthorities();
  return state.authorities;
}

export function getRightsAuthority(state, authorityId) {
  return state?.authorities?.[authorityId] ?? null;
}

// Credit a rights fee to the authority that issued it. A pure transfer target for
// money that has already left the player — never a source of new money.
export function recordAuthorityRevenue(state, { authorityId, amount, referenceId = null, description = "", now = Date.now() }) {
  const authority = getRightsAuthority(ensureRightsAuthorities(state) && state, authorityId);
  if (!authority || !(amount > 0)) return null;
  authority.account.balance += amount;
  authority.account.transactions ??= [];
  const transaction = {
    id: `AUTH-TX-${authority.account.transactions.length + 1}`,
    at: now, type: "rights-fee", amount, balance: authority.account.balance, referenceId, description,
  };
  authority.account.transactions.push(transaction);
  state.ledger?.recordEvent?.("authority.feeCollected", {
    authorityId, authorityName: authority.name, amount, referenceId, description,
    balance: authority.account.balance,
  }, { visible: true, message: `${authority.name} collected ${amount} cr — ${description || "rights fee"}.` });
  return transaction;
}
