import { ensureAccounts, syncLegacyCredits } from "./accounts.js?v=fresh-20260718-2316-3243220";
import { ensureHulls, syncActiveHullFromComponents } from "./hulls.js?v=fresh-20260718-2316-3243220";
import { ensureObligations } from "./obligations.js?v=fresh-20260718-2316-3243220";

const SAVE_KEY = "asteroids.profileSave.v4";

export function shouldResetSave(search = window.location.search) {
  return new URLSearchParams(search).get("resetSave") === "1";
}

export function getDevStart(search = window.location.search) {
  return new URLSearchParams(search).get("devStart");
}

export function clearSavedProfile() {
  localStorage.removeItem(SAVE_KEY);
}

export function peekSavedDevStartId() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? (JSON.parse(raw)?.devStartId ?? null) : null;
  } catch {
    return null;
  }
}

export function loadSavedProfile(state) {
  const rawSave = localStorage.getItem(SAVE_KEY);

  if (!rawSave) {
    return null;
  }

  try {
    const save = JSON.parse(rawSave);

    state.credits = save.credits ?? save.components?.account?.credits ?? 0;
    mergePlainObject(state.accounts, save.accounts);
    ensureAccounts(state);
    if (!save.accounts) {
      state.accounts.records[state.accounts.currentAccountId].balance = state.credits;
      syncLegacyCredits(state);
    }
    mergePlainObject(state.components, save.components);
    delete state.components.account;
    delete state.components.merchant;
    delete state.components["component-shop"];
    delete state.components.contract;
    if (save.attention && !save.ui?.attention) {
      state.ui.attention = save.attention;
    }
    mergePlainObject(state.contracts, save.contracts);
    mergePlainObject(state.character, save.character);
    mergePlainObject(state.debt, save.debt);
    mergePlainObject(state.hubServices, save.hubServices);
    mergePlainObject(state.hulls, save.hulls);
    ensureHulls(state);
    mergePlainObject(state.journey, save.journey);
    const RESET_TO_DRAG_PANELS = new Set(["file-license", "offer-contract", "show-viewport", "yard-traffic-cleared"]);
    if (state.journey.mission?.id === "chapter-1-yard-exchange" && RESET_TO_DRAG_PANELS.has(state.journey.currentStepId)) {
      state.journey.currentStepId = "drag-panels";
      state.journey.flags = {};
    }
    mergePlainObject(state.legal, save.legal);
    mergePlainObject(state.obligations, save.obligations);
    ensureObligations(state);
    mergePlainObject(state.ship, save.ship);
    syncActiveHullFromComponents(state);
    mergePlainObject(state.ui, save.ui);
    mergePlainObject(state.worldRecords, save.worldRecords);

    if (!save.ship?.purchasedOfferId && save.components?.merchant?.purchasedOfferId) {
      state.ship.purchasedOfferId = save.components.merchant.purchasedOfferId;
    }

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
    devStartId: state._devStartId ?? null,
    credits: state.credits,
    accounts: cloneJsonSafe(state.accounts),
    components: cloneJsonSafe(state.components),
    contracts: cloneJsonSafe(state.contracts),
    character: cloneJsonSafe(state.character),
    debt: cloneJsonSafe(state.debt),
    hubServices: cloneJsonSafe(state.hubServices),
    hulls: cloneJsonSafe(state.hulls),
    journey: cloneJsonSafe(state.journey),
    legal: cloneJsonSafe(state.legal),
    obligations: cloneJsonSafe(state.obligations),
    ship: cloneJsonSafe(state.ship),
    ui: cloneJsonSafe(state.ui),
    worldRecords: cloneJsonSafe(state.worldRecords),
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
