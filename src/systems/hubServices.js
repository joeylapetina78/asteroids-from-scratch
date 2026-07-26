import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260726-1139-3d379b8";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
