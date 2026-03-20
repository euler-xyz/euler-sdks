import type { Address } from "viem";

export interface VaultFactoryResult {
  id: Address;
  factory: Address;
}

export interface VaultResolvedTypeResult {
  id: Address;
  type: string;
}

export interface IVaultTypeAdapter {
  /**
   * Fetches vault id -> factory address for the given vault addresses on the chain.
   * Vaults not found in the adapter may be omitted from the result.
   */
  fetchVaultFactories(
    chainId: number,
    vaultAddresses: Address[]
  ): Promise<VaultFactoryResult[]>;

  /**
   * Fetches vault id -> vault type for the given vault addresses on the chain.
   * Vaults not found in the adapter may be omitted from the result.
   */
  fetchVaultTypes?(
    chainId: number,
    vaultAddresses: Address[]
  ): Promise<VaultResolvedTypeResult[]>;
}
