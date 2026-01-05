// TypeScript equivalents for VaultLens structs (from evk-periphery/src/Lens/LensTypes.sol).
// Numeric on-chain values use bigint to avoid precision loss.

import { OracleDecodedInfo, OracleDetailedInfo } from "src/utils/oracle.js";

export type Address = `0x${string}`;
export type BytesLike = `0x${string}` | string;

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
  queryFailureReason: BytesLike;
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
  interestRateModelParams: BytesLike;
}

export interface VaultInterestRateModelInfo {
  queryFailure: boolean;
  queryFailureReason: BytesLike;
  vault: Address;
  interestRateModel: Address;
  interestRateInfo: InterestRateInfo[];
  interestRateModelInfo: InterestRateModelDetailedInfo;
}

export interface TokenMeta {
  name: string
  symbol: string
  address: string
  decimals: bigint
}

export interface IEVault {
  timestamp: bigint;
  address: Address;
  vault: TokenMeta;
  asset: TokenMeta;
  unitOfAccount: TokenMeta;
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
  oracleInfo: OracleDecodedInfo;
  dTokenAddress: Address;
  interestRateModel: Address;
  hookTarget: Address;
  balanceTracker: Address;
  permit2: Address;
  creator: Address;
  governorAdmin: Address;
  collateralLTVInfo?: LTVInfo[];
  irmInfo?: VaultInterestRateModelInfo;
  liabilityPriceInfo?: AssetPriceInfo;
  collateralPriceInfo?: AssetPriceInfo[];
  backupAssetPriceInfo?: AssetPriceInfo;
  backupAssetOracleInfo?: OracleDecodedInfo;
}

export class EVault implements IEVault {
  timestamp: bigint;
  address: Address;
  vault: TokenMeta;
  asset: TokenMeta;
  unitOfAccount: TokenMeta;
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
  dTokenAddress: Address;
  interestRateModel: Address;
  hookTarget: Address;
  balanceTracker: Address;
  permit2: Address;
  creator: Address;
  governorAdmin: Address;
  oracleInfo: OracleDecodedInfo;

  collateralLTVInfo?: LTVInfo[];
  irmInfo?: VaultInterestRateModelInfo;
  liabilityPriceInfo?: AssetPriceInfo;
  collateralPriceInfo?: AssetPriceInfo[];
  backupAssetPriceInfo?: AssetPriceInfo;
  backupAssetOracleInfo?: OracleDecodedInfo;

  constructor(params: IEVault) {
    this.timestamp = params.timestamp;
    this.address = params.address;
    this.vault = params.vault;
    this.asset = params.asset;
    this.unitOfAccount = params.unitOfAccount;
    this.totalShares = params.totalShares;
    this.totalCash = params.totalCash;
    this.totalBorrowed = params.totalBorrowed;
    this.totalAssets = params.totalAssets;
    this.accumulatedFeesShares = params.accumulatedFeesShares;
    this.accumulatedFeesAssets = params.accumulatedFeesAssets;
    this.governorFeeReceiver = params.governorFeeReceiver;
    this.protocolFeeReceiver = params.protocolFeeReceiver;
    this.protocolFeeShare = params.protocolFeeShare;
    this.interestFee = params.interestFee;
    this.hookedOperations = params.hookedOperations;
    this.configFlags = params.configFlags;
    this.supplyCap = params.supplyCap;
    this.borrowCap = params.borrowCap;
    this.maxLiquidationDiscount = params.maxLiquidationDiscount;
    this.liquidationCoolOffTime = params.liquidationCoolOffTime;
    this.dTokenAddress = params.dTokenAddress;
    this.interestRateModel = params.interestRateModel;
    this.hookTarget = params.hookTarget;
    this.balanceTracker = params.balanceTracker;
    this.permit2 = params.permit2;
    this.creator = params.creator;
    this.governorAdmin = params.governorAdmin;
    this.collateralLTVInfo = params.collateralLTVInfo;
    this.oracleInfo = params.oracleInfo;
    this.irmInfo = params.irmInfo;
    this.liabilityPriceInfo = params.liabilityPriceInfo;
    this.collateralPriceInfo = params.collateralPriceInfo;
    this.backupAssetPriceInfo = params.backupAssetPriceInfo;
    this.backupAssetOracleInfo = params.backupAssetOracleInfo;
  }
}


