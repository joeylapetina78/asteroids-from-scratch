import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260812-1801-94af5ff";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
