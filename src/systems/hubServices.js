import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260812-2142-5cc0c24";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
