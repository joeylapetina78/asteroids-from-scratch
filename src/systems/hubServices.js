import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260915-2119-b800b8df";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
