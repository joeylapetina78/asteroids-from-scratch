import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260820-1911-46d9453";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
