import type { Address } from "viem";
import type { ServiceResult } from "../../utils/entityDiagnostics.js";

export interface VaultFetchOptions {
	/** When true, enables all supported populate steps and overrides granular populate flags. */
	populateAll?: boolean;
	populateMarketPrices?: boolean;
	populateCollaterals?: boolean;
	populateStrategyVaults?: boolean;
	populateRewards?: boolean;
	populateIntrinsicApy?: boolean;
	populateLabels?: boolean;
	/** Options forwarded to EVaultService when populating strategy vaults (applies to EulerEarnService). */
	eVaultFetchOptions?: {
		populateAll?: boolean;
		populateCollaterals?: boolean;
		populateMarketPrices?: boolean;
		populateRewards?: boolean;
		populateIntrinsicApy?: boolean;
	};
}

export type VaultFilter<TVault> = (vault: TVault) => boolean | Promise<boolean>;

export interface FetchAllVaultsArgs<TVault, TOptions> {
	options?: TOptions;
	/**
	 * Optional async predicate applied after the initial vault fetch and before any populate/enrichment work.
	 * Use this to discard vaults early so the SDK does not spend resources populating vaults you will throw away.
	 */
	filter?: VaultFilter<TVault>;
}

/**
 * Unified interface for vault services (Euler Earn, EVault).
 * @typeParam TVault - Vault entity type (EulerEarn | EVault)
 * @typeParam TPerspective - Perspective type (string, or perspective enums like StandardEulerEarnPerspectives | StandardEVaultPerspectives)
 */
export interface IVaultService<TVault, TPerspective> {
	fetchVault(
		chainId: number,
		vault: Address,
		options?: VaultFetchOptions,
	): Promise<ServiceResult<TVault | undefined>>;
	fetchVaults(
		chainId: number,
		vaults: Address[],
		options?: VaultFetchOptions,
	): Promise<ServiceResult<(TVault | undefined)[]>>;
	/**
	 * Fetches all discoverable vaults for the service.
	 * The optional async `filter` runs after the first fetch and before populate/enrichment work,
	 * so rejected vaults are skipped before additional resources are spent on them.
	 */
	fetchAllVaults(
		chainId: number,
		args?: FetchAllVaultsArgs<TVault, VaultFetchOptions>,
	): Promise<ServiceResult<(TVault | undefined)[]>>;
	fetchVerifiedVaultAddresses(
		chainId: number,
		perspectives: (TPerspective | Address)[],
	): Promise<Address[]>;
	fetchVerifiedVaults(
		chainId: number,
		perspectives: (TPerspective | Address)[],
		options?: VaultFetchOptions,
	): Promise<ServiceResult<(TVault | undefined)[]>>;
	factory(chainId: number): Address;
}
