import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260916-2047-f04aec86";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
