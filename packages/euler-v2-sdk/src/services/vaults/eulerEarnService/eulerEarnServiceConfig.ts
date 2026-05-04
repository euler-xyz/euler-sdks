export type EulerEarnServiceAdapter = "v3" | "onchain";

export interface EulerEarnV3AdapterConfig {
	/** Base HTTP endpoint, for example `https://v3.eul.dev`. */
	endpoint: string;
	/** Optional API key sent as `X-API-Key` on V3 HTTP requests. */
	apiKey?: string;
}

export interface EulerEarnServiceConfig {
	/** Selects which built-in EulerEarn adapter `buildEulerSDK` should construct. Defaults to `v3`. */
	adapter?: EulerEarnServiceAdapter;
	/** Configuration used when the `v3` EulerEarn adapter is selected. */
	v3AdapterConfig?: EulerEarnV3AdapterConfig;
}
