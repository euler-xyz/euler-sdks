import { Address, Hex } from "viem";

// TypeScript equivalents for AccountLens structs (from evk-periphery/src/Lens/LensTypes.sol).
// Numeric on-chain values use bigint to avoid precision loss.

export interface EVCAccountInfo {
  timestamp: bigint;
  evc: Address;
  account: Address;
  addressPrefix: `0x${string}`; // bytes19 in Solidity
  owner: Address;
  isLockdownMode: boolean;
  isPermitDisabledMode: boolean;
  lastAccountStatusCheckTimestamp: bigint;
  enabledControllers: Address[];
  enabledCollaterals: Address[];
}

export interface AccountLiquidityInfo {
  queryFailure: boolean;
  queryFailureReason: Hex;
  account: Address;
  vault: Address;
  unitOfAccount: Address;
  timeToLiquidation: bigint; // int256 in Solidity
  liabilityValueBorrowing: bigint;
  liabilityValueLiquidation: bigint;
  collateralValueBorrowing: bigint;
  collateralValueLiquidation: bigint;
  collateralValueRaw: bigint;
  collaterals: Address[];
  collateralValuesBorrowing: bigint[];
  collateralValuesLiquidation: bigint[];
  collateralValuesRaw: bigint[];
}

export interface VaultAccountInfo {
  timestamp: bigint;
  account: Address;
  vault: Address;
  asset: Address;
  assetsAccount: bigint;
  shares: bigint;
  assets: bigint;
  borrowed: bigint;
  assetAllowanceVault: bigint;
  assetAllowanceVaultPermit2: bigint;
  assetAllowanceExpirationVaultPermit2: bigint;
  assetAllowancePermit2: bigint;
  balanceForwarderEnabled: boolean;
  isController: boolean;
  isCollateral: boolean;
  liquidityInfo: AccountLiquidityInfo;
}
