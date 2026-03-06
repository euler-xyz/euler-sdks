import type { Address } from "viem";
import type { ERC4626Vault } from "../../entities/ERC4626Vault.js";
import type {
  IIntrinsicApyService,
  IntrinsicApyServiceConfig,
  IntrinsicApyInfo,
  IntrinsicApyResult,
  DefiLlamaPool,
  PendleMarketData,
} from "./intrinsicApyServiceTypes.js";
import { intrinsicApySources } from "./intrinsicApySources.js";
import { type BuildQueryFn, applyBuildQuery } from "../../utils/buildQuery.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_DEFILLAMA_YIELDS_URL = "https://yields.llama.fi/pools";
const DEFAULT_PENDLE_API_URL = "https://api-v2.pendle.finance/core/v2";
const PENDLE_CONCURRENCY = 10;
const MATURITY_STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const normalize = (addr: string): string => addr.toLowerCase();

const formatProjectName = (project: string): string =>
  project
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

const isMatured = (timestamp?: string): boolean => {
  if (!timestamp) return true;
  const ts = new Date(timestamp).getTime();
  return Date.now() - ts > MATURITY_STALE_THRESHOLD_MS;
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class IntrinsicApyService implements IIntrinsicApyService {
  private defillamaYieldsUrl: string;
  private pendleApiUrl: string;

  constructor(config?: IntrinsicApyServiceConfig, buildQuery?: BuildQueryFn) {
    this.defillamaYieldsUrl = config?.defillamaYieldsUrl ?? DEFAULT_DEFILLAMA_YIELDS_URL;
    this.pendleApiUrl = config?.pendleApiUrl ?? DEFAULT_PENDLE_API_URL;
    if (buildQuery) applyBuildQuery(this, buildQuery);
  }

  // -----------------------------------------------------------------------
  // Query methods (decoratable via buildQuery)
  // -----------------------------------------------------------------------

  queryDefiLlamaPools = async (url: string): Promise<DefiLlamaPool[]> => {
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: unknown };
    return Array.isArray(json?.data) ? (json.data as DefiLlamaPool[]) : [];
  };

  setQueryDefiLlamaPools(fn: typeof this.queryDefiLlamaPools): void {
    this.queryDefiLlamaPools = fn;
  }

  queryPendleMarketData = async (url: string): Promise<PendleMarketData> => {
    const res = await fetch(url);
    if (!res.ok) return {};
    return res.json() as Promise<PendleMarketData>;
  };

  setQueryPendleMarketData(fn: typeof this.queryPendleMarketData): void {
    this.queryPendleMarketData = fn;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  async getIntrinsicApy(
    chainId: number,
    assetAddress: Address
  ): Promise<IntrinsicApyInfo | undefined> {
    const chainMap = await this.getChainIntrinsicApys(chainId);
    return chainMap.get(assetAddress.toLowerCase());
  }

  async getChainIntrinsicApys(
    chainId: number
  ): Promise<Map<string, IntrinsicApyInfo>> {
    const results = await Promise.allSettled([
      this.fetchDefiLlama(chainId),
      this.fetchPendle(chainId),
    ]);

    const apyMap = new Map<string, IntrinsicApyInfo>();

    for (const result of results) {
      if (result.status !== "fulfilled") continue;
      for (const entry of result.value) {
        apyMap.set(entry.address, entry.info);
      }
    }

    return apyMap;
  }

  async populateIntrinsicApy(vaults: ERC4626Vault[]): Promise<void> {
    if (vaults.length === 0) return;

    const byChain = new Map<number, ERC4626Vault[]>();
    for (const vault of vaults) {
      const arr = byChain.get(vault.chainId) ?? [];
      arr.push(vault);
      byChain.set(vault.chainId, arr);
    }

    await Promise.all(
      Array.from(byChain.entries()).map(async ([chainId, chainVaults]) => {
        const apyMap = await this.getChainIntrinsicApys(chainId);
        for (const vault of chainVaults) {
          const info = apyMap.get(vault.asset.address.toLowerCase());
          if (info) {
            vault.intrinsicApy = info;
          }
          vault.populated.intrinsicApy = true;
        }
      })
    );
  }

  // -----------------------------------------------------------------------
  // Internal: DefiLlama
  // -----------------------------------------------------------------------

  private async fetchDefiLlama(
    chainId: number
  ): Promise<IntrinsicApyResult[]> {
    const defillamaSources = intrinsicApySources.filter(
      (s) => s.provider === "defillama" && s.chainId === chainId
    );
    if (defillamaSources.length === 0) return [];

    const pools = await this.queryDefiLlamaPools(this.defillamaYieldsUrl);
    const poolsById = new Map<string, DefiLlamaPool>();
    for (const pool of pools) {
      if (pool.pool) {
        poolsById.set(pool.pool, pool);
      }
    }

    const results: IntrinsicApyResult[] = [];
    for (const source of defillamaSources) {
      if (source.provider !== "defillama") continue;
      const pool = poolsById.get(source.poolId);
      if (!pool) continue;

      const apy = source.useSpotApy
        ? (pool.apy ?? 0)
        : (pool.apyMean30d ?? 0);

      const providerName = pool.project
        ? `${formatProjectName(pool.project)} via DefiLlama`
        : "DefiLlama";

      results.push({
        address: normalize(source.address),
        info: {
          apy,
          provider: providerName,
          source: `https://defillama.com/yields/pool/${source.poolId}`,
        },
      });
    }

    return results;
  }

  // -----------------------------------------------------------------------
  // Internal: Pendle
  // -----------------------------------------------------------------------

  private async fetchPendle(
    chainId: number
  ): Promise<IntrinsicApyResult[]> {
    const pendleSources = intrinsicApySources.filter(
      (s) => s.provider === "pendle" && s.chainId === chainId
    );
    if (pendleSources.length === 0) return [];

    const results: IntrinsicApyResult[] = [];

    // Batch in groups of PENDLE_CONCURRENCY
    for (let i = 0; i < pendleSources.length; i += PENDLE_CONCURRENCY) {
      const batch = pendleSources.slice(i, i + PENDLE_CONCURRENCY);
      const settled = await Promise.allSettled(
        batch.map(async (source) => {
          if (source.provider !== "pendle") return null;

          const apiChainId = source.crossChainSourceChainId ?? source.chainId;
          const url = `${this.pendleApiUrl}/${apiChainId}/markets/${source.pendleMarket}/data`;
          const data = await this.queryPendleMarketData(url);

          if (!data || isMatured(data.timestamp)) {
            return {
              address: normalize(source.address),
              info: { apy: 0, provider: "Pendle" } as IntrinsicApyInfo,
            };
          }

          return {
            address: normalize(source.address),
            info: {
              apy: (data.impliedApy ?? 0) * 100,
              provider: "Pendle",
              source: "https://app.pendle.finance/trade/markets",
            } as IntrinsicApyInfo,
          };
        })
      );

      for (const result of settled) {
        if (result.status === "fulfilled" && result.value) {
          results.push(result.value);
        }
      }
    }

    return results;
  }
}
