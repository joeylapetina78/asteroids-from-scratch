import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260731-2336-b77e55a";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
