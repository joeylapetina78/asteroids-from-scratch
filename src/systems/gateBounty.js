// The evergreen gate bounty, funded by the authority that grants mining rights.
//
// Every gate ("rift") a ship destroys drops a bearer token whose value is fixed
// at the moment of destruction by the gate's LEVEL — a bigger rift is worth
// more. The token is not sold on the open market: it is redeemed at the
// regional authority's office, and whoever physically brings it in is paid,
// from the authority's own standing bounty fund. That is what makes it a
// bounty rather than salvage: the price is posted and guaranteed by the body
// that also grants the mining rights the whole frontier operates under
// (`institution:frontier-regional-authority`, the grantor in authoritySeeds).
//
// WHY THE FUND LIVES IN ITS OWN STORE AND NOT IN logistics.institutions:
// the economy sampler reconciles the INSTITUTIONAL money supply and everything
// in `logistics.institutions` is counted in it. The player is deliberately
// outside that pool — selling ore already pays the player from nowhere. The
// authority is a higher body outside the local economy too, so its bounty fund
// is kept here, out of the reconciled total, and pays the (also-external)
// player. Putting it among the hubs would report every payout as institutional
// money vanishing. It still depletes, so the fund is a real, drainable stake.

export const AUTHORITY_INSTITUTION_ID = "institution:frontier-regional-authority";
export const AUTHORITY_NAME = "Frontier Regional Authority";
// The one office where gate tokens are redeemed. A data edit moves it.
export const AUTHORITY_OFFICE_SITE_ID = "yard-exchange";
const AUTHORITY_OPENING_FUND = 250_000;

export function ensureGateBounty(state) {
  state.gateBounty ??= {
    authorityId: AUTHORITY_INSTITUTION_ID,
    authorityName: AUTHORITY_NAME,
    officeSiteId: AUTHORITY_OFFICE_SITE_ID,
    fund: AUTHORITY_OPENING_FUND,
    paidCumulative: 0,
    redemptions: 0,
  };
  return state.gateBounty;
}

// What this token is worth turned in, and whether it can be turned in here. A
// token is only redeemable at the authority office; anywhere else the answer is
// "wrong office" so the caller can say so rather than silently paying nothing.
export function getGateBountyOffer(state, siteId, unit) {
  const bounty = ensureGateBounty(state);
  const payout = Math.max(0, Math.round(unit?.tradeValue ?? 0));
  if (siteId !== bounty.officeSiteId) {
    return { redeemable: false, reason: "wrong-office", payout, officeSiteId: bounty.officeSiteId };
  }
  if (payout <= 0) return { redeemable: false, reason: "no-value", payout: 0, officeSiteId: bounty.officeSiteId };
  return { redeemable: true, reason: null, payout, officeSiteId: bounty.officeSiteId };
}

// Redeem a delivered gate token, paying the bearer from the authority's fund.
// The caller credits the player with `total`; this only moves the authority
// side, so the two halves of the transfer are explicit and a depleted fund
// cannot pay.
export function redeemGateTrophy(state, { siteId, unit, quantity = 1, now = Date.now() } = {}) {
  const offer = getGateBountyOffer(state, siteId, unit);
  if (!offer.redeemable) return { redeemed: false, reason: offer.reason, payout: 0, total: 0, officeSiteId: offer.officeSiteId };
  const bounty = ensureGateBounty(state);
  const total = offer.payout * Math.max(1, quantity);
  if (bounty.fund < total) {
    state.ledger?.recordEvent("authority.gateBountyUnfunded", {
      institutionId: bounty.authorityId, siteId, requested: total, fund: Math.round(bounty.fund),
    }, { visible: true, message: `${bounty.authorityName} cannot cover the gate bounty right now (fund ${Math.round(bounty.fund)} cr).` });
    return { redeemed: false, reason: "authority-underfunded", payout: 0, total: 0, shortfall: total - bounty.fund, officeSiteId: bounty.officeSiteId };
  }
  bounty.fund -= total;
  bounty.paidCumulative += total;
  bounty.redemptions += 1;
  state.ledger?.recordEvent("authority.gateBountyPaid", {
    institutionId: bounty.authorityId, siteId, quantity: Math.max(1, quantity),
    payout: offer.payout, total, fund: Math.round(bounty.fund),
  }, { visible: true, message: `${bounty.authorityName} paid ${total} cr for turning in a rift trophy.` });
  return { redeemed: true, reason: null, payout: offer.payout, total, fund: bounty.fund, officeSiteId: bounty.officeSiteId };
}

// The bearer can be the player or an institution. Settlement does not care
// which UI or AI delivered the token; it only requires a credit account.
export function redeemGateTrophyForBearer(state, { siteId, unit, quantity = 1, bearerId = null, account, now = Date.now() } = {}) {
  if (!account || !Number.isFinite(account.balance)) {
    return { redeemed: false, reason: "missing-bearer-account", payout: 0, total: 0 };
  }
  const result = redeemGateTrophy(state, { siteId, unit, quantity, now });
  if (!result.redeemed) return result;
  account.balance += result.total;
  account.transactions?.push({
    id: `GATE-BOUNTY-${now}-${bearerId ?? "bearer"}`,
    at: now,
    type: "gate-bounty-income",
    amount: result.total,
    balance: account.balance,
    referenceId: "authority:gate-bounty",
  });
  return { ...result, bearerId, balance: account.balance };
}
