import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260801-1152-2b2fe1f";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
