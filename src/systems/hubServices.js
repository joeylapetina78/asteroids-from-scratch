import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260813-2143-3cd1c72";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
