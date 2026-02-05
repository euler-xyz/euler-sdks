// TypeScript equivalents for VaultLens structs (from evk-periphery/src/Lens/LensTypes.sol).
// Numeric on-chain values use bigint to avoid precision loss.

import { Address, Hex } from "viem";
import { OracleInfo, OraclePrice } from "../utils/oracle.js";
import { InterestRateModelType } from "../services/vaults/eVaultService/dataSources/eVaultLensTypes.js";
import { Token } from "../utils/types.js";
import { IRMParams } from "../utils/irm.js";
import { ERC4626Vault, IERC4626Vault, IERC4626VaultConversion, VIRTUAL_DEPOSIT_AMOUNT } from "./ERC4626Vault.js";

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

export interface InterestRates {
  borrowSPY: string;
  borrowAPY: string;
  supplyAPY: string;
}

export interface InterestRateModel {
  address: Address;
  type: InterestRateModelType;
  data: IRMParams | null; // Decoded IRM parameters, null for UNKNOWN type
}

export interface EVaultCollateral {
  address: Address;
  borrowLTV: number;
  liquidationLTV: number;
  ramping?: EVaultCollateralRamping;
  price: OraclePrice;
}

export interface EVaultCollateralRamping {
  initialLiquidationLTV: number;
  targetTimestamp: number;
  rampDuration: bigint;
}

export interface IEVault extends IERC4626Vault {
  unitOfAccount: Token;

  totalCash: bigint;
  totalBorrowed: bigint;

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

export class EVault extends ERC4626Vault implements IEVault, IERC4626VaultConversion {
  unitOfAccount: Token;
  totalCash: bigint;
  totalBorrowed: bigint;
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

  constructor(args: IEVault) {
    super(args);
    this.unitOfAccount = args.unitOfAccount;
    this.totalCash = args.totalCash;
    this.totalBorrowed = args.totalBorrowed;
    this.creator = args.creator;
    this.governorAdmin = args.governorAdmin;
    this.dToken = args.dToken;
    this.balanceTracker = args.balanceTracker;
    this.fees = args.fees;
    this.hooks = args.hooks;
    this.caps = args.caps;
    this.liquidation = args.liquidation;
    this.oracle = args.oracle;
    this.interestRates = args.interestRates;
    this.interestRateModel = args.interestRateModel;
    this.collaterals = args.collaterals;
    this.evcCompatibleAsset = args.evcCompatibleAsset;
    this.liabilityPrice = args.liabilityPrice;
    this.timestamp = args.timestamp;
  }

  /** Conversion using VIRTUAL_DEPOSIT (matches EVault contract). */
  override convertToAssets(shares: bigint): bigint {
    const totalAssetsAdjusted = this.totalAssets + VIRTUAL_DEPOSIT_AMOUNT;
    const totalSharesAdjusted = this.totalShares + VIRTUAL_DEPOSIT_AMOUNT;
    return (shares * totalAssetsAdjusted) / totalSharesAdjusted;
  }

  /** Conversion using VIRTUAL_DEPOSIT (matches EVault contract). */
  override convertToShares(assets: bigint): bigint {
    const totalAssetsAdjusted = this.totalAssets + VIRTUAL_DEPOSIT_AMOUNT;
    const totalSharesAdjusted = this.totalShares + VIRTUAL_DEPOSIT_AMOUNT;
    return (assets * totalSharesAdjusted) / totalAssetsAdjusted;
  }
}
