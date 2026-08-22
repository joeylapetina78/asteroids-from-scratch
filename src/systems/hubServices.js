import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260821-2344-8ca142c4";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
