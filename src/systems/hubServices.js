import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260919-1538-9d02b382";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
