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
 * Which vault service handles a vault. An EVault's escrow status is a separate
 * question — see `EVault.isEscrow`.
 */
export enum VaultType {
	EVault = "EVault",
	EulerEarn = "EulerEarn",
	SecuritizeCollateral = "SecuritizeCollateral",
	Unknown = "Unknown",
}
