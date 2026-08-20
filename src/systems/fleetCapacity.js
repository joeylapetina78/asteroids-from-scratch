import { createNeedRecord, planResponses, resolveInstitutionPolicy } from "./institutionDecision.js?v=fresh-20260820-1818-9a1a051";
import { getActorProtectedCash, getActorTraits } from "./actorConfig.js?v=fresh-20260820-1818-9a1a051";

// How an operator decides how much fleet to carry.
//
// WHY THIS EXISTS: `miningOperation.assessHiring` and `assessExpansion` were the
// generic decision loop written out longhand — derive a need, propose a
// response, check it can be paid for, commit — with the thresholds as MODULE
// CONSTANTS. `HIRE_AFTER_BUSY_SECONDS`, `RELEASE_AFTER_IDLE_SECONDS`,
// `HIRE_COST`, `MIN_FLEET` and `MAX_FLEET` applied to every mining company in
// the world, so Ivo Cinder (growthBias 0.55, caution 0.40) and Rhea Flint
// (growthBias 0.28, caution 0.72) grew their fleets at exactly the same rate.
// Two carefully authored temperaments met one `const` and became the same
// company.
//
// So the constants become POLICY, resolved per actor, and the choice runs
// through `institutionDecision` rather than beside it. What is left in
// `miningOperation` is execution — hiring a ship is a mining-specific act, but
// deciding to is not.
//
// THE SPLIT: this module decides WHETHER and WHICH. It never hires, releases or
// spends. Callers hand in capabilities that know how to do those things and get
// back a ranked, affordable plan. That is what lets a hauler fleet or a patrol
// wing reuse this without either of them knowing what an ore worker is.

export const FLEET_NEED = Object.freeze({
  CAPACITY: "fleet-capacity",         // work is being turned away
  SURPLUS: "surplus-capacity",        // a ship is being carried for nothing
  // Capacity somebody has ALREADY decided to add, waiting only on money. An
  // approved project carries its own justification — whatever approved it knew
  // something the generic busy clock does not — so it must not be gated behind
  // that clock a second time. Making it wait for the fleet to also read as
  // fully committed is how an approved expansion sits approved forever.
  COMMITTED: "approved-capacity",
});

// The trait-neutral middle. An operator at 0.5 on everything behaves exactly as
// the old constants did, which is what makes this conversion checkable: the
// numbers below are the numbers that were there before.
const NEUTRAL = 0.5;

export const FLEET_CAPACITY_DEFAULTS = Object.freeze({
  hireAfterBusySeconds: 60,
  releaseAfterIdleSeconds: 120,
  minFleet: 1,
  maxFleet: 8,
  hireCost: 3500,
});

// Temperament bends the thresholds; it does not replace them.
//
// `growthBias` sets how long a full fleet must stay full before that reads as
// turning work away. `caution` sets how long an idle ship is carried before it
// reads as waste — a cautious operator is slow to hire AND slow to let go,
// because both directions are ways of being caught short. That gives Flint a
// recognisable character (reluctant, sticky) against Cinder's (quick both ways)
// out of the traits already authored for them.
export function resolveFleetPolicy(state, institutionId, overrides = {}) {
  const traits = getActorTraits(state, institutionId);
  const base = { ...FLEET_CAPACITY_DEFAULTS, ...overrides };
  const growthBias = Number.isFinite(traits?.growthBias) ? traits.growthBias : NEUTRAL;
  const caution = Number.isFinite(traits?.caution) ? traits.caution : NEUTRAL;

  return resolveInstitutionPolicy({
    institutionPolicy: {
      ...base,
      hireAfterBusySeconds: base.hireAfterBusySeconds * (1 + (NEUTRAL - growthBias)),
      releaseAfterIdleSeconds: base.releaseAfterIdleSeconds * (NEUTRAL + caution),
      protectedCash: getActorProtectedCash(state, institutionId),
      // A grower rates added capacity above the routine baseline; the engine's
      // own scorer turns this into ordering when several responses compete.
      purposeWeights: { "expand-capacity": Math.round(growthBias * 20), "reduce-carrying-cost": Math.round(caution * 20) },
    },
    controllerModifiers: { traits },
  });
}

// ── Needs ───────────────────────────────────────────────────────────────────
//
// A `FleetView` is `{ size, allBusySince, ships: [{ id, name, busy, carrying,
// idleSince }] }`. Nothing here knows what the ships do.

export function deriveFleetNeeds({ fleet, policy, now, makeId = (kind, id) => `need:${kind}:${id ?? "fleet"}` }) {
  const needs = [];
  const serviceable = fleet.ships ?? [];

  // Capacity already approved, waiting only on funding. Deliberately ahead of
  // the serviceable-ships check below: an operator whose whole fleet is in for
  // repair still wants the hull it already signed off on — arguably more than
  // usual — and gating this on having a working ship is how an approved project
  // never gets bought precisely when it is most needed.
  (fleet.approvedProjects ?? []).forEach((project) => {
    if (fleet.size >= policy.maxFleet) return;
    needs.push(createNeedRecord({
      id: makeId(FLEET_NEED.COMMITTED, project.id),
      kind: FLEET_NEED.COMMITTED,
      subject: { projectId: project.id, projectName: project.name },
      target: fleet.size + 1,
      current: fleet.size,
      shortage: 1,
      urgency: "urgent",
      purpose: "expand-capacity",
      context: { requiredCredits: project.requiredCredits ?? 0 },
      createdAt: now,
    }));
  });

  // Hiring and standing down both read the working fleet, so neither has
  // anything to say when none of it is working.
  if (serviceable.length === 0) return needs;

  const busyLongEnough = fleet.allBusySince != null
    && now - fleet.allBusySince >= policy.hireAfterBusySeconds * 1000;

  if (busyLongEnough && fleet.size < policy.maxFleet) {
    needs.push(createNeedRecord({
      id: makeId(FLEET_NEED.CAPACITY),
      kind: FLEET_NEED.CAPACITY,
      subject: { fleetSize: fleet.size },
      target: fleet.size + 1,
      current: fleet.size,
      shortage: 1,
      // Turning work away is not an emergency, but it is not routine either —
      // it is money already on the table going somewhere else.
      urgency: "urgent",
      purpose: "expand-capacity",
      context: { busySeconds: Math.round((now - fleet.allBusySince) / 1000) },
      createdAt: now,
    }));
  }

  // How many ships the fleet can spare AT ALL — computed once, against the
  // whole set, because every surplus need raised here may be acted on in the
  // same pass. The loop this replaced re-read the live fleet size on each
  // iteration, so the floor held implicitly; deriving the needs up front loses
  // that unless the cap is applied to the set. Without it a fleet with three
  // idle ships and a floor of one releases all three and stops existing.
  const spare = fleet.size - policy.minFleet;
  if (spare > 0) {
    serviceable
      .filter((ship) => {
        if (ship.busy || ship.idleSince == null) return false;
        if (now - ship.idleSince < policy.releaseAfterIdleSeconds * 1000) return false;
        // Never stand down a ship that is still carrying something — the cargo
        // would go with it. A guard, not a preference, so it lives here rather
        // than in the scoring.
        return (ship.carrying ?? 0) <= 0;
      })
      // Longest-idle first, so which ships go is stable rather than an artefact
      // of fleet ordering when more are idle than can be spared.
      .sort((first, second) => first.idleSince - second.idleSince)
      .slice(0, spare)
      .forEach((ship) => {
        needs.push(createNeedRecord({
          id: makeId(FLEET_NEED.SURPLUS, ship.id),
          kind: FLEET_NEED.SURPLUS,
          subject: { shipId: ship.id, shipName: ship.name },
          target: fleet.size - 1,
          current: fleet.size,
          shortage: 1,
          urgency: "routine",
          purpose: "reduce-carrying-cost",
          context: { idleSeconds: Math.round((now - ship.idleSince) / 1000) },
          createdAt: now,
        }));
      });
  }

  return needs;
}

// ── Capabilities ────────────────────────────────────────────────────────────
//
// Each is a way of answering a capacity need. They are ordinary capability
// records, so a fourth way to get capacity — chartering, buying a rival's
// hull — is a new record here and nothing else anywhere.

// Buy a new ship outright.
export function createHireCapability({ cost, execute }) {
  return {
    id: "hire-worker",
    canAddress: ({ need }) => need?.kind === FLEET_NEED.CAPACITY,
    propose: ({ need }) => [{
      capabilityId: "hire-worker",
      action: "hire-worker",
      purpose: need.purpose,
      urgency: need.urgency,
      estimatedCost: cost,
      // Spending the reserve on a hull is the risky direction; a cautious
      // controller discounts it through the engine's own scorer.
      risk: 0.4,
      rationale: `Every ship has been committed for ${need.context.busySeconds}s with work still waiting.`,
      execute,
    }],
  };
}

// Stand an idle ship down.
export function createReleaseCapability({ execute }) {
  return {
    id: "release-worker",
    canAddress: ({ need }) => need?.kind === FLEET_NEED.SURPLUS,
    propose: ({ need }) => [{
      capabilityId: "release-worker",
      action: "release-worker",
      purpose: need.purpose,
      urgency: need.urgency,
      estimatedCost: 0,
      risk: 0,
      subject: need.subject,
      rationale: `${need.subject.shipName ?? need.subject.shipId} has had nothing to do for ${need.context.idleSeconds}s.`,
      execute,
    }],
  };
}

// Commission an approved expansion — capacity that had to be approved before it
// could be bought, which is why it is a capability of its own rather than a
// second hire. It answers only the need approval itself raised.
export function createCommissionCapability({ execute }) {
  return {
    id: "commission-project",
    canAddress: ({ need }) => need?.kind === FLEET_NEED.COMMITTED,
    propose: ({ need }) => [{
      capabilityId: "commission-project",
      action: "commission-project",
      purpose: need.purpose,
      urgency: need.urgency,
      estimatedCost: need.context.requiredCredits ?? 0,
      // Buying something already approved is the least speculative way to add
      // capacity, so a cautious controller discounts it least.
      risk: 0.2,
      subject: need.subject,
      rationale: `${need.subject.projectName ?? need.subject.projectId} was approved and is waiting on funds.`,
      execute,
    }],
  };
}

// ── The plan ────────────────────────────────────────────────────────────────

// Derive what this fleet needs, then let the engine choose. The ranking, the
// one-answer-per-need rule and the running-balance affordability test all live
// in `institutionDecision.planResponses`, because they are true of every
// domain's decisions and not of fleets in particular.
export function planFleetCapacity({ institution, controller = null, fleet, policy, capabilities = [], account, now }) {
  return planResponses({
    institution,
    controller,
    needs: deriveFleetNeeds({ fleet, policy, now }),
    capabilities,
    policy,
    account,
    context: { fleet },
  });
}
