import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260731-1848-975f9ca";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
