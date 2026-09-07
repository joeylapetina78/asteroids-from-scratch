import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260906-2115-5581345c";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
