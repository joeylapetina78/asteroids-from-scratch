import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260808-2209-d56d3b0";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
