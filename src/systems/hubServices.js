import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260801-2328-b73c5fd";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
