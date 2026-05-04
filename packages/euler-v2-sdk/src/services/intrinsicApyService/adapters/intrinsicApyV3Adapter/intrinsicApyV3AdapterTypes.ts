export interface IntrinsicApyV3AdapterConfig {
	/** Base HTTP endpoint, for example `https://v3.eul.dev`. */
	endpoint: string;
	/** Optional API key sent as `X-API-Key` on V3 HTTP requests. */
	apiKey?: string;
	/** Optional page size override used when fetching paginated intrinsic APYs. */
	pageSize?: number;
	/**
	 * Optional max number of asset addresses sent in a single filtered request.
	 * Used by the bundled single-asset query path to avoid oversized URLs.
	 */
	maxAssetsPerRequest?: number;
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
