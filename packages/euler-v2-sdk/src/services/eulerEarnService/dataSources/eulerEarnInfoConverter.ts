import { formatUnits } from "viem";
import { IEulerEarn, EulerEarnStrategyInfo, EulerEarnGovernance, EulerEarnAllocationCap } from "../../../entities/EulerEarn.js";
import { Token, VaultType } from "../../../utils/types.js";
import { EulerEarnVaultInfoFull, VaultInfoERC4626 as LensVaultInfoERC4626 } from "./eulerEarnLensTypes.js";

/**
 * Converts EulerEarnVaultLens's EulerEarnVaultInfoFull object to an IEulerEarn object
 * @param vaultInfo - The EulerEarnVaultInfoFull object to convert
 * @returns The IEulerEarn object
 */
export function convertEulerEarnVaultInfoFullToIEulerEarn(vaultInfo: EulerEarnVaultInfoFull): IEulerEarn {
  const shares: Token = {
    address: vaultInfo.vault,
    name: vaultInfo.vaultName,
    symbol: vaultInfo.vaultSymbol,
    decimals: Number(vaultInfo.vaultDecimals),
  };

  const asset: Token = {
    address: vaultInfo.asset,
    name: vaultInfo.assetName,
    symbol: vaultInfo.assetSymbol,
    decimals: Number(vaultInfo.assetDecimals),
  };

  const governance: EulerEarnGovernance = {
    owner: vaultInfo.owner,
    creator: vaultInfo.creator,
    curator: vaultInfo.curator,
    guardian: vaultInfo.guardian,
    feeReceiver: vaultInfo.feeReceiver,
    timelock: Number(vaultInfo.timelock),
    pendingTimelock: Number(vaultInfo.pendingTimelock),
    pendingTimelockValidAt: Number(vaultInfo.pendingTimelockValidAt),
    pendingGuardian: vaultInfo.pendingGuardian,
    pendingGuardianValidAt: Number(vaultInfo.pendingGuardianValidAt),
  };

  const strategies: EulerEarnStrategyInfo[] = vaultInfo.strategies.map((strategy) => {
    const strategyShares: Token = {
      address: strategy.info.vault,
      name: strategy.info.vaultName,
      symbol: strategy.info.vaultSymbol,
      decimals: Number(strategy.info.vaultDecimals),
    };

    const strategyAsset: Token = {
      address: strategy.info.asset,
      name: strategy.info.assetName,
      symbol: strategy.info.assetSymbol,
      decimals: Number(strategy.info.assetDecimals),
    };

    const allocationCap: EulerEarnAllocationCap = {
      current: strategy.currentAllocationCap,
      pending: strategy.pendingAllocationCap,
      pendingValidAt: Number(strategy.pendingAllocationCapValidAt),
    };

    return {
      address: strategy.strategy,
      vaultType: strategy.info.isEVault ? VaultType.EVault : VaultType.Unknown,
      allocatedAssets: strategy.allocatedAssets,
      availableAssets: strategy.availableAssets,
      allocationCap,
      removableAt: Number(strategy.removableAt),
      shares: strategyShares,
      asset: strategyAsset,
      totalShares: strategy.info.totalShares,
      totalAssets: strategy.info.totalAssets,
    };
  });

  return {
    address: vaultInfo.vault,
    shares,
    asset,
    totalShares: vaultInfo.totalShares,
    totalAssets: vaultInfo.totalAssets,
    lostAssets: vaultInfo.lostAssets,
    availableAssets: vaultInfo.availableAssets,
    performanceFee: Number(formatUnits(vaultInfo.performanceFee, 18)),
    governance,
    supplyQueue: vaultInfo.supplyQueue,
    strategies,
    timestamp: Number(vaultInfo.timestamp),
  };
}

