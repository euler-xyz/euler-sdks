import { formatUnits } from "viem";
import { IEulerEarn, EulerEarnStrategyInfo, EulerEarnGovernance, EulerEarnAllocationCap } from "../../../../entities/EulerEarn.js";
import { Token, VaultType } from "../../../../utils/types.js";
import { EulerEarnVaultInfoFull } from "./eulerEarnLensTypes.js";
import {
  type DataIssue,
} from "../../../../utils/entityDiagnostics.js";
import {
  bigintToSafeNumber,
} from "../../../../utils/normalization.js";

/**
 * Converts EulerEarnVaultLens's EulerEarnVaultInfoFull object to an IEulerEarn object
 * @param vaultInfo - The EulerEarnVaultInfoFull object to convert
 * @param chainId - The chain ID
 * @returns The IEulerEarn object
 */
export function convertEulerEarnVaultInfoFullToIEulerEarn(
  vaultInfo: EulerEarnVaultInfoFull,
  chainId: number,
  errors: DataIssue[]
): IEulerEarn {
  const vaultEntityId = vaultInfo.vault;
  const shares: Token = {
    address: vaultInfo.vault,
    name: vaultInfo.vaultName,
    symbol: vaultInfo.vaultSymbol,
    decimals: bigintToSafeNumber(vaultInfo.vaultDecimals, {
      path: "$.shares.decimals",
      errors,
      source: "eulerEarnLens",
      entityId: vaultEntityId,
    }),
  };

  const asset: Token = {
    address: vaultInfo.asset,
    name: vaultInfo.assetName,
    symbol: vaultInfo.assetSymbol,
    decimals: bigintToSafeNumber(vaultInfo.assetDecimals, {
      path: "$.asset.decimals",
      errors,
      source: "eulerEarnLens",
      entityId: vaultEntityId,
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
      errors,
      source: "eulerEarnLens",
      entityId: vaultEntityId,
    }),
    pendingTimelock: bigintToSafeNumber(vaultInfo.pendingTimelock, {
      path: "$.governance.pendingTimelock",
      errors,
      source: "eulerEarnLens",
      entityId: vaultEntityId,
    }),
    pendingTimelockValidAt: bigintToSafeNumber(vaultInfo.pendingTimelockValidAt, {
      path: "$.governance.pendingTimelockValidAt",
      errors,
      source: "eulerEarnLens",
      entityId: vaultEntityId,
    }),
    pendingGuardian: vaultInfo.pendingGuardian,
    pendingGuardianValidAt: bigintToSafeNumber(vaultInfo.pendingGuardianValidAt, {
      path: "$.governance.pendingGuardianValidAt",
      errors,
      source: "eulerEarnLens",
      entityId: vaultEntityId,
    }),
  };

  const strategies: EulerEarnStrategyInfo[] = vaultInfo.strategies.map((strategy, idx) => {
    const strategyShares: Token = {
      address: strategy.info.vault,
      name: strategy.info.vaultName,
      symbol: strategy.info.vaultSymbol,
      decimals: bigintToSafeNumber(strategy.info.vaultDecimals, {
        path: `$.strategies[${idx}].shares.decimals`,
        errors,
        source: "eulerEarnLens",
        entityId: strategy.strategy,
      }),
    };

    const strategyAsset: Token = {
      address: strategy.info.asset,
      name: strategy.info.assetName,
      symbol: strategy.info.assetSymbol,
      decimals: bigintToSafeNumber(strategy.info.assetDecimals, {
        path: `$.strategies[${idx}].asset.decimals`,
        errors,
        source: "eulerEarnLens",
        entityId: strategy.strategy,
      }),
    };

    const allocationCap: EulerEarnAllocationCap = {
      current: strategy.currentAllocationCap,
      pending: strategy.pendingAllocationCap,
      pendingValidAt: bigintToSafeNumber(strategy.pendingAllocationCapValidAt, {
        path: `$.strategies[${idx}].allocationCap.pendingValidAt`,
        errors,
        source: "eulerEarnLens",
        entityId: strategy.strategy,
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
        errors,
        source: "eulerEarnLens",
        entityId: strategy.strategy,
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
      errors.push({
        code: "PRECISION_LOSS",
        severity: "warning",
        message: "performanceFee could not be represented as a finite number; defaulted to 0.",
        path: "$.performanceFee",
        source: "eulerEarnLens",
        entityId: vaultEntityId,
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
      errors,
      source: "eulerEarnLens",
      entityId: vaultEntityId,
    }),
  };
  return result;
}
