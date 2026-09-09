import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260909-1854-f2fad7ca";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
