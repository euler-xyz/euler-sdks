export interface IntrinsicApyV3AdapterConfig {
	/** Base HTTP endpoint, for example `https://v3staging.eul.dev`. */
	endpoint: string;
	/** Optional API key sent as `X-API-Key` on V3 HTTP requests. */
	apiKey?: string;
	/** Optional page size override used when fetching paginated intrinsic APYs. */
	pageSize?: number;
}

export type V3ListEnvelope<T> = {
	data?: T[];
	meta?: {
		total?: number;
		offset?: number;
		limit?: number;
	};
};

export type V3IntrinsicApyRow = {
	chainId: number;
	address: string;
	symbol?: string;
	apy?: number;
	provider?: string;
	source?: string;
	timestamp?: string;
};
