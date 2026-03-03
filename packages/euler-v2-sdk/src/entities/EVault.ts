// TypeScript equivalents for VaultLens structs (from evk-periphery/src/Lens/LensTypes.sol).
// Numeric on-chain values use bigint to avoid precision loss.

import { Address, maxUint256 } from "viem";
import { OracleInfo, OraclePrice } from "../utils/oracle.js";
import { InterestRateModelType } from "../services/vaults/eVaultService/adapters/eVaultLensTypes.js";
import { Token } from "../utils/types.js";
import { IRMParams } from "../utils/irm.js";
import { ERC4626Vault, IERC4626Vault, IERC4626VaultConversion, VIRTUAL_DEPOSIT_AMOUNT, type PriceWad } from "./ERC4626Vault.js";
import type { IPriceService } from "../services/priceService/index.js";
import { getAssetOraclePrice, getCollateralOraclePrice } from "../services/priceService/index.js";
import type { VaultEntity } from "../services/vaults/vaultMetaService/index.js";
import type { IVaultMetaService } from "../services/vaults/vaultMetaService/index.js";
import { addEntityDataIssue, transferEntityDataIssues } from "../utils/entityDiagnostics.js";

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
  oraclePriceRaw: OraclePrice; // shouldn't be used directly, use EVault price getters instead
  vault?: VaultEntity;
  marketPriceUsd?: PriceWad;
}

export interface EVaultCollateralRamping {
  initialLiquidationLTV: number;
  targetTimestamp: number;
  rampDuration: bigint;
}

export type RiskPrice = {
  priceLiquidation: PriceWad;
  priceBorrowing: PriceWad;
};

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

  oraclePriceRaw: OraclePrice; // shouldn't be used directly, use EVault price getters instead
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
  oraclePriceRaw: OraclePrice;
  timestamp: number;

  constructor(args: IEVault) {
    super(args);
    transferEntityDataIssues(args as object, this);
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
    this.oraclePriceRaw = args.oraclePriceRaw;
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

  get availableToBorrow(): bigint {
    const { borrowCap } = this.caps;
    if (borrowCap === maxUint256) return this.totalCash;
    if (this.totalBorrowed >= borrowCap) return 0n;
    const remaining = borrowCap - this.totalBorrowed;
    return this.totalCash < remaining ? this.totalCash : remaining;
  }

  get assetRiskPrice(): RiskPrice | undefined {
    const price = getAssetOraclePrice(this);
    if (!price) return undefined;

    const scale = 10n ** BigInt(18 - price.decimals);
    return {
      priceLiquidation: price.amountOutMid * scale,
      priceBorrowing: price.amountOutAsk * scale,
    };
  }

  getCollateralRiskPrice(collateralVault: ERC4626Vault): RiskPrice | undefined {
    const price = getCollateralOraclePrice(this, collateralVault);
    if (!price) return undefined;

    const scale = 10n ** BigInt(18 - price.decimals);
    return {
      priceLiquidation: price.amountOutMid * scale,
      priceBorrowing: price.amountOutBid * scale,
    };
  }

  async fetchUnitOfAccountMarketPriceUsd(priceService: IPriceService): Promise<PriceWad | undefined> {
    return priceService.getUnitOfAccountUsdRate(this);
  }

  async fetchCollateralMarketPriceUsd(
    collateralVault: ERC4626Vault,
    priceService: IPriceService
  ): Promise<PriceWad | undefined> {
    const price = await priceService.getCollateralUsdPrice(this, collateralVault);
    if (!price) return undefined;
    return price.amountOutMid;
  }

  async fetchCollateralMarketValueUsd(
    amount: bigint,
    collateralVault: ERC4626Vault,
    priceService: IPriceService
  ): Promise<bigint | undefined> {
    const price = await priceService.getCollateralUsdPrice(this, collateralVault);
    if (!price) return undefined;
    return (amount * price.amountOutMid) / 10n ** BigInt(collateralVault.asset.decimals);
  }

  async populateCollaterals(vaultMetaService: IVaultMetaService): Promise<void> {
    const addresses = this.collaterals.map((c) => c.address);
    if (addresses.length === 0) return;

    const collateralVaults = await Promise.all(
      addresses.map((addr) =>
        vaultMetaService.fetchVault(this.chainId, addr).catch((error) => {
          addEntityDataIssue(this, {
            code: "SOURCE_UNAVAILABLE",
            severity: "warning",
            message: "Failed to resolve collateral vault metadata.",
            path: "$.collaterals",
            source: "vaultMetaService",
            originalValue: error instanceof Error ? error.message : String(error),
            normalizedValue: "collateral-vault-missing",
          });
          return undefined;
        })
      )
    );

    const vaultByAddress = new Map(
      collateralVaults
        .filter((v) => v !== undefined)
        .map((v) => [(v as { address: Address }).address.toLowerCase(), v])
    );

    for (const collateral of this.collaterals) {
      collateral.vault = vaultByAddress.get(collateral.address.toLowerCase());
    }
  }

  override async populateMarketPrices(priceService: IPriceService): Promise<void> {
    this.marketPriceUsd = await this.fetchAssetMarketPriceUsd(priceService).catch((error) => {
      addEntityDataIssue(this, {
        code: "SOURCE_UNAVAILABLE",
        severity: "warning",
        message: "Failed to populate EVault market price.",
        path: "$.marketPriceUsd",
        source: "priceService",
        originalValue: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    });

    await Promise.all(
      this.collaterals.map(async (collateral) => {
        if (!collateral.vault) return;
        const price = await priceService
          .getCollateralUsdPrice(this, collateral.vault as ERC4626Vault)
          .catch((error) => {
            addEntityDataIssue(this, {
              code: "SOURCE_UNAVAILABLE",
              severity: "warning",
              message: "Failed to populate collateral market price.",
              path: "$.collaterals",
              source: "priceService",
              originalValue: error instanceof Error ? error.message : String(error),
              normalizedValue: "collateral-market-price-missing",
            });
            return undefined;
          });
        collateral.marketPriceUsd = price?.amountOutMid;
      })
    );
  }

}
