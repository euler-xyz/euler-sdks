import type { Address } from "viem";
import { type BuildQueryFn, applyBuildQuery } from "../../utils/buildQuery.js";
import { createCallBundler } from "../../utils/callBundler.js";

/**
 * Response shape from the price backend (indexer /v1/prices endpoint).
 */
export type BackendPriceData = {
  address: string;
  price: number;
  source: string;
  symbol: string;
  timestamp: number;
};

/**
 * Response from /v1/prices endpoint.
 * Flat object keyed by lowercase address.
 */
export type BackendPriceResponse = Record<string, BackendPriceData>;

/**
 * Backend configuration for the price service.
 */
export type BackendConfig = {
  /** Backend API endpoint URL. */
  endpoint: string;
  /** Default chain ID for requests. */
  chainId?: number;
};

/**
 * Convert backend price (number) to bigint with 18 decimals.
 */
export const backendPriceToBigInt = (price: string | number): bigint => {
  try {
    const priceNum = typeof price === "number" ? price : parseFloat(price);
    if (isNaN(priceNum) || priceNum < 0) {
      return 0n;
    }
    const priceString = priceNum.toFixed(18);
    const [intPart, decPart = ""] = priceString.split(".");
    const paddedDec = decPart.slice(0, 18);
    return BigInt(intPart + paddedDec);
  } catch {
    return 0n;
  }
};

/**
 * Instance-based backend price client with batching.
 */
export class PricingBackendClient {
  private readonly endpoint: string;

  constructor(config: BackendConfig, buildQuery?: BuildQueryFn) {
    this.endpoint = config.endpoint;
    if (buildQuery) applyBuildQuery(this, buildQuery);
  }

  get isConfigured(): boolean {
    return !!this.endpoint;
  }

  /**
   * Fetch a single asset price. Concurrent calls within the same microtask
   * are bundled into a single request per chainId.
   */
  queryBackendPrice = createCallBundler(
    async (keys: { address: Address; chainId: number }[]) => {
      // Group by chainId
      const byChain = new Map<number, Address[]>();
      for (const key of keys) {
        const arr = byChain.get(key.chainId) ?? [];
        arr.push(key.address);
        byChain.set(key.chainId, arr);
      }

      // One request per chainId
      const chainResults = new Map<number, Map<string, BackendPriceData>>();
      for (const [chainId, addresses] of byChain) {
        const unique = [...new Set(addresses.map((a) => a.toLowerCase()))] as Address[];
        const url = new URL("/v1/prices", this.endpoint);
        url.searchParams.set("chainId", String(chainId));
        url.searchParams.set("assets", unique.join(","));

        const response = await fetch(url.toString(), {
          method: "GET",
          headers: { Accept: "application/json" },
        });

        if (response.ok) {
          const data = (await response.json()) as BackendPriceResponse;
          const map = new Map<string, BackendPriceData>();
          for (const [addr, priceData] of Object.entries(data)) {
            map.set(addr.toLowerCase(), priceData);
          }
          chainResults.set(chainId, map);
        }
      }

      return keys.map((key) =>
        chainResults.get(key.chainId)?.get(key.address.toLowerCase()),
      );
    },
  );

  setQueryPrice(fn: typeof this.queryBackendPrice): void {
    this.queryBackendPrice = fn;
  }
}
