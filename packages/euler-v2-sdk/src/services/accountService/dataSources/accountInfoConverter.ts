import { maxInt256 } from "viem";
import { SubAccount, AccountPosition, AccountLiquidity, DaysToLiquidation } from "../../../entities/Account.js";
import { EVCAccountInfo, VaultAccountInfo, AccountLiquidityInfo } from "./accountLensTypes.js";

/**
 * Converts AccountLens's AccountLiquidityInfo object to an AccountLiquidity object
 * @param liquidityInfo - The AccountLiquidityInfo object to convert
 * @returns The AccountLiquidity object
 */
 function convertAccountLiquidityInfoToAccountLiquidity(liquidityInfo: AccountLiquidityInfo): AccountLiquidity {
  const liabilityValue = {
    borrowing: liquidityInfo.liabilityValueBorrowing,
    liquidation: liquidityInfo.liabilityValueLiquidation,
    oracleMid: liquidityInfo.liabilityValueLiquidation, // vault liquidation value is oraclemid 
  };

  const totalCollateralValue = {
    borrowing: liquidityInfo.collateralValueBorrowing,
    liquidation: liquidityInfo.collateralValueLiquidation,
    oracleMid: liquidityInfo.collateralValueRaw,
  };

  const collaterals = liquidityInfo.collaterals.map((collateral, idx) => ({
    address: collateral,
    value: {
      borrowing: liquidityInfo.collateralValuesBorrowing[idx] || 0n,
      liquidation: liquidityInfo.collateralValuesLiquidation[idx] || 0n,
      oracleMid: liquidityInfo.collateralValuesRaw[idx] || 0n,
    },
  }));

  let daysToLiquidation: DaysToLiquidation = "Infinity";
  if (liquidityInfo.timeToLiquidation !== maxInt256) {
    if (liquidityInfo.timeToLiquidation === maxInt256 - 1n) {
      daysToLiquidation = "MoreThanAYear";
    } else {
      daysToLiquidation = Number(liquidityInfo.timeToLiquidation);
    }
  }

  return {
    vault: liquidityInfo.vault,
    unitOfAccount: liquidityInfo.unitOfAccount,
    daysToLiquidation,
    liabilityValue,
    totalCollateralValue,
    collaterals,
  };
}

/**
 * Converts AccountLens's VaultAccountInfo object to an AccountPosition object
 * @param vaultAccountInfo - The VaultAccountInfo object to convert
 * @returns The AccountPosition object
 */
export function convertVaultAccountInfoToAccountPosition(vaultAccountInfo: VaultAccountInfo): AccountPosition {
  let liquidity: AccountLiquidity | undefined = undefined;
  if (vaultAccountInfo.borrowed !== 0n) {
    if (vaultAccountInfo.liquidityInfo.queryFailure) {
      throw new Error(`Failed to fetch liquidity for position ${vaultAccountInfo.vault} for sub-account ${vaultAccountInfo.account}: ${vaultAccountInfo.liquidityInfo.queryFailureReason}`);
    }
    liquidity = convertAccountLiquidityInfoToAccountLiquidity(vaultAccountInfo.liquidityInfo);
  }


  return {
    account: vaultAccountInfo.account,
    vault: vaultAccountInfo.vault,
    asset: vaultAccountInfo.asset,
    shares: vaultAccountInfo.shares,
    assets: vaultAccountInfo.assets,
    borrowed: vaultAccountInfo.borrowed,
    isController: vaultAccountInfo.isController,
    isCollateral: vaultAccountInfo.isCollateral,
    liquidity,
    balanceForwarderEnabled: vaultAccountInfo.balanceForwarderEnabled,
  };
}

/**
 * Converts AccountLens's EVCAccountInfo and VaultAccountInfo[] to a SubAccount object
 * @param evcAccountInfo - The EVCAccountInfo object
 * @param vaultAccountInfos - Array of VaultAccountInfo objects
 * @returns The SubAccount object
 */
export function convertToSubAccount(
  evcAccountInfo: EVCAccountInfo,
  vaultAccountInfos: VaultAccountInfo[]
): SubAccount {
  const positions = vaultAccountInfos.map(convertVaultAccountInfoToAccountPosition);

  return {
    timestamp: Number(evcAccountInfo.timestamp),
    account: evcAccountInfo.account,
    owner: evcAccountInfo.owner,
    isLockdownMode: evcAccountInfo.isLockdownMode,
    isPermitDisabledMode: evcAccountInfo.isPermitDisabledMode,
    lastAccountStatusCheckTimestamp: Number(evcAccountInfo.lastAccountStatusCheckTimestamp),
    enabledControllers: evcAccountInfo.enabledControllers,
    enabledCollaterals: evcAccountInfo.enabledCollaterals,
    positions,
  };
}
