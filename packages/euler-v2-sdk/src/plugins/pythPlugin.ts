import {
  type Address,
  type Hex,
  type PublicClient,
  encodeFunctionData,
  zeroAddress,
} from "viem";
import type { EulerPlugin, PluginBatchItems, ReadPluginContext, WritePluginContext } from "./types.js";
import { prependToBatch } from "./types.js";
import type { EVCBatchItem, TransactionPlan } from "../services/executionService/executionServiceTypes.js";
import { collectPythFeedsFromAdapters, type PythFeed } from "../utils/oracle.js";
import { type BuildQueryFn, applyBuildQuery } from "../utils/buildQuery.js";

// ── Pyth ABI (minimal: only the two functions we need) ──

const PYTH_ABI = [
  {
    type: "function",
    name: "getUpdateFee",
    inputs: [{ name: "updateData", type: "bytes[]" }],
    outputs: [{ name: "feeAmount", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "updatePriceFeeds",
    inputs: [{ name: "updateData", type: "bytes[]" }],
    outputs: [],
    stateMutability: "payable",
  },
] as const;

// ── Hermes data fetch with batching + caching (injectable query pattern) ──

const PYTH_BATCH_DELAY_MS = 50;
const PYTH_UPDATE_CACHE_TTL_MS = 15_000;

type PythPendingRequest = {
  feedIds: Hex[];
  endpoint: string;
  resolve: (data: Hex[]) => void;
  reject: (err: unknown) => void;
};

type CachedPythUpdate = {
  data: Hex[];
  fetchedAt: number;
};

const normalizeHex = (value: string): Hex =>
  (value.startsWith("0x") ? value : `0x${value}`) as Hex;

const normalizeFeedId = (value: string): Hex =>
  normalizeHex(value).toLowerCase() as Hex;

const getCacheKey = (feedIds: Hex[], endpoint: string): string => {
  const sorted = [...feedIds].sort().join(",");
  return `${endpoint}:${sorted}`;
};

/**
 * Data source for the Pyth plugin. Follows the SDK's injectable query pattern:
 * all external calls are `query*` arrow-function properties, wrapped by `applyBuildQuery`.
 */
export class PythPluginDataSource {
  private pendingRequests: PythPendingRequest[] = [];
  private batchTimeout: ReturnType<typeof setTimeout> | null = null;
  private updateCache = new Map<string, CachedPythUpdate>();

  constructor(buildQuery?: BuildQueryFn) {
    if (buildQuery) applyBuildQuery(this, buildQuery);
  }

  /**
   * Fetch latest price update data from Pyth Hermes API.
   * Includes a 50ms batching window to coalesce concurrent calls,
   * and a 15-second cache for identical feed sets.
   */
  queryPythUpdateData = async (feedIds: Hex[], endpoint: string): Promise<Hex[]> => {
    if (!feedIds.length || !endpoint) return [];

    const normalizedIds = feedIds.map(normalizeFeedId);
    const cacheKey = getCacheKey(normalizedIds, endpoint);
    const now = Date.now();

    const cached = this.updateCache.get(cacheKey);
    if (cached && now - cached.fetchedAt < PYTH_UPDATE_CACHE_TTL_MS) {
      return cached.data;
    }

    return new Promise<Hex[]>((resolve, reject) => {
      this.pendingRequests.push({ feedIds: normalizedIds, endpoint, resolve, reject });
      if (!this.batchTimeout) {
        this.batchTimeout = setTimeout(() => this.executeBatch(), PYTH_BATCH_DELAY_MS);
      }
    });
  };

  /**
   * Query the on-chain Pyth contract for the fee required to update given price data.
   */
  queryPythUpdateFee = async (
    provider: PublicClient,
    pythAddress: Address,
    updateData: Hex[],
  ): Promise<bigint> => {
    return provider.readContract({
      address: pythAddress,
      abi: PYTH_ABI,
      functionName: "getUpdateFee",
      args: [updateData],
    });
  };

  // ── Internal batch executor ──

  private executeBatch = async () => {
    this.batchTimeout = null;
    const requests = this.pendingRequests;
    this.pendingRequests = [];
    if (requests.length === 0) return;

    // Group by endpoint
    const byEndpoint = new Map<string, PythPendingRequest[]>();
    for (const req of requests) {
      const group = byEndpoint.get(req.endpoint) || [];
      group.push(req);
      byEndpoint.set(req.endpoint, group);
    }

    for (const [endpoint, endpointRequests] of byEndpoint.entries()) {
      const allFeedIds = new Set<Hex>();
      for (const req of endpointRequests) {
        req.feedIds.forEach((id) => allFeedIds.add(id));
      }

      const feedIdArray = [...allFeedIds];
      const cacheKey = getCacheKey(feedIdArray, endpoint);
      const now = Date.now();

      const cached = this.updateCache.get(cacheKey);
      if (cached && now - cached.fetchedAt < PYTH_UPDATE_CACHE_TTL_MS) {
        for (const req of endpointRequests) req.resolve(cached.data);
        continue;
      }

      try {
        const data = await this.fetchDirect(feedIdArray, endpoint);
        this.updateCache.set(cacheKey, { data, fetchedAt: Date.now() });
        for (const req of endpointRequests) req.resolve(data);
      } catch (err) {
        for (const req of endpointRequests) req.reject(err);
      }
    }
  };

  private fetchDirect = async (feedIds: Hex[], endpoint: string): Promise<Hex[]> => {
    const url = new URL("/v2/updates/price/latest", endpoint);
    feedIds.forEach((id) => url.searchParams.append("ids[]", id));
    url.searchParams.set("encoding", "hex");

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`Failed to fetch Pyth update data: ${response.status}`);
    }

    const body = (await response.json()) as { binary?: { data?: unknown[] } };
    const binaryData = body?.binary?.data;
    if (!Array.isArray(binaryData)) return [];

    return binaryData.map((item) => normalizeHex(String(item)));
  };
}

// ── Core batch item builder ──

async function buildPythBatchItems(
  feeds: PythFeed[],
  dataSource: PythPluginDataSource,
  provider: PublicClient,
  hermesUrl: string,
  sender: Address = zeroAddress,
): Promise<PluginBatchItems> {
  if (!feeds.length) return { items: [], totalValue: 0n };

  // Group feeds by Pyth contract address
  const grouped = new Map<Address, Set<Hex>>();
  for (const feed of feeds) {
    const set = grouped.get(feed.pythAddress) || new Set();
    set.add(feed.feedId);
    grouped.set(feed.pythAddress, set);
  }

  const items: EVCBatchItem[] = [];
  let totalValue = 0n;

  for (const [pythAddress, feedSet] of grouped.entries()) {
    try {
      const updateData = await dataSource.queryPythUpdateData([...feedSet], hermesUrl);
      if (!updateData.length) continue;

      const fee = await dataSource.queryPythUpdateFee(provider, pythAddress, updateData);

      items.push({
        targetContract: pythAddress,
        onBehalfOfAccount: sender,
        value: fee,
        data: encodeFunctionData({
          abi: PYTH_ABI,
          functionName: "updatePriceFeeds",
          args: [updateData],
        }),
      });
      totalValue += fee;
    } catch {
      // Skip this Pyth contract on error — operation proceeds without its update
      continue;
    }
  }

  return { items, totalValue };
}

// ── Deduplicate feeds ──

function deduplicateFeeds(feeds: PythFeed[]): PythFeed[] {
  const seen = new Map<string, PythFeed>();
  for (const feed of feeds) {
    const key = `${feed.pythAddress.toLowerCase()}:${feed.feedId.toLowerCase()}`;
    if (!seen.has(key)) seen.set(key, feed);
  }
  return [...seen.values()];
}

// ── Plugin factory ──

export interface PythPluginConfig {
  hermesUrl?: string;
  buildQuery?: BuildQueryFn;
}

export function createPythPlugin(config: PythPluginConfig = {}): EulerPlugin {
  const hermesUrl = config.hermesUrl || "https://hermes.pyth.network";
  const dataSource = new PythPluginDataSource(config.buildQuery);

  return {
    name: "pyth",

    async getReadPrepend(ctx: ReadPluginContext): Promise<PluginBatchItems | null> {
      const feeds = deduplicateFeeds(
        ctx.vaults.flatMap((v) => collectPythFeedsFromAdapters(v.oracle.adapters)),
      );

      if (!feeds.length) return null;
      const result = await buildPythBatchItems(feeds, dataSource, ctx.provider, hermesUrl);
      return result.items.length > 0 ? result : null;
    },

    async processPlan(plan: TransactionPlan, ctx: WritePluginContext): Promise<TransactionPlan> {
      const feeds = deduplicateFeeds(
        ctx.vaults.flatMap((v) => collectPythFeedsFromAdapters(v.oracle.adapters)),
      );
      if (!feeds.length) return plan;

      const result = await buildPythBatchItems(feeds, dataSource, ctx.provider, hermesUrl, ctx.sender);
      if (!result.items.length) return plan;

      return prependToBatch(plan, result.items);
    },
  };
}
