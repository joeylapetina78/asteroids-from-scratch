import { resourceTypesMatch } from "./resourceDefinitions.js?v=fresh-20260703-2331-c066ca2";

export function matchesEventRule(rule, event, { state }) {
  if (!rule.repeatable && rule.once && state.journey.flags[rule.setFlag ?? rule.id]) {
    return false;
  }

  if (rule.repeatable && rule.cooldownMs) {
    const lastAt = state.journey.flags[getRuleLastAtKey(rule)] ?? 0;

    if (Date.now() - lastAt < rule.cooldownMs) {
      return false;
    }
  }

  if (rule.maxRuns !== undefined && getRuleRunCount(rule, state) >= rule.maxRuns) {
    return false;
  }

  if (rule.requiresFlag && !state.journey.flags[rule.requiresFlag]) {
    return false;
  }

  if (rule.requiresFlags?.some((flag) => !state.journey.flags[flag])) {
    return false;
  }

  if (rule.eventType !== event.type) {
    return false;
  }

  if (!matchesPayload(rule.payloadEquals ?? {}, event.payload ?? {})) {
    return false;
  }

  return matchesConditions(rule, event, { state });
}

export function applyRuleMarkers(rule, { state }) {
  if (rule.setFlag) {
    state.journey.flags[rule.setFlag] = true;
  }

  if (rule.repeatable || rule.responses?.length || rule.maxRuns !== undefined) {
    state.journey.flags[getRuleCountKey(rule)] = getRuleRunCount(rule, state) + 1;
    state.journey.flags[getRuleLastAtKey(rule)] = Date.now();
  }
}

export function getRuleActions(rule, { state }) {
  if (!rule.responses?.length) {
    return rule.actions ?? [];
  }

  const runCount = getRuleRunCount(rule, state);
  const responseIndex =
    rule.responseMode === "loop"
      ? runCount % rule.responses.length
      : Math.min(runCount, rule.responses.length - 1);
  const response = rule.responses[responseIndex];

  return [
    ...(rule.beforeResponseActions ?? []),
    { type: "say", ...response },
    ...(rule.afterResponseActions ?? []),
  ];
}

function getRuleRunCount(rule, state) {
  return state.journey.flags[getRuleCountKey(rule)] ?? 0;
}

function getRuleCountKey(rule) {
  return `rule:${rule.id}:count`;
}

function getRuleLastAtKey(rule) {
  return `rule:${rule.id}:lastAt`;
}

function matchesPayload(expectedPayload, actualPayload) {
  return Object.entries(expectedPayload).every(([key, expectedValue]) => {
    if (typeof expectedValue === "string" && expectedValue.startsWith("not:")) {
      return actualPayload[key] !== expectedValue.slice(4);
    }

    if (key === "resourceType") {
      return resourceTypesMatch(actualPayload[key], expectedValue);
    }

    return actualPayload[key] === expectedValue;
  });
}

function matchesConditions(rule, event, { state }) {
  const ledger = state.ledger;

  if (rule.requiresSignal && !ledger.getSignal(rule.requiresSignal)) {
    return false;
  }

  if (rule.requiresSignals?.some((signal) => !ledger.getSignal(signal))) {
    return false;
  }

  if (rule.forbidSignal && ledger.getSignal(rule.forbidSignal)) {
    return false;
  }

  if (rule.forbidSignals?.some((signal) => ledger.getSignal(signal))) {
    return false;
  }

  if (rule.requiresStat && !matchesStatCondition(rule.requiresStat, state)) {
    return false;
  }

  if (rule.requiresStats?.some((condition) => !matchesStatCondition(condition, state))) {
    return false;
  }

  if (rule.requiresRecentEvent && !matchesRecentEventCondition(rule.requiresRecentEvent, state)) {
    return false;
  }

  if (typeof rule.requiresCondition === "function") {
    return Boolean(rule.requiresCondition({ event, ledger, state }));
  }

  return true;
}

function matchesStatCondition(condition, state) {
  const value = state.ledger.getStat(condition.key, condition.fallback ?? 0);

  if (condition.equals !== undefined && value !== condition.equals) {
    return false;
  }

  if (condition.min !== undefined && value < condition.min) {
    return false;
  }

  if (condition.max !== undefined && value > condition.max) {
    return false;
  }

  return true;
}

function matchesRecentEventCondition(condition, state) {
  const lastSeen = state.ledger.getLastSeen(condition.type);

  if (!lastSeen) {
    return false;
  }

  if (condition.withinMs !== undefined && Date.now() - lastSeen.time > condition.withinMs) {
    return false;
  }

  return matchesPayload(condition.payloadEquals ?? {}, lastSeen.payload ?? {});
}
