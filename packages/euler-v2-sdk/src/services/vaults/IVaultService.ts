import { Address } from "viem";

export interface VaultFetchOptions {
  populateMarketPrices?: boolean;
  populateCollaterals?: boolean;
  populateStrategyVaults?: boolean;
  populateRewards?: boolean;
  populateLabels?: boolean;
  /** Options forwarded to EVaultService when populating strategy vaults (applies to EulerEarnService). */
  eVaultFetchOptions?: {
    populateCollaterals?: boolean;
    populateMarketPrices?: boolean;
    populateRewards?: boolean;
  };
}

/**
 * Unified interface for vault services (Euler Earn, EVault).
 * @typeParam TVault - Vault entity type (EulerEarn | EVault)
 * @typeParam TPerspective - Perspective type (string, or perspective enums like StandardEulerEarnPerspectives | StandardEVaultPerspectives)
 */
export interface IVaultService<TVault, TPerspective> {
  fetchVault(chainId: number, vault: Address, options?: VaultFetchOptions): Promise<TVault>;
  fetchVaults(chainId: number, vaults: Address[], options?: VaultFetchOptions): Promise<TVault[]>;
  fetchVerifiedVaultAddresses(
    chainId: number,
    perspectives: (TPerspective | Address)[]
  ): Promise<Address[]>;
  fetchVerifiedVaults(
    chainId: number,
    perspectives: (TPerspective | Address)[],
    options?: VaultFetchOptions
  ): Promise<TVault[]>;
  factory(chainId: number): Address;
}
