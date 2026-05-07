import { getAddress } from "viem";
import type { Address } from "viem";
import type { BuildQueryFn } from "../../utils/buildQuery.js";
import { applyBuildQuery } from "../../utils/buildQuery.js";
import type { OracleAdapterEntry } from "../../utils/oracle.js";

export type OracleAdapterCheck = {
	id?: string;
	message?: string;
	pass?: boolean;
	severity?: string;
	[key: string]: unknown;
};

export type OracleAdapterMetadata = {
	address: Address;
	oracle: Address;
	base?: Address;
	quote?: Address;
	provider?: string;
	methodology?: string;
	label?: string;
	name?: string;
	checks?: OracleAdapterCheck[];
	[key: string]: unknown;
};

export type EnrichedOracleAdapterEntry = OracleAdapterEntry & {
	metadata?: OracleAdapterMetadata;
};

export interface OracleAdapterServiceConfig {
	baseUrl?: string;
	cacheMs?: number;
}

export interface IOracleAdapterService {
	fetchOracleAdapters(chainId: number): Promise<OracleAdapterMetadata[]>;
	fetchOracleAdapterMap(
		chainId: number,
	): Promise<Record<string, OracleAdapterMetadata>>;
	enrichAdapters(
		chainId: number,
		adapters: OracleAdapterEntry[],
	): Promise<EnrichedOracleAdapterEntry[]>;
}

const DEFAULT_BASE_URL = "https://oracle-checks-data.euler.finance";
const DEFAULT_CACHE_MS = 10 * 60 * 1000;

export class OracleAdapterService implements IOracleAdapterService {
	private cache = new Map<
		number,
		{ expiresAt: number; value: OracleAdapterMetadata[] }
	>();

	constructor(
		private readonly config: OracleAdapterServiceConfig = {},
		buildQuery?: BuildQueryFn,
	) {
		if (buildQuery) applyBuildQuery(this, buildQuery);
	}

	queryOracleAdapters = async (chainId: number): Promise<unknown> => {
		const base = this.config.baseUrl ?? DEFAULT_BASE_URL;
		const res = await fetch(`${base}/${chainId}/adapters/all.json`);
		if (!res.ok) {
			throw new Error(
				`Oracle adapters request failed: ${res.status} ${res.statusText}`,
			);
		}
		return res.json();
	};

	setQueryOracleAdapters(fn: typeof this.queryOracleAdapters): void {
		this.queryOracleAdapters = fn;
	}

	async fetchOracleAdapters(chainId: number): Promise<OracleAdapterMetadata[]> {
		const now = Date.now();
		const cached = this.cache.get(chainId);
		if (cached && cached.expiresAt > now) return cached.value;

		const raw = await this.queryOracleAdapters(chainId);
		const parsed = this.parseOracleAdapters(raw);
		this.cache.set(chainId, {
			expiresAt: now + (this.config.cacheMs ?? DEFAULT_CACHE_MS),
			value: parsed,
		});
		return parsed;
	}

	async fetchOracleAdapterMap(
		chainId: number,
	): Promise<Record<string, OracleAdapterMetadata>> {
		const adapters = await this.fetchOracleAdapters(chainId);
		return Object.fromEntries(
			adapters.map((adapter) => [adapter.oracle.toLowerCase(), adapter]),
		);
	}

	async enrichAdapters(
		chainId: number,
		adapters: OracleAdapterEntry[],
	): Promise<EnrichedOracleAdapterEntry[]> {
		if (adapters.length === 0) return [];
		const metadata = await this.fetchOracleAdapterMap(chainId);
		return adapters.map((adapter) => ({
			...adapter,
			metadata: metadata[adapter.oracle.toLowerCase()],
		}));
	}

	private parseOracleAdapters(raw: unknown): OracleAdapterMetadata[] {
		if (!Array.isArray(raw)) return [];
		return raw
			.filter(
				(item): item is Record<string, unknown> =>
					typeof item === "object" && item !== null,
			)
			.map((item): OracleAdapterMetadata | undefined => {
				const rawOracle = item.oracle ?? item.adapter ?? item.address;
				if (typeof rawOracle !== "string") return undefined;
				let oracle: Address;
				try {
					oracle = getAddress(rawOracle) as Address;
				} catch {
					return undefined;
				}

				const normalizeOptionalAddress = (value: unknown): Address | undefined => {
					if (typeof value !== "string") return undefined;
					try {
						return getAddress(value) as Address;
					} catch {
						return undefined;
					}
				};

				const checks = Array.isArray(item.checks)
					? (item.checks as OracleAdapterCheck[]).filter(
							(check) => check.id !== "Adapter whitelist",
						)
					: undefined;

				const metadata: OracleAdapterMetadata = {
					...(item as Record<string, unknown>),
					address: oracle,
					oracle,
					base: normalizeOptionalAddress(
						item.base ?? item.baseAsset ?? item.base_asset,
					),
					quote: normalizeOptionalAddress(
						item.quote ?? item.quoteAsset ?? item.quote_asset,
					),
					checks,
				};
				return metadata;
			})
			.filter((item): item is OracleAdapterMetadata => item !== undefined);
	}
}
