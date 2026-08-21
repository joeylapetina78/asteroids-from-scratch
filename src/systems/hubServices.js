import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260821-0638-453f3f93";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
