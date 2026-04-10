import type { Address } from "viem";
import {
	type BuildQueryFn,
	applyBuildQuery,
} from "../../../../utils/buildQuery.js";
import { createCallBundler } from "../../../../utils/callBundler.js";
import type {
	IntrinsicApyV3AdapterConfig,
	V3IntrinsicApyRow,
	V3ListEnvelope,
} from "./intrinsicApyV3AdapterTypes.js";
import type {
	IIntrinsicApyAdapter,
	IntrinsicApyInfo,
} from "../../intrinsicApyService.js";

const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MAX_ASSETS_PER_REQUEST = 50;

const normalize = (addr: string): string => addr.toLowerCase();

export class IntrinsicApyV3Adapter implements IIntrinsicApyAdapter {
	constructor(
		private config: IntrinsicApyV3AdapterConfig,
		buildQuery?: BuildQueryFn,
	) {
		if (buildQuery) applyBuildQuery(this, buildQuery);
	}

	setConfig(config: IntrinsicApyV3AdapterConfig): void {
		this.config = config;
	}

	private getHeaders(): Record<string, string> {
		return {
			Accept: "application/json",
			...(this.config.apiKey ? { "X-API-Key": this.config.apiKey } : {}),
		};
	}

	private buildUrl(
		endpoint: string,
		path: string,
		search?: Record<string, string>,
	): string {
		const normalizedEndpoint = endpoint.replace(/\/+$/, "");
		const joined =
			normalizedEndpoint.startsWith("http://") ||
			normalizedEndpoint.startsWith("https://")
				? new URL(path, `${normalizedEndpoint}/`).toString()
				: `${normalizedEndpoint}${path}`;

		if (!search || Object.keys(search).length === 0) return joined;

		const params = new URLSearchParams(search);
		return `${joined}?${params.toString()}`;
	}

	queryV3IntrinsicApysPage = async (
		endpoint: string,
		chainId: number,
		offset: number,
		limit: number,
		assets?: Address[],
	): Promise<V3ListEnvelope<V3IntrinsicApyRow>> => {
		const url = this.buildUrl(endpoint, "/v3/apys/intrinsic", {
			chainId: String(chainId),
			offset: String(offset),
			limit: String(limit),
			...(assets?.length ? { assets: assets.join(",") } : {}),
		});

		const response = await fetch(url, {
			method: "GET",
			headers: this.getHeaders(),
		});
		if (!response.ok) {
			throw new Error(
				`intrinsicApyV3 ${response.status} ${response.statusText}`,
			);
		}
		return response.json() as Promise<V3ListEnvelope<V3IntrinsicApyRow>>;
	};

	private mapRowsToApyMap(
		rows: V3IntrinsicApyRow[],
	): Map<string, IntrinsicApyInfo> {
		const apyMap = new Map<string, IntrinsicApyInfo>();

		for (const row of rows) {
			if (!row.address || typeof row.apy !== "number" || !row.provider) continue;
			apyMap.set(normalize(row.address), {
				apy: row.apy,
				provider: row.provider,
				source: row.source,
			});
		}

		return apyMap;
	}

	private async fetchChunkedIntrinsicApys(
		chainId: number,
		assetAddresses: Address[],
	): Promise<Map<string, IntrinsicApyInfo>> {
		const uniqueAssetAddresses = [
			...new Set(assetAddresses.map((address) => normalize(address))),
		] as Address[];
		const apyMap = new Map<string, IntrinsicApyInfo>();
		const maxAssetsPerRequest = Math.max(
			1,
			this.config.maxAssetsPerRequest ?? DEFAULT_MAX_ASSETS_PER_REQUEST,
		);
		const chunks: Address[][] = [];
		for (
			let offset = 0;
			offset < uniqueAssetAddresses.length;
			offset += maxAssetsPerRequest
		) {
			chunks.push(
				uniqueAssetAddresses.slice(offset, offset + maxAssetsPerRequest),
			);
		}

		const pages = await Promise.all(
			chunks.map((chunk) =>
				this.queryV3IntrinsicApysPage(
					this.config.endpoint,
					chainId,
					0,
					Math.max(chunk.length, DEFAULT_PAGE_SIZE),
					chunk,
				),
			),
		);

		for (const page of pages) {
			const rows = Array.isArray(page.data) ? page.data : [];
			for (const [address, info] of this.mapRowsToApyMap(rows)) {
				apyMap.set(address, info);
			}
		}

		return apyMap;
	}

	queryV3IntrinsicApy = createCallBundler(
		async (
			keys: { chainId: number; assetAddress: Address }[],
		): Promise<(IntrinsicApyInfo | undefined)[]> => {
			const byChain = new Map<number, Address[]>();
			for (const key of keys) {
				const addresses = byChain.get(key.chainId) ?? [];
				addresses.push(key.assetAddress);
				byChain.set(key.chainId, addresses);
			}

			const chainResults = new Map<number, Map<string, IntrinsicApyInfo>>();
			const maxAssetsPerRequest = Math.max(
				1,
				this.config.maxAssetsPerRequest ?? DEFAULT_MAX_ASSETS_PER_REQUEST,
			);

			for (const [chainId, assetAddresses] of byChain) {
				const apyMap = await this.fetchChunkedIntrinsicApys(
					chainId,
					assetAddresses,
				);
				chainResults.set(chainId, apyMap);
			}

			return keys.map((key) =>
				chainResults.get(key.chainId)?.get(normalize(key.assetAddress)),
			);
		},
		{
			maxBatchSize: DEFAULT_MAX_ASSETS_PER_REQUEST,
		},
	);

	setQueryV3IntrinsicApy(fn: typeof this.queryV3IntrinsicApy): void {
		this.queryV3IntrinsicApy = fn;
	}

	async fetchIntrinsicApy(
		chainId: number,
		assetAddress: Address,
	): Promise<IntrinsicApyInfo | undefined> {
		return this.queryV3IntrinsicApy({ chainId, assetAddress });
	}

	async fetchChainIntrinsicApys(
		chainId: number,
		assetAddresses?: Address[],
	): Promise<Map<string, IntrinsicApyInfo>> {
		if (assetAddresses?.length) {
			return this.fetchChunkedIntrinsicApys(chainId, assetAddresses);
		}

		const pageSize = Math.max(1, this.config.pageSize ?? DEFAULT_PAGE_SIZE);
		const apyMap = new Map<string, IntrinsicApyInfo>();
		let offset = 0;

		for (;;) {
			const page = await this.queryV3IntrinsicApysPage(
				this.config.endpoint,
				chainId,
				offset,
				pageSize,
			);
			const rows = Array.isArray(page.data) ? page.data : [];

			for (const [address, info] of this.mapRowsToApyMap(rows)) {
				apyMap.set(address, info);
			}

			if (rows.length < pageSize) break;
			offset += rows.length;
			if (typeof page.meta?.total === "number" && offset >= page.meta.total) break;
		}

		return apyMap;
	}
}
