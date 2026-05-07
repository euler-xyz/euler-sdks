const configuredV3Endpoint = import.meta.env.EULER_SDK_V3_API_URL as
  | string
  | undefined;

export const V3_PROXY_ENDPOINT =
  (import.meta.env.EULER_SDK_V3_PROXY_API_URL as string | undefined) ??
  (configuredV3Endpoint?.startsWith("/") ? configuredV3Endpoint : "/api/v3");

export const V3_DIRECT_ENDPOINT =
  (import.meta.env.EULER_SDK_V3_DIRECT_API_URL as string | undefined) ??
  (configuredV3Endpoint && !configuredV3Endpoint.startsWith("/")
    ? configuredV3Endpoint
    : "https://v3.eul.dev");

export function getV3ApiEndpoint(proxyV3Calls: boolean): string {
  return proxyV3Calls ? V3_PROXY_ENDPOINT : V3_DIRECT_ENDPOINT;
}
