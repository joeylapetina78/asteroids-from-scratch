import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260730-0650-ae6e94a";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
