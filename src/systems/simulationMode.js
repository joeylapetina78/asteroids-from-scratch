export const DISTANT_SIMULATION_VERSION = 1;

export function ensureDistantSimulationState(state) {
  state.distantSimulation ??= { version: DISTANT_SIMULATION_VERSION, hubs: {}, transitions: [], counters: { transition: 0 } };
  state.distantSimulation.version ??= DISTANT_SIMULATION_VERSION;
  state.distantSimulation.hubs ??= {};
  state.distantSimulation.transitions ??= [];
  state.distantSimulation.counters ??= { transition: 0 };
  return state.distantSimulation;
}

export function isHubAggregated(state, institutionId) {
  return state?.distantSimulation?.hubs?.[institutionId]?.mode === "aggregate";
}

export function getHubSimulationRecord(state, institutionId) {
  return ensureDistantSimulationState(state).hubs[institutionId] ?? null;
}
