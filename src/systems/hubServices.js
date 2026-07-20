import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260719-2003-2d72582";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
