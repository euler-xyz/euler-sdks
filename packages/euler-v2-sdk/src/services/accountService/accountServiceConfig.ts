import type { AccountVaultsOnchainAdapterConfig } from "./adapters/accountVaultsOnchainAdapter/index.js";

export type AccountServiceAdapter = "v3" | "onchain" | "fallback";

/**
 * How the on-chain account adapter discovers which sub-accounts and vaults an
 * owner touches:
 *  - `subgraph` (default): the historical path — a subgraph lookup returns the
 *    position map, which is then read on-chain via AccountLens.
 *  - `onchain`: a pure-RPC brute-force scan (deployless discovery lens) with no
 *    subgraph dependency. See {@link AccountVaultsOnchainAdapter}.
 */
export type AccountPositionDiscovery = "subgraph" | "onchain";

export interface AccountV3AdapterConfig {
	/** Base HTTP endpoint, for example `https://v3.euler.finance`. */
	endpoint: string;
	/** Optional API key sent as `X-API-Key` on V3 HTTP requests. */
	apiKey?: string;
	/** Optional default for the `forceFresh` query param on `/v3/accounts/.../positions`. */
	forceFresh?: boolean;
}

export interface AccountServiceConfig {
	/** Selects which built-in account adapter `buildEulerSDK` should construct. Defaults to `fallback` (v3 primary, onchain secondary). */
	adapter?: AccountServiceAdapter;
	/** Configuration used when the `v3` account adapter is selected. */
	v3AdapterConfig?: AccountV3AdapterConfig;
	/** Discovery backend used by the on-chain account adapter. Defaults to `subgraph`. */
	positionDiscovery?: AccountPositionDiscovery;
	/** Configuration for the pure-RPC discovery adapter (used when `positionDiscovery` is `onchain`). */
	onchainDiscoveryConfig?: AccountVaultsOnchainAdapterConfig;
}
