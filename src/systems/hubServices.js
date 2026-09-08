import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260907-2037-8d2a468d";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
