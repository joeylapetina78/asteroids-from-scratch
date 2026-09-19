import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260918-2018-10803e1a";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
