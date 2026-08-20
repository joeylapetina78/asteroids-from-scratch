// Operating rights: may the pilot work or even fly this ground right now, and if
// not, is it controlled space they simply lack the right for?
//
// This is the READ side of the rights model. It grants nothing and enforces
// nothing — it answers "may I mine / fly here?" so the viewport can show where
// the pilot is clear and where they are not.
//
// Two DIFFERENT rights, because the world enforces them differently today:
//
//   FLIGHT is scoped by ZONE, on the pilot license. The license lists the named
//   zones the pilot may enter; a hub inspection flags any visit to a zone outside
//   that list (`getUnauthorizedVisitedZones`). So the no-fly overlay is driven by
//   exactly that rule — red means "enter here and the next hub check flags you".
//
//   MINING is scoped by AUTHORITY, on a per-region charter/claim/lease/permit.
//   The pilot holds a set of mining authorities (Rook's sponsoring permit to
//   start); an active source-limited contract grants its own specific claims for
//   WORK. This is advisory until enforcement lands, but it is the shape the
//   mining economy already uses.
//
// Not a `player.canMine` flag: rights are sets the pilot holds (zones, authorities)
// checked against what each plot carries.

import { RIGHT_TYPES } from "./authorityModel.js?v=fresh-20260820-0654-6716a5f";
import { evaluateTerritoryAccess } from "./hubTerritories.js?v=fresh-20260820-0654-6716a5f";

const RIGHT_REQUIRING_STATUS = /required|restricted/i;
// The zone influence at which the ship is considered to have ENTERED a zone —
// the same threshold Game.updateZoneTitle uses before it logs a zone entry, so
// the overlay shades exactly the ground a visit would be recorded from.
const ZONE_ENTRY_INFLUENCE = 0.55;

// ── Mining (authority-scoped permit) ─────────────────────────────────────────

export function miningRequiresRight(miningRight) {
  return Boolean(miningRight?.status) && RIGHT_REQUIRING_STATUS.test(miningRight.status);
}

export function getPlayerMiningAuthorities(state) {
  return state?.legal?.operatingRights?.mining?.authorityIds ?? [];
}

// The specific claims any active source-limited contract grants the pilot to WORK.
export function getContractGrantedClaimIds(state) {
  const ids = new Set();
  Object.values(state?.contracts?.records ?? {}).forEach((contract) => {
    if (contract.status !== "active") return;
    (contract.terms?.sourceClaimIds ?? []).forEach((claimId) => ids.add(claimId));
  });
  return ids;
}

export function evaluatePlotMiningAccess(state, plot, grantedClaimIds = null) {
  const territory = plot?.center ? evaluateTerritoryAccess(state, plot.center, RIGHT_TYPES.MINING) : null;
  if (!territory?.controlled) return { controlled: false, allowed: true, via: "unclaimed-frontier" };
  if (territory.allowed) return { controlled: true, allowed: true, territoryId: territory.territory.id, via: "territory-grant" };
  const granted = grantedClaimIds ?? getContractGrantedClaimIds(state);
  if (granted.has(plot.id) || (plot.sourceClaimId && granted.has(plot.sourceClaimId))) {
    return { controlled: true, allowed: true, territoryId: territory.territory.id, via: "contract" };
  }
  return {
    controlled: true,
    allowed: false,
    territoryId: territory.territory.id,
    territoryName: territory.territory.name,
    territory: territory.territory,
  };
}

// ── Flight (zone-scoped pilot license — the rule the hub actually enforces) ───

export function getPlayerAuthorizedZones(state) {
  return state?.legal?.pilotLicense?.authorizedZones ?? [];
}

// A plot is a no-fly when it sits firmly inside a named zone the license does not
// authorize. Open space and weak zone fringes are never a violation.
export function evaluateFlightAccess(state, plot) {
  const territory = plot?.center ? evaluateTerritoryAccess(state, plot.center, RIGHT_TYPES.TRANSIT) : null;
  return territory?.controlled
    ? { controlled: true, allowed: true, via: territory.allowed ? territory.via : "open-transit", territoryId: territory.territory.id }
    : { controlled: false, allowed: true, via: "open-transit" };
}

// ── Combined ─────────────────────────────────────────────────────────────────

export function evaluatePlotAccess(state, plot, action = "mine", grantedClaimIds = null) {
  return action === "fly"
    ? evaluateFlightAccess(state, plot)
    : evaluatePlotMiningAccess(state, plot, grantedClaimIds);
}

// What the viewport draws for a plot, or null if it is clear. Flight is the
// harder restriction — you may not even be here — so it leads the label; a
// mining-only restriction means fly through but do not dig.
export function getPlotRestriction(state, plot, grantedClaimIds = null) {
  const mine = evaluatePlotMiningAccess(state, plot, grantedClaimIds);
  const fly = evaluateFlightAccess(state, plot);
  const noMine = mine.controlled && !mine.allowed;
  const noFly = fly.controlled && !fly.allowed;
  if (!noMine && !noFly) return null;
  if (noFly) {
    return { noMine, noFly, label: "NO FLIGHT CLEARANCE", sublabel: fly.zoneName ?? "" };
  }
  const territory = mine.territory;
  return {
    noMine,
    noFly,
    territoryId: territory?.id ?? null,
    color: territory?.color ?? [255, 92, 108],
    label: `${territory?.name?.replace(/ Jurisdiction$/, "") ?? "HUB"} JURISDICTION`,
    sublabel: "MINING RIGHTS REQUIRED",
    detailLines: [
      "MINING RIGHTS REQUIRED",
      `CLEAR AT ${String(territory?.clearanceOfficeName ?? "Yard Exchange Travel Authority").toUpperCase()}`,
    ],
  };
}

export function isPlotRestrictedForPlayer(state, plot, grantedClaimIds = null) {
  return getPlotRestriction(state, plot, grantedClaimIds) !== null;
}

// "copperline-prospectors" -> "Copperline Prospectors", for labels.
export function humanizeAuthorityId(authorityId) {
  return String(authorityId ?? "")
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ") || "an authority";
}
