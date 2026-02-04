import { Address } from "viem";

export interface VaultFactoryResult {
  id: Address;
  factory: Address;
}

export interface IVaultTypeDataSource {
  /**
   * Fetches vault id -> factory address for the given vault addresses on the chain.
   * Vaults not found in the data source may be omitted from the result.
   */
  getVaultFactories(
    chainId: number,
    vaultAddresses: Address[]
  ): Promise<VaultFactoryResult[]>;
}
