import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260908-1758-b90f0dde";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
