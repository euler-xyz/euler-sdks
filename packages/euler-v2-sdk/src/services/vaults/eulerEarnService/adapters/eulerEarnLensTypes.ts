import type { Address } from "viem";

// TypeScript equivalents for EulerEarnVaultLens structs (from evk-periphery/src/Lens/EulerEarnVaultLens.sol).
// Numeric on-chain values use bigint to avoid precision loss.

export interface VaultInfoERC4626 {
	timestamp: bigint;
	vault: Address;
	vaultName: string;
	vaultSymbol: string;
	vaultDecimals: bigint;
	asset: Address;
	assetName: string;
	assetSymbol: string;
	assetDecimals: bigint;
	totalShares: bigint;
	totalAssets: bigint;
	isEVault: boolean;
}

export interface EulerEarnVaultStrategyInfo {
	strategy: Address;
	allocatedAssets: bigint;
	availableAssets: bigint;
	currentAllocationCap: bigint;
	pendingAllocationCap: bigint;
	pendingAllocationCapValidAt: bigint;
	removableAt: bigint;
	info: VaultInfoERC4626;
}

export interface EulerEarnVaultInfoFull {
	timestamp: bigint;
	vault: Address;
	vaultName: string;
	vaultSymbol: string;
	vaultDecimals: bigint;
	asset: Address;
	assetName: string;
	assetSymbol: string;
	assetDecimals: bigint;
	totalShares: bigint;
	totalAssets: bigint;
	lostAssets: bigint;
	availableAssets: bigint;
	timelock: bigint;
	performanceFee: bigint;
	feeReceiver: Address;
	owner: Address;
	creator: Address;
	curator: Address;
	guardian: Address;
	evc: Address;
	permit2: Address;
	pendingTimelock: bigint;
	pendingTimelockValidAt: bigint;
	pendingGuardian: Address;
	pendingGuardianValidAt: bigint;
	supplyQueue: Address[];
	strategies: EulerEarnVaultStrategyInfo[];
}
