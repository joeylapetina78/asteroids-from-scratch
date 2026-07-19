import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260718-2008-0fd02ac";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
