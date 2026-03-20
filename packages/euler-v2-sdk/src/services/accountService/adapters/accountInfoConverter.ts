import { maxInt256 } from "viem";
import type { ISubAccount, IAccountLiquidity, DaysToLiquidation } from "../../../entities/Account.js";
import { AccountPosition } from "../../../entities/Account.js";
import type { EVCAccountInfo, VaultAccountInfo, AccountLiquidityInfo } from "./accountLensTypes.js";
import type {
  DataIssue,
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
  liquidityInfo: AccountLiquidityInfo,
  errors: DataIssue[]
): IAccountLiquidity {
  const vaultEntityId = liquidityInfo.vault;
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
      errors.push({
        code: "DEFAULT_APPLIED",
        severity: "warning",
        message: "Missing collateral borrowing value; defaulted to 0.",
        paths: [`$.collaterals[${idx}].value.borrowing`],
        source: "accountLens",
        entityId: collateral,
        normalizedValue: "0",
      });
    }
    if (liquidation === undefined) {
      errors.push({
        code: "DEFAULT_APPLIED",
        severity: "warning",
        message: "Missing collateral liquidation value; defaulted to 0.",
        paths: [`$.collaterals[${idx}].value.liquidation`],
        source: "accountLens",
        entityId: collateral,
        normalizedValue: "0",
      });
    }
    if (oracleMid === undefined) {
      errors.push({
        code: "DEFAULT_APPLIED",
        severity: "warning",
        message: "Missing collateral oracleMid value; defaulted to 0.",
        paths: [`$.collaterals[${idx}].value.oracleMid`],
        source: "accountLens",
        entityId: collateral,
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
        errors,
        source: "accountLens",
        entityId: vaultEntityId,
      });
    }
  }

  return {
    vaultAddress: liquidityInfo.vault,
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
export function convertVaultAccountInfoToAccountPosition(
  vaultAccountInfo: VaultAccountInfo,
  errors: DataIssue[]
): AccountPosition {
  let liquidity: IAccountLiquidity | undefined ;
  if (vaultAccountInfo.borrowed !== 0n) {
    if (vaultAccountInfo.liquidityInfo.queryFailure) {
      const message = `Failed to fetch liquidity for position ${vaultAccountInfo.vault} for sub-account ${vaultAccountInfo.account}: ${vaultAccountInfo.liquidityInfo.queryFailureReason}`;
      errors.push({
        code: "SOURCE_UNAVAILABLE",
        severity: "warning",
        message,
        paths: ["$.liquidity"],
        entityId: vaultAccountInfo.vault,
        source: "accountLens",
        originalValue: vaultAccountInfo.liquidityInfo.queryFailureReason,
      });
    } else {
      liquidity = convertAccountLiquidityInfoToAccountLiquidity(vaultAccountInfo.liquidityInfo, errors);
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
  vaultAccountInfos: VaultAccountInfo[],
  errors: DataIssue[]
): ISubAccount {
  const positions = vaultAccountInfos.map((info) => convertVaultAccountInfoToAccountPosition(info, errors));
  const subAccountData: ISubAccount = {
    timestamp: bigintToSafeNumber(evcAccountInfo.timestamp, {
      path: "$.timestamp",
      errors,
      source: "accountLens",
      entityId: evcAccountInfo.account,
    }),
    account: evcAccountInfo.account,
    owner: evcAccountInfo.owner,
    lastAccountStatusCheckTimestamp: bigintToSafeNumber(evcAccountInfo.lastAccountStatusCheckTimestamp, {
      path: "$.lastAccountStatusCheckTimestamp",
      errors,
      source: "accountLens",
      entityId: evcAccountInfo.account,
    }),
    enabledControllers: evcAccountInfo.enabledControllers,
    enabledCollaterals: evcAccountInfo.enabledCollaterals,
    positions,
  };
  return subAccountData;
}
