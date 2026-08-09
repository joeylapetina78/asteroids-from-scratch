// Operating rights: may the pilot work or even fly this ground right now, and if
// not, is it controlled space they simply lack the right for?
//
// This is the READ side of the rights model. It grants nothing and enforces
// nothing — it answers "may I mine / fly here?" so the viewport can show where
// the pilot is clear and where they are not, and so a future patrol and a future
// hub can ask the same question instead of hardcoding player state.
//
// A plot only requires a right when its region's status for that action is a
// charter/claim/lease/permit — i.e. some authority controls that ground. Open or
// unassigned frontier needs no right and is never flagged. The pilot holds a set
// of authorities per action (Rook's sponsoring mining permit and a Yard Exchange
// flight registration to begin with); an active source-limited contract
// additionally grants its own specific claims — but only for WORK, not transit.
//
// Not a `player.canMine` flag: the pilot's rights are a set of authorities, each
// plot carries its own controlling authority per action, and access is the
// intersection.

const RIGHT_REQUIRING_STATUS = /required|restricted/i;

// The right a physical action is checked against on a plot/region.
const ACTION_RIGHT_KEY = { mine: "mining", fly: "transit" };

export function rightRequires(right) {
  return Boolean(right?.status) && RIGHT_REQUIRING_STATUS.test(right.status);
}

export function getPlayerAuthorities(state, rightKey) {
  return state?.legal?.operatingRights?.[rightKey]?.authorityIds ?? [];
}

// The specific claims any active source-limited contract grants the pilot. An
// Ore Ridge run, for instance, makes its charter plots legal to WORK for as long
// as the contract is active, without changing the pilot's standing rights.
export function getContractGrantedClaimIds(state) {
  const ids = new Set();
  Object.values(state?.contracts?.records ?? {}).forEach((contract) => {
    if (contract.status !== "active") return;
    (contract.terms?.sourceClaimIds ?? []).forEach((claimId) => ids.add(claimId));
  });
  return ids;
}

// Resolve the pilot's access to one plot for one action ("mine" or "fly").
//   { controlled: false, allowed: true }                    — open ground
//   { controlled: true,  allowed: true,  via: "held-right" } — pilot's own right
//   { controlled: true,  allowed: true,  via: "contract" }  — granted by a job (mining only)
//   { controlled: true,  allowed: false, authorityId }      — off-limits
export function evaluatePlotAccess(state, plot, action = "mine", grantedClaimIds = null) {
  const rightKey = ACTION_RIGHT_KEY[action] ?? action;
  const right = plot?.rights?.[rightKey];
  if (!rightRequires(right)) {
    return { controlled: false, allowed: true };
  }
  const authorityId = right.authorityId ?? null;
  if (authorityId && getPlayerAuthorities(state, rightKey).includes(authorityId)) {
    return { controlled: true, allowed: true, authorityId, via: "held-right" };
  }
  // A job grants the right to WORK its claims, not the right to be in the region:
  // flight clearance is never conferred by a mining contract.
  if (action === "mine") {
    const granted = grantedClaimIds ?? getContractGrantedClaimIds(state);
    if (granted.has(plot.id) || (plot.sourceClaimId && granted.has(plot.sourceClaimId))) {
      return { controlled: true, allowed: true, authorityId, via: "contract" };
    }
  }
  return { controlled: true, allowed: false, authorityId };
}

// What the viewport draws: the pilot's restriction on a plot, or null if clear.
// Flight is the stronger restriction — if you may not be here at all, that is
// what the label leads with; a mining-only restriction means fly through but do
// not dig.
export function getPlotRestriction(state, plot, grantedClaimIds = null) {
  const mine = evaluatePlotAccess(state, plot, "mine", grantedClaimIds);
  const fly = evaluatePlotAccess(state, plot, "fly", grantedClaimIds);
  const noMine = mine.controlled && !mine.allowed;
  const noFly = fly.controlled && !fly.allowed;
  if (!noMine && !noFly) return null;
  return {
    noMine,
    noFly,
    label: noFly ? "NO FLIGHT RIGHTS" : "NO MINING RIGHTS",
    authorityId: (noFly ? fly.authorityId : mine.authorityId) ?? null,
  };
}

export function isPlotRestrictedForPlayer(state, plot, grantedClaimIds = null) {
  return getPlotRestriction(state, plot, grantedClaimIds) !== null;
}

// ── Back-compat mining-only helpers (kept: existing callers and tests) ────────
export function miningRequiresRight(miningRight) {
  return rightRequires(miningRight);
}
export function getPlayerMiningAuthorities(state) {
  return getPlayerAuthorities(state, "mining");
}
export function evaluatePlotMiningAccess(state, plot, grantedClaimIds = null) {
  return evaluatePlotAccess(state, plot, "mine", grantedClaimIds);
}

// "copperline-prospectors" -> "Copperline Prospectors", for labels.
export function humanizeAuthorityId(authorityId) {
  return String(authorityId ?? "")
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ") || "an authority";
}
