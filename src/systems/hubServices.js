import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260718-1907-e22bb1b";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
