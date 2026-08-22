import { chapterOneContracts } from "../content/contracts/chapterOneContracts.js?v=fresh-20260822-1326-partsmkt";

// Where a contract's money actually comes from.
//
// WHY THIS EXISTS: a contract reward and a loan principal were both handed to
// the player with `depositCredits` and nothing on the other side of the
// transaction. Nobody was poorer for having paid you. Rook could commission work
// forever on an empty pocket, and the Finance Office could lend twenty thousand
// credits it did not have, because neither of them had a pocket at all — an
// issuer was a display string on a card.
//
// So an issuer becomes what it always claimed to be: an organisation with money.
// Paying you is a transfer out of its account, and the reconciliation sees the
// balance fall by exactly what yours rises.
//
// THE ENDOWMENT IS DERIVED FROM WHAT THE ISSUER HAS PROMISED, not picked. Every
// authored contract it issues is a commitment, so its treasury opens holding the
// sum of them with a working margin on top. That is what makes this safe to turn
// on: an issuer can never fail to pay a reward the content already promised,
// and adding a new contract raises the endowment automatically rather than
// silently under-funding a story beat months later.
//
// An issuer arriving with money is an ENDOWMENT, not creation. `reconcileMoney`
// detects actors that appear between samples and reports their cash separately
// from flow, so standing one up mid-run is accounted rather than mistaken for a
// leak. See `listAccountHolders` — anything with an operating account is counted,
// which is why these live beside the other institutions instead of off to one
// side like the gate bounty fund.

// A comfortable multiple of what an issuer owes, so it can absorb repeatable
// contracts and still visibly spend down rather than sitting at exactly zero.
const COMMITMENT_COVER = 4;
const MINIMUM_ENDOWMENT = 5_000;

// The organisations that issue contracts, and the ids their treasuries take.
const ISSUER_TREASURIES = Object.freeze({
  "Rook": { id: "rook-industries", name: "Rook Industries" },
  "Yard Exchange Finance Office": { id: "yard-exchange-finance", name: "Yard Exchange Finance Office" },
  "Reach Transit Commission": { id: "reach-transit-commission", name: "Reach Transit Commission" },
  "Yard Exchange Authority": { id: "yard-exchange-authority", name: "Yard Exchange Authority" },
});

export function getIssuerTreasuryId(issuer) {
  return ISSUER_TREASURIES[issuer]?.id ?? null;
}

// Everything the authored content has this issuer promising to pay out.
export function getIssuerCommitments(issuer) {
  return chapterOneContracts
    .filter((definition) => definition.issuer === issuer)
    .reduce((total, definition) => {
      const reward = definition.reward?.credits;
      const principal = definition.terms?.principal;
      const owed = (typeof principal === "number" ? principal : 0)
        || (typeof reward === "number" ? reward : 0);
      return total + owed;
    }, 0);
}

export function getIssuerEndowment(issuer) {
  return Math.max(MINIMUM_ENDOWMENT, getIssuerCommitments(issuer) * COMMITMENT_COVER);
}

// An issuer that is ALREADY a real organisation in the world pays out of its own
// account — a hub posting a protection job is the hub that funds it. Only the
// authored offices, which exist purely as names on a contract card, need a
// treasury standing up for them.
function findExistingTreasury(state, { issuer, institutionId }) {
  const institutions = state.logistics?.institutions ?? {};
  const direct = institutionId ? institutions[String(institutionId).replace(/^institution:/, "")] : null;
  if (direct?.accounts?.operating) return direct;

  const named = institutions[String(issuer ?? "").replace(/^institution:/, "")];
  if (named?.accounts?.operating) return named;

  return Object.values(institutions).find((institution) =>
    institution?.accounts?.operating && institution.name === issuer) ?? null;
}

// The issuer records themselves, so a freshly created world can hold them from
// the very first tick rather than growing them later.
export function issuerTreasuryRecords() {
  return Object.entries(ISSUER_TREASURIES).map(([issuer, seed]) => ({
    id: seed.id,
    name: seed.name,
    // Deliberately not a settlement: no population, no shelf, nothing to sell,
    // so every hub system that filters on capability skips it.
    archetypeId: "office",
    inventories: {},
    accounts: {
      operating: {
        id: `${seed.id}:operating`,
        balance: getIssuerEndowment(issuer),
        committed: 0,
        transactions: [],
      },
    },
  }));
}

// Stand the issuer up the first time it owes anybody something.
export function ensureIssuerTreasury(state, issuer, { institutionId = null, now = Date.now() } = {}) {
  const existingTreasury = findExistingTreasury(state, { issuer, institutionId });
  if (existingTreasury) return existingTreasury;

  const seed = ISSUER_TREASURIES[issuer];
  if (!seed || !state.logistics?.institutions) return null;

  const existing = state.logistics.institutions[seed.id];
  if (existing?.accounts?.operating) return existing;

  const record = {
    id: seed.id,
    name: seed.name,
    // Deliberately not a settlement: it has no population, no shelf and nothing
    // to sell, so every hub system that filters on capability skips it.
    archetypeId: "office",
    inventories: {},
    accounts: {
      operating: {
        id: `${seed.id}:operating`,
        balance: getIssuerEndowment(issuer),
        committed: 0,
        transactions: [],
      },
    },
  };

  state.logistics.institutions[seed.id] = record;
  state.ledger?.recordEvent?.("institution.treasuryOpened", {
    institutionId: seed.id,
    institutionName: seed.name,
    endowment: record.accounts.operating.balance,
    commitments: getIssuerCommitments(issuer),
  }, { visible: false });

  return record;
}

// Pay `amount` out of the issuer's account.
//
// Refuses rather than overdrawing, and says so — the same shape as the gate
// bounty, which is the one payout in this codebase that always had a funded
// source and an honest refusal when the fund ran dry.
export function payFromIssuer(state, { issuer, institutionId = null, amount, referenceId = null, kind = "contract-payout", now = Date.now() } = {}) {
  const owed = Math.max(0, Math.round(amount ?? 0));
  if (owed === 0) return { paid: 0, shortfall: 0, institutionId: getIssuerTreasuryId(issuer), funded: true };

  const treasury = ensureIssuerTreasury(state, issuer, { institutionId, now });
  if (!treasury) {
    // An issuer nobody has given a treasury to. Reported rather than quietly
    // conjured, so a new contract issuer shows up here instead of becoming a
    // fresh faucet.
    return { paid: 0, shortfall: owed, institutionId: null, funded: false, reason: "no-treasury" };
  }

  const account = treasury.accounts.operating;
  if ((account.balance ?? 0) < owed) {
    return { paid: 0, shortfall: owed - (account.balance ?? 0), institutionId: treasury.id, funded: false, reason: "issuer-underfunded" };
  }

  account.balance -= owed;
  account.transactions ??= [];
  account.transactions.push({
    id: `ISS-${now}-${referenceId ?? kind}`,
    at: now,
    type: kind,
    amount: -owed,
    balance: account.balance,
    referenceId,
  });

  return { paid: owed, shortfall: 0, institutionId: treasury.id, funded: true };
}

// ── The other direction ─────────────────────────────────────────────────────

// Credit whoever was actually paid.
//
// `processPayment` debited the player and stopped there: a loan repayment, a
// fine or a fee simply left the world. That is the exact mirror of the faucets
// above — money destroyed rather than conjured — and it hides just as badly,
// because a leak and a sink cancel in a total while both are wrong.
//
// A payee id is an entity reference (`institution:yard-exchange-finance`), so
// the institution id is the same string without its namespace.
export function creditPayee(state, { payeeEntityId, amount, referenceId = null, kind = "receivable", now = Date.now() } = {}) {
  const owed = Math.max(0, Math.round(amount ?? 0));
  if (owed === 0 || !payeeEntityId) return { credited: 0, institutionId: null, reason: "nothing-owed" };

  const institutionId = String(payeeEntityId).replace(/^institution:/, "");
  const account = state.logistics?.institutions?.[institutionId]?.accounts?.operating
    ?? state.rightsAuthorities?.records?.[institutionId]?.account
    ?? null;

  if (!account) {
    // Reported rather than silently swallowed, so a payee with nowhere to put
    // the money shows up as a named gap instead of as a shrinking money supply.
    state.ledger?.recordEvent?.("payment.payeeUnbanked", {
      payeeEntityId, amount: owed, referenceId, kind,
    }, { visible: false });
    return { credited: 0, institutionId, reason: "payee-has-no-account" };
  }

  account.balance = (account.balance ?? 0) + owed;
  account.transactions ??= [];
  account.transactions.push({
    id: `RCV-${now}-${referenceId ?? kind}`,
    at: now,
    type: kind,
    amount: owed,
    balance: account.balance,
    referenceId,
  });

  return { credited: owed, institutionId, reason: null };
}

// Stand every issuer up at world creation rather than on first payment.
//
// A treasury that appears mid-run and pays out in the same breath is reported by
// `reconcileMoney` as an arrival, and the payment it made before the next sample
// gets attributed to that arrival instead of to flow — a phantom residual
// exactly the size of the payout. Measured: a twenty-thousand credit loan from a
// lazily-created lender showed a twenty-thousand residual that was not a leak at
// all. Existing before the first sample removes the ambiguity entirely.
export function seedIssuerTreasuries(state, { now = Date.now() } = {}) {
  Object.keys(ISSUER_TREASURIES).forEach((issuer) => ensureIssuerTreasury(state, issuer, { now }));
  return state;
}
