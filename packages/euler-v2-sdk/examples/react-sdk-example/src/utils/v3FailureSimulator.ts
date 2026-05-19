import { getSimulateV3Failure } from "../queries/queryOptionsStore.ts";

const V3_URL_MARKERS = ["/v3/", "/api/v3/", "v3.euler.finance"];

let installed = false;

/**
 * Installs a one-time fetch interceptor that makes every V3 HTTP request reject
 * when the `simulateV3Failure` setting is enabled. Used in the example app to
 * exercise the SDK's fallback adapters in the browser.
 */
export function installV3FailureSimulator(): void {
  if (installed) return;
  if (typeof window === "undefined") return;
  installed = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = (async (input, init) => {
    if (!getSimulateV3Failure()) return originalFetch(input, init);

    const url =
      typeof input === "string"
        ? input
        : input instanceof Request
          ? input.url
          : (input as URL).toString();

    if (V3_URL_MARKERS.some((marker) => url.includes(marker))) {
      throw new Error(
        `[simulateV3Failure] Forced failure for V3 request: ${url}`,
      );
    }
    return originalFetch(input, init);
  }) as typeof window.fetch;
}
