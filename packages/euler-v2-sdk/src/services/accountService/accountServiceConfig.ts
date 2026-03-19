export type AccountServiceAdapter = "v3" | "onchain";

export interface AccountV3AdapterConfig {
  /** Base HTTP endpoint, for example `https://indexer.euler.finance`. */
  endpoint: string;
  /** Optional API key sent as `X-API-Key` on V3 HTTP requests. */
  apiKey?: string;
  /** Optional default for the `forceFresh` query param on `/v3/accounts/.../positions`. */
  forceFresh?: boolean;
}

export interface AccountServiceConfig {
  /** Selects which built-in account adapter `buildEulerSDK` should construct. Defaults to `v3`. */
  adapter?: AccountServiceAdapter;
  /** Configuration used when the `v3` account adapter is selected. */
  v3AdapterConfig?: AccountV3AdapterConfig;
}
