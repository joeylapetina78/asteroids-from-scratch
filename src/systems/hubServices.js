import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260713-2123-91ff60b";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
