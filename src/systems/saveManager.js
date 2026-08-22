import { ensureAccounts, syncLegacyCredits } from "./accounts.js?v=fresh-20260822-1226-8a8ff3f3";
import { ensureHulls, syncActiveHullFromComponents } from "./hulls.js?v=fresh-20260822-1226-8a8ff3f3";
import { ensureObligations } from "./obligations.js?v=fresh-20260822-1226-8a8ff3f3";
import { ensurePanelCondition } from "./panelMaintenance.js?v=fresh-20260822-1226-8a8ff3f3";
import { consolidateSprcOwnership } from "./sprcOwnership.js?v=fresh-20260822-1226-8a8ff3f3";
import { listGeneratedSettlements, materializeSettlementAuthority } from "./settlementSeedPipeline.js?v=fresh-20260822-1226-8a8ff3f3";

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

    state.ledger?.loadSaveSnapshot?.(save.ledger);

    state.credits = save.credits ?? save.components?.account?.credits ?? 0;
    mergePlainObject(state.accounts, save.accounts);
    ensureAccounts(state);
    if (!save.accounts) {
      state.accounts.records[state.accounts.currentAccountId].balance = state.credits;
      syncLegacyCredits(state);
    }
    mergePlainObject(state.components, save.components);
    // Migration: older saves predate panel conditions. Guarantee the engine
    // carries a well-formed condition object (defaults to healthy).
    ensurePanelCondition(state.components.engine);
    ensurePanelCondition(state.components.hull);
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
    mergePlainObject(state.authorities, save.authorities);
    mergePlainObject(state.settlements, save.settlements);
    mergePlainObject(state.distantSimulation, save.distantSimulation);
    if (save.wrecks) state.wrecks = cloneJsonSafe(save.wrecks);
    mergePlainObject(state.sprc, save.sprc);
    mergePlainObject(state.logistics, save.logistics);
    mergePlainObject(state.population, save.population);
    mergePlainObject(state.hubProcurement, save.hubProcurement);
    mergePlainObject(state.industrial, save.industrial);
    mergePlainObject(state.npcDevelopment, save.npcDevelopment);
    if (save.relationships) state.relationships = cloneJsonSafe(save.relationships);
    mergePlainObject(state.towing, save.towing);
    if (save.fleetInsurance) state.fleetInsurance = cloneJsonSafe(save.fleetInsurance);
    if (save.fleetProtection) state.fleetProtection = cloneJsonSafe(save.fleetProtection);
    // The gate-bounty fund depletes as it pays out, so it has to survive a
    // reload; the live attack reports do not — they are transient and expire.
    if (save.gateBounty) state.gateBounty = cloneJsonSafe(save.gateBounty);
    // Rebuild derived legal/place projections from the durable source seeds.
    // Live treasuries and populations remain the restored domain records.
    listGeneratedSettlements(state).forEach((seed) => materializeSettlementAuthority(state, seed));

    // Old profiles held an independent SPRC treasury. Merge it exactly once;
    // current profiles merely need their JSON-cloned compatibility account
    // rebound to Scrap Porch's authoritative account object.
    consolidateSprcOwnership(state, {
      mergeLegacyTreasury: !save.sprc?.ownership?.consolidated,
      legacyTreasury: save.sprc?.account ?? null,
      at: save.savedAt ?? Date.now(),
    });

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
    authorities: cloneJsonSafe(state.authorities),
    settlements: cloneJsonSafe(state.settlements),
    distantSimulation: cloneJsonSafe(state.distantSimulation),
    wrecks: cloneJsonSafe(state.wrecks),
    ledger: state.ledger?.getSaveSnapshot?.() ?? null,
    sprc: cloneJsonSafe(state.sprc),
    logistics: cloneJsonSafe(state.logistics),
    population: cloneJsonSafe(state.population),
    hubProcurement: cloneJsonSafe(state.hubProcurement),
    industrial: cloneJsonSafe(state.industrial),
    npcDevelopment: cloneJsonSafe(state.npcDevelopment),
    relationships: cloneJsonSafe(state.relationships),
    towing: cloneJsonSafe(state.towing),
    fleetInsurance: cloneJsonSafe(state.fleetInsurance),
    fleetProtection: cloneJsonSafe(state.fleetProtection),
    gateBounty: cloneJsonSafe(state.gateBounty),
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
  // Some state slices are created lazily by their subsystem (e.g. state.wrecks
  // only exists once the wreck registry first runs). A save that fires before
  // that must not crash on `JSON.parse(JSON.stringify(undefined))` — a missing
  // optional slice is simply absent, restored as its subsystem re-initializes it.
  if (value === undefined) return null;
  return JSON.parse(JSON.stringify(value));
}
