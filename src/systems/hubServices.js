import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260717-2226-d0a062a";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
