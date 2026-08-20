import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260820-1818-9a1a051";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
