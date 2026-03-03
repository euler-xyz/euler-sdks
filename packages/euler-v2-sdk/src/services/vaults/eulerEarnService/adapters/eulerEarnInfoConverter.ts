import { formatUnits } from "viem";
import { IEulerEarn, EulerEarnStrategyInfo, EulerEarnGovernance, EulerEarnAllocationCap } from "../../../../entities/EulerEarn.js";
import { Token, VaultType } from "../../../../utils/types.js";
import { EulerEarnVaultInfoFull } from "./eulerEarnLensTypes.js";
import {
  transferEntityDataIssues,
} from "../../../../utils/entityDiagnostics.js";
import {
  bigintToSafeNumber,
  emitNormalizationIssue,
} from "../../../../utils/normalization.js";

/**
 * Converts EulerEarnVaultLens's EulerEarnVaultInfoFull object to an IEulerEarn object
 * @param vaultInfo - The EulerEarnVaultInfoFull object to convert
 * @param chainId - The chain ID
 * @returns The IEulerEarn object
 */
export function convertEulerEarnVaultInfoFullToIEulerEarn(
  vaultInfo: EulerEarnVaultInfoFull,
  chainId: number
): IEulerEarn {
  const shares: Token = {
    address: vaultInfo.vault,
    name: vaultInfo.vaultName,
    symbol: vaultInfo.vaultSymbol,
    decimals: bigintToSafeNumber(vaultInfo.vaultDecimals, {
      path: "$.shares.decimals",
      target: vaultInfo as object,
      source: "eulerEarnLens",
    }),
  };

  const asset: Token = {
    address: vaultInfo.asset,
    name: vaultInfo.assetName,
    symbol: vaultInfo.assetSymbol,
    decimals: bigintToSafeNumber(vaultInfo.assetDecimals, {
      path: "$.asset.decimals",
      target: vaultInfo as object,
      source: "eulerEarnLens",
    }),
  };

  const governance: EulerEarnGovernance = {
    owner: vaultInfo.owner,
    creator: vaultInfo.creator,
    curator: vaultInfo.curator,
    guardian: vaultInfo.guardian,
    feeReceiver: vaultInfo.feeReceiver,
    timelock: bigintToSafeNumber(vaultInfo.timelock, {
      path: "$.governance.timelock",
      target: vaultInfo as object,
      source: "eulerEarnLens",
    }),
    pendingTimelock: bigintToSafeNumber(vaultInfo.pendingTimelock, {
      path: "$.governance.pendingTimelock",
      target: vaultInfo as object,
      source: "eulerEarnLens",
    }),
    pendingTimelockValidAt: bigintToSafeNumber(vaultInfo.pendingTimelockValidAt, {
      path: "$.governance.pendingTimelockValidAt",
      target: vaultInfo as object,
      source: "eulerEarnLens",
    }),
    pendingGuardian: vaultInfo.pendingGuardian,
    pendingGuardianValidAt: bigintToSafeNumber(vaultInfo.pendingGuardianValidAt, {
      path: "$.governance.pendingGuardianValidAt",
      target: vaultInfo as object,
      source: "eulerEarnLens",
    }),
  };

  const strategies: EulerEarnStrategyInfo[] = vaultInfo.strategies.map((strategy, idx) => {
    const strategyShares: Token = {
      address: strategy.info.vault,
      name: strategy.info.vaultName,
      symbol: strategy.info.vaultSymbol,
      decimals: bigintToSafeNumber(strategy.info.vaultDecimals, {
        path: `$.strategies[${idx}].shares.decimals`,
        target: vaultInfo as object,
        source: "eulerEarnLens",
      }),
    };

    const strategyAsset: Token = {
      address: strategy.info.asset,
      name: strategy.info.assetName,
      symbol: strategy.info.assetSymbol,
      decimals: bigintToSafeNumber(strategy.info.assetDecimals, {
        path: `$.strategies[${idx}].asset.decimals`,
        target: vaultInfo as object,
        source: "eulerEarnLens",
      }),
    };

    const allocationCap: EulerEarnAllocationCap = {
      current: strategy.currentAllocationCap,
      pending: strategy.pendingAllocationCap,
      pendingValidAt: bigintToSafeNumber(strategy.pendingAllocationCapValidAt, {
        path: `$.strategies[${idx}].allocationCap.pendingValidAt`,
        target: vaultInfo as object,
        source: "eulerEarnLens",
      }),
    };

    return {
      address: strategy.strategy,
      vaultType: strategy.info.isEVault ? VaultType.EVault : VaultType.Unknown,
      allocatedAssets: strategy.allocatedAssets,
      availableAssets: strategy.availableAssets,
      allocationCap,
      removableAt: bigintToSafeNumber(strategy.removableAt, {
        path: `$.strategies[${idx}].removableAt`,
        target: vaultInfo as object,
        source: "eulerEarnLens",
      }),
      shares: strategyShares,
      asset: strategyAsset,
      totalShares: strategy.info.totalShares,
      totalAssets: strategy.info.totalAssets,
    };
  });

  const result: IEulerEarn = {
    type: VaultType.EulerEarn,
    chainId,
    address: vaultInfo.vault,
    shares,
    asset,
    totalShares: vaultInfo.totalShares,
    totalAssets: vaultInfo.totalAssets,
    lostAssets: vaultInfo.lostAssets,
    availableAssets: vaultInfo.availableAssets,
    performanceFee: (() => {
      const value = Number(formatUnits(vaultInfo.performanceFee, 18));
      if (Number.isFinite(value)) return value;
      emitNormalizationIssue(vaultInfo as object, {
        code: "PRECISION_LOSS",
        severity: "warning",
        message: "performanceFee could not be represented as a finite number; defaulted to 0.",
        path: "$.performanceFee",
        source: "eulerEarnLens",
        originalValue: formatUnits(vaultInfo.performanceFee, 18),
        normalizedValue: 0,
      });
      return 0;
    })(),
    governance,
    supplyQueue: vaultInfo.supplyQueue,
    strategies,
    timestamp: bigintToSafeNumber(vaultInfo.timestamp, {
      path: "$.timestamp",
      target: vaultInfo as object,
      source: "eulerEarnLens",
    }),
  };
  transferEntityDataIssues(vaultInfo as object, result as object);
  return result;
}
