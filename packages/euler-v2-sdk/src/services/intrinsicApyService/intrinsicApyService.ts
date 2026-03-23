import type { Address } from "viem";
import type { ERC4626Vault } from "../../entities/ERC4626Vault.js";
import type {
	IIntrinsicApyService,
	IntrinsicApyServiceConfig,
	IntrinsicApyInfo,
	IntrinsicApyResult,
	DefiLlamaPool,
	PendleMarketData,
	StablewatchResponse,
} from "./intrinsicApyServiceTypes.js";
import { intrinsicApySources } from "./intrinsicApySources.js";
import { type BuildQueryFn, applyBuildQuery } from "../../utils/buildQuery.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_DEFILLAMA_YIELDS_URL = "https://yields.llama.fi/pools";
const DEFAULT_PENDLE_API_URL = "https://api-v2.pendle.finance/core/v2";
const DEFAULT_STABLEWATCH_POOLS_URL = "/api/stablewatch-pools";
const DEFAULT_STABLEWATCH_SOURCE_URL = "https://stablewatch.io";
const PENDLE_CONCURRENCY = 10;
const MATURITY_STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const normalize = (addr: string): string => addr.toLowerCase();

const CHAIN_ID_TO_STABLEWATCH_NAME: Record<number, string> = {
	1: "ethereum",
	56: "bnbsmartchain",
	146: "sonic",
	239: "tac",
	8453: "base",
	9745: "plasma",
	42161: "arbitrumone",
	43114: "avalanche",
	59144: "lineamainnet",
};

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

const normalizeStablewatchChainName = (raw: string): string => {
	const trimmed = raw.toLowerCase().replace(/\s+/g, "");
	if (trimmed === "binance-smart-chain") return "bnbsmartchain";
	if (trimmed === "linea") return "lineamainnet";
	if (trimmed === "arbitrum") return "arbitrumone";
	return trimmed;
};

const buildStablewatchLookupKey = (chain: string, address: string): string =>
	`${chain.toLowerCase()}:${address.toLowerCase()}`;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class IntrinsicApyService implements IIntrinsicApyService {
	private defillamaYieldsUrl: string;
	private pendleApiUrl: string;
	private stablewatchPoolsUrl: string;
	private stablewatchSourceUrl: string;

	constructor(config?: IntrinsicApyServiceConfig, buildQuery?: BuildQueryFn) {
		this.defillamaYieldsUrl =
			config?.defillamaYieldsUrl ?? DEFAULT_DEFILLAMA_YIELDS_URL;
		this.pendleApiUrl = config?.pendleApiUrl ?? DEFAULT_PENDLE_API_URL;
		this.stablewatchPoolsUrl =
			config?.stablewatchPoolsUrl ?? DEFAULT_STABLEWATCH_POOLS_URL;
		this.stablewatchSourceUrl =
			config?.stablewatchSourceUrl ?? DEFAULT_STABLEWATCH_SOURCE_URL;
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

	queryStablewatchPools = async (url: string): Promise<StablewatchResponse> => {
		const res = await fetch(url);
		if (!res.ok) return { data: [] };
		return res.json() as Promise<StablewatchResponse>;
	};

	setQueryStablewatchPools(fn: typeof this.queryStablewatchPools): void {
		this.queryStablewatchPools = fn;
	}

	// -----------------------------------------------------------------------
	// Public API
	// -----------------------------------------------------------------------

	async fetchIntrinsicApy(
		chainId: number,
		assetAddress: Address,
	): Promise<IntrinsicApyInfo | undefined> {
		const chainMap = await this.fetchChainIntrinsicApys(chainId);
		return chainMap.get(assetAddress.toLowerCase());
	}

	async fetchChainIntrinsicApys(
		chainId: number,
	): Promise<Map<string, IntrinsicApyInfo>> {
		const results = await Promise.allSettled([
			this.fetchDefiLlama(chainId),
			this.fetchPendle(chainId),
			this.fetchStablewatch(chainId),
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
				const apyMap = await this.fetchChainIntrinsicApys(chainId);
				for (const vault of chainVaults) {
					const info = apyMap.get(vault.asset.address.toLowerCase());
					if (info) {
						vault.intrinsicApy = info;
					}
					vault.populated.intrinsicApy = true;
				}
			}),
		);
	}

	// -----------------------------------------------------------------------
	// Internal: DefiLlama
	// -----------------------------------------------------------------------

	private async fetchDefiLlama(chainId: number): Promise<IntrinsicApyResult[]> {
		const defillamaSources = intrinsicApySources.filter(
			(s) => s.provider === "defillama" && s.chainId === chainId,
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

			const apy = source.useSpotApy ? (pool.apy ?? 0) : (pool.apyMean30d ?? 0);

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

	private async fetchPendle(chainId: number): Promise<IntrinsicApyResult[]> {
		const pendleSources = intrinsicApySources.filter(
			(s) => s.provider === "pendle" && s.chainId === chainId,
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
				}),
			);

			for (const result of settled) {
				if (result.status === "fulfilled" && result.value) {
					results.push(result.value);
				}
			}
		}

		return results;
	}

	// -----------------------------------------------------------------------
	// Internal: Stablewatch
	// -----------------------------------------------------------------------

	private async fetchStablewatch(
		chainId: number,
	): Promise<IntrinsicApyResult[]> {
		const stablewatchSources = intrinsicApySources.filter(
			(s) => s.provider === "stablewatch" && s.chainId === chainId,
		);
		if (stablewatchSources.length === 0) return [];

		const chainName = CHAIN_ID_TO_STABLEWATCH_NAME[chainId];
		if (!chainName) return [];

		const response = await this.queryStablewatchPools(
			this.stablewatchPoolsUrl,
		).catch(() => ({ data: [] }) as StablewatchResponse);
		const pools = Array.isArray(response.data) ? response.data : [];

		const lookup = new Map<string, number>();
		for (const pool of pools) {
			const apyRaw = pool.metrics?.apy?.avg7d;
			const apy = typeof apyRaw === "number" ? apyRaw : Number(apyRaw);
			if (!Number.isFinite(apy) || !pool.token?.chains) continue;

			for (const [rawChainName, addresses] of Object.entries(
				pool.token.chains,
			)) {
				if (!Array.isArray(addresses)) continue;
				const normalizedChain = normalizeStablewatchChainName(rawChainName);
				for (const address of addresses) {
					if (typeof address !== "string") continue;
					lookup.set(
						buildStablewatchLookupKey(normalizedChain, address),
						Math.max(0, apy),
					);
				}
			}
		}

		const results: IntrinsicApyResult[] = [];
		for (const source of stablewatchSources) {
			const apy = lookup.get(
				buildStablewatchLookupKey(chainName, source.address),
			);
			if (apy === undefined) continue;
			results.push({
				address: normalize(source.address),
				info: {
					apy,
					provider: "Stablewatch",
					source: this.stablewatchSourceUrl,
				},
			});
		}

		return results;
	}
}
