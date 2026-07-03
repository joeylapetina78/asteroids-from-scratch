const INITIAL_HULL_VIN = "YRDSKF-01-7A3";

export function createInitialHulls() {
  return {
    activeHullVin: INITIAL_HULL_VIN,
    records: {
      [INITIAL_HULL_VIN]: {
        vin: INITIAL_HULL_VIN,
        name: "Yard Skiff",
        frameId: "yard-skiff",
        status: "borrowed",
        installedComponentIds: ["hull"],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    },
  };
}

export function ensureHulls(state) {
  if (!state.hulls) {
    state.hulls = createInitialHulls();
  }

  state.hulls.records ??= {};
  state.hulls.activeHullVin ??= state.character?.activeHullVin ?? state.components?.hull?.vin ?? INITIAL_HULL_VIN;

  if (!state.hulls.records[state.hulls.activeHullVin]) {
    state.hulls.records[state.hulls.activeHullVin] = {
      vin: state.hulls.activeHullVin,
      name: state.ship?.name ?? "Unknown Hull",
      frameId: state.ship?.frameId ?? null,
      status: "active",
      installedComponentIds: getInstalledComponentIds(state),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  return state.hulls;
}

export function registerHull(state, { vin, name, frameId, status = "active", installedComponentIds = null }) {
  const hulls = ensureHulls(state);

  hulls.records[vin] = {
    ...(hulls.records[vin] ?? {}),
    vin,
    name,
    frameId,
    status,
    installedComponentIds: installedComponentIds ?? getInstalledComponentIds(state),
    updatedAt: Date.now(),
  };

  if (!hulls.records[vin].createdAt) {
    hulls.records[vin].createdAt = hulls.records[vin].updatedAt;
  }

  return hulls.records[vin];
}

export function setActiveHull(state, vin) {
  const hulls = ensureHulls(state);
  hulls.activeHullVin = vin;

  if (state.character) {
    state.character.activeHullVin = vin;
  }

  if (state.components?.hull) {
    state.components.hull.vin = vin;
  }

  syncActiveHullFromComponents(state);
  return hulls.records[vin] ?? null;
}

export function syncActiveHullFromComponents(state) {
  const hulls = ensureHulls(state);
  const vin = state.character?.activeHullVin ?? state.components?.hull?.vin ?? hulls.activeHullVin;
  const record = registerHull(state, {
    vin,
    name: state.ship?.name ?? hulls.records[vin]?.name ?? "Unknown Hull",
    frameId: state.ship?.frameId ?? hulls.records[vin]?.frameId ?? null,
    status: hulls.records[vin]?.status ?? "active",
    installedComponentIds: getInstalledComponentIds(state),
  });

  hulls.activeHullVin = vin;
  return record;
}

function getInstalledComponentIds(state) {
  return Object.entries(state.components ?? {})
    .filter(([, component]) => component?.installed)
    .map(([componentId]) => componentId);
}
