const SAVE_KEY = "asteroids.profileSave.v2";

export function shouldResetSave(search = window.location.search) {
  return new URLSearchParams(search).get("resetSave") === "1";
}

export function getDevStart(search = window.location.search) {
  return new URLSearchParams(search).get("devStart");
}

export function clearSavedProfile() {
  localStorage.removeItem(SAVE_KEY);
}

export function loadSavedProfile(state) {
  const rawSave = localStorage.getItem(SAVE_KEY);

  if (!rawSave) {
    return null;
  }

  try {
    const save = JSON.parse(rawSave);

    mergePlainObject(state.components, save.components);
    mergePlainObject(state.contracts, save.contracts);
    mergePlainObject(state.debt, save.debt);
    mergePlainObject(state.hubServices, save.hubServices);
    mergePlainObject(state.journey, save.journey);
    mergePlainObject(state.pilot, save.pilot);
    mergePlainObject(state.ship, save.ship);

    return save;
  } catch (error) {
    console.warn("Could not load saved Asteroids profile.", error);
    return null;
  }
}

export function saveProfile({ state, game, cargoHold }) {
  const save = {
    version: 1,
    savedAt: Date.now(),
    components: cloneJsonSafe(state.components),
    contracts: cloneJsonSafe(state.contracts),
    debt: cloneJsonSafe(state.debt),
    hubServices: cloneJsonSafe(state.hubServices),
    journey: cloneJsonSafe(state.journey),
    pilot: cloneJsonSafe(state.pilot),
    ship: cloneJsonSafe(state.ship),
    world: game?.getSaveSnapshot?.() ?? null,
    cargo: cargoHold?.getSaveSnapshot?.() ?? null,
  };

  localStorage.setItem(SAVE_KEY, JSON.stringify(save));
}

export function restoreSavedWorld({ save, game, cargoHold }) {
  if (!save) {
    return;
  }

  game?.loadSaveSnapshot?.(save.world);
  cargoHold?.loadSaveSnapshot?.(save.cargo);
}

function mergePlainObject(target, source) {
  if (!target || !source) {
    return;
  }

  Object.entries(source).forEach(([key, value]) => {
    if (value && typeof value === "object" && !Array.isArray(value) && target[key] && typeof target[key] === "object") {
      mergePlainObject(target[key], value);
    } else {
      target[key] = value;
    }
  });
}

function cloneJsonSafe(value) {
  return JSON.parse(JSON.stringify(value));
}
