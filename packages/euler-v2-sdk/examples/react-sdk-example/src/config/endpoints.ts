const configuredV3Endpoint = import.meta.env.VITE_EULER_V3_ENDPOINT as
  | string
  | undefined;

export const V3_PROXY_ENDPOINT =
  (import.meta.env.VITE_EULER_V3_PROXY_ENDPOINT as string | undefined) ??
  (configuredV3Endpoint?.startsWith("/") ? configuredV3Endpoint : "/api/v3");

export const V3_DIRECT_ENDPOINT =
  (import.meta.env.VITE_EULER_V3_DIRECT_ENDPOINT as string | undefined) ??
  (configuredV3Endpoint && !configuredV3Endpoint.startsWith("/")
    ? configuredV3Endpoint
    : "https://v3staging.eul.dev");

export function getV3ApiEndpoint(proxyV3Calls: boolean): string {
  return proxyV3Calls ? V3_PROXY_ENDPOINT : V3_DIRECT_ENDPOINT;
}
