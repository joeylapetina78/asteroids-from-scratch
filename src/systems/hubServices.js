import { hubServiceDefinitions } from "../content/hubs/yardExchangeServices.js?v=hub-contract-windows-v1";

export function getHubServices(siteId) {
  return hubServiceDefinitions[siteId] ?? [];
}

export function getHubService(siteId, serviceId) {
  return getHubServices(siteId).find((service) => service.id === serviceId) ?? null;
}
