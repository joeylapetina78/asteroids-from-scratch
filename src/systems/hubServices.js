import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260719-2129-6f18a9a";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
