import { Address } from "viem";
import { ERC4626Data, Token } from "../utils/types.js";
import type { IPriceService } from "../services/priceService/index.js";
import type { IRewardsService, VaultRewardInfo } from "../services/rewardsService/index.js";
import type { IntrinsicApyInfo } from "../services/intrinsicApyService/index.js";
import type { EulerLabel } from "./EulerLabels.js";

/** Virtual deposit amount used in share/asset conversions (matches EVault ConversionHelpers.sol). */
export const VIRTUAL_DEPOSIT_AMOUNT = 1_000_000n;

/** Price scaled to 18 decimals (WAD precision). */
export type PriceWad = bigint;

export interface IERC4626Vault extends ERC4626Data {
  type: string;
  chainId: number;
  address: Address;
  shares: Token;
  asset: Token;
  totalShares: bigint;
  totalAssets: bigint;
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

  constructor(args: IERC4626Vault) {
    this.type = args.type;
    this.chainId = args.chainId;
    this.address = args.address;
    this.shares = args.shares;
    this.asset = args.asset;
    this.totalShares = args.totalShares;
    this.totalAssets = args.totalAssets;
  }

  /** 1:1 conversion (standard ERC4626 when totalShares === totalAssets). */
  convertToAssets(shares: bigint): bigint {
    return shares;
  }

  /** 1:1 conversion (standard ERC4626 when totalShares === totalAssets). */
  convertToShares(assets: bigint): bigint {
    return assets;
  }

  async fetchAssetMarketPriceUsd(priceService: IPriceService): Promise<PriceWad | undefined> {
    const price = await priceService.getAssetUsdPrice(this);
    if (!price) return undefined;
    return price.amountOutMid;
  }

  async fetchAssetMarketValueUsd(amount: bigint, priceService: IPriceService): Promise<bigint | undefined> {
    const price = await priceService.getAssetUsdPrice(this);
    if (!price) return undefined;
    return (amount * price.amountOutMid) / 10n ** BigInt(this.asset.decimals);
  }

  async populateMarketPrices(priceService: IPriceService): Promise<void> {
    this.marketPriceUsd = await this.fetchAssetMarketPriceUsd(priceService).catch(() => undefined);
  }

  async populateRewards(rewardsService: IRewardsService): Promise<void> {
    this.rewards = await rewardsService.getVaultRewards(this.chainId, this.address).catch(() => undefined);
  }
}
