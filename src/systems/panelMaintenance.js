// Shared ship-maintenance seam. This is deliberately panel-agnostic: hull is the
// first caller, but the same pieces are meant to serve every major panel once
// the wear/condition system lands (engine, scanner, processor, ...). Keep domain
// nouns out of here — a "panel" is anything with { integrity, maxIntegrity } and
// a "reserve holder" is anything carrying a numeric `repairReserve`.

// How long a panel must go WITHOUT taking fresh damage before stored patch
// material starts flowing back into it. Tunable by feel.
export const HULL_REPAIR_DELAY_SECONDS = 5;

// Integrity points restored per second once patching is active. At 20/s a full
// 100-point hull re-patches in ~5s and a small top-off resolves in well under 1s.
export const HULL_REPAIR_RATE = 20;
export const HULL_REPAIR_START_RATE_MULTIPLIER = 0.1;

// Onboard patching deliberately starts as a cautious trickle, then accelerates
// as the repair settles in. Progress is measured against the integrity the
// current repair episode can actually reach, so a partly filled reserve still
// gets the complete 10%-to-100% curve.
export function getHullRepairRateMultiplier(currentIntegrity, startIntegrity, targetIntegrity) {
  const span = Math.max(0, (targetIntegrity ?? 0) - (startIntegrity ?? 0));

  if (span <= 0) {
    return 1;
  }

  const progress = Math.min(1, Math.max(0, ((currentIntegrity ?? 0) - startIntegrity) / span));
  return HULL_REPAIR_START_RATE_MULTIPLIER + (1 - HULL_REPAIR_START_RATE_MULTIPLIER) * progress;
}

// Clamp a tank value into [0, max]. Used for every onboard tank (fuel, charge,
// scanergy, repair reserve) so nothing can be overfilled past its capacity.
// A non-finite max means "uncapped" (defensive; all real tanks have a cap).
export function addToTank(current, amount, max) {
  const next = (current ?? 0) + (amount ?? 0);
  const capped = Number.isFinite(max) ? Math.min(max, next) : next;
  return Math.max(0, capped);
}

// ── Shared panel-condition machine ─────────────────────────────────────────
// Persistent wear/fault state that any panel can carry. This layer is strictly
// panel-agnostic: it knows only "wear accumulates, thresholds define a stage,
// service clears it." Panel-specific wear rates, thresholds, and symptoms live
// in per-panel config/handlers (e.g. engineCondition.js), never here. The engine
// is the first caller; hull/scanner/processor/tractor reuse the same functions.

export const PANEL_STAGES = ["healthy", "degraded", "emergency", "failed"];
export const MIN_RECOVERABLE_CONDITION = 35;
export const LIFETIME_DEGRADATION_PER_WEAR = 0.003;
export const DEFERRED_MAINTENANCE_WEAR_MULTIPLIER = 0.15;

export function createPanelCondition() {
  return {
    stage: "healthy",
    wear: 0,
    currentCondition: 100,
    lifetimeDegradation: 0,
    maxRecoverableCondition: 100,
    serviceCount: 0,
  };
}

// Guarantee a component carries a well-formed condition object. Tolerates old
// saves where it was absent or a bare string placeholder (migration seam).
export function ensurePanelCondition(component) {
  if (!component) {
    return null;
  }

  if (!component.condition || typeof component.condition !== "object") {
    component.condition = createPanelCondition();
    return component.condition;
  }

  if (!PANEL_STAGES.includes(component.condition.stage)) {
    component.condition.stage = "healthy";
  }
  if (typeof component.condition.wear !== "number" || component.condition.wear < 0) {
    component.condition.wear = 0;
  }
  if (typeof component.condition.lifetimeDegradation !== "number" || component.condition.lifetimeDegradation < 0) {
    component.condition.lifetimeDegradation = 0;
  }
  component.condition.maxRecoverableCondition = Math.max(
    MIN_RECOVERABLE_CONDITION,
    100 - component.condition.lifetimeDegradation,
  );
  if (typeof component.condition.currentCondition !== "number") {
    component.condition.currentCondition = component.condition.maxRecoverableCondition;
  }
  component.condition.currentCondition = Math.max(0, Math.min(
    component.condition.maxRecoverableCondition,
    component.condition.currentCondition,
  ));
  if (!Number.isInteger(component.condition.serviceCount) || component.condition.serviceCount < 0) {
    component.condition.serviceCount = 0;
  }
  return component.condition;
}

export function panelStageIndex(stage) {
  const index = PANEL_STAGES.indexOf(stage);
  return index < 0 ? 0 : index;
}

// Which stage a given wear total lands in. `thresholds` = cumulative wear where
// each worse stage begins; the gap between thresholds is that stage's "grace
// window" of extra use before the next escalation.
export function stageForWear(wear, thresholds) {
  if (wear >= thresholds.failed) return "failed";
  if (wear >= thresholds.emergency) return "emergency";
  if (wear >= thresholds.degraded) return "degraded";
  return "healthy";
}

// Add use-driven wear and recompute the stage. Returns whether the stage
// changed (and both stages) so the panel's effect handler can react — fire a
// fault message, escalate audio, route a failure to distress, etc.
export function accumulatePanelWear(condition, wearDelta, thresholds) {
  const previousStage = condition.stage;
  const deferredMaintenanceMultiplier = 1 + panelStageIndex(previousStage) * DEFERRED_MAINTENANCE_WEAR_MULTIPLIER;
  const effectiveWearDelta = Math.max(0, wearDelta ?? 0) * deferredMaintenanceMultiplier;
  condition.wear = Math.max(0, (condition.wear ?? 0) + effectiveWearDelta);
  condition.lifetimeDegradation = Math.max(0,
    (condition.lifetimeDegradation ?? 0) + effectiveWearDelta * LIFETIME_DEGRADATION_PER_WEAR);
  condition.maxRecoverableCondition = Math.max(MIN_RECOVERABLE_CONDITION, 100 - condition.lifetimeDegradation);
  const wearFraction = Math.min(1, condition.wear / Math.max(1, thresholds.failed));
  condition.currentCondition = Math.max(0, condition.maxRecoverableCondition * (1 - wearFraction));
  const stage = stageForWear(condition.wear, thresholds);
  condition.stage = stage;
  return { changed: stage !== previousStage, previousStage, stage, effectiveWearDelta, deferredMaintenanceMultiplier };
}

// Shared service seam: any provider (dock repair now, material-based SPRC
// service later) calls this to restore a panel to healthy. Returns the stage it
// was at, so the provider can price/log the repair by severity. There is no
// second "magical" repair path — providers all funnel through here.
export function repairPanelCondition(condition) {
  const previousStage = condition?.stage ?? "healthy";
  if (condition) {
    condition.wear = 0;
    condition.stage = "healthy";
    condition.currentCondition = condition.maxRecoverableCondition ?? 100;
    condition.serviceCount = (condition.serviceCount ?? 0) + 1;
  }
  return previousStage;
}

// Routine service is deliberately ship-owner facing rather than component
// facing: one general inspection tends every still-serviceable system at once.
// It removes most ordinary wear, but an emergency/failed part has become a
// diagnosed repair and is left for a capable repair shop.
export function routineServicePanelCondition(condition, thresholds, { wearRemaining = 0.25 } = {}) {
  const previousStage = condition?.stage ?? "healthy";
  if (!condition || previousStage === "emergency" || previousStage === "failed") {
    return { serviced: false, previousStage, stage: previousStage };
  }
  condition.wear = Math.max(0, (condition.wear ?? 0) * wearRemaining);
  condition.stage = stageForWear(condition.wear, thresholds);
  const wearFraction = Math.min(1, condition.wear / Math.max(1, thresholds.failed));
  condition.currentCondition = Math.max(0, (condition.maxRecoverableCondition ?? 100) * (1 - wearFraction));
  condition.serviceCount = (condition.serviceCount ?? 0) + 1;
  return { serviced: true, previousStage, stage: condition.stage };
}

// Transfer stored reserve into a panel's missing integrity, 1:1, bounded by the
// panel's headroom, the available reserve, and this frame's rate budget. Mutates
// `panel.integrity` and `reserveHolder.repairReserve`, and returns the amount
// actually patched. Conservation invariant: the reserve decreases by exactly the
// integrity gained, and neither side crosses its bound.
export function applyPanelPatch(panel, reserveHolder, budget) {
  const missing = Math.max(0, (panel.maxIntegrity ?? 0) - (panel.integrity ?? 0));
  const reserve = Math.max(0, reserveHolder.repairReserve ?? 0);
  const patched = Math.min(missing, reserve, Math.max(0, budget ?? 0));

  if (patched <= 0) {
    return 0;
  }

  panel.integrity = (panel.integrity ?? 0) + patched;
  reserveHolder.repairReserve = reserve - patched;
  return patched;
}
