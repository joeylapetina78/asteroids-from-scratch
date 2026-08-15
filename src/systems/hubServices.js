import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260814-2029-4c85d98";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
