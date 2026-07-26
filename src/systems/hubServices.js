import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260726-1600-f2e1678";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
