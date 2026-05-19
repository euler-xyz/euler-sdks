export type EulerEarnServiceAdapter = "v3" | "onchain" | "fallback";

export interface EulerEarnV3AdapterConfig {
	/** Base HTTP endpoint, for example `https://v3.euler.finance`. */
	endpoint: string;
	/** Optional API key sent as `X-API-Key` on V3 HTTP requests. */
	apiKey?: string;
}

export interface EulerEarnServiceConfig {
	/** Selects which built-in EulerEarn adapter `buildEulerSDK` should construct. Defaults to `fallback` (v3 primary, onchain secondary). */
	adapter?: EulerEarnServiceAdapter;
	/** Configuration used when the `v3` EulerEarn adapter is selected. */
	v3AdapterConfig?: EulerEarnV3AdapterConfig;
}
