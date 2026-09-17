import type { Address } from "viem";

export interface ERC4626Data {
	shares: Token;
	asset: Token;
	totalShares: bigint;
	totalAssets: bigint;
}

export interface Token {
	address: Address;
	name: string;
	symbol: string;
	decimals: number;
	logoURI?: string;
}

/**
 * Which vault service handles a vault. Not the vault family Euler V3 publishes
 * as `vaultType` — see `VaultFamily` in `utils/vaultFamily.ts`, where both
 * `evk` and `escrow` map to `VaultType.EVault`.
 */
export enum VaultType {
	EVault = "EVault",
	EulerEarn = "EulerEarn",
	SecuritizeCollateral = "SecuritizeCollateral",
	Unknown = "Unknown",
}
