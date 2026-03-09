import { Address } from "viem";
import { ERC4626Data, Token } from "../utils/types.js";
import type { IPriceService } from "../services/priceService/index.js";
import type { IRewardsService, VaultRewardInfo } from "../services/rewardsService/index.js";
import type { IntrinsicApyInfo } from "../services/intrinsicApyService/index.js";
import type { EulerLabel } from "./EulerLabels.js";
import type { DataIssue } from "../utils/entityDiagnostics.js";

/** Virtual deposit amount used in share/asset conversions (matches EVault ConversionHelpers.sol). */
export const VIRTUAL_DEPOSIT_AMOUNT = 1_000_000n;

/** Price scaled to 18 decimals (WAD precision). */
export type PriceWad = bigint;

export interface ERC4626VaultPopulated {
  marketPrices: boolean;
  rewards: boolean;
  intrinsicApy: boolean;
  labels: boolean;
}

export interface IERC4626Vault extends ERC4626Data {
  type: string;
  chainId: number;
  address: Address;
  shares: Token;
  asset: Token;
  totalShares: bigint;
  totalAssets: bigint;
  populated?: Partial<ERC4626VaultPopulated>;
}

/** Interface for ERC4626 share/asset conversion methods (not part of data shape). */
export interface IERC4626VaultConversion {
  convertToAssets(shares: bigint): bigint;
  convertToShares(assets: bigint): bigint;
}

export class ERC4626Vault implements IERC4626Vault, IERC4626VaultConversion {
  type: string;
  chainId: number;
  address: Address;
  shares: Token;
  asset: Token;
  totalShares: bigint;
  totalAssets: bigint;
  marketPriceUsd?: PriceWad;
  rewards?: VaultRewardInfo;
  intrinsicApy?: IntrinsicApyInfo;
  eulerLabel?: EulerLabel;
  populated: ERC4626VaultPopulated;

  constructor(args: IERC4626Vault) {
    this.type = args.type;
    this.chainId = args.chainId;
    this.address = args.address;
    this.shares = args.shares;
    this.asset = args.asset;
    this.totalShares = args.totalShares;
    this.totalAssets = args.totalAssets;
    this.populated = {
      marketPrices: args.populated?.marketPrices ?? false,
      rewards: args.populated?.rewards ?? false,
      intrinsicApy: args.populated?.intrinsicApy ?? false,
      labels: args.populated?.labels ?? false,
    };
  }

  /** 1:1 conversion (standard ERC4626 when totalShares === totalAssets). */
  convertToAssets(shares: bigint): bigint {
    return shares;
  }

  /** 1:1 conversion (standard ERC4626 when totalShares === totalAssets). */
  convertToShares(assets: bigint): bigint {
    return assets;
  }

  async fetchAssetMarketValueUsd(amount: bigint, priceService: IPriceService): Promise<bigint | undefined> {
    const price = await priceService.getAssetUsdPrice(this);
    if (!price) return undefined;
    return (amount * price.amountOutMid) / 10n ** BigInt(this.asset.decimals);
  }

  async populateMarketPrices(priceService: IPriceService): Promise<DataIssue[]> {
    try {
      const priced = await priceService.getAssetUsdPriceWithDiagnostics(this, "$.marketPriceUsd");
      this.marketPriceUsd = priced.result?.amountOutMid;
      this.populated.marketPrices = true;
      return priced.errors;
    } catch (error) {
      this.marketPriceUsd = undefined;
      this.populated.marketPrices = false;
      return [{
        code: "SOURCE_UNAVAILABLE",
        severity: "error",
        message: "Failed to populate asset market price.",
        paths: ["$.marketPriceUsd"],
        entityId: this.asset.address,
        source: "priceService",
        originalValue: error instanceof Error ? error.message : String(error),
      }];
    }
  }

  async populateRewards(rewardsService: IRewardsService): Promise<DataIssue[]> {
    try {
      this.rewards = await rewardsService.getVaultRewards(this.chainId, this.address);
      this.populated.rewards = true;
      return [];
    } catch (error) {
      this.rewards = undefined;
      this.populated.rewards = false;
      return [{
        code: "SOURCE_UNAVAILABLE",
        severity: "error",
        message: "Failed to populate rewards.",
        paths: ["$.rewards"],
        entityId: this.address,
        source: "rewardsService",
        originalValue: error instanceof Error ? error.message : String(error),
      }];
    }
  }
}
