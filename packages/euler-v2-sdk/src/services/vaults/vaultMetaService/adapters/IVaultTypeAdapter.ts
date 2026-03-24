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
	 * Fetches the vault type identifier for a single vault.
	 * Adapters may return either a canonical SDK vault type string or another
	 * stable identifier that maps 1:1 to a registered vault service.
	 */
	fetchVaultType(
		chainId: number,
		vaultAddress: Address,
	): Promise<string | undefined>;

	/**
	 * Fetches vault id -> factory address for the given vault addresses on the chain.
	 * Vaults not found in the adapter may be omitted from the result.
	 */
	fetchVaultFactories(
		chainId: number,
		vaultAddresses: Address[],
	): Promise<VaultFactoryResult[]>;

	/**
	 * Fetches vault id -> vault type for the given vault addresses on the chain.
	 * Adapters may return canonical SDK vault type strings or another stable
	 * identifier that maps 1:1 to a registered vault service.
	 * Vaults not found in the adapter may be omitted from the result.
	 */
	fetchVaultTypes(
		chainId: number,
		vaultAddresses: Address[],
	): Promise<VaultResolvedTypeResult[]>;
}
