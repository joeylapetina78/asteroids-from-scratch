import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260730-2038-909a1a1";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
