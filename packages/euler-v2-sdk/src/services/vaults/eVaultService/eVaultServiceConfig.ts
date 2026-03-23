export type EVaultServiceAdapter = "v3" | "onchain";

export interface EVaultV3AdapterConfig {
	/** Base HTTP endpoint, for example `https://v3staging.eul.dev`. */
	endpoint: string;
	/** Optional API key sent as `X-API-Key` on V3 HTTP requests. */
	apiKey?: string;
}

export interface EVaultServiceConfig {
	/** Selects which built-in EVault adapter `buildEulerSDK` should construct. Defaults to `v3`. */
	adapter?: EVaultServiceAdapter;
	/** Configuration used when the `v3` EVault adapter is selected. */
	v3AdapterConfig?: EVaultV3AdapterConfig;
}
