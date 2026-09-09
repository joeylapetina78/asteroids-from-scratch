import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260908-2017-938406fa";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
