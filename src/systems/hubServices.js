import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=rook-random-contracts-v2";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
