import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260822-1226-8a8ff3f3";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
