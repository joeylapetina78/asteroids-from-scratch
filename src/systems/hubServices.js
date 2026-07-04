import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260703-2059-1d6effa";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
