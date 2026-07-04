import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260703-2036-4e3b414";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
