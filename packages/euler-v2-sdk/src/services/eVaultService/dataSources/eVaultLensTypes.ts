import { OracleDetailedInfo } from "src/utils/oracle.js";
import { Address, Hex } from "viem";

export interface LTVInfo {
  collateral: Address;
  borrowLTV: bigint;
  liquidationLTV: bigint;
  initialLiquidationLTV: bigint;
  targetTimestamp: bigint;
  rampDuration: bigint;
}

export interface AssetPriceInfo {
  queryFailure: boolean;
  queryFailureReason: Hex;
  timestamp: bigint;
  oracle: Address;
  asset: Address;
  unitOfAccount: Address;
  amountIn: bigint;
  amountOutMid: bigint;
  amountOutBid: bigint;
  amountOutAsk: bigint;
}

export interface InterestRateInfo {
  cash: bigint;
  borrows: bigint;
  borrowSPY: bigint;
  borrowAPY: bigint;
  supplyAPY: bigint;
}

export enum InterestRateModelType {
  UNKNOWN = 0,
  KINK = 1,
  ADAPTIVE_CURVE = 2,
  KINKY = 3,
  FIXED_CYCLICAL_BINARY = 4,
}

export interface InterestRateModelDetailedInfo {
  interestRateModel: Address;
  interestRateModelType: InterestRateModelType;
  interestRateModelParams: Hex;
}

export interface VaultInterestRateModelInfo {
  queryFailure: boolean;
  queryFailureReason: Hex;
  vault: Address;
  interestRateModel: Address;
  interestRateInfo: InterestRateInfo[];
  interestRateModelInfo: InterestRateModelDetailedInfo;
}

export interface VaultInfoFull {
  timestamp: bigint;
  vault: Address;
  vaultName: string;
  vaultSymbol: string;
  vaultDecimals: bigint;
  asset: Address;
  assetName: string;
  assetSymbol: string;
  assetDecimals: bigint;
  unitOfAccount: Address;
  unitOfAccountName: string;
  unitOfAccountSymbol: string;
  unitOfAccountDecimals: bigint;
  totalShares: bigint;
  totalCash: bigint;
  totalBorrowed: bigint;
  totalAssets: bigint;
  accumulatedFeesShares: bigint;
  accumulatedFeesAssets: bigint;
  governorFeeReceiver: Address;
  protocolFeeReceiver: Address;
  protocolFeeShare: bigint;
  interestFee: bigint;
  hookedOperations: bigint;
  configFlags: bigint;
  supplyCap: bigint;
  borrowCap: bigint;
  maxLiquidationDiscount: bigint;
  liquidationCoolOffTime: bigint;
  dToken: Address;
  oracle: Address;
  interestRateModel: Address;
  hookTarget: Address;
  evc: Address;
  protocolConfig: Address;
  balanceTracker: Address;
  permit2: Address;
  creator: Address;
  governorAdmin: Address;
  irmInfo: VaultInterestRateModelInfo;
  collateralLTVInfo: LTVInfo[];
  liabilityPriceInfo: AssetPriceInfo;
  collateralPriceInfo: AssetPriceInfo[];
  oracleInfo: OracleDetailedInfo;
  backupAssetPriceInfo: AssetPriceInfo;
  backupAssetOracleInfo: OracleDetailedInfo;
}

