import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260908-2102-2b391a0a";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
