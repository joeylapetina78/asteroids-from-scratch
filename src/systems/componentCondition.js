// Craft-level composition over the panel-agnostic condition machine.
//
// This module knows no ship classes or component names. A craft archetype passes
// component definitions and actual use by component ID. Runtime records retain
// the individual condition and service history; `aggregateWear` exists only as
// a migration projection for systems that have not moved off scalar wear yet.

import {
  accumulatePanelWear,
  createPanelCondition,
  ensurePanelCondition,
  panelStageIndex,
  repairPanelCondition,
} from "./panelMaintenance.js?v=fresh-20260806-2000-39c17e6";

export const COMPONENT_THRESHOLDS = Object.freeze({ degraded: 0.55, emergency: 0.8, failed: 1 });

export function ensureCraftComponents(craft, definitions, { initialWear = 0 } = {}) {
  craft.components ??= {};
  definitions.forEach((definition) => {
    const component = craft.components[definition.id] ??= {
      id: definition.id,
      label: definition.label ?? definition.id,
      capabilityIds: [...(definition.capabilityIds ?? [])],
      condition: createPanelCondition(),
      serviceHistory: [],
    };
    component.label ??= definition.label ?? definition.id;
    component.capabilityIds ??= [...(definition.capabilityIds ?? [])];
    component.serviceHistory ??= [];
    ensurePanelCondition(component);
    if (!component.initialWearApplied) {
      if (initialWear > 0) {
        accumulatePanelWear(component.condition, initialWear * (definition.initialWearFactor ?? 1), COMPONENT_THRESHOLDS);
      }
      component.initialWearApplied = true;
    }
  });
  craft.aggregateWear = getAggregateComponentWear(craft);
  return craft.components;
}

export function applyCraftUse(craft, usage, { at = Date.now(), thresholds = COMPONENT_THRESHOLDS } = {}) {
  const transitions = [];
  Object.entries(usage).forEach(([componentId, wearDelta]) => {
    const component = craft.components?.[componentId];
    if (!component || wearDelta <= 0) return;
    const transition = accumulatePanelWear(component.condition, wearDelta, thresholds);
    component.lastUsedAt = at;
    component.totalUseWear = (component.totalUseWear ?? 0) + transition.effectiveWearDelta;
    if (transition.changed) transitions.push({ componentId, ...transition });
  });
  craft.aggregateWear = getAggregateComponentWear(craft);
  return { transitions, aggregateWear: craft.aggregateWear, worst: getWorstComponent(craft) };
}

export function getWorstComponent(craft) {
  return Object.values(craft.components ?? {}).sort((first, second) => {
    const stageGap = panelStageIndex(second.condition?.stage) - panelStageIndex(first.condition?.stage);
    if (stageGap !== 0) return stageGap;
    return (second.condition?.wear ?? 0) - (first.condition?.wear ?? 0);
  })[0] ?? null;
}

export function getAggregateComponentWear(craft) {
  const conditions = Object.values(craft.components ?? {}).map((component) => component.condition);
  return conditions.length > 0 ? Math.max(...conditions.map((condition) => condition?.wear ?? 0)) : 0;
}

export function serviceCraftComponent(craft, componentId, { at = Date.now(), providerId = null, repairOrderId = null } = {}) {
  const component = craft.components?.[componentId];
  if (!component) return null;
  const priorStage = repairPanelCondition(component.condition);
  component.serviceHistory ??= [];
  component.serviceHistory.push({ at, providerId, repairOrderId, priorStage,
    restoredTo: component.condition.currentCondition, lifetimeDegradation: component.condition.lifetimeDegradation });
  craft.aggregateWear = getAggregateComponentWear(craft);
  return { componentId, priorStage, condition: component.condition };
}
