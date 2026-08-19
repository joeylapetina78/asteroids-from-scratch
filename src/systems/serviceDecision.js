import { COMPONENT_THRESHOLDS, getWorstComponent } from "./componentCondition.js?v=fresh-20260818-2212-559e0fe";
import { createNeedRecord, planResponses, resolveInstitutionPolicy } from "./institutionDecision.js?v=fresh-20260818-2212-559e0fe";
import { getActorProtectedCash, getActorTraits } from "./actorConfig.js?v=fresh-20260818-2212-559e0fe";

// When an operator takes a machine out of service.
//
// WHY THIS EXISTS: it did not. `miningOperation` withdrew a craft on exactly one
// condition —
//
//     if (componentUse.worst?.condition.stage === "failed") beginMaintenance()
//
// — so every operator in the world ran every machine to destruction, and the
// `emergency` stage (`COMPONENT_THRESHOLDS.emergency`, 0.8) that the condition
// machine goes to the trouble of computing was never once acted on. There was no
// decision here to have an opinion about, which means no operator could differ
// from another and no amount of authored temperament could show.
//
// Whether to stop earning now to avoid a breakdown later is one of the few
// genuinely characterful choices a small operator makes, so it becomes a real
// one: a cautious operator pulls a craft while it still works, a bolder one
// runs it to failure and takes the outage.
//
// THE SPLIT, as with `fleetCapacity`: this module decides WHETHER. Withdrawing
// a mining worker to Scrap Porch is a mining-specific act and stays where it is.

export const SERVICE_NEED = Object.freeze({
  WEAR: "equipment-wear",
});

const NEUTRAL = 0.5;
// How far ahead of failure the most cautious operator imaginable will pull a
// machine. Deliberately sized so that caution 1.0 lands exactly on `emergency`
// — that stage is the condition machine's own statement of "about to fail", and
// nobody should be more nervous than the machine is.
const PREVENTIVE_RANGE = (1 - COMPONENT_THRESHOLDS.emergency) / NEUTRAL;

export const SERVICE_DEFAULTS = Object.freeze({
  // Run to failure. This is what the code this replaces did, for everybody, so
  // a trait-neutral operator changes nothing.
  withdrawAtWear: COMPONENT_THRESHOLDS.failed,
});

// Only caution ABOVE the neutral middle buys preventive maintenance. Below it,
// an operator behaves exactly as the old unconditional rule did rather than
// running machines past the point they break, which is not a thing that can
// happen anyway — `failed` is the ceiling.
export function resolveServicePolicy(state, institutionId, overrides = {}) {
  const traits = getActorTraits(state, institutionId);
  const caution = Number.isFinite(traits?.caution) ? traits.caution : NEUTRAL;
  const base = { ...SERVICE_DEFAULTS, ...overrides };
  const preventive = Math.max(0, caution - NEUTRAL) * PREVENTIVE_RANGE;

  return resolveInstitutionPolicy({
    institutionPolicy: {
      ...base,
      withdrawAtWear: Math.min(
        COMPONENT_THRESHOLDS.failed,
        Math.max(COMPONENT_THRESHOLDS.emergency, base.withdrawAtWear - preventive),
      ),
      protectedCash: getActorProtectedCash(state, institutionId),
      purposeWeights: { "avoid-breakdown": Math.round(caution * 20) },
    },
    controllerModifiers: { traits },
  });
}

// A `craft` is anything `componentCondition` manages: `{ id, name, components }`.
// Nothing here knows what the machine is for.
export function deriveServiceNeeds({ craft, policy, now, makeId = (kind, id) => `need:${kind}:${id}` }) {
  const worst = getWorstComponent(craft);
  const wear = worst?.condition?.wear ?? 0;
  if (!worst || wear < policy.withdrawAtWear) return [];

  const failed = worst.condition?.stage === "failed";
  return [createNeedRecord({
    id: makeId(SERVICE_NEED.WEAR, craft.id),
    kind: SERVICE_NEED.WEAR,
    subject: { craftId: craft.id, craftName: craft.name, componentId: worst.id, componentLabel: worst.label },
    target: 0,
    current: wear,
    shortage: wear,
    // A machine that has already broken is not a judgement call any more.
    urgency: failed ? "emergency" : "urgent",
    purpose: "avoid-breakdown",
    context: { wear, stage: worst.condition?.stage ?? null, failed, threshold: policy.withdrawAtWear },
    createdAt: now,
  })];
}

// Take it out of service.
//
// `estimatedCost` is deliberately ZERO: stopping work costs nothing to decide,
// and the repair itself is billed and funded through the service provider's own
// path. Pricing the repair here would let a broke operator decline to withdraw a
// craft that has already failed — which would leave broken machines working
// forever, a strictly worse world than the one before this module.
export function createWithdrawForServiceCapability({ execute }) {
  return {
    id: "withdraw-for-service",
    canAddress: ({ need }) => need?.kind === SERVICE_NEED.WEAR,
    propose: ({ need }) => [{
      capabilityId: "withdraw-for-service",
      action: "withdraw-for-service",
      purpose: need.purpose,
      urgency: need.urgency,
      estimatedCost: 0,
      // Pulling a working machine forgoes real earnings; letting one break does
      // not, until it does. That asymmetry is what `caution` is weighing.
      risk: need.context.failed ? 0 : 0.5,
      subject: { ...need.subject, preventive: !need.context.failed, wear: need.context.wear },
      rationale: need.context.failed
        ? `${need.subject.componentLabel ?? need.subject.componentId} has failed.`
        : `${need.subject.componentLabel ?? need.subject.componentId} is at ${need.context.wear.toFixed(2)} and will fail if it keeps working.`,
      execute,
    }],
  };
}

export function planCraftService({ institution, controller = null, craft, policy, capabilities = [], account = null, now }) {
  return planResponses({
    institution,
    controller,
    needs: deriveServiceNeeds({ craft, policy, now }),
    capabilities,
    policy,
    account,
    context: { craft },
  });
}
