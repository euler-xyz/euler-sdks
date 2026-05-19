export type EVaultServiceAdapter = "v3" | "onchain" | "fallback";

export interface EVaultV3AdapterConfig {
	/** Base HTTP endpoint, for example `https://v3.euler.finance`. */
	endpoint: string;
	/** Optional API key sent as `X-API-Key` on V3 HTTP requests. */
	apiKey?: string;
	/** Optional V3 batch size for `/v3/evk/vaults/batch` detail requests. Defaults to 200. */
	batchSize?: number;
}

export interface EVaultServiceConfig {
	/** Selects which built-in EVault adapter `buildEulerSDK` should construct. Defaults to `fallback` (v3 primary, onchain secondary). */
	adapter?: EVaultServiceAdapter;
	/** Configuration used when the `v3` EVault adapter is selected. */
	v3AdapterConfig?: EVaultV3AdapterConfig;
}
