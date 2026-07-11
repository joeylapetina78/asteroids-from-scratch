import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260711-0000-b3e4376";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
