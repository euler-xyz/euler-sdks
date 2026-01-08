import { IEulerEarn, EulerEarnVaultStrategyInfo, VaultInfoERC4626 } from "../../../entities/EulerEarn.js";
import { Token } from "../../../utils/types.js";
import { EulerEarnVaultInfoFull, VaultInfoERC4626 as LensVaultInfoERC4626 } from "./eulerEarnLensTypes.js";

/**
 * Converts EulerEarnVaultLens's EulerEarnVaultInfoFull object to an IEulerEarn object
 * @param vaultInfo - The EulerEarnVaultInfoFull object to convert
 * @returns The IEulerEarn object
 */
export function convertEulerEarnVaultInfoFullToIEulerEarn(vaultInfo: EulerEarnVaultInfoFull): IEulerEarn {
  const vault: Token = {
    address: vaultInfo.vault,
    name: vaultInfo.vaultName,
    symbol: vaultInfo.vaultSymbol,
    decimals: vaultInfo.vaultDecimals,
  };

  const asset: Token = {
    address: vaultInfo.asset,
    name: vaultInfo.assetName,
    symbol: vaultInfo.assetSymbol,
    decimals: vaultInfo.assetDecimals,
  };

  const strategies: EulerEarnVaultStrategyInfo[] = vaultInfo.strategies.map((strategy) => ({
    strategy: strategy.strategy,
    allocatedAssets: strategy.allocatedAssets,
    availableAssets: strategy.availableAssets,
    currentAllocationCap: strategy.currentAllocationCap,
    pendingAllocationCap: strategy.pendingAllocationCap,
    pendingAllocationCapValidAt: strategy.pendingAllocationCapValidAt,
    removableAt: strategy.removableAt,
    info: convertVaultInfoERC4626(strategy.info),
  }));

  return {
    timestamp: vaultInfo.timestamp,
    address: vaultInfo.vault,
    vault,
    asset,
    totalShares: vaultInfo.totalShares,
    totalAssets: vaultInfo.totalAssets,
    lostAssets: vaultInfo.lostAssets,
    availableAssets: vaultInfo.availableAssets,
    timelock: vaultInfo.timelock,
    performanceFee: vaultInfo.performanceFee,
    feeReceiver: vaultInfo.feeReceiver,
    owner: vaultInfo.owner,
    creator: vaultInfo.creator,
    curator: vaultInfo.curator,
    guardian: vaultInfo.guardian,
    evc: vaultInfo.evc,
    permit2: vaultInfo.permit2,
    pendingTimelock: vaultInfo.pendingTimelock,
    pendingTimelockValidAt: vaultInfo.pendingTimelockValidAt,
    pendingGuardian: vaultInfo.pendingGuardian,
    pendingGuardianValidAt: vaultInfo.pendingGuardianValidAt,
    supplyQueue: vaultInfo.supplyQueue,
    strategies,
  };
}

function convertVaultInfoERC4626(info: LensVaultInfoERC4626): VaultInfoERC4626 {
  return {
    timestamp: info.timestamp,
    vault: info.vault,
    vaultName: info.vaultName,
    vaultSymbol: info.vaultSymbol,
    vaultDecimals: info.vaultDecimals,
    asset: info.asset,
    assetName: info.assetName,
    assetSymbol: info.assetSymbol,
    assetDecimals: info.assetDecimals,
    totalShares: info.totalShares,
    totalAssets: info.totalAssets,
    isEVault: info.isEVault,
  };
}

