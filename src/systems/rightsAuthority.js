// Rights-issuing authorities the pilot buys work passes and permits from.
//
// A capital authority (Yard Exchange Authority, to be fleshed out later) controls
// a bounded territory and sells the rights to operate within it. Its treasury is
// The authority account is a visible clearing ledger. When it represents a hub,
// the same payment is settled into that hub's real operating treasury so the
// institutional NPC can eventually spend permit income on patrols, claims and
// upkeep. The clearing ledger remains outside economy reconciliation.

export const RIGHTS_AUTHORITIES = Object.freeze([
  { id: "yard-exchange-authority", name: "Yard Exchange Authority", siteId: "yard-exchange", beneficiaryInstitutionId: "yard-exchange" },
  { id: "scrap-porch-authority", name: "Scrap Porch Commons", siteId: "scrap-porch", beneficiaryInstitutionId: "scrap-forge" },
  { id: "the-ledge-authority", name: "Ledge Works Board", siteId: "the-ledge", beneficiaryInstitutionId: "the-ledge" },
  { id: "blue-lantern-authority", name: "Blue Lantern Mutual", siteId: "blue-lantern", beneficiaryInstitutionId: "blue-lantern" },
  { id: "morrow-shoal-authority", name: "Morrow Claimholders' Moot", siteId: "morrow-shoal", beneficiaryInstitutionId: "morrow-shoal" },
  { id: "kiln-crossing-authority", name: "Kiln Masters' Chapter", siteId: "kiln-crossing", beneficiaryInstitutionId: "kiln-crossing" },
  { id: "ore-station-one-authority", name: "Ore Station Syndicate", siteId: "ore-station-one", beneficiaryInstitutionId: "ore-station-one" },
  { id: "coldwater-depot-authority", name: "Coldwater Depot Trust", siteId: "coldwater-depot", beneficiaryInstitutionId: "coldwater-depot" },
  { id: "deep-research-authority", name: "Deep Research Collegium", siteId: "deep-research", beneficiaryInstitutionId: "deep-research" },
]);

export function createInitialRightsAuthorities() {
  const authorities = {};
  RIGHTS_AUTHORITIES.forEach((seed) => {
    authorities[seed.id] = {
      id: seed.id,
      name: seed.name,
      siteId: seed.siteId,
      beneficiaryInstitutionId: seed.beneficiaryInstitutionId,
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
  const beneficiary = authority.beneficiaryInstitutionId
    ? state.logistics?.institutions?.[authority.beneficiaryInstitutionId]
    : null;
  const beneficiaryAccount = beneficiary?.accounts?.operating;
  if (beneficiaryAccount) {
    beneficiaryAccount.balance += amount;
    beneficiaryAccount.transactions ??= [];
    beneficiaryAccount.transactions.push({
      id: `RIGHTS-${authority.account.transactions.length}`,
      at: now,
      type: "territorial-rights-revenue",
      amount,
      balance: beneficiaryAccount.balance,
      referenceId,
      counterpartyId: authority.id,
      description,
    });
    transaction.settledToInstitutionId = beneficiary.id;
  }
  state.ledger?.recordEvent?.("authority.feeCollected", {
    authorityId, authorityName: authority.name, amount, referenceId, description,
    balance: authority.account.balance,
    beneficiaryInstitutionId: beneficiary?.id ?? null,
  }, { visible: true, message: `${authority.name} collected ${amount} cr — ${description || "rights fee"}.` });
  return transaction;
}
