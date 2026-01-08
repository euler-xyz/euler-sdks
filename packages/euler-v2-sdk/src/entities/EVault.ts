// TypeScript equivalents for VaultLens structs (from evk-periphery/src/Lens/LensTypes.sol).
// Numeric on-chain values use bigint to avoid precision loss.

import { Address, Hex } from "viem";
import { OracleInfo, OraclePrice } from "../utils/oracle.js";
import { InterestRateModelType } from "src/services/eVaultService/dataSources/eVaultLensTypes.js";
import { Token } from "../utils/types.js";

export type EVaultHookedOperations = {
  deposit: boolean;
  mint: boolean;
  withdraw: boolean;
  redeem: boolean;
  transfer: boolean;
  skim: boolean;
  borrow: boolean;
  repay: boolean;
  repayWithShares: boolean;
  pullDebt: boolean;
  convertFees: boolean;
  liquidate: boolean;
  flashloan: boolean;
  touch: boolean;
  vaultStatusCheck: boolean;
};

export interface EVaultFees {
  interestFee: number;
  accumulatedFeesShares: bigint;
  accumulatedFeesAssets: bigint;
  governorFeeReceiver: Address;
  protocolFeeReceiver: Address;
  protocolFeeShare: number;
}

export interface EVaultHooks {
  hookedOperations: EVaultHookedOperations;
  hookTarget: Address;
}

export interface EVaultCaps {
  supplyCap: bigint;
  borrowCap: bigint;
}

export interface EVaultLiquidation {
  maxLiquidationDiscount: number;
  liquidationCoolOffTime: number;
  socializeDebt: boolean;
}

// TODO make consumable
export interface InterestRates {
  borrowSPY: bigint;
  borrowAPY: bigint;
  supplyAPY: bigint;
}

// TODO make an entity for this
export interface InterestRateModel {
  address: Address;
  type: InterestRateModelType;
  data: Hex; // TODO
}

export interface EVaultCollateral {
  address: Address;
  borrowLTV: bigint;
  liquidationLTV: bigint;
  isRamping: boolean;
  ramping: EVaultCollateralRamping;
  price: OraclePrice;
}

export interface EVaultCollateralRamping {
  initialLiquidationLTV: bigint;
  targetTimestamp: bigint;
  rampDuration: bigint;
}

export interface IEVault {
  vault: Token;
  asset: Token;
  unitOfAccount: Token;

  totalShares: bigint;
  totalCash: bigint;
  totalBorrowed: bigint;
  totalAssets: bigint;

  creator: Address;
  governorAdmin: Address;
  dToken: Address;
  balanceTracker: Address;

  fees: EVaultFees;
  hooks: EVaultHooks; 
  caps: EVaultCaps;
  liquidation: EVaultLiquidation;
  oracle: OracleInfo;
  interestRates: InterestRates;
  interestRateModel: InterestRateModel;
  collaterals: EVaultCollateral[];

  evcCompatibleAsset: boolean;

  liabilityPrice: OraclePrice;
  timestamp: number;
}

export class EVault implements IEVault {
  vault: Token;
  asset: Token;
  unitOfAccount: Token;

  totalShares: bigint;
  totalCash: bigint;
  totalBorrowed: bigint;
  totalAssets: bigint;

  creator: Address;
  governorAdmin: Address;
  dToken: Address;
  balanceTracker: Address;

  evcCompatibleAsset: boolean;

  fees: EVaultFees;
  hooks: EVaultHooks;
  caps: EVaultCaps;
  liquidation: EVaultLiquidation;
  oracle: OracleInfo;
  interestRates: InterestRates;
  interestRateModel: InterestRateModel;
  collaterals: EVaultCollateral[];

  liabilityPrice: OraclePrice;
  timestamp: number;

  constructor(args: IEVault) {
    this.vault = args.vault;
    this.asset = args.asset;
    this.unitOfAccount = args.unitOfAccount;

    this.totalShares = args.totalShares;
    this.totalCash = args.totalCash;
    this.totalBorrowed = args.totalBorrowed;
    this.totalAssets = args.totalAssets;

    this.creator = args.creator;
    this.governorAdmin = args.governorAdmin;
    this.dToken = args.dToken;
    this.balanceTracker = args.balanceTracker;

    this.evcCompatibleAsset = args.evcCompatibleAsset;

    this.fees = args.fees;
    this.hooks = args.hooks;
    this.caps = args.caps;
    this.liquidation = args.liquidation;

    this.oracle = args.oracle;
    this.interestRates = args.interestRates;
    this.interestRateModel = args.interestRateModel;
    this.collaterals = args.collaterals;

    this.liabilityPrice = args.liabilityPrice;
    this.timestamp = args.timestamp;
  }
}


