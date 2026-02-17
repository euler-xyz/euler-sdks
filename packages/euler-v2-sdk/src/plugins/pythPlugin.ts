import {
  type Address,
  type Hex,
  type PublicClient,
  type Abi,
  encodeFunctionData,
  decodeFunctionData,
  zeroAddress,
} from "viem";
import type { EulerPlugin, PluginBatchItems, ReadPluginContext, WritePluginContext } from "./types.js";
import { prependToBatch } from "./types.js";
import type { BatchItemDescription, EVCBatchItem, TransactionPlan } from "../services/executionService/executionServiceTypes.js";
import { collectPythFeedsFromAdapters, type PythFeed } from "../utils/oracle.js";
import { type BuildQueryFn, applyBuildQuery } from "../utils/buildQuery.js";
import { createBundledCall } from "../utils/callBundler.js";

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

// ── Hermes data fetch (injectable query pattern) ──

const normalizeHex = (value: string): Hex =>
  (value.startsWith("0x") ? value : `0x${value}`) as Hex;

const normalizeFeedId = (value: string): Hex =>
  normalizeHex(value).toLowerCase() as Hex;

/**
 * Adapter for the Pyth plugin. Follows the SDK's injectable query pattern:
 * all external calls are `query*` arrow-function properties, wrapped by `applyBuildQuery`.
 */
export class PythPluginAdapter {
  private hermesUrl: string;

  constructor(hermesUrl: string, buildQuery?: BuildQueryFn) {
    this.hermesUrl = hermesUrl;
    if (buildQuery) applyBuildQuery(this, buildQuery);
  }

  /**
   * Fetch latest price update data from Pyth Hermes API.
   * FeedIds are automatically bundled across concurrent calls within the same tick.
   */
  queryPythUpdateData = createBundledCall(async (feedIds: Hex[]): Promise<Hex[]> => {
    const normalizedIds = [...new Set(feedIds.map(normalizeFeedId))];
    if (!normalizedIds.length) return [];

    const url = new URL("/v2/updates/price/latest", this.hermesUrl);
    normalizedIds.forEach((id) => url.searchParams.append("ids[]", id));
    url.searchParams.set("encoding", "hex");

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`Failed to fetch Pyth update data: ${response.status}`);
    }

    const body = (await response.json()) as { binary?: { data?: unknown[] } };
    const binaryData = body?.binary?.data;
    if (!Array.isArray(binaryData)) return [];

    return binaryData.map((item) => normalizeHex(String(item)));
  });

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

  setQueryPythUpdateData(fn: typeof this.queryPythUpdateData): void {
    this.queryPythUpdateData = fn;
  }

  setQueryPythUpdateFee(fn: typeof this.queryPythUpdateFee): void {
    this.queryPythUpdateFee = fn;
  }
}

// ── Core batch item builder ──

async function buildPythBatchItems(
  feeds: PythFeed[],
  adapter: PythPluginAdapter,
  provider: PublicClient,
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
      const updateData = await adapter.queryPythUpdateData([...feedSet]);
      if (!updateData.length) continue;

      const fee = await adapter.queryPythUpdateFee(provider, pythAddress, updateData);

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
  const adapter = new PythPluginAdapter(hermesUrl, config.buildQuery);

  return {
    name: "pyth",

    async getReadPrepend(ctx: ReadPluginContext): Promise<PluginBatchItems | null> {
      const feeds = deduplicateFeeds(
        ctx.vaults.flatMap((v) => collectPythFeedsFromAdapters(v.oracle.adapters)),
      );

      if (!feeds.length) return null;
      const result = await buildPythBatchItems(feeds, adapter, ctx.provider);
      return result.items.length > 0 ? result : null;
    },

    async processPlan(plan: TransactionPlan, ctx: WritePluginContext): Promise<TransactionPlan> {
      const feeds = deduplicateFeeds(
        ctx.vaults.flatMap((v) => collectPythFeedsFromAdapters(v.oracle.adapters)),
      );
      if (!feeds.length) return plan;

      const result = await buildPythBatchItems(feeds, adapter, ctx.provider, ctx.sender);
      if (!result.items.length) return plan;

      return prependToBatch(plan, result.items);
    },

    decodeBatchItem(item: EVCBatchItem): BatchItemDescription | null {
      try {
        const decoded = decodeFunctionData({
          abi: PYTH_ABI as unknown as Abi,
          data: item.data,
        });

        const functionAbi = PYTH_ABI.find((a) => a.type === "function" && a.name === decoded.functionName);
        const namedArgs: Record<string, unknown> = {};
        if (functionAbi && "inputs" in functionAbi && Array.isArray(decoded.args)) {
          functionAbi.inputs.forEach((input, index) => {
            namedArgs[input.name] = decoded.args?.[index];
          });
        }

        return {
          targetContract: item.targetContract,
          onBehalfOfAccount: item.onBehalfOfAccount,
          functionName: decoded.functionName,
          args: namedArgs,
        };
      } catch {
        return null;
      }
    },
  };
}
