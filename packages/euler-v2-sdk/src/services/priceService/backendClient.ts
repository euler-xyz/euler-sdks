import type { Address } from "viem";
import { type BuildQueryFn, applyBuildQuery } from "../../utils/buildQuery.js";

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

const CACHE_TTL_MS = 60 * 1000; // 1 minute
const BATCH_DELAY_MS = 50; // 50ms batch window

type CachedPrice = {
  data: BackendPriceData;
  fetchedAt: number;
};

type PendingRequest = {
  address: Address;
  chainId: number;
  resolve: (data: BackendPriceData | undefined) => void;
  reject: (err: unknown) => void;
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
 * Instance-based backend price client with batching and caching.
 */
export class PricingBackendClient {
  private readonly endpoint: string;
  private readonly defaultChainId: number;
  private readonly cache = new Map<string, CachedPrice>();
  private pendingRequests: PendingRequest[] = [];
  private batchTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(config: BackendConfig, buildQuery?: BuildQueryFn) {
    this.endpoint = config.endpoint;
    this.defaultChainId = config.chainId ?? 1;
    if (buildQuery) applyBuildQuery(this, buildQuery);
  }

  get isConfigured(): boolean {
    return !!this.endpoint;
  }

  clearStaleCache(): void {
    const now = Date.now();
    for (const [key, cached] of this.cache.entries()) {
      if (now - cached.fetchedAt >= CACHE_TTL_MS) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Fetch a single asset price. Requests are automatically batched —
   * multiple calls within 50ms are combined into a single network request.
   */
  async fetchPrice(
    assetAddress: Address,
    chainId?: number
  ): Promise<BackendPriceData | undefined> {
    if (!this.endpoint) return undefined;

    const effectiveChainId = chainId ?? this.defaultChainId;

    // Check cache first
    const key = this.getCacheKey(assetAddress, effectiveChainId);
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return cached.data;
    }

    return new Promise<BackendPriceData | undefined>((resolve, reject) => {
      this.pendingRequests.push({
        address: assetAddress,
        chainId: effectiveChainId,
        resolve,
        reject,
      });

      if (!this.batchTimeout) {
        this.batchTimeout = setTimeout(() => this.executeBatch(), BATCH_DELAY_MS);
      }
    });
  }

  /**
   * Fetch prices for multiple assets in a single call (no batching delay).
   */
  async fetchPrices(
    assetAddresses: Address[],
    chainId?: number
  ): Promise<Map<string, BackendPriceData> | undefined> {
    return this.fetchPricesBatch(assetAddresses, chainId);
  }

  private getCacheKey(assetAddress: string, chainId: number): string {
    return `${chainId}:${assetAddress.toLowerCase()}`;
  }

  private async executeBatch(): Promise<void> {
    this.batchTimeout = null;
    const requests = this.pendingRequests;
    this.pendingRequests = [];

    if (requests.length === 0) return;

    // Group by chainId
    const byChain = new Map<number, PendingRequest[]>();
    for (const req of requests) {
      const existing = byChain.get(req.chainId) ?? [];
      existing.push(req);
      byChain.set(req.chainId, existing);
    }

    for (const [chainId, chainRequests] of byChain.entries()) {
      const addresses = [
        ...new Set(chainRequests.map((r) => r.address)),
      ] as Address[];

      try {
        const results = await this.fetchPricesBatch(addresses, chainId);
        for (const req of chainRequests) {
          const data = results?.get(req.address.toLowerCase());
          req.resolve(data);
        }
      } catch (err) {
        for (const req of chainRequests) {
          req.reject(err);
        }
      }
    }
  }

  queryPricesBatch = async (
    url: string
  ): Promise<BackendPriceResponse | undefined> => {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      return undefined;
    }

    return (await response.json()) as BackendPriceResponse;
  };

  setQueryPricesBatch(fn: typeof this.queryPricesBatch): void {
    this.queryPricesBatch = fn;
  }

  private async fetchPricesBatch(
    assetAddresses: Address[],
    chainId?: number
  ): Promise<Map<string, BackendPriceData> | undefined> {
    if (!this.endpoint || assetAddresses.length === 0) return undefined;

    const effectiveChainId = chainId ?? this.defaultChainId;
    const now = Date.now();
    const results = new Map<string, BackendPriceData>();
    const missingAddresses: Address[] = [];

    // Check cache
    for (const address of assetAddresses) {
      const key = this.getCacheKey(address, effectiveChainId);
      const cached = this.cache.get(key);
      if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
        results.set(address.toLowerCase(), cached.data);
      } else {
        missingAddresses.push(address);
      }
    }

    if (missingAddresses.length === 0) return results;

    try {
      const url = new URL("/v1/prices", this.endpoint);
      url.searchParams.set("chainId", String(effectiveChainId));
      url.searchParams.set("assets", missingAddresses.join(","));

      const data = await this.queryPricesBatch(url.toString());

      if (!data) {
        return results.size > 0 ? results : undefined;
      }

      for (const [address, priceData] of Object.entries(data)) {
        const normalizedAddr = address.toLowerCase();
        results.set(normalizedAddr, priceData);

        const key = this.getCacheKey(address, effectiveChainId);
        this.cache.set(key, { data: priceData, fetchedAt: now });
      }

      return results;
    } catch {
      return results.size > 0 ? results : undefined;
    }
  }
}
