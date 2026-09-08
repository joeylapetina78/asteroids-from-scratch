import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260907-2014-86f4c011";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
