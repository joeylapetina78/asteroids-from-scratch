import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260906-2130-f16b8333";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
