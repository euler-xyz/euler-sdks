import { maxInt256 } from "viem";
import type { ISubAccount, IAccountLiquidity, DaysToLiquidation } from "../../../entities/Account.js";
import { AccountPosition } from "../../../entities/Account.js";
import { EVCAccountInfo, VaultAccountInfo, AccountLiquidityInfo } from "./accountLensTypes.js";
import {
  addEntityDataIssue,
  transferEntityDataIssues,
} from "../../../utils/entityDiagnostics.js";
import {
  bigintToSafeNumber,
} from "../../../utils/normalization.js";

/**
 * Converts AccountLens's AccountLiquidityInfo object to an IAccountLiquidity object
 * @param liquidityInfo - The AccountLiquidityInfo object to convert
 * @returns The IAccountLiquidity object
 */
 function convertAccountLiquidityInfoToAccountLiquidity(
  liquidityInfo: AccountLiquidityInfo
): IAccountLiquidity {
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

  const collaterals = liquidityInfo.collaterals.map((collateral, idx) => {
    const borrowing = liquidityInfo.collateralValuesBorrowing[idx];
    const liquidation = liquidityInfo.collateralValuesLiquidation[idx];
    const oracleMid = liquidityInfo.collateralValuesRaw[idx];

    if (borrowing === undefined) {
      addEntityDataIssue(liquidityInfo as object, {
        code: "DEFAULT_APPLIED",
        severity: "warning",
        message: "Missing collateral borrowing value; defaulted to 0.",
        path: `$.collaterals[${idx}].value.borrowing`,
        source: "accountLens",
        normalizedValue: "0",
      });
    }
    if (liquidation === undefined) {
      addEntityDataIssue(liquidityInfo as object, {
        code: "DEFAULT_APPLIED",
        severity: "warning",
        message: "Missing collateral liquidation value; defaulted to 0.",
        path: `$.collaterals[${idx}].value.liquidation`,
        source: "accountLens",
        normalizedValue: "0",
      });
    }
    if (oracleMid === undefined) {
      addEntityDataIssue(liquidityInfo as object, {
        code: "DEFAULT_APPLIED",
        severity: "warning",
        message: "Missing collateral oracleMid value; defaulted to 0.",
        path: `$.collaterals[${idx}].value.oracleMid`,
        source: "accountLens",
        normalizedValue: "0",
      });
    }

    return {
      address: collateral,
      value: {
        borrowing: borrowing ?? 0n,
        liquidation: liquidation ?? 0n,
        oracleMid: oracleMid ?? 0n,
      },
    };
  });

  let daysToLiquidation: DaysToLiquidation = "Infinity";
  if (liquidityInfo.timeToLiquidation !== maxInt256) {
    if (liquidityInfo.timeToLiquidation === maxInt256 - 1n) {
      daysToLiquidation = "MoreThanAYear";
    } else {
      daysToLiquidation = bigintToSafeNumber(liquidityInfo.timeToLiquidation, {
        path: "$.daysToLiquidation",
        target: liquidityInfo as object,
        source: "accountLens",
      });
    }
  }

  const liquidityData: IAccountLiquidity = {
    vaultAddress: liquidityInfo.vault,
    unitOfAccount: liquidityInfo.unitOfAccount,
    daysToLiquidation,
    liabilityValue,
    totalCollateralValue,
    collaterals,
  };
  transferEntityDataIssues(liquidityInfo as object, liquidityData as object);
  return liquidityData;
}

/**
 * Converts AccountLens's VaultAccountInfo object to an AccountPosition object
 * @param vaultAccountInfo - The VaultAccountInfo object to convert
 * @returns The AccountPosition object
 */
export function convertVaultAccountInfoToAccountPosition(
  vaultAccountInfo: VaultAccountInfo
): AccountPosition {
  let liquidity: IAccountLiquidity | undefined = undefined;
  if (vaultAccountInfo.borrowed !== 0n) {
    if (vaultAccountInfo.liquidityInfo.queryFailure) {
      const message = `Failed to fetch liquidity for position ${vaultAccountInfo.vault} for sub-account ${vaultAccountInfo.account}: ${vaultAccountInfo.liquidityInfo.queryFailureReason}`;
      addEntityDataIssue(vaultAccountInfo as object, {
        code: "SOURCE_UNAVAILABLE",
        severity: "warning",
        message,
        path: "$.liquidity",
        source: "accountLens",
        originalValue: vaultAccountInfo.liquidityInfo.queryFailureReason,
      });
    } else {
      liquidity = convertAccountLiquidityInfoToAccountLiquidity(vaultAccountInfo.liquidityInfo);
    }
  }


  const positionData = {
    account: vaultAccountInfo.account,
    vaultAddress: vaultAccountInfo.vault,
    asset: vaultAccountInfo.asset,
    shares: vaultAccountInfo.shares,
    assets: vaultAccountInfo.assets,
    borrowed: vaultAccountInfo.borrowed,
    isController: vaultAccountInfo.isController,
    isCollateral: vaultAccountInfo.isCollateral,
    liquidity,
    balanceForwarderEnabled: vaultAccountInfo.balanceForwarderEnabled,
  };
  transferEntityDataIssues(vaultAccountInfo as object, positionData as object);
  if (liquidity) transferEntityDataIssues(liquidity as object, positionData as object);

  return new AccountPosition(positionData);
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
): ISubAccount {
  const positions = vaultAccountInfos.map((info) => convertVaultAccountInfoToAccountPosition(info));
  const subAccountData: ISubAccount = {
    timestamp: bigintToSafeNumber(evcAccountInfo.timestamp, {
      path: "$.timestamp",
      target: evcAccountInfo as object,
      source: "accountLens",
    }),
    account: evcAccountInfo.account,
    owner: evcAccountInfo.owner,
    lastAccountStatusCheckTimestamp: bigintToSafeNumber(evcAccountInfo.lastAccountStatusCheckTimestamp, {
      path: "$.lastAccountStatusCheckTimestamp",
      target: evcAccountInfo as object,
      source: "accountLens",
    }),
    enabledControllers: evcAccountInfo.enabledControllers,
    enabledCollaterals: evcAccountInfo.enabledCollaterals,
    positions,
  };
  transferEntityDataIssues(evcAccountInfo as object, subAccountData as object);
  return subAccountData;
}
