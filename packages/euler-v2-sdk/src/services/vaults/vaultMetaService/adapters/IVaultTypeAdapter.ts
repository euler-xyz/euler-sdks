import { Address } from "viem";

export interface VaultFactoryResult {
  id: Address;
  factory: Address;
}

export interface IVaultTypeAdapter {
  /**
   * Fetches vault id -> factory address for the given vault addresses on the chain.
   * Vaults not found in the adapter may be omitted from the result.
   */
  getVaultFactories(
    chainId: number,
    vaultAddresses: Address[]
  ): Promise<VaultFactoryResult[]>;
}
