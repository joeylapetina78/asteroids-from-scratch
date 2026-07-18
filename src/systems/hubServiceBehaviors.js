export const HUB_SERVICE_BEHAVIOR_BY_TYPE = {
  shipyard: {
    panelId: "merchant",
    prompt: "ship offers are open at the yard window.",
  },
  contracts: {
    panelId: "contract",
    prompt: "open contracts are handled here. Rook offers one job from the board at a time.",
    offersContracts: true,
  },
  finance: {
    panelId: "contract",
    prompt: "financing records are handled through active contracts.",
    offersContracts: true,
  },
  permits: {
    panelId: "contract",
    prompt: "zone flight rights and hub docking permits are sold here.",
    offersContracts: true,
  },
  supply: {
    panelId: "finley",
    prompt: "Finley handles repair and cargo sales here.",
  },
  components: {
    panelId: "component-shop",
    prompt: "component refits and bolt-on ship modifications are sold here.",
  },
  roadmap: {
    panelId: "roadmap",
    prompt: "Murmur keeps a future-board in the back corridor.",
  },
};

export function getHubServiceBehavior(service) {
  return HUB_SERVICE_BEHAVIOR_BY_TYPE[service?.serviceType] ?? {
    panelId: null,
    prompt: service?.description ?? "",
  };
}

export function getHubServicePrompt(service) {
  return getHubServiceBehavior(service).prompt;
}

export function shouldKeepServiceWindowOpen(serviceType, panelId) {
  return getServiceTypesForPanel(panelId).includes(serviceType);
}

export function getServiceTypesForPanel(panelId) {
  return Object.entries(HUB_SERVICE_BEHAVIOR_BY_TYPE)
    .filter(([, behavior]) => behavior.panelId === panelId)
    .map(([serviceType]) => serviceType);
}

export function getPanelForServiceType(serviceType) {
  return HUB_SERVICE_BEHAVIOR_BY_TYPE[serviceType]?.panelId ?? null;
}
