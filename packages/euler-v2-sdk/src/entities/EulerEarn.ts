import { Address } from "viem";
import { ERC4626Data, Token, VaultType } from "../utils/types.js";
import { ERC4626Vault, IERC4626Vault, IERC4626VaultConversion, VIRTUAL_DEPOSIT_AMOUNT } from "./ERC4626Vault.js";
import type { EVault } from "./EVault.js";
import type { IEVaultService } from "../services/vaults/eVaultService/eVaultService.js";
import type { IPriceService } from "../services/priceService/index.js";
import { addEntityDataIssue, transferEntityDataIssues } from "../utils/entityDiagnostics.js";


export interface EulerEarnAllocationCap {
  current: bigint;
  pending: bigint;
  pendingValidAt: number;
}

export interface EulerEarnStrategyInfo extends ERC4626Data {
  address: Address;
  vaultType: VaultType;
  allocatedAssets: bigint;
  availableAssets: bigint;
  allocationCap: EulerEarnAllocationCap;
  removableAt: number;
  vault?: EVault;
}

export interface EulerEarnGovernance {
  owner: Address;
  creator: Address;
  curator: Address;
  guardian: Address;
  feeReceiver: Address;

  timelock: number;

  pendingTimelock: number;
  pendingTimelockValidAt: number;
  pendingGuardian: Address;
  pendingGuardianValidAt: number;
}

export interface IEulerEarn extends IERC4626Vault {
  lostAssets: bigint;
  availableAssets: bigint;
  performanceFee: number;

  governance: EulerEarnGovernance;

  supplyQueue: Address[];
  strategies: EulerEarnStrategyInfo[];

  timestamp: number;
}

export class EulerEarn extends ERC4626Vault implements IEulerEarn, IERC4626VaultConversion {
  lostAssets: bigint;
  availableAssets: bigint;
  performanceFee: number;

  governance: EulerEarnGovernance;

  supplyQueue: Address[];
  strategies: EulerEarnStrategyInfo[];

  timestamp: number;

  constructor(args: IEulerEarn) {
    super(args);
    transferEntityDataIssues(args as object, this);
    this.lostAssets = args.lostAssets;
    this.availableAssets = args.availableAssets;
    this.performanceFee = args.performanceFee;

    this.governance = args.governance;

    this.supplyQueue = args.supplyQueue;
    this.strategies = args.strategies;

    this.timestamp = args.timestamp;
  }

  isPendingRemoval(strategy: EulerEarnStrategyInfo): boolean {
    return this.strategies.some((s) => s.address === strategy.address && s.removableAt > this.timestamp);
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

  /** Weighted supply APY derived from underlying strategy EVault APYs, net of performance fee. */
  get supplyApy(): number | undefined {
    if (this.totalAssets === 0n) return undefined;

    const strategiesWithVault = this.strategies.filter((s) => s.vault);
    if (strategiesWithVault.length === 0) return undefined;

    let weightedSum = 0;
    let totalAllocated = 0;
    for (const strategy of strategiesWithVault) {
      const apy = parseFloat(strategy.vault!.interestRates.supplyAPY);
      let allocated: number;
      if (strategy.allocatedAssets <= BigInt(Number.MAX_SAFE_INTEGER)) {
        allocated = Number(strategy.allocatedAssets);
      } else {
        allocated = Number.MAX_SAFE_INTEGER;
        addEntityDataIssue(this, {
          code: "OUT_OF_RANGE_CLAMPED",
          severity: "warning",
          message: "Strategy allocatedAssets exceeded safe number range in supply APY computation and was clamped.",
          path: "$.supplyApy",
          source: "eulerEarnEntity",
          originalValue: strategy.allocatedAssets.toString(),
          normalizedValue: allocated,
        });
      }
      weightedSum += allocated * apy;
      totalAllocated += allocated;
    }

    if (totalAllocated === 0) return undefined;

    const grossApy = weightedSum / totalAllocated;
    return grossApy * (1 - this.performanceFee);
  }

  async populateStrategyVaults(eVaultService: IEVaultService): Promise<void> {
    const allStrategyAddresses = [...new Set(this.strategies.map((s) => s.address))];
    if (allStrategyAddresses.length === 0) return;

    const eVaults = await Promise.all(
      allStrategyAddresses.map((addr) =>
        eVaultService.fetchVault(this.chainId, addr).catch((error) => {
          addEntityDataIssue(this, {
            code: "SOURCE_UNAVAILABLE",
            severity: "warning",
            message: "Failed to populate strategy vault metadata for EulerEarn strategy.",
            path: "$.strategies",
            source: "eVaultService",
            originalValue: error instanceof Error ? error.message : String(error),
            normalizedValue: "strategy-vault-missing",
          });
          return undefined;
        })
      )
    );

    const eVaultByAddress = new Map(
      eVaults
        .filter((v) => v !== undefined)
        .map((v) => [v.address.toLowerCase(), v])
    );

    for (const strategy of this.strategies) {
      strategy.vault = eVaultByAddress.get(strategy.address.toLowerCase());
    }
  }

  override async populateMarketPrices(priceService: IPriceService): Promise<void> {
    this.marketPriceUsd = await this.fetchAssetMarketPriceUsd(priceService).catch((error) => {
      addEntityDataIssue(this, {
        code: "SOURCE_UNAVAILABLE",
        severity: "warning",
        message: "Failed to populate EulerEarn market price.",
        path: "$.marketPriceUsd",
        source: "priceService",
        originalValue: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    });
  }
}
