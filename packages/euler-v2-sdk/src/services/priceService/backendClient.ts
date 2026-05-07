import type { Address } from "viem";
import { type BuildQueryFn, applyBuildQuery } from "../../utils/buildQuery.js";
import { createCallBundler } from "../../utils/callBundler.js";

/**
 * Normalized response shape from the price backend.
 */
export type BackendPriceData = {
	address: string;
	price: number;
	source: string;
	symbol?: string;
	timestamp?: number;
};

/**
 * Legacy response from /v1/prices endpoint.
 * Flat object keyed by lowercase address.
 */
export type BackendPriceResponse = Record<string, BackendPriceData>;

export type V3PriceRow = {
	address?: string;
	price?: number;
	priceUsd?: number;
	source?: string;
	symbol?: string;
	timestamp?: string;
};

export type V3PriceResponse = {
	data?: V3PriceRow[];
	meta?: {
		total?: number;
		offset?: number;
		limit?: number;
		timestamp?: string;
		chainId?: string;
	};
};

/**
 * Pricing service configuration for the V3 pricing endpoint.
 */
export type PricingServiceConfig = {
	/** Pricing API endpoint URL. */
	endpoint: string;
	/** Optional API key sent as `X-API-Key` for V3-style backend requests. */
	apiKey?: string;
};

/** Convert a pricing API price (number) to bigint with 18 decimals. */
export const backendPriceToBigInt = (price: string | number): bigint => {
	try {
		const priceNum = typeof price === "number" ? price : parseFloat(price);
		if (Number.isNaN(priceNum) || priceNum < 0) {
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

/** Instance-based V3 pricing API client with batching. */
export class PricingBackendClient {
	private readonly endpoint: string;
	private readonly apiKey?: string;

	constructor(config: PricingServiceConfig, buildQuery?: BuildQueryFn) {
		this.endpoint = config.endpoint;
		this.apiKey = config.apiKey;
		if (buildQuery) applyBuildQuery(this, buildQuery);
	}

	get isConfigured(): boolean {
		return !!this.endpoint;
	}

	private getHeaders(): Record<string, string> {
		return {
			Accept: "application/json",
			...(this.apiKey ? { "X-API-Key": this.apiKey } : {}),
		};
	}

	private parseResponse(
		data: BackendPriceResponse | V3PriceResponse,
	): Map<string, BackendPriceData> {
		const map = new Map<string, BackendPriceData>();

		if (
			data &&
			typeof data === "object" &&
			"data" in data &&
			Array.isArray((data as V3PriceResponse).data)
		) {
			for (const row of (data as V3PriceResponse).data ?? []) {
				if (!row.address) continue;
				const price = row.priceUsd ?? row.price;
				if (typeof price !== "number") continue;
				const timestamp = row.timestamp
					? Math.floor(new Date(row.timestamp).getTime() / 1000)
					: undefined;
				map.set(row.address.toLowerCase(), {
					address: row.address,
					price,
					source: row.source ?? "v3",
					symbol: row.symbol,
					timestamp,
				});
			}
			return map;
		}

		for (const [addr, priceData] of Object.entries(
			data as BackendPriceResponse,
		)) {
			map.set(addr.toLowerCase(), priceData);
		}
		return map;
	}

	/**
	 * Fetch a single asset price. Concurrent calls within the same microtask
	 * are bundled into a single request per chainId.
	 */
	queryV3Price = createCallBundler(
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
				const unique = [
					...new Set(addresses.map((a) => a.toLowerCase())),
				] as Address[];
				const url = new URL("/v3/prices", this.endpoint);
				url.searchParams.set("chainId", String(chainId));
				url.searchParams.set("assets", unique.join(","));

				const response = await fetch(url.toString(), {
					method: "GET",
					headers: this.getHeaders(),
				});

				if (response.ok) {
					const data = (await response.json()) as
						| BackendPriceResponse
						| V3PriceResponse;
					chainResults.set(chainId, this.parseResponse(data));
				}
			}

			return keys.map((key) =>
				chainResults.get(key.chainId)?.get(key.address.toLowerCase()),
			);
		},
	);

	setQueryV3Price(fn: typeof this.queryV3Price): void {
		this.queryV3Price = fn;
	}
}
