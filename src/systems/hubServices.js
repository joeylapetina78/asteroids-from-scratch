import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=fresh-20260801-2307-1fd54b6";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
