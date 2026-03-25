import type { Address } from "viem";
import {
	type BuildQueryFn,
	applyBuildQuery,
} from "../../../../utils/buildQuery.js";
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

	queryV3IntrinsicApys = async (
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

	setQueryV3IntrinsicApys(fn: typeof this.queryV3IntrinsicApys): void {
		this.queryV3IntrinsicApys = fn;
	}

	async fetchIntrinsicApy(
		chainId: number,
		assetAddress: Address,
	): Promise<IntrinsicApyInfo | undefined> {
		const chainMap = await this.fetchChainIntrinsicApys(chainId, [assetAddress]);
		return chainMap.get(assetAddress.toLowerCase());
	}

	async fetchChainIntrinsicApys(
		chainId: number,
		assetAddresses?: Address[],
	): Promise<Map<string, IntrinsicApyInfo>> {
		const pageSize = Math.max(1, this.config.pageSize ?? DEFAULT_PAGE_SIZE);
		const normalizedAssets = assetAddresses?.map((address) => normalize(address));
		const apyMap = new Map<string, IntrinsicApyInfo>();
		let offset = 0;

		for (;;) {
			const page = await this.queryV3IntrinsicApys(
				this.config.endpoint,
				chainId,
				offset,
				pageSize,
				assetAddresses,
			);
			const rows = Array.isArray(page.data) ? page.data : [];

			for (const row of rows) {
				if (!row.address || typeof row.apy !== "number" || !row.provider) continue;
				apyMap.set(normalize(row.address), {
					apy: row.apy,
					provider: row.provider,
					source: row.source,
				});
			}

			if (rows.length < pageSize) break;
			offset += rows.length;
			if (typeof page.meta?.total === "number" && offset >= page.meta.total) break;
			if (normalizedAssets && apyMap.size >= new Set(normalizedAssets).size) break;
		}

		return apyMap;
	}
}
