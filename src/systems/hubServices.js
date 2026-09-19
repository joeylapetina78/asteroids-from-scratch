import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260918-2005-906ca879";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
