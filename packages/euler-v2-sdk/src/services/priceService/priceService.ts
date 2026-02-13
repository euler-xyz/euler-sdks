import { type Address, getAddress, formatUnits } from "viem";
import type { OraclePrice } from "../../utils/oracle.js";
import type { EVault } from "../../entities/EVault.js";
import type { ERC4626Vault } from "../../entities/ERC4626Vault.js";
import { VaultType } from "../../utils/types.js";
import type { ProviderService } from "../providerService/providerService.js";
import type { DeploymentService } from "../deploymentService/deploymentService.js";
import { utilsLensPriceAbi } from "./utilsLensPriceAbi.js";
import { PricingBackendClient, backendPriceToBigInt } from "./backendClient.js";
import { type BuildQueryFn, applyBuildQuery } from "../../utils/buildQuery.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const ONE_18 = 10n ** 18n;

/** Euler virtual USD address (decimal 840 = ISO-4217 USD). */
export const USD_ADDRESS: Address =
  "0x0000000000000000000000000000000000000348";

const USD_DECIMALS = 18;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Price result with mid, ask, and bid prices.
 * `decimals` indicates the precision of the quote (output) asset —
 * e.g. 18 for USD amounts, or the UoA decimals for Layer-1 oracle prices.
 */
export type PriceResult = {
  amountOutMid: bigint;
  amountOutAsk: bigint;
  amountOutBid: bigint;
  decimals: number;
};

export type FormatAssetValueOptions = {
  maxDecimals?: number;
  minDecimals?: number;
};

export type FormattedAssetValue = {
  /** Formatted display string: "1,234.56 USDC" when no price available, empty when price available (caller formats USD). */
  display: string;
  /** Whether a USD price was available. */
  hasPrice: boolean;
  /** USD value of the amount (0 when no price). */
  usdValue: number;
  /** Human-readable token amount. */
  assetAmount: number;
  /** Token symbol. */
  assetSymbol: string;
};

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface IPriceService {
  // Layer 1: Raw Oracle Prices (Unit of Account) — sync, from vault data
  getAssetOraclePrice(vault: EVault): PriceResult | undefined;
  getCollateralShareOraclePrice(
    liabilityVault: EVault,
    collateralVault: ERC4626Vault
  ): OraclePrice | undefined;
  getCollateralOraclePrice(
    liabilityVault: EVault,
    collateralVault: ERC4626Vault
  ): PriceResult | undefined;

  // UoA → USD rate (async — may call utilsLens or backend)
  getUnitOfAccountUsdRate(vault: EVault): Promise<bigint | undefined>;

  // Layer 2: USD Prices (async — tries backend first, falls back to on-chain)
  getAssetUsdPrice(
    vault: ERC4626Vault
  ): Promise<PriceResult | undefined>;
  getCollateralUsdPrice(
    liabilityVault: EVault,
    collateralVault: ERC4626Vault
  ): Promise<PriceResult | undefined>;

  // Display helpers
  formatAssetValue(
    amount: bigint,
    vault: ERC4626Vault,
    options?: FormatAssetValueOptions
  ): Promise<FormattedAssetValue>;

}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class PriceService implements IPriceService {
  constructor(
    private readonly providerService: ProviderService,
    private readonly deploymentService: DeploymentService,
    private readonly backendClient?: PricingBackendClient,
    buildQuery?: BuildQueryFn,
  ) {
    if (buildQuery) applyBuildQuery(this, buildQuery);
  }

  queryAssetPriceInfo = async (
    provider: ReturnType<ProviderService["getProvider"]>,
    utilsLensAddress: Address,
    assetAddress: Address
  ) => {
    return provider.readContract({
      address: utilsLensAddress,
      abi: utilsLensPriceAbi,
      functionName: "getAssetPriceInfo",
      args: [assetAddress, USD_ADDRESS],
    }) as Promise<{
      queryFailure: boolean;
      amountOutMid: bigint;
    }>;
  };

  setQueryAssetPriceInfo(fn: typeof this.queryAssetPriceInfo): void {
    this.queryAssetPriceInfo = fn;
  }

  // -----------------------------------------------------------------------
  // Layer 1: Raw Oracle Prices (Unit of Account)
  // -----------------------------------------------------------------------

  getAssetOraclePrice(vault: EVault): PriceResult | undefined {
    return getAssetOraclePrice(vault);
  }

  getCollateralShareOraclePrice(
    liabilityVault: EVault,
    collateralVault: ERC4626Vault
  ): OraclePrice | undefined {
    return getCollateralShareOraclePrice(liabilityVault, collateralVault);
  }

  getCollateralOraclePrice(
    liabilityVault: EVault,
    collateralVault: ERC4626Vault
  ): PriceResult | undefined {
    return getCollateralOraclePrice(liabilityVault, collateralVault);
  }

  // -----------------------------------------------------------------------
  // UoA → USD Rate
  // -----------------------------------------------------------------------

  /**
   * Get the USD rate for a vault's unit of account.
   * Always tries backend first (UoA is a common denominator —
   * using off-chain rates doesn't affect health factor/LTV ratios).
   * Falls back to on-chain utilsLens call.
   */
  async getUnitOfAccountUsdRate(vault: EVault): Promise<bigint | undefined> {
    const uoaAddress = vault.unitOfAccount.address;
    if (!uoaAddress) return undefined;

    // USD unit of account → 1.0
    if (getAddress(uoaAddress) === getAddress(USD_ADDRESS)) {
      return ONE_18;
    }

    // Try backend first
    if (this.backendClient?.isConfigured) {
      try {
        const backendPrice = await this.backendClient.fetchPrice(
          uoaAddress,
          vault.chainId
        );
        if (backendPrice) {
          const rate = backendPriceToBigInt(backendPrice.price);
          if (rate > 0n) return rate;
        }
      } catch {
        // Fall through to on-chain
      }
    }

    // On-chain: call utilsLens.getAssetPriceInfo(unitOfAccount, USD)
    const priceInfo = await this.fetchAssetPriceInfo(
      vault.chainId,
      uoaAddress
    );
    return priceInfo?.amountOutMid || undefined;
  }

  // -----------------------------------------------------------------------
  // Layer 2: USD Prices
  // -----------------------------------------------------------------------

  /**
   * Get asset price in USD.
   * Tries backend first, falls back to on-chain oracle.
   * EVault: oraclePrice × uoaRate.
   * EulerEarn / SecuritizeCollateral: utilsLens or backend.
   */
  async getAssetUsdPrice(
    vault: ERC4626Vault
  ): Promise<PriceResult | undefined> {
    if (!vault) return undefined;

    // Try backend first
    if (this.backendClient?.isConfigured) {
      try {
        const backendPrice = await this.backendClient.fetchPrice(
          vault.asset.address,
          vault.chainId
        );
        if (backendPrice) {
          const result = backendPriceToPriceResult(backendPrice.price);
          if (result) return result;
        }
      } catch {
        // Fall through to on-chain
      }
    }

    return this.getAssetUsdPriceFromOracle(vault);
  }

  /**
   * Get collateral price in USD in the context of a liability vault.
   * Tries backend first, falls back to on-chain oracle.
   * Collateral pricing ALWAYS uses the liability vault's oracle for on-chain fallback.
   */
  async getCollateralUsdPrice(
    liabilityVault: EVault,
    collateralVault: ERC4626Vault
  ): Promise<PriceResult | undefined> {
    if (!liabilityVault || !collateralVault) return undefined;

    // Try backend first
    if (this.backendClient?.isConfigured) {
      try {
        const backendPrice = await this.backendClient.fetchPrice(
          collateralVault.asset.address,
          collateralVault.chainId
        );
        if (backendPrice) {
          const result = backendPriceToPriceResult(backendPrice.price);
          if (result) return result;
        }
      } catch {
        // Fall through to on-chain
      }
    }

    return this.getCollateralUsdPriceFromOracle(liabilityVault, collateralVault);
  }

  // -----------------------------------------------------------------------
  // Display helpers
  // -----------------------------------------------------------------------

  /**
   * Format an asset amount for UI display.
   * Returns USD value when price is available, falls back to token amount + symbol.
   */
  async formatAssetValue(
    amount: bigint,
    vault: ERC4626Vault,
    options: FormatAssetValueOptions = {}
  ): Promise<FormattedAssetValue> {
    const { maxDecimals = 2, minDecimals = 2 } = options;

    if (!vault) {
      return { display: "-", hasPrice: false, usdValue: 0, assetAmount: 0, assetSymbol: "" };
    }

    const assetAmount = +formatUnits(amount, vault.asset.decimals);
    const symbol = vault.asset.symbol;

    const price = await this.getAssetUsdPrice(vault);

    if (!price) {
      const display = assetAmount.toLocaleString("en-US", {
        maximumFractionDigits: maxDecimals,
        minimumFractionDigits: minDecimals,
      });
      return { display: `${display} ${symbol}`, hasPrice: false, usdValue: 0, assetAmount, assetSymbol: symbol };
    }

    const usdValue = assetAmount * +formatUnits(price.amountOutMid, price.decimals);
    return { display: "", hasPrice: true, usdValue, assetAmount, assetSymbol: symbol };
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  /**
   * Get asset USD price from on-chain oracles.
   * EVault: oraclePriceRaw × UoA rate.
   * EulerEarn / SecuritizeCollateral: utilsLens.getAssetPriceInfo.
   */
  private async getAssetUsdPriceFromOracle(
    vault: ERC4626Vault
  ): Promise<PriceResult | undefined> {
    // EVault: use oracle router (oraclePriceRaw + UoA conversion)
    if (vault.type === VaultType.EVault) {
      const oraclePrice = this.getAssetOraclePrice(vault as EVault);
      if (!oraclePrice) return undefined;

      const uoaRate = await this.getUnitOfAccountUsdRate(vault as EVault);
      if (!uoaRate) return undefined;

      return {
        amountOutMid: (oraclePrice.amountOutMid * uoaRate) / ONE_18,
        amountOutAsk: (oraclePrice.amountOutAsk * uoaRate) / ONE_18,
        amountOutBid: (oraclePrice.amountOutBid * uoaRate) / ONE_18,
        decimals: USD_DECIMALS,
      };
    }

    // EulerEarn / SecuritizeCollateral: use utilsLens (direct USD price)
    const priceInfo = await this.fetchAssetPriceInfo(
      vault.chainId,
      vault.asset.address
    );

    if (!priceInfo?.amountOutMid) return undefined;

    const mid = priceInfo.amountOutMid;
    return {
      amountOutMid: mid,
      amountOutAsk: mid,
      amountOutBid: mid,
      decimals: USD_DECIMALS,
    };
  }

  /**
   * Get collateral USD price from on-chain oracles.
   */
  private async getCollateralUsdPriceFromOracle(
    liabilityVault: EVault,
    collateralVault: ERC4626Vault
  ): Promise<PriceResult | undefined> {
    const oraclePrice = this.getCollateralOraclePrice(
      liabilityVault,
      collateralVault
    );
    if (!oraclePrice) return undefined;

    const uoaRate = await this.getUnitOfAccountUsdRate(liabilityVault);
    if (!uoaRate) return undefined;

    return {
      amountOutMid: (oraclePrice.amountOutMid * uoaRate) / ONE_18,
      amountOutAsk: (oraclePrice.amountOutAsk * uoaRate) / ONE_18,
      amountOutBid: (oraclePrice.amountOutBid * uoaRate) / ONE_18,
      decimals: USD_DECIMALS,
    };
  }

  /**
   * Call utilsLens.getAssetPriceInfo(asset, USD_ADDRESS) on-chain.
   */
  private async fetchAssetPriceInfo(
    chainId: number,
    assetAddress: Address
  ): Promise<{ amountOutMid: bigint } | undefined> {
    try {
      const provider = this.providerService.getProvider(chainId);
      const utilsLensAddress =
        this.deploymentService.getDeployment(chainId).addresses.lensAddrs
          .utilsLens;

      const priceInfo = await this.queryAssetPriceInfo(provider, utilsLensAddress, assetAddress);

      if (
        priceInfo.queryFailure ||
        priceInfo.amountOutMid === undefined ||
        priceInfo.amountOutMid === null
      ) {
        return undefined;
      }

      return { amountOutMid: priceInfo.amountOutMid };
    } catch {
      return undefined;
    }
  }
}

// ---------------------------------------------------------------------------
// Free functions — Layer 1 oracle price extraction (used by vault entities)
// ---------------------------------------------------------------------------

/**
 * Get raw oracle price for a vault's asset in the vault's unit of account.
 * Uses oraclePriceRaw (liabilityPriceInfo from the vault lens).
 */
export function getAssetOraclePrice(vault: EVault): PriceResult | undefined {
  const { oraclePriceRaw, unitOfAccount } = vault;
  if (!oraclePriceRaw || !oraclePriceRaw.amountOutMid) return undefined;

  const { amountOutMid, amountOutAsk, amountOutBid } = oraclePriceRaw;
  const ask = amountOutAsk && amountOutAsk > 0n ? amountOutAsk : amountOutMid;
  const bid = amountOutBid && amountOutBid > 0n ? amountOutBid : amountOutMid;

  return {
    amountOutMid,
    amountOutAsk: ask,
    amountOutBid: bid,
    decimals: unitOfAccount.decimals,
  };
}

/**
 * Get collateral share price from the liability vault's perspective.
 * Returns the raw OraclePrice in the liability vault's unit of account.
 */
export function getCollateralShareOraclePrice(
  liabilityVault: EVault,
  collateralVault: ERC4626Vault
): OraclePrice | undefined {
  const collateralAddress = getAddress(collateralVault.address);

  const collateral = liabilityVault.collaterals.find(
    (c) => getAddress(c.address) === collateralAddress
  );

  if (!collateral) return undefined;

  const { oraclePriceRaw } = collateral;
  // Treat zero amountOutMid with no meaningful bid/ask as "no price"
  if (!oraclePriceRaw.amountOutMid && !oraclePriceRaw.amountOutAsk && !oraclePriceRaw.amountOutBid) {
    return undefined;
  }

  return oraclePriceRaw;
}

/**
 * Get collateral ASSET price from the liability vault's perspective.
 * Converts share price to asset price using totalShares/totalAssets.
 */
export function getCollateralOraclePrice(
  liabilityVault: EVault,
  collateralVault: ERC4626Vault
): PriceResult | undefined {
  const sharePrice = getCollateralShareOraclePrice(
    liabilityVault,
    collateralVault
  );
  if (!sharePrice) return undefined;

  const { totalAssets, totalShares } = collateralVault;
  const uoaDecimals = liabilityVault.unitOfAccount.decimals;

  // Empty vault (both 0): ERC-4626 standard defines 1:1 ratio
  if (totalAssets === 0n && totalShares === 0n) {
    const mid = sharePrice.amountOutMid;
    const ask =
      sharePrice.amountOutAsk && sharePrice.amountOutAsk > 0n
        ? sharePrice.amountOutAsk
        : mid;
    const bid =
      sharePrice.amountOutBid && sharePrice.amountOutBid > 0n
        ? sharePrice.amountOutBid
        : mid;
    return { amountOutMid: mid, amountOutAsk: ask, amountOutBid: bid, decimals: uoaDecimals };
  }

  if (totalAssets === 0n) {
    // totalAssets 0 but totalShares > 0 — unusual state
    return undefined;
  }

  // assetPrice = sharePrice × (totalShares / totalAssets)
  const amountOutMid =
    (sharePrice.amountOutMid * totalShares) / totalAssets;
  const amountOutAsk =
    (sharePrice.amountOutAsk * totalShares) / totalAssets;
  const amountOutBid =
    (sharePrice.amountOutBid * totalShares) / totalAssets;

  const ask = amountOutAsk > 0n ? amountOutAsk : amountOutMid;
  const bid = amountOutBid > 0n ? amountOutBid : amountOutMid;

  return { amountOutMid, amountOutAsk: ask, amountOutBid: bid, decimals: uoaDecimals };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function backendPriceToPriceResult(
  price: number
): PriceResult | undefined {
  const mid = backendPriceToBigInt(price);
  if (mid <= 0n) return undefined;
  return { amountOutMid: mid, amountOutAsk: mid, amountOutBid: mid, decimals: USD_DECIMALS };
}
