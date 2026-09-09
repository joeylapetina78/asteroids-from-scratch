import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260908-1911-da7e283e";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
