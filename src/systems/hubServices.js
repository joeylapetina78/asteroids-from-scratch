import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260822-0010-4a2fda0d";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
