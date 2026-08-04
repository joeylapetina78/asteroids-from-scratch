import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260803-1917-5d1b109";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
