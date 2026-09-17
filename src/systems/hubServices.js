import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260917-1715-cca5018f";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
