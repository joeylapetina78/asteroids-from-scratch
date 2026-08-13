import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260812-2045-3ff3331";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
